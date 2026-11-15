import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  randomUUID,
  randomBytes,
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import type { FastifyInstance } from "fastify";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { openDb, migrate } from "../src/db.js";
import { initializeUsers } from "../src/cli.js";
import { createApp } from "../src/app.js";

const origin = "http://localhost:3001",
  password = "DiarioTest2026!";
type Session = { cookie: string; csrf: string; id: string };
let app: FastifyInstance,
  directory: string,
  storage: ReturnType<typeof openDb>,
  time: number,
  a: Session,
  b: Session;
const hash = (v: string) => createHash("sha256").update(v).digest();
const request = (
  s: Session,
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  payload?: unknown,
) =>
  app.inject({
    url,
    method,
    headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
    payload: payload as object,
  });
const login = async (username = "alpha") => {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin },
    payload: { username, password },
  });
  expect(r.statusCode).toBe(200);
  return {
    cookie: `akai_session=${r.cookies[0].value}`,
    csrf: r.json().csrf,
    id: r.json().user.id,
  } as Session;
};
function authenticator() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    jwk = pair.publicKey.export({ format: "jwk" }),
    id = randomBytes(32);
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
    ]),
  );
  return {
    id: id.toString("base64url"),
    bytes: id,
    cose,
    privateKey: pair.privateKey,
  };
}
type Authenticator = ReturnType<typeof authenticator>;
const clientData = (type: string, challenge: string, site = origin) =>
  Buffer.from(
    JSON.stringify({ type, challenge, origin: site, crossOrigin: false }),
  );
function registration(
  key: Authenticator,
  challenge: string,
  { site = origin, rp = "localhost", uv = true } = {},
) {
  const client = clientData("webauthn.create", challenge, site),
    length = Buffer.alloc(2);
  length.writeUInt16BE(key.bytes.length);
  const auth = Buffer.concat([
    hash(rp),
    Buffer.from([uv ? 0x45 : 0x41]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    key.bytes,
    Buffer.from(key.cose),
  ]);
  const att = isoCBOR.encode(
    new Map<string, string | Uint8Array | Map<string, string>>([
      ["fmt", "none"],
      ["authData", new Uint8Array(auth)],
      ["attStmt", new Map()],
    ]),
  );
  return {
    id: key.id,
    rawId: key.id,
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString("base64url"),
      attestationObject: Buffer.from(att).toString("base64url"),
      transports: ["internal"],
    },
  };
}
function assertion(
  key: Authenticator,
  challenge: string,
  userId: string,
  {
    site = origin,
    rp = "localhost",
    uv = true,
    counter = 1,
    invalidSignature = false,
  } = {},
) {
  const client = clientData("webauthn.get", challenge, site),
    count = Buffer.alloc(4);
  count.writeUInt32BE(counter);
  const auth = Buffer.concat([hash(rp), Buffer.from([uv ? 5 : 1]), count]);
  const signature = sign(
    "sha256",
    Buffer.concat([auth, hash(client.toString())]),
    invalidSignature ? authenticator().privateKey : key.privateKey,
  );
  return {
    id: key.id,
    rawId: key.id,
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString("base64url"),
      authenticatorData: auth.toString("base64url"),
      signature: signature.toString("base64url"),
      userHandle: Buffer.from(userId).toString("base64url"),
    },
  };
}
const options = async (s = a) => {
  const r = await request(s, "/api/auth/passkeys/options", "POST");
  expect(r.statusCode).toBe(200);
  return r.json();
};
const register = async (s = a, key = authenticator()) => {
  const opt = await options(s);
  const r = await request(s, "/api/auth/passkeys/verify", "POST", {
    challengeId: opt.challengeId,
    name: "Dispositivo di prova",
    response: registration(key, opt.options.challenge),
  });
  expect(r.statusCode, r.body).toBe(200);
  return key;
};
const enable = async (seconds = 300, s = a) => {
  const r = await request(s, "/api/auth/lock/preferences", "PUT", {
    enabled: true,
    timeoutSeconds: seconds,
  });
  expect(r.statusCode, r.body).toBe(200);
};
const lock = async (s = a) => {
  const r = await request(s, "/api/auth/lock/manual", "POST");
  expect(r.statusCode).toBe(200);
  expect(r.json().locked).toBe(true);
};
const authOptions = async (s = a) => {
  const r = await request(s, "/api/auth/lock/options", "POST");
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};

