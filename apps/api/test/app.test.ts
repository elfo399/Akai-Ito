import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app.js";
import { memories as memoryTable } from "../src/schema.js";
import { eq } from "drizzle-orm";
import { openDb, migrate } from "../src/db.js";
import { initializeUsers, maintenance } from "../src/cli.js";
import { daysTogether, civilDate } from "@akai/shared";
import type { Memory } from "../../web/src/types";

const origin = "http://localhost:5173";
const password = randomBytes(24).toString("hex");
type Session = { cookie: string; csrf: string; id: string };
let directory: string,
  app: FastifyInstance,
  a: Session,
  b: Session,
  image: Buffer;
const headers = (s: Session) => ({
  cookie: s.cookie,
  origin,
  "x-csrf-token": s.csrf,
});
const memory = (title = "Un giorno insieme", eventDate = "2024-05-12") => ({
  title,
  eventDate,
  description: "Il nostro piccolo momento.",
  category: "Viaggi",
  location: "Roma",
});
function multipart(
  data: unknown,
  files: { buffer: Buffer; type: string; name?: string }[] = [],
) {
  const boundary = "akai-" + randomUUID();
  const chunks: Buffer[] =
    data === undefined
      ? []
      : [
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(data)}\r\n`,
          ),
        ];
  for (const file of files)
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${file.name ?? "foto.png"}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.buffer,
      Buffer.from("\r\n"),
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: "multipart/form-data; boundary=" + boundary,
  };
}
async function login(username: string): Promise<Session> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin },
    payload: { username, password },
  });
  expect(res.statusCode).toBe(200);
  return {
    cookie: res.cookies[0].name + "=" + res.cookies[0].value,
    csrf: res.json().csrf,
    id: res.json().user.id,
  };
}
async function create(
  title = "Un giorno insieme",
  date = "2024-05-12",
  s = a,
  withImage = false,
) {
  const form = multipart(
    {
      memory: memory(title, date),
      photos: withImage ? ["new:0"] : [],
      cover: withImage ? "new:0" : null,
    },
    withImage ? [{ buffer: image, type: "image/png" }] : [],
  );
  const res = await app.inject({
    method: "POST",
    url: "/api/memories",
    headers: { ...headers(s), "content-type": form.contentType },
    payload: form.payload,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Memory>();
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "akai-test-"));
  const { db, sqlite } = openDb(directory);
  migrate(sqlite);
  migrate(sqlite);
  await initializeUsers(db, [
    { username: "first", name: "Prima persona", password },
    { username: "second", name: "Seconda persona", password },
  ]);
  sqlite.close();
  app = await createApp({
    dataDir: directory,
    origin,
    secureCookies: false,
    loginLimit: 100,
  });
  a = await login("first");
  b = await login("second");
  image = await sharp({
    create: { width: 60, height: 40, channels: 3, background: "#c96b6b" },
  })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await app?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("Autenticazione e privacy", () => {
  it("inizializza esattamente due account e nessun ricordo dimostrativo", async () => {
    const r = await app.inject({ url: "/api/memories", headers: headers(a) });
    expect(r.json().total).toBe(0);
    const { db, sqlite } = openDb(directory);
    await expect(initializeUsers(db, [])).rejects.toThrow("già");
    sqlite.close();
  });
  it("rifiuta accessi anonimi alle API private", async () => {
    for (const url of [
      "/api/auth/me",
      "/api/settings",
      "/api/memories",
      "/api/albums",
      "/api/avatars/" + a.id,
    ])
      expect((await app.inject({ url })).statusCode).toBe(401);
  });
  it("rifiuta login errati e origini estranee", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin },
          payload: { username: "first", password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: "https://other.test" },
          payload: { username: "first", password },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("accetta gli indirizzi equivalenti di loopback solo per l’anteprima HTTP locale", async () => {
    for (const localOrigin of ["http://127.0.0.1:5173", "http://[::1]:5173"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: localOrigin, "sec-fetch-site": "same-origin" },
        payload: { username: "first", password },
      });
      expect(response.statusCode, response.body).toBe(200);
      const cookie = response.cookies[0].name + "=" + response.cookies[0].value;
      const mutation = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: {
          origin: localOrigin,
          cookie,
          "x-csrf-token": response.json().csrf,
        },
        payload: { name: "Prima persona" },
      });
      expect(mutation.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/profile",
            headers: { origin: localOrigin, cookie },
            payload: { name: "Prima persona" },
          })
        ).statusCode,
      ).toBe(403);
    }
  });
  it("rifiuta origini mancanti, opache, porte diverse, domini ingannevoli e richieste cross-site", async () => {
    for (const rejected of [
      undefined,
      "null",
      "http://127.0.0.1:5174",
      "https://127.0.0.1:5173",
      "http://localhost.evil.test:5173",
      "http://127.1:5173",
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: rejected ? { origin: rejected } : {},
            payload: { username: "first", password },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: "http://127.0.0.1:5173",
            "sec-fetch-site": "cross-site",
          },
          payload: { username: "first", password },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("mantiene il controllo esatto dell’origine quando i cookie sono Secure o l’host non è locale", async () => {
    for (const config of [
      { origin, secureCookies: true },
      { origin: "https://diary.test", secureCookies: false },
    ]) {
      const strict = await createApp({ dataDir: directory, ...config });
      try {
        expect(
          (
            await strict.inject({
              method: "POST",
              url: "/api/auth/login",
              headers: { origin: "http://127.0.0.1:5173" },
              payload: { username: "first", password },
            })
          ).statusCode,
        ).toBe(403);
      } finally {
        await strict.close();
      }
    }
  });
  it("ripristina sessione persistente con cookie HttpOnly e SameSite", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: { username: "first", password },
    });
    expect(r.headers["set-cookie"]).toMatch(/HttpOnly/);
    expect(r.headers["set-cookie"]).toMatch(/SameSite=Strict/);
    expect(
      (
        await app.inject({ url: "/api/auth/me", headers: { cookie: a.cookie } })
      ).json().user.id,
    ).toBe(a.id);
  });
  it("blocca mutazioni prive di CSRF o con origine non valida", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { cookie: a.cookie, origin },
      payload: { name: "X" },
    });
    expect(r.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/profile",
          headers: { ...headers(a), origin: "https://other.test" },
          payload: { name: "X" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("revoca la sessione al logout", async () => {
    const s = await login("first");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: headers(s),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: { cookie: s.cookie } }))
        .statusCode,
    ).toBe(401);
  });
  it("limita i tentativi di login", async () => {
    const limited = await createApp({
      dataDir: directory,
      origin,
      secureCookies: false,
      loginLimit: 1,
    });
    try {
      const opts = {
        method: "POST" as const,
        url: "/api/auth/login",
        headers: { origin },
        payload: { username: "missing", password: "invalid" },
      };
      expect((await limited.inject(opts)).statusCode).toBe(401);
      expect((await limited.inject(opts)).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
describe("Ricordi condivisi e fotografie", () => {
  it("crea un ricordo persistente visibile al secondo account", async () => {
    const m = await create();
    const r = await app.inject({
      url: "/api/memories/" + m.id,
      headers: headers(b),
    });
    expect(r.json().title).toBe(m.title);
    expect(r.json().authorId).toBe(a.id);
  });
  it("valida date civili e campi obbligatori", async () => {
    const form = multipart({
      memory: { ...memory(), title: "", eventDate: "2024-02-30" },
      photos: [],
      cover: null,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/memories",
          headers: { ...headers(a), "content-type": form.contentType },
          payload: form.payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(civilDate.safeParse("2024-02-30").success).toBe(false);
  });
  it("permette al secondo account di modificare e rileva conflitti", async () => {
    const m = await create("Versione iniziale");
    const form = multipart({
      memory: memory("Modificato dal secondo"),
      version: m.version,
      photos: [],
      cover: null,
    });
    const opts = {
      method: "PUT" as const,
      url: "/api/memories/" + m.id,
      headers: { ...headers(b), "content-type": form.contentType },
      payload: form.payload,
    };
    const updated = await app.inject(opts);
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().version).toBe(2);
    expect((await app.inject(opts)).statusCode).toBe(409);
    expect(
      (
        await app.inject({ url: "/api/memories/" + m.id, headers: headers(a) })
      ).json().title,
    ).toBe("Modificato dal secondo");
  });
  it("carica foto valide e protegge miniature, display e originali", async () => {
    const m = await create("Con fotografia", "2023-08-12", a, true);
    expect(m.photos).toHaveLength(1);
    for (const size of ["thumb", "display", "original"]) {
      const url = `/api/media/${m.photos[0].id}/${size}`;
      expect((await app.inject({ url })).statusCode).toBe(401);
      const r = await app.inject({ url, headers: headers(b) });
      expect(r.statusCode).toBe(200);
      expect(r.headers["cache-control"]).toBe("private, no-store");
      expect((await sharp(r.rawPayload).metadata()).format).toBe(
        size === "original" ? "png" : "webp",
      );
    }
    expect((await readdir(path.join(directory, "media"))).length).toBe(3);
  });
  it("rifiuta contenuti falsi e ripulisce un upload parzialmente riuscito", async () => {
    const before = (await readdir(path.join(directory, "media"))).sort();
    const listBefore = (
      await app.inject({ url: "/api/memories", headers: headers(a) })
    ).json().total;
    const form = multipart(
      { memory: memory(), photos: ["new:0", "new:1"], cover: "new:0" },
      [
        { buffer: image, type: "image/png" },
        {
          buffer: Buffer.from("<script>fake image</script>"),
          type: "image/png",
        },
      ],
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/memories",
          headers: { ...headers(a), "content-type": form.contentType },
          payload: form.payload,
        })
      ).statusCode,
    ).toBe(400);
    expect((await readdir(path.join(directory, "media"))).sort()).toEqual(
      before,
    );
    expect(
      (await app.inject({ url: "/api/memories", headers: headers(a) })).json()
        .total,
    ).toBe(listBefore);
  });
  it("rifiuta MIME incongruenti, SVG e path traversal", async () => {
    for (const type of ["image/jpeg", "image/svg+xml"]) {
      const form = multipart(
        { memory: memory(), photos: ["new:0"], cover: "new:0" },
        [{ buffer: image, type, name: "../../evil.svg" }],
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/memories",
            headers: { ...headers(a), "content-type": form.contentType },
            payload: form.payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          url: "/api/media/not-a-uuid/original",
          headers: headers(a),
        })
      ).statusCode,
    ).toBe(400);
  });
  it("riordina, cambia copertina ed elimina una fotografia", async () => {
    const form = multipart(
      {
        memory: memory("Due foto"),
        photos: ["new:0", "new:1"],
        cover: "new:0",
      },
      [
        { buffer: image, type: "image/png" },
        { buffer: image, type: "image/png" },
      ],
    );
    const m = (
      await app.inject({
        method: "POST",
        url: "/api/memories",
        headers: { ...headers(a), "content-type": form.contentType },
        payload: form.payload,
      })
    ).json<Memory>();
    const update = multipart({
      memory: memory("Foto riordinate"),
      version: m.version,
      photos: [m.photos[1].id, m.photos[0].id],
      cover: m.photos[1].id,
    });
    const r = await app.inject({
      method: "PUT",
      url: "/api/memories/" + m.id,
      headers: { ...headers(b), "content-type": update.contentType },
      payload: update.payload,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().photos[0].id).toBe(m.photos[1].id);
    expect(r.json().photos[0].isCover).toBe(true);
    const remove = multipart({
      memory: memory("Una sola foto"),
      version: 2,
      photos: [m.photos[1].id],
      cover: m.photos[1].id,
    });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/memories/" + m.id,
          headers: { ...headers(a), "content-type": remove.contentType },
          payload: remove.payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `/api/media/${m.photos[0].id}/thumb`,
          headers: headers(a),
        })
      ).statusCode,
    ).toBe(404);
  });
  it("ripulisce file nuovi quando un salvataggio è in conflitto", async () => {
    const m = await create();
    const before = (await readdir(path.join(directory, "media"))).sort();
    const form = multipart(
      { memory: memory(), version: 999, photos: ["new:0"], cover: "new:0" },
      [{ buffer: image, type: "image/png" }],
    );
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/memories/" + m.id,
          headers: { ...headers(a), "content-type": form.contentType },
          payload: form.payload,
        })
      ).statusCode,
    ).toBe(409);
    expect((await readdir(path.join(directory, "media"))).sort()).toEqual(
      before,
    );
  });
  it("ordina per data evento in entrambe le direzioni e filtra anno/categoria", async () => {
    await create("Futuro", "2030-06-01");
    await create("Passato", "2001-01-01");
    const ascending = (
      await app.inject({ url: "/api/memories?order=asc", headers: headers(a) })
    ).json().items;
    expect(ascending[0].eventDate).toBe("2001-01-01");
    const descending = (
      await app.inject({ url: "/api/memories?order=desc", headers: headers(a) })
    ).json().items;
    expect(descending[0].eventDate).toBe("2030-06-01");
    const filtered = (
      await app.inject({
        url: "/api/memories?year=2001&category=Viaggi",
        headers: headers(a),
      })
    ).json().items;
    expect(filtered).toHaveLength(1);
  });
  it("sposta nel cestino, nasconde media e ripristina senza perdere foto", async () => {
    const m = await create("Da ritrovare", "2024-05-12", a, true);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/memories/" + m.id,
          headers: headers(b),
          payload: { version: 1 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/memories/" + m.id, headers: headers(a) }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: `/api/media/${m.photos[0].id}/thumb`,
          headers: headers(a),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: "/api/memories?trash=true",
          headers: headers(a),
        })
      )
        .json()
        .items.some((i: Memory) => i.id === m.id),
    ).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/memories/${m.id}/restore`,
          headers: headers(b),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ url: "/api/memories/" + m.id, headers: headers(a) })
      ).json().photos,
    ).toHaveLength(1);
  });
  it("richiede conferma esplicita per eliminare definitivamente file e record", async () => {
    const m = await create("Da eliminare", "2024-01-01", a, true);
    await app.inject({
      method: "DELETE",
      url: "/api/memories/" + m.id,
      headers: headers(a),
      payload: { version: 1 },
    });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/memories/${m.id}/permanent`,
          headers: headers(a),
          payload: { confirmation: "no" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/memories/${m.id}/permanent`,
          headers: headers(b),
          payload: { confirmation: "ELIMINA" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `/api/media/${m.photos[0].id}/original`,
          headers: headers(a),
        })
      ).statusCode,
    ).toBe(404);
  });
});
describe("Pensieri, album e impostazioni", () => {
  it("salva avatar privati e rifiuta richieste con più avatar senza lasciare file", async () => {
    const boundary = "avatar-" + randomUUID();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({
      method: "POST",
      url: "/api/profile/avatar",
      headers: {
        ...headers(a),
        "content-type": "multipart/form-data; boundary=" + boundary,
      },
      payload: body,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await app.inject({ url: "/api/avatars/" + a.id })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ url: "/api/avatars/" + a.id, headers: headers(b) }))
        .headers["content-type"],
    ).toContain("image/webp");
    const before = (await readdir(path.join(directory, "media"))).sort();
    const double = multipart(undefined, [
      { buffer: image, type: "image/png" },
      { buffer: image, type: "image/png" },
    ]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/profile/avatar",
          headers: { ...headers(a), "content-type": double.contentType },
          payload: double.payload,
        })
      ).statusCode,
    ).toBe(413);
    expect((await readdir(path.join(directory, "media"))).sort()).toEqual(
      before,
    );
  });
  it("accetta anche JPEG e WebP decodificabili", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const buffer = await sharp(image).toFormat(format).toBuffer();
      const form = multipart(
        { memory: memory(format), photos: ["new:0"], cover: "new:0" },
        [{ buffer, type: "image/" + format }],
      );
      const r = await app.inject({
        method: "POST",
        url: "/api/memories",
        headers: { ...headers(a), "content-type": form.contentType },
        payload: form.payload,
      });
      expect(r.statusCode, r.body).toBe(201);
    }
  });
  it("impone limiti configurabili e ripulisce file quando il multipart supera i limiti", async () => {
    const previousFiles = process.env.MAX_UPLOAD_FILES,
      previousMB = process.env.MAX_IMAGE_MB;
    process.env.MAX_UPLOAD_FILES = "1";
    process.env.MAX_IMAGE_MB = "0.0001";
    let limited: FastifyInstance | undefined;
    const before = (await readdir(path.join(directory, "media"))).sort();
    try {
      limited = await createApp({
        dataDir: directory,
        origin,
        secureCookies: false,
      });
      const form = multipart(
        { memory: memory(), photos: ["new:0"], cover: "new:0" },
        [
          {
            buffer: Buffer.concat([image, Buffer.alloc(1024)]),
            type: "image/png",
          },
        ],
      );
      const r = await limited.inject({
        method: "POST",
        url: "/api/memories",
        headers: { ...headers(a), "content-type": form.contentType },
        payload: form.payload,
      });
      expect(r.statusCode, r.body).toBe(413);
      expect((await readdir(path.join(directory, "media"))).sort()).toEqual(
        before,
      );
    } finally {
      await limited?.close();
      if (previousFiles === undefined) delete process.env.MAX_UPLOAD_FILES;
      else process.env.MAX_UPLOAD_FILES = previousFiles;
      if (previousMB === undefined) delete process.env.MAX_IMAGE_MB;
      else process.env.MAX_IMAGE_MB = previousMB;
    }
    process.env.MAX_UPLOAD_FILES = "1";
    try {
      limited = await createApp({
        dataDir: directory,
        origin,
        secureCookies: false,
      });
      const form = multipart(
        { memory: memory(), photos: ["new:0", "new:1"], cover: "new:0" },
        [
          { buffer: image, type: "image/png" },
          { buffer: image, type: "image/png" },
        ],
      );
      const r = await limited.inject({
        method: "POST",
        url: "/api/memories",
        headers: { ...headers(a), "content-type": form.contentType },
        payload: form.payload,
      });
      expect(r.statusCode, r.body).toBe(413);
      expect((await readdir(path.join(directory, "media"))).sort()).toEqual(
        before,
      );
    } finally {
      await limited?.close();
      if (previousFiles === undefined) delete process.env.MAX_UPLOAD_FILES;
      else process.env.MAX_UPLOAD_FILES = previousFiles;
    }
  });
  it("serializza due modifiche concorrenti senza sovrascrivere il ricordo", async () => {
    const m = await create("Concorrenza");
    const send = (session: Session, title: string) => {
      const form = multipart({
        memory: memory(title),
        version: 1,
        photos: [],
        cover: null,
      });
      return app.inject({
        method: "PUT",
        url: "/api/memories/" + m.id,
        headers: { ...headers(session), "content-type": form.contentType },
        payload: form.payload,
      });
    };
    const responses = await Promise.all([
      send(a, "Prima modifica"),
      send(b, "Seconda modifica"),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });
  it("non espone media tramite percorsi codificati o attraversamento directory", async () => {
    const m = await create("Percorsi", "2024-01-01", a, true);
    for (const url of [
      `/api/media/${m.photos[0].id}/thumb?x=1`,
      `/api%2fmedia/${m.photos[0].id}/thumb`,
      `/api/media/${m.photos[0].id}/%74humb`,
      `/api/media/${m.photos[0].id}/../../akai.sqlite`,
    ]) {
      const r = await app.inject({ url });
      expect([400, 401, 404]).toContain(r.statusCode);
      expect(r.headers["content-type"] ?? "").not.toContain("image/");
    }
  });
  it("applica cookie Secure quando configurato per HTTPS", async () => {
    const secure = await createApp({
      dataDir: directory,
      origin: "https://diary.test",
      secureCookies: true,
    });
    try {
      const r = await secure.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: "https://diary.test" },
        payload: { username: "first", password },
      });
      expect(r.statusCode).toBe(200);
      expect(r.headers["set-cookie"]).toMatch(/; Secure/);
    } finally {
      await secure.close();
    }
  });
  it("crea pensieri per entrambi e consente modifiche soltanto al proprio autore", async () => {
    const m = await create("I pensieri");
    const first = await app.inject({
      method: "POST",
      url: `/api/memories/${m.id}/comments`,
      headers: headers(a),
      payload: { body: "Che bello quel giorno." },
    });
    expect(first.statusCode).toBe(201);
    const id = first.json().id;
    for (const method of ["PUT", "DELETE"] as const)
      expect(
        (
          await app.inject({
            method,
            url: "/api/comments/" + id,
            headers: headers(b),
            payload: { body: "No" },
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/comments/" + id,
          headers: headers(a),
          payload: { body: "Lo ricordo ancora." },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/memories/${m.id}/comments`,
          headers: headers(b),
          payload: { body: "Anche io." },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          url: `/api/memories/${m.id}/comments`,
          headers: headers(b),
        })
      ).json(),
    ).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/comments/" + id,
          headers: headers(a),
        })
      ).statusCode,
    ).toBe(200);
  });
  it("genera album per categoria senza duplicare fotografie", async () => {
    const before = (await readdir(path.join(directory, "media"))).length;
    const albums = (
      await app.inject({ url: "/api/albums", headers: headers(a) })
    ).json();
    expect(albums).toHaveLength(6);
    expect(
      albums.find((a: { category: string }) => a.category === "Viaggi").count,
    ).toBeGreaterThan(0);
    const photos = (
      await app.inject({ url: "/api/albums/Viaggi", headers: headers(b) })
    ).json();
    expect(photos.items[0].memoryId).toBeTruthy();
    expect((await readdir(path.join(directory, "media"))).length).toBe(before);
  });
  it("salva configurazione condivisa, nomi personali e copertina", async () => {
    const m = await create("Copertina", "2024-01-01", a, true);
    const r = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: headers(a),
      payload: {
        coupleNames: "Noi due",
        startDate: "2020-02-29",
        cover: m.photos[0].id,
      },
    });
    expect(r.statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/api/settings", headers: headers(b) })).json()
        .settings.startDate,
    ).toBe("2020-02-29");
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/profile",
          headers: headers(b),
          payload: { name: "Il mio nome" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers(b) })).json()
        .user.name,
    ).toBe("Il mio nome");
  });
  it("calcola giorni civili senza effetti di ora legale o UTC", () => {
    expect(daysTogether("2024-03-30", "2024-04-01")).toBe(2);
    expect(daysTogether("2024-10-26", "2024-10-28")).toBe(2);
    expect(daysTogether("2030-01-01", "2024-01-01")).toBe(0);
  });
  it("mantiene dati e sessioni dopo la riapertura del server", async () => {
    await app.close();
    app = await createApp({
      dataDir: directory,
      origin,
      secureCookies: false,
      loginLimit: 100,
    });
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers(a) }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/memories", headers: headers(b) })).json()
        .total,
    ).toBeGreaterThan(0);
    expect((await app.inject({ url: "/api/health" })).json().status).toBe("ok");
    expect(await maintenance(directory)).toBe(true);
  });
  it("elimina solo ricordi nel cestino da oltre 30 giorni e ripulisce le fotografie", async () => {
    const old = await create("Scaduto", "2020-01-01", a, true),
      recent = await create("Recuperabile", "2024-01-01", a, true);
    for (const m of [old, recent])
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: "/api/memories/" + m.id,
            headers: headers(a),
            payload: { version: 1 },
          })
        ).statusCode,
      ).toBe(200);
    await app.close();
    const { db, sqlite } = openDb(directory);
    db.update(memoryTable)
      .set({ deletedAt: new Date(Date.now() - 31 * 86400000).toISOString() })
      .where(eq(memoryTable.id, old.id))
      .run();
    sqlite.close();
    expect(await maintenance(directory, true)).toBe(true);
    app = await createApp({
      dataDir: directory,
      origin,
      secureCookies: false,
      loginLimit: 100,
    });
    const trash = (
      await app.inject({ url: "/api/memories?trash=true", headers: headers(b) })
    ).json().items;
    expect(trash.some((m: Memory) => m.id === old.id)).toBe(false);
    expect(trash.some((m: Memory) => m.id === recent.id)).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/memories/${recent.id}/restore`,
          headers: headers(b),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `/api/media/${recent.photos[0].id}/thumb`,
          headers: headers(b),
        })
      ).statusCode,
    ).toBe(200);
  });
  it("cambia password e revoca tutte le sessioni personali", async () => {
    const another = await login("first");
    const next = randomBytes(24).toString("hex");
    const r = await app.inject({
      method: "PUT",
      url: "/api/auth/password",
      headers: headers(a),
      payload: { current: password, password: next },
    });
    expect(r.statusCode).toBe(200);
    for (const s of [a, another])
      expect(
        (await app.inject({ url: "/api/auth/me", headers: headers(s) }))
          .statusCode,
      ).toBe(401);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers(b) }))
        .statusCode,
    ).toBe(200);
  });
});
