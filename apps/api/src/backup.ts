import http from "node:http";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  backupConfiguration,
  backupAction,
  type BackupStatus,
} from "@akai/shared";
import type { DiaryLock } from "./diary-lock.js";

export type BackupControl = {
  request: (
    method: "GET" | "POST",
    route: string,
    body?: unknown,
  ) => Promise<unknown>;
};
const unavailable = () =>
  Object.assign(
    new Error("Il collegamento ai backup non è disponibile. Riprova tra poco."),
    { statusCode: 503 },
  );
export function backupControl(): BackupControl {
  return {
    async request(method, route, body) {
      const socketPath =
        process.env.VAULT_CONTROL_SOCKET ?? "/app/vault-control/control.sock";
      let key: string;
      try {
        key = (
          await readFile(
            process.env.VAULT_CONTROL_KEY ?? "/app/vault-control/control.key",
            "utf8",
          )
        ).trim();
      } catch {
        throw unavailable();
      }
      if (!/^[a-f0-9]{64}$/.test(key)) throw unavailable();
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            socketPath,
            path: route,
            method,
            timeout: 8000,
            headers: {
              Authorization: "Bearer " + key,
              ...(encoded
                ? {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(encoded),
                  }
                : {}),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            let length = 0;
            res.on("data", (chunk: Buffer) => {
              length += chunk.length;
              if (length > 512_000) req.destroy(unavailable());
              else chunks.push(chunk);
            });
            res.on("error", () => reject(unavailable()));
            res.on("end", () => {
              try {
                const data = JSON.parse(Buffer.concat(chunks).toString());
                if (res.statusCode! >= 400) {
                  const messages: Record<string, string> = {
                    busy: "Un backup o un aggiornamento è già in corso. Attendi e riprova.",
                    invalid_destination:
                      "La destinazione scelta non è disponibile o non è scrivibile.",
                    local_acknowledgement:
                      "Conferma di aver compreso i limiti della copia locale.",
                    password_required:
                      "Scegli una password di cifratura e conservala separatamente.",
                    key_already_configured:
                      "La password di cifratura è già configurata e viene conservata.",
                    unsafe_destination:
                      "La cartella scelta non può essere usata per i backup.",
                    not_ready:
                      "Salva e prepara prima la destinazione dei backup.",
                  };
                  reject(
                    Object.assign(
                      new Error(
                        messages[data.error] ??
                          "Non è stato possibile completare l’operazione di backup.",
                      ),
                      {
                        statusCode: [400, 409].includes(res.statusCode!)
                          ? res.statusCode
                          : 503,
                      },
                    ),
                  );
                } else resolve(data);
              } catch {
                reject(unavailable());
              }
            });
          },
        );
        req.on("timeout", () => req.destroy(unavailable()));
        req.on("error", () => reject(unavailable()));
        req.end(encoded);
      });
    },
  };
}

export function registerBackup(
  app: FastifyInstance,
  lock: DiaryLock,
  control: BackupControl,
) {
  app.get("/api/backup/status", async () => {
    try {
      return await control.request("GET", "/status");
    } catch {
      return {
        available: false,
        reason: "unavailable",
        destinations: [],
        configuration: null,
        keyConfigured: false,
        ready: false,
        automaticActive: false,
        targetPath: null,
        job: null,
        lastAttempt: null,
        lastSuccess: null,
        lastRestoreTest: null,
        snapshotCount: 0,
      } satisfies BackupStatus;
    }
  });
  const limited = {
    config: { rateLimit: { max: 20, timeWindow: "15 minutes" } },
  };
  app.put("/api/backup/configuration", limited, async (req) => {
    lock.fresh(req.identity!.sessionId);
    return control.request(
      "POST",
      "/configure",
      backupConfiguration.parse(req.body),
    );
  });
  app.post("/api/backup/actions", limited, async (req) => {
    lock.fresh(req.identity!.sessionId);
    const action = backupAction.parse(
      (req.body as { action?: unknown })?.action,
    );
    if (!req.body || Object.keys(req.body).length !== 1)
      throw Object.assign(new Error("Controlla l’operazione richiesta."), {
        statusCode: 400,
      });
    return control.request("POST", "/actions", { action });
  });
}