beforeEach(async () => {
  time = Date.now();
  directory = await mkdtemp(path.join(tmpdir(), "akai-lock-test-"));
  storage = openDb(directory);
  migrate(storage.sqlite);
  await initializeUsers(storage.db, [
    { username: "alpha", name: "Alpha", password },
    { username: "bravo", name: "Bravo", password },
  ]);
  app = await createApp({
    dataDir: directory,
    origin,
    secureCookies: false,
    loginLimit: 100,
    clock: () => time,
  });
  a = await login();
  b = await login("bravo");
});
afterEach(async () => {
  await app?.close();
  storage?.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});

describe("Passkey registration and isolation", () => {
  it("keeps existing users disabled, requires auth and CSRF, never trusts a supplied account ID", async () => {
    expect((await request(a, "/api/auth/lock/state")).json()).toMatchObject({
      enabled: false,
      timeoutSeconds: 300,
      locked: false,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/passkeys/options",
          headers: { origin },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/passkeys/options",
          headers: { origin, cookie: a.cookie },
        })
      ).statusCode,
    ).toBe(403);
    const r = await request(a, "/api/auth/passkeys/options", "POST", {
      userId: b.id,
    });
    expect(r.json().options.user.id).toBe(
      Buffer.from(a.id).toString("base64url"),
    );
  });
  it("registers a real attestation, enforces UV and rejects replay and duplicate credentials", async () => {
    const key = authenticator(),
      o = await options();
    expect(o.options.authenticatorSelection.userVerification).toBe("required");
    const payload = {
      challengeId: o.challengeId,
      name: "Telefono",
      response: registration(key, o.options.challenge),
    };
    expect(
      (await request(a, "/api/auth/passkeys/verify", "POST", payload))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(a, "/api/auth/passkeys/verify", "POST", payload))
        .statusCode,
    ).toBe(400);
    const another = await options();
    expect(
      (
        await request(a, "/api/auth/passkeys/verify", "POST", {
          ...payload,
          challengeId: another.challengeId,
          response: registration(key, another.options.challenge),
        })
      ).statusCode,
    ).toBe(409);
    expect((await request(b, "/api/auth/passkeys")).json().items).toHaveLength(
      0,
    );
    expect(
      (await request(b, "/api/auth/passkeys/" + key.id, "DELETE")).statusCode,
    ).toBe(404);
  });
  it.each(["origin", "rp", "uv", "challenge", "expired"])(
    "rejects invalid registration: %s",
    async (kind) => {
      const key = authenticator(),
        o = await options();
      if (kind === "expired") time += 120001;
      const response = registration(
        key,
        kind === "challenge"
          ? randomBytes(32).toString("base64url")
          : o.options.challenge,
        {
          site: kind === "origin" ? "https://evil.invalid" : origin,
          rp: kind === "rp" ? "evil.invalid" : "localhost",
          uv: kind !== "uv",
        },
      );
      const r = await request(a, "/api/auth/passkeys/verify", "POST", {
        challengeId: o.challengeId,
        name: "Test",
        response,
      });
      expect(r.statusCode, r.body).toBe(400);
      expect(
        (await request(a, "/api/auth/passkeys")).json().items,
      ).toHaveLength(0);
    },
  );
  it("binds challenges to a session and prevents registering the same ID on another account", async () => {
    const key = await register(),
      o = await options();
    expect(
      (
        await request(b, "/api/auth/passkeys/verify", "POST", {
          challengeId: o.challengeId,
          name: "Test",
          response: registration(authenticator(), o.options.challenge),
        })
      ).statusCode,
    ).toBe(400);
    const other = await options(b);
    expect(
      (
        await request(b, "/api/auth/passkeys/verify", "POST", {
          challengeId: other.challengeId,
          name: "Test",
          response: registration(key, other.options.challenge),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("requires recent identity confirmation for add/remove and preserves last-key protection", async () => {
    const key = await register();
    time += 300001;
    expect(
      (await request(a, "/api/auth/passkeys/options", "POST")).statusCode,
    ).toBe(403);
    expect(
      (await request(a, "/api/auth/passkeys/" + key.id, "DELETE")).statusCode,
    ).toBe(403);
    expect(
      (await request(a, "/api/auth/lock/reauth", "POST", { password }))
        .statusCode,
    ).toBe(200);
    await enable();
    expect(
      (await request(a, "/api/auth/passkeys/" + key.id, "DELETE")).statusCode,
    ).toBe(409);
    expect(
      (
        await request(a, "/api/auth/lock/preferences", "PUT", {
          enabled: false,
          timeoutSeconds: 300,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request(a, "/api/auth/passkeys/" + key.id, "DELETE")).statusCode,
    ).toBe(200);
  });
});

describe("Server-authoritative unlock", () => {
  it("denies every private route while locked and restores access with a verified signature", async () => {
    const key = await register();
    await enable();
    await lock();
    for (const url of [
      "/api/memories",
      "/api/collections",
      "/api/albums",
      "/api/settings",
      "/api/world",
      "/api/auth/passkeys",
      `/api/media/${randomUUID()}/thumb`,
      `/api/media/${randomUUID()}/display`,
      `/api/media/${randomUUID()}/original`,
      `/api/memories/${randomUUID()}/comments`,
      `/api/avatars/${a.id}`,
    ]) {
      const r = await request(a, url);
      expect(r.statusCode, url + " " + r.body).toBe(423);
      expect(r.json().code).toBe("DIARY_LOCKED");
    }
    expect((await request(a, "/api/auth/me")).json().lock.locked).toBe(true);
    const o = await authOptions();
    expect(o.options.userVerification).toBe("required");
    const payload = {
      challengeId: o.challengeId,
      response: assertion(key, o.options.challenge, a.id),
    };
    expect(
      (await request(a, "/api/auth/lock/verify", "POST", payload)).json()
        .locked,
    ).toBe(false);
    expect((await request(a, "/api/memories")).statusCode).toBe(200);
    expect(
      (await request(a, "/api/auth/lock/verify", "POST", payload)).statusCode,
    ).toBe(400);
  });
  it.each([
    "signature",
    "origin",
    "rp",
    "uv",
    "challenge",
    "revoked",
    "expired",
  ])("rejects invalid unlock: %s", async (kind) => {
    const key = await register();
    await enable();
    await lock();
    const o = await authOptions();
    if (kind === "revoked")
      storage.sqlite.prepare("DELETE FROM passkeys WHERE id=?").run(key.id);
    if (kind === "expired") time += 120001;
    const response = assertion(
      key,
      kind === "challenge"
        ? randomBytes(32).toString("base64url")
        : o.options.challenge,
      a.id,
      {
        site: kind === "origin" ? "https://evil.invalid" : origin,
        rp: kind === "rp" ? "evil.invalid" : "localhost",
        uv: kind !== "uv",
        invalidSignature: kind === "signature",
      },
    );
    const r = await request(a, "/api/auth/lock/verify", "POST", {
      challengeId: o.challengeId,
      response,
    });
    expect(r.statusCode, r.body).toBe(400);
    expect((await request(a, "/api/memories")).statusCode).toBe(423);
  });
  it("checks credential owner, session expiry and revocation", async () => {
    const key = await register();
    await register(b);
    await enable(300, b);
    await lock(b);
    const o = await authOptions(b);
    expect(
      (
        await request(b, "/api/auth/lock/verify", "POST", {
          challengeId: o.challengeId,
          response: assertion(key, o.options.challenge, b.id),
        })
      ).statusCode,
    ).toBe(400);
    storage.sqlite
      .prepare("UPDATE session SET expires=? WHERE user_id=?")
      .run(time - 1, b.id);
    expect((await request(b, "/api/auth/lock/state")).statusCode).toBe(401);
    expect((await request(a, "/api/auth/logout", "POST")).statusCode).toBe(200);
    expect(
      (await request(a, "/api/auth/lock/options", "POST")).statusCode,
    ).toBe(401);
  });
  it("handles signature counters and permits zero-counter passkeys per library rules", async () => {
    const key = await register();
    await enable();
    await lock();
    let o = await authOptions();
    expect(
      (
        await request(a, "/api/auth/lock/verify", "POST", {
          challengeId: o.challengeId,
          response: assertion(key, o.options.challenge, a.id, { counter: 0 }),
        })
      ).statusCode,
    ).toBe(200);
    await lock();
    o = await authOptions();
    expect(
      (
        await request(a, "/api/auth/lock/verify", "POST", {
          challengeId: o.challengeId,
          response: assertion(key, o.options.challenge, a.id, { counter: 1 }),
        })
      ).statusCode,
    ).toBe(200);
    await lock();
    o = await authOptions();
    expect(
      (
        await request(a, "/api/auth/lock/verify", "POST", {
          challengeId: o.challengeId,
          response: assertion(key, o.options.challenge, a.id, { counter: 1 }),
        })
      ).statusCode,
    ).toBe(400);
  });
  it("verifies the fallback password, rate limits attempts and permits locked logout", async () => {
    await register();
    await enable();
    await lock();
    expect(
      (
        await request(a, "/api/auth/lock/password", "POST", {
          password: "sbagliata",
        })
      ).statusCode,
    ).toBe(400);
    expect((await request(a, "/api/auth/lock/state")).json().locked).toBe(true);
    expect(
      (await request(a, "/api/auth/lock/password", "POST", { password })).json()
        .locked,
    ).toBe(false);
    await lock();
    for (let i = 0; i < 7; i++)
      await request(a, "/api/auth/lock/password", "POST", {
        password: "sbagliata",
      });
    expect(
      (await request(a, "/api/auth/lock/password", "POST", { password }))
        .statusCode,
    ).toBe(429);
    expect((await request(a, "/api/auth/logout", "POST")).statusCode).toBe(200);
  });
});

describe("Timeouts, visibility and independent accounts", () => {
  it.each([60, 300, 900])(
    "expires at %s seconds without relying on a client timer",
    async (seconds) => {
      await register();
      await enable(seconds);
      time += seconds * 1000 - 1;
      expect((await request(a, "/api/auth/lock/state")).json().locked).toBe(
        false,
      );
      time += 1;
      expect((await request(a, "/api/memories")).statusCode).toBe(423);
      expect(
        (
          await request(a, "/api/auth/lock/activity", "POST", {
            tabId: randomUUID(),
          })
        ).statusCode,
      ).toBe(423);
      expect((await request(b, "/api/memories")).statusCode).toBe(200);
    },
  );
  it("locks immediately in background, persists across reload, and leaves another active tab usable", async () => {
    await register();
    await enable(0);
    const first = randomUUID(),
      second = randomUUID();
    await request(a, "/api/auth/lock/activity", "POST", { tabId: first });
    await request(a, "/api/auth/lock/activity", "POST", { tabId: second });
    expect(
      (
        await request(a, "/api/auth/lock/visibility", "POST", {
          tabId: first,
          hidden: true,
        })
      ).json().locked,
    ).toBe(false);
    expect(
      (
        await request(a, "/api/auth/lock/visibility", "POST", {
          tabId: second,
          hidden: true,
        })
      ).json().locked,
    ).toBe(true);
    expect((await request(a, "/api/auth/me")).json().lock.locked).toBe(true);
  });
  it("counts real activity, survives suspended timers, and does not extend time on state reads", async () => {
    await register();
    await enable(300);
    const tabId = randomUUID();
    time += 240000;
    await request(a, "/api/auth/lock/activity", "POST", { tabId });
    time += 240000;
    expect((await request(a, "/api/auth/lock/state")).json().locked).toBe(
      false,
    );
    await request(a, "/api/auth/lock/visibility", "POST", {
      tabId,
      hidden: true,
    });
    time += 60001;
    expect(
      (
        await request(a, "/api/auth/lock/visibility", "POST", {
          tabId,
          hidden: false,
        })
      ).json().locked,
    ).toBe(true);
  });
  it("discards presence from tabs reloaded while locked before a new immediate background lock", async () => {
    await register();
    await enable(0);
    await request(a, "/api/auth/lock/activity", "POST", {
      tabId: randomUUID(),
    });
    await lock();
    await request(a, "/api/auth/lock/password", "POST", { password });
    const newTab = randomUUID();
    await request(a, "/api/auth/lock/activity", "POST", { tabId: newTab });
    expect(
      (
        await request(a, "/api/auth/lock/visibility", "POST", {
          tabId: newTab,
          hidden: true,
        })
      ).json().locked,
    ).toBe(true);
  });
  it("rejects activation without a key and locks other sessions when preferences change", async () => {
    expect(
      (
        await request(a, "/api/auth/lock/preferences", "PUT", {
          enabled: true,
          timeoutSeconds: 300,
        })
      ).statusCode,
    ).toBe(409);
    await register();
    const other = await login();
    await enable();
    expect((await request(other, "/api/memories")).statusCode).toBe(423);
    expect((await request(b, "/api/auth/lock/state")).json().enabled).toBe(
      false,
    );
  });
});
