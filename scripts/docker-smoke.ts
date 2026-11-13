/** End-to-end container check. Uses an isolated Compose project and disposable volumes. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const suffix = randomBytes(5).toString("hex");
const project = "akai-qa-" + suffix;
const restoredVolume = project + "-restored";
const root = process.cwd();
const artifacts = path.join(root, ".tools", project);
const override = path.join(artifacts, "compose.json");
const port = Number(process.env.SMOKE_PORT ?? 33117);
const image = process.env.SMOKE_IMAGE ?? "akai-ito:local";
const platform =
  process.env.SMOKE_PLATFORM ??
  (process.arch === "arm64" ? "linux/arm64" : "linux/amd64");
const origin = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  APP_ORIGIN: origin,
  COOKIE_SECURE: "false",
  PORT: String(port),
  TRUST_PROXY: "false",
};
function run(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `docker ${args.slice(0, 4).join(" ")}: ${result.stderr || result.error || result.stdout}`,
    );
  return result.stdout.trim();
}
const compose = (args: string[], input?: string) =>
  run(
    [
      "compose",
      "--project-name",
      project,
      "--env-file",
      ".env.example",
      "-f",
      "docker-compose.yml",
      "-f",
      override,
      ...args,
    ],
    input,
  );
const ensure = (condition: unknown, label: string) => {
  if (!condition) throw new Error(label);
  console.info("PASS " + label);
};
async function healthy() {
  for (let n = 0; n < 40; n++) {
    try {
      const r = await fetch(origin + "/api/health");
      if (r.ok) return;
    } catch {
      /* Container may still be starting. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Healthcheck non disponibile.");
}
await mkdir(artifacts, { recursive: true });
await writeFile(
  override,
  JSON.stringify({ services: { app: { image, platform } } }),
);
try {
  compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "90"]);
  await healthy();
  ensure(
    compose(["exec", "-T", "app", "id", "-u"]) === "1000",
    "container senza root",
  );
  const password = randomBytes(32).toString("hex");
  const initializer =
    "import {openDb} from './apps/api/dist/db.js'; import {initializeUsers} from './apps/api/dist/cli.js'; let raw='';for await(const chunk of process.stdin)raw+=chunk;const {db,sqlite}=openDb('/app/data');await initializeUsers(db,JSON.parse(raw));sqlite.close();";
  compose(
    ["exec", "-T", "app", "node", "--input-type=module", "-e", initializer],
    JSON.stringify([
      { username: "qa-first", name: "QA uno", password },
      { username: "qa-second", name: "QA due", password },
    ]),
  );
  type Login = { cookie: string; csrf: string };
  async function login(username: string): Promise<Login> {
    const r = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    ensure(r.ok, "login " + username);
    const body = (await r.json()) as { csrf: string };
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0],
      csrf: body.csrf,
    };
  }
  const a = await login("qa-first"),
    b = await login("qa-second");
  const headers = (s: Login) => ({
    origin,
    cookie: s.cookie,
    "x-csrf-token": s.csrf,
  });
  const png = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#d8c3a5" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      memory: {
        title: "Ricordo temporaneo QA",
        eventDate: "2024-04-01",
        description: "Solo nel volume di test.",
        category: "Viaggi",
        location: "",
      },
      photos: ["new:0"],
      cover: "new:0",
    }),
  );
  form.append(
    "photos",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    "qa.png",
  );
  const created = await fetch(origin + "/api/memories", {
    method: "POST",
    headers: headers(a),
    body: form,
  });
  ensure(created.status === 201, "creazione con fotografia nel container");
  const m = (await created.json()) as { id: string; photos: { id: string }[] };
  const mediaUrl = origin + `/api/media/${m.photos[0].id}/thumb`;
  ensure(
    (await fetch(mediaUrl)).status === 401,
    "foto inaccessibile senza sessione",
  );
  ensure(
    (await fetch(mediaUrl, { headers: headers(b) })).ok,
    "foto condivisa con il secondo account",
  );
  const thought = await fetch(origin + `/api/memories/${m.id}/comments`, {
    method: "POST",
    headers: { ...headers(b), "content-type": "application/json" },
    body: JSON.stringify({ body: "Pensiero temporaneo." }),
  });
  ensure(thought.status === 201, "commento del secondo account");
  compose(["restart", "app"]);
  await healthy();
  ensure(
    (await fetch(origin + "/api/memories/" + m.id, { headers: headers(a) })).ok,
    "ricordo e sessione persistenti dopo riavvio",
  );
  ensure(
    (await fetch(mediaUrl, { headers: headers(a) })).ok,
    "fotografia persistente dopo riavvio",
  );
  const html = await fetch(origin + "/memories/" + m.id);
  const markup = await html.text();
  ensure(
    html.ok && markup.includes("Akai Ito"),
    "frontend e route SPA serviti dal backend",
  );
  const assetPath = markup.match(/src="([^"]+\.js)"/)?.[1];
  ensure(assetPath, "asset JavaScript presente nella pagina");
  const asset = await fetch(origin + assetPath);
  ensure(
    asset.ok && asset.headers.get("cache-control")?.includes("immutable"),
    "asset statici serviti e cache corretta",
  );
  // Stop every writer, archive DB/WAL/media together, restore to a separate volume.
  compose(["stop", "app"]);
  compose([
    "run",
    "--rm",
    "--no-deps",
    "-T",
    "-v",
    artifacts + ":/backup",
    "app",
    "sh",
    "-c",
    "tar -czf /backup/snapshot.tar.gz -C /app/data .",
  ]);
  run(["volume", "create", restoredVolume]);
  run([
    "run",
    "--rm",
    "--user",
    "0:0",
    "-v",
    restoredVolume + ":/restore",
    "-v",
    artifacts + ":/backup:ro",
    "--platform",
    platform,
    image,
    "sh",
    "-c",
    "tar -xzf /backup/snapshot.tar.gz -C /restore && chown -R 1000:1000 /restore",
  ]);
  const verified = run([
    "run",
    "--rm",
    "-e",
    "DATA_DIR=/restore",
    "-v",
    restoredVolume + ":/restore",
    "--platform",
    platform,
    image,
    "node",
    "apps/api/dist/cli.js",
    "verify",
  ]);
  ensure(
    JSON.parse(verified).healthy,
    "backup ripristinato: SQLite, relazioni e file integri",
  );
  const inspect =
    "import {openDb} from './apps/api/dist/db.js';const {sqlite}=openDb('/restore');console.log(JSON.stringify({memories:sqlite.prepare('select count(*) n from memories').get().n,photos:sqlite.prepare('select count(*) n from memory_media').get().n,comments:sqlite.prepare('select count(*) n from comments').get().n}));sqlite.close();";
  const counts = JSON.parse(
    run([
      "run",
      "--rm",
      "-v",
      restoredVolume + ":/restore",
      "--platform",
      platform,
      image,
      "node",
      "--input-type=module",
      "-e",
      inspect,
    ]),
  );
  ensure(
    counts.memories === 1 && counts.photos === 1 && counts.comments === 1,
    "contenuti reali conservati nel backup",
  );
  console.info(
    "Docker smoke test completato. Nessun dato dimostrativo nel diario.",
  );
} finally {
  compose(["down", "--volumes", "--remove-orphans"]);
  const inspected = spawnSync("docker", ["volume", "inspect", restoredVolume], {
    encoding: "utf8",
  });
  if (inspected.status === 0) run(["volume", "rm", restoredVolume]);
  if (
    path.resolve(artifacts).startsWith(path.resolve(root, ".tools") + path.sep)
  )
    await rm(artifacts, { recursive: true, force: true });
}
