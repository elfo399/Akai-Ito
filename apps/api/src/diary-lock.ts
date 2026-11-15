import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";

const fail = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode });
};
type Session = {
  id: string;
  user_id: string;
  expires: number;
  last_activity: number;
  background_at: number | null;
  locked_at: number | null;
  verified_at: number;
  lock_enabled: number;
  lock_timeout: number;
  username: string;
  name: string;
  password: string;
};
type Passkey = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string;
  device_type: string;
  backed_up: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
};
export const lockExceptions = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/lock/state",
  "/api/auth/lock/options",
  "/api/auth/lock/verify",
  "/api/auth/lock/password",
  "/api/auth/lock/visibility",
]);

export class DiaryLock {
  readonly rpId: string;
  readonly available: boolean;
  constructor(
    readonly sqlite: Database.Database,
    readonly origin: string,
    readonly now = () => Date.now(),
  ) {
    const url = new URL(origin);
    this.rpId = url.hostname;
    this.available =
      origin === url.origin &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && url.hostname === "localhost")) &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.hostname.includes(":");
  }
  session(id: string) {
    const row = this.sqlite
      .prepare(
        `SELECT s.*,u.lock_enabled,u.lock_timeout,u.username,u.name,u.password
      FROM session s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?`,
      )
      .get(id, this.now()) as Session | undefined;
    return row ?? fail(401, "Sessione scaduta. Accedi nuovamente.");
  }
  state(id: string) {
    const s = this.session(id),
      time = this.now();
    const deadline = !s.lock_enabled
      ? null
      : Math.min(
          s.last_activity + (s.lock_timeout || 60) * 1000,
          s.background_at === null
            ? Infinity
            : s.background_at + s.lock_timeout * 1000,
        );
    if (s.lock_enabled && s.locked_at === null && deadline! <= time) {
      this.sqlite
        .prepare(
          "UPDATE session SET locked_at=? WHERE id=? AND locked_at IS NULL",
        )
        .run(time, id);
      s.locked_at = time;
    }
    return {
      enabled: !!s.lock_enabled,
      timeoutSeconds: s.lock_timeout,
      locked: !!s.lock_enabled && s.locked_at !== null,
      deadline,
      serverTime: time,
      webauthnAvailable: this.available,
    };
  }
  unlocked(id: string) {
    if (this.state(id).locked)
      fail(423, "Il nostro diario è protetto. Sbloccalo per continuare.");
  }
  fresh(id: string) {
    this.unlocked(id);
    if (this.session(id).verified_at < this.now() - 5 * 60_000)
      fail(
        403,
        "Conferma di nuovo la tua password prima di gestire la protezione.",
      );
  }
  webauthn(req: FastifyRequest) {
    if (!this.available)
      fail(
        400,
        "Passkey non disponibili per questa origine. Usa HTTPS o localhost.",
      );
    if (req.headers.origin !== this.origin)
      fail(
        403,
        "Apri il diario dalla sua origine configurata per usare le passkey.",
      );
  }
  credentials(userId: string) {
    return this.sqlite
      .prepare("SELECT * FROM passkeys WHERE user_id=? ORDER BY created_at")
      .all(userId) as Passkey[];
  }
  issue(
    sessionId: string,
    purpose: "registration" | "unlock",
    challenge: string,
  ) {
    const id = randomUUID(),
      s = this.session(sessionId);
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          "DELETE FROM auth_challenges WHERE expires<=? OR (session_id=? AND purpose=?)",
        )
        .run(this.now(), sessionId, purpose);
      this.sqlite
        .prepare("INSERT INTO auth_challenges VALUES(?,?,?,?,?,?)")
        .run(
          id,
          sessionId,
          s.user_id,
          purpose,
          challenge,
          this.now() + 120_000,
        );
    })();
    return id;
  }
  consume(sessionId: string, purpose: string, id: string) {
    // Atomic consume before asynchronous signature verification, even on failure.
    const row = this.sqlite
      .prepare(
        "DELETE FROM auth_challenges WHERE id=? AND session_id=? AND purpose=? RETURNING *",
      )
      .get(id, sessionId, purpose) as
      { challenge: string; expires: number; user_id: string } | undefined;
    const s = this.session(sessionId);
    if (!row || row.expires <= this.now() || row.user_id !== s.user_id)
      fail(400, "Verifica scaduta o già utilizzata. Riprova.");
    return row!.challenge;
  }
  touch(id: string, tab: string) {
    this.unlocked(id);
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          "DELETE FROM session_presence WHERE session_id=? AND last_seen<?",
        )
        .run(id, this.now() - 900_000);
      this.sqlite
        .prepare(
          `INSERT INTO session_presence VALUES(?,?,1,?) ON CONFLICT(session_id,tab_id)
        DO UPDATE SET visible=1,last_seen=excluded.last_seen`,
        )
        .run(id, tab, this.now());
      this.sqlite
        .prepare(
          "UPDATE session SET last_activity=?,background_at=NULL WHERE id=?",
        )
        .run(this.now(), id);
    })();
    return this.state(id);
  }
  visibility(id: string, tab: string, hidden: boolean) {
    const state = this.state(id);
    if (!state.enabled || state.locked) return state;
    if (!hidden) return this.touch(id, tab);
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO session_presence VALUES(?,?,0,?) ON CONFLICT(session_id,tab_id)
        DO UPDATE SET visible=0,last_seen=excluded.last_seen`,
        )
        .run(id, tab, this.now());
      const s = this.session(id);
      const other = this.sqlite
        .prepare(
          "SELECT 1 FROM session_presence WHERE session_id=? AND tab_id<>? AND visible=1 AND last_seen>? LIMIT 1",
        )
        .get(id, tab, this.now() - (s.lock_timeout || 60) * 1000);
      if (!other)
        this.sqlite
          .prepare(
            "UPDATE session SET background_at=coalesce(background_at,?) WHERE id=?",
          )
          .run(this.now(), id);
    })();
    return this.state(id);
  }
  unlock(id: string) {
    this.session(id);
    this.sqlite.transaction(() => {
      // Reloads while locked can leave old tab identities. Visible tabs announce
      // themselves again after unlock; stale presence must not defer 'Subito'.
      this.sqlite
        .prepare("DELETE FROM session_presence WHERE session_id=?")
        .run(id);
      this.sqlite
        .prepare(
          "UPDATE session SET locked_at=NULL,background_at=NULL,last_activity=?,verified_at=? WHERE id=?",
        )
        .run(this.now(), this.now(), id);
    })();
    return this.state(id);
  }
}

export function registerDiaryLock(app: FastifyInstance, service: DiaryLock) {
  const sql = service.sqlite,
    sid = (r: FastifyRequest) => r.identity!.sessionId;
  const limit = { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } };
  const pass = z.object({ password: z.string().min(1).max(128) }).strict();
  async function checkPassword(req: FastifyRequest) {
    const { password } = pass.parse(req.body),
      s = service.session(sid(req));
    if (!(await argon2.verify(s.password, password)))
      fail(400, "La password non è corretta.");
    // Password/session may have been revoked while Argon2 was running.
    if (service.session(sid(req)).password !== s.password)
      fail(401, "Accedi nuovamente al diario.");
    return s;
  }
  app.get("/api/auth/lock/state", async (req) => service.state(sid(req)));
  app.post("/api/auth/lock/activity", async (req) => {
    const { tabId } = z
      .object({ tabId: z.string().uuid() })
      .strict()
      .parse(req.body);
    return service.touch(sid(req), tabId);
  });
  app.post("/api/auth/lock/visibility", async (req) => {
    const { tabId, hidden } = z
      .object({ tabId: z.string().uuid(), hidden: z.boolean() })
      .strict()
      .parse(req.body);
    return service.visibility(sid(req), tabId, hidden);
  });
  app.post("/api/auth/lock/manual", async (req) => {
    if (service.state(sid(req)).enabled)
      sql
        .prepare("UPDATE session SET locked_at=? WHERE id=?")
        .run(service.now(), sid(req));
    return service.state(sid(req));
  });
  app.post("/api/auth/lock/reauth", limit, async (req) => {
    await checkPassword(req);
    service.unlocked(sid(req));
    sql
      .prepare("UPDATE session SET verified_at=? WHERE id=?")
      .run(service.now(), sid(req));
    return { ok: true };
  });
  app.post("/api/auth/lock/password", limit, async (req) => {
    await checkPassword(req);
    return service.unlock(sid(req));
  });
  app.put("/api/auth/lock/preferences", async (req) => {
    service.fresh(sid(req));
    const input = z
      .object({
        enabled: z.boolean(),
        timeoutSeconds: z.union([
          z.literal(0),
          z.literal(60),
          z.literal(300),
          z.literal(900),
        ]),
      })
      .strict()
      .parse(req.body);
    const s = service.session(sid(req));
    if (input.enabled && !service.credentials(s.user_id).length)
      fail(409, "Registra prima una passkey.");
    sql.transaction(() => {
      sql
        .prepare("UPDATE users SET lock_enabled=?,lock_timeout=? WHERE id=?")
        .run(Number(input.enabled), input.timeoutSeconds, s.user_id);
      // Other sessions must verify again after account protection changes.
      sql
        .prepare(
          "UPDATE session SET locked_at=?,background_at=NULL WHERE user_id=? AND id<>?",
        )
        .run(input.enabled ? service.now() : null, s.user_id, s.id);
      sql
        .prepare(
          "UPDATE session SET locked_at=NULL,background_at=NULL,last_activity=? WHERE id=?",
        )
        .run(service.now(), s.id);
    })();
    return service.state(s.id);
  });
  app.get("/api/auth/passkeys", async (req) => ({
    items: service.credentials(req.identity!.id).map((k) => ({
      id: k.id,
      name: k.name,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      backedUp: !!k.backed_up,
    })),
    available: service.available,
  }));
  app.post("/api/auth/passkeys/options", limit, async (req) => {
    service.webauthn(req);
    service.fresh(sid(req));
    const s = service.session(sid(req)),
      keys = service.credentials(s.user_id);
    if (keys.length >= 10) fail(400, "Puoi registrare al massimo 10 passkey.");
    const options = await generateRegistrationOptions({
      rpName: "Akai Ito — Il nostro filo rosso",
      rpID: service.rpId,
      userID: new Uint8Array(Buffer.from(s.user_id)),
      userName: s.username,
      userDisplayName: s.name,
      attestationType: "none",
      timeout: 120_000,
      excludeCredentials: keys.map((k) => ({ id: k.id })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      supportedAlgorithmIDs: [-7, -257],
    });
    return {
      options,
      challengeId: service.issue(s.id, "registration", options.challenge),
    };
  });
  app.post("/api/auth/passkeys/verify", limit, async (req) => {
    service.webauthn(req);
    service.fresh(sid(req));
    const input = z
      .object({
        challengeId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        response: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(req.body);
    const challenge = service.consume(
      sid(req),
      "registration",
      input.challengeId,
    );
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: input.response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: service.origin,
        expectedRPID: service.rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch {
      fail(400, "La registrazione della passkey non è valida. Riprova.");
    }
    if (!result!.verified || !result!.registrationInfo?.userVerified)
      fail(400, "Verifica del dispositivo richiesta.");
    service.fresh(sid(req));
    const info = result!.registrationInfo!,
      s = service.session(sid(req)),
      key = info.credential;
    if (key.id.length > 2048)
      fail(400, "Identificativo della passkey non valido.");
    if (sql.prepare("SELECT 1 FROM passkeys WHERE id=?").get(key.id))
      fail(409, "Questa passkey è già registrata.");
    if (service.credentials(s.user_id).length >= 10)
      fail(400, "Limite di passkey raggiunto.");
    sql
      .prepare(
        `INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up,name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        key.id,
        s.user_id,
        Buffer.from(key.publicKey).toString("base64url"),
        key.counter,
        JSON.stringify(key.transports ?? []),
        info.credentialDeviceType,
        Number(info.credentialBackedUp),
        input.name,
        new Date(service.now()).toISOString(),
      );
    return { ok: true };
  });
  app.delete("/api/auth/passkeys/:credentialId", async (req) => {
    service.fresh(sid(req));
    const { credentialId } = z
      .object({ credentialId: z.string().min(1).max(2048) })
      .parse(req.params);
    const keys = service.credentials(req.identity!.id);
    if (!keys.some((k) => k.id === credentialId))
      fail(404, "Passkey non trovata.");
    if (service.state(sid(req)).enabled && keys.length === 1)
      fail(409, "Disattiva la protezione prima di rimuovere l’ultima passkey.");
    sql
      .prepare("DELETE FROM passkeys WHERE id=? AND user_id=?")
      .run(credentialId, req.identity!.id);
    return { ok: true };
  });
  app.post("/api/auth/lock/options", limit, async (req) => {
    service.webauthn(req);
    const keys = service.credentials(req.identity!.id);
    if (!keys.length)
      fail(400, "Nessuna passkey disponibile. Usa la password.");
    const options = await generateAuthenticationOptions({
      rpID: service.rpId,
      timeout: 120_000,
      userVerification: "required",
      allowCredentials: keys.map((k) => ({
        id: k.id,
        transports: JSON.parse(k.transports) as AuthenticatorTransport[],
      })),
    });
    return {
      options,
      challengeId: service.issue(sid(req), "unlock", options.challenge),
    };
  });
  app.post("/api/auth/lock/verify", limit, async (req) => {
    service.webauthn(req);
    const input = z
      .object({
        challengeId: z.string().uuid(),
        response: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(req.body);
    const challenge = service.consume(sid(req), "unlock", input.challengeId);
    const key = service
      .credentials(req.identity!.id)
      .find((k) => k.id === input.response.id);
    if (!key)
      fail(400, "Passkey non disponibile per questo account. Usa la password.");
    const userHandle = (
      input.response.response as { userHandle?: unknown } | undefined
    )?.userHandle;
    if (
      userHandle &&
      userHandle !== Buffer.from(req.identity!.id).toString("base64url")
    )
      fail(400, "Credenziale di un altro account.");
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: input.response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: service.origin,
        expectedRPID: service.rpId,
        requireUserVerification: true,
        credential: {
          id: key!.id,
          publicKey: new Uint8Array(Buffer.from(key!.public_key, "base64url")),
          counter: key!.counter,
          transports: JSON.parse(key!.transports) as AuthenticatorTransport[],
        },
      });
    } catch {
      fail(
        400,
        "La verifica della passkey non è valida. Riprova o usa la password.",
      );
    }
    if (!result!.verified || !result!.authenticationInfo.userVerified)
      fail(400, "Verifica del dispositivo richiesta.");
    return sql.transaction(() => {
      service.session(sid(req));
      const changed = sql
        .prepare(
          "UPDATE passkeys SET counter=?,last_used_at=?,device_type=?,backed_up=? WHERE id=? AND user_id=? AND counter=? AND public_key=? AND created_at=?",
        )
        .run(
          result!.authenticationInfo.newCounter,
          new Date(service.now()).toISOString(),
          result!.authenticationInfo.credentialDeviceType,
          Number(result!.authenticationInfo.credentialBackedUp),
          key!.id,
          req.identity!.id,
          key!.counter,
          key!.public_key,
          key!.created_at,
        );
      if (changed.changes !== 1)
        fail(409, "La passkey è cambiata. Avvia una nuova verifica.");
      return service.unlock(sid(req));
    })();
  });
}
