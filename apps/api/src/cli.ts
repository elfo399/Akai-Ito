import { openDb, migrate } from "./db.js";
import { users, media, memories, settings } from "./schema.js";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readdir, unlink, access } from "node:fs/promises";
import path from "node:path";
import { eq, lt } from "drizzle-orm";
import argon2 from "argon2";
import { z } from "zod";
import { passwordInput } from "@akai/shared";
import { dataDirectory } from "./config.js";
import { importPhotoMetadata } from "./import-photo-metadata.js";
export async function initializeUsers(
  db: ReturnType<typeof openDb>["db"],
  inputs: { username: string; name: string; password: string }[],
) {
  if (db.select().from(users).all().length)
    throw new Error("Gli account sono già configurati.");
  const input = z
    .array(
      z.object({
        username: z.string().regex(/^[a-z0-9_.-]{3,40}$/),
        name: z.string().trim().min(1).max(80),
        password: passwordInput,
      }),
    )
    .length(2)
    .parse(inputs);
  if (input[0].username === input[1].username)
    throw new Error("I nomi utente devono essere diversi.");
  const rows = await Promise.all(
    input.map(async (u) => ({
      ...u,
      id: randomUUID(),
      password: await argon2.hash(u.password, { type: argon2.argon2id }),
    })),
  );
  db.transaction((tx) => {
    if (tx.select().from(users).all().length)
      throw new Error("Account già presenti.");
    tx.insert(users).values(rows).run();
  });
}
async function secret(label: string): Promise<string> {
  if (!stdin.isTTY)
    throw new Error(
      "Per inserire la password serve un terminale interattivo (docker compose exec app ...).",
    );
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const listener = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Operazione annullata."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    const cleanup = () => {
      stdin.off("data", listener);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    stdin.on("data", listener);
  });
}
export async function maintenance(dataDir: string, purge = false) {
  const { sqlite, db } = openDb(dataDir);
  let missing = 0;
  try {
    if (purge) {
      const expired = db
        .select()
        .from(memories)
        .where(
          lt(
            memories.deletedAt,
            new Date(Date.now() - 30 * 86400000).toISOString(),
          ),
        )
        .all();
      for (const m of expired)
        db.transaction((tx) => {
          const photos = tx
            .select()
            .from(media)
            .where(eq(media.memoryId, m.id))
            .all();
          for (const p of photos)
            tx.update(settings)
              .set({ cover: null })
              .where(eq(settings.cover, p.id))
              .run();
          tx.delete(memories).where(eq(memories.id, m.id)).run();
        });
    }
    const referenced = new Set<string>();
    for (const row of db.select().from(media).all())
      for (const name of [row.original, row.display, row.thumb])
        referenced.add(name);
    for (const user of db.select().from(users).all())
      if (user.avatar) referenced.add(user.avatar);
    const storage = path.join(dataDir, "media");
    for (const name of referenced) {
      try {
        await access(path.join(storage, name));
      } catch {
        missing++;
      }
    }
    let orphaned = 0;
    for (const name of await readdir(storage).catch(() => []))
      if (!referenced.has(name)) {
        orphaned++;
        if (purge) await unlink(path.join(storage, name));
      }
    const integrity = sqlite.pragma("integrity_check") as {
      integrity_check: string;
    }[];
    const foreign = sqlite.pragma("foreign_key_check") as unknown[];
    const healthy =
      integrity.every((r) => r.integrity_check === "ok") &&
      !foreign.length &&
      !missing;
    console.info(
      JSON.stringify({
        healthy,
        missing,
        orphaned,
        purged: purge,
        integrity: healthy ? "ok" : "failed",
      }),
    );
    return healthy;
  } finally {
    sqlite.close();
  }
}
// No side effects when this module is imported by tests.
if (process.argv[1] && /(?:^|[/\\])cli\.(?:ts|js)$/.test(process.argv[1])) {
  const dataDir = dataDirectory();
  const command = process.argv[2];
  try {
    if (command === "import-photo-metadata") {
      const flags = process.argv.slice(3);
      if (
        flags.some((flag) => !["--dry-run", "--apply"].includes(flag)) ||
        flags.length > 1
      )
        throw new Error("Usa --dry-run (predefinito) oppure --apply.");
      const summary = await importPhotoMetadata(
        dataDir,
        flags.includes("--apply"),
      );
      console.info(JSON.stringify(summary));
      if (summary.errors) process.exitCode = 1;
    } else if (command === "verify" || command === "purge") {
      if (!(await maintenance(dataDir, command === "purge")))
        process.exitCode = 1;
    } else {
      const { sqlite, db } = openDb(dataDir);
      try {
        if (command === "migrate") {
          migrate(sqlite);
          console.info("Migrazioni applicate.");
        } else if (command === "init-users") {
          const ask = async (label: string) => {
            const rl = createInterface({ input: stdin, output: stdout });
            try {
              return await rl.question(label);
            } finally {
              rl.close();
            }
          };
          if (db.select().from(users).all().length)
            throw new Error("Gli account sono già configurati.");
          const inputs = [];
          for (let n = 1; n <= 2; n++) {
            const username = (
              await ask(`Account ${n} — nome utente (a-z, 3–40 caratteri): `)
            )
              .trim()
              .toLowerCase();
            const name = await ask("Nome visualizzato: ");
            const password = await secret(
              "Password (almeno 12 caratteri, nascosta): ",
            );
            const confirm = await secret("Ripeti password: ");
            if (password !== confirm)
              throw new Error("Le password non coincidono.");
            inputs.push({ username, name, password });
          }
          await initializeUsers(db, inputs);
          console.info("Creati entrambi gli account. Il diario è vuoto.");
        } else if (command === "backup") {
          // Used offline from the documented stopped-container procedure.
          const target = process.argv[3];
          if (!target) throw new Error("Indica il file di destinazione.");
          await sqlite.backup(target);
          console.info("Snapshot SQLite creato.");
        } else
          throw new Error(
            "Comando non valido. Usa migrate, init-users, verify, purge o backup.",
          );
      } finally {
        sqlite.close();
      }
    }
  } catch (error) {
    console.error(
      error instanceof z.ZodError
        ? "Dati non validi: controlla nomi e password."
        : (error as Error).message,
    );
    process.exitCode = 1;
  }
}
