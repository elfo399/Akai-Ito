import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { openDb, migrate } from "../src/db.js";
import { initializeUsers } from "../src/cli.js";
import { createApp } from "../src/app.js";
import type { Memory, Collection } from "../../web/src/types";
const origin = "http://localhost:5173",
  password = randomBytes(24).toString("hex");
let dir: string, app: FastifyInstance, image: Buffer;
let auth: Record<string, string>, partner: Record<string, string>;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "akai-collections-"));
  const { db, sqlite } = openDb(dir);
  migrate(sqlite);
  await initializeUsers(db, [
    { username: "one", name: "Uno", password },
    { username: "two", name: "Due", password },
  ]);
  sqlite.close();
  app = await createApp({
    dataDir: dir,
    origin,
    secureCookies: false,
    loginLimit: 100,
  });
  const login = async (username: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: { username, password },
    });
    return {
      origin,
      cookie: response.cookies[0].name + "=" + response.cookies[0].value,
      "x-csrf-token": response.json().csrf as string,
    };
  };
  auth = await login("one");
  partner = await login("two");
  image = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#b43131" },
  })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await app?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function album(name = "Barcellona", category = "Viaggi") {
  const response = await app.inject({
    method: "POST",
    url: "/api/collections",
    headers: auth,
    payload: { name, category, description: "Il diario del viaggio" },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Collection>();
}
async function save(
  data: { category: string; collectionId?: string | null; title?: string },
  existing?: Memory,
) {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      memory: {
        title: data.title ?? "Un giorno",
        eventDate: "2026-01-01",
        description: "Una giornata da ricordare",
        location: "",
        ...data,
      },
      version: existing?.version,
      photos: existing ? existing.photos.map((p) => p.id) : ["new:0"],
      cover: existing ? (existing.photos[0]?.id ?? null) : "new:0",
    }),
  );
  if (!existing)
    form.append(
      "photos",
      new Blob([new Uint8Array(image)], { type: "image/png" }),
      "foto.png",
    );
  const request = new Request("http://localhost", {
    method: "POST",
    body: form,
  });
  return app.inject({
    method: existing ? "PUT" : "POST",
    url: "/api/memories" + (existing ? "/" + existing.id : ""),
    headers: { ...auth, "content-type": request.headers.get("content-type")! },
    payload: Buffer.from(await request.arrayBuffer()),
  });
}
const detail = async (id: string) =>
  (
    await app.inject({ url: "/api/memories/" + id, headers: auth })
  ).json<Memory>();
it("migra un diario precedente senza perdere ricordi e resta idempotente", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "akai-migration-"));
  const { sqlite } = openDb(folder);
  try {
    sqlite.exec(
      "CREATE TABLE _migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    for (const name of ["0001_initial.sql", "0002_photo_locations.sql"]) {
      sqlite.exec(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
      sqlite
        .prepare("INSERT INTO _migrations VALUES(?,?)")
        .run(name, "2026-01-01");
    }
    sqlite.exec(
      "INSERT INTO users(id,username,name,password) VALUES('u','old','Old','x'); INSERT INTO memories(id,title,event_date,category,author_id,created_at,updated_at) VALUES('m','Ricordo precedente','2025-01-01','Viaggi','u','2025-01-01','2025-01-01')",
    );
    migrate(sqlite);
    migrate(sqlite);
    expect(
      sqlite
        .prepare("SELECT title,collection_id FROM memories WHERE id='m'")
        .get(),
    ).toEqual({ title: "Ricordo precedente", collection_id: null });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
it("protegge gli album con sessione e CSRF e valida nome e capitolo", async () => {
  expect((await app.inject({ url: "/api/collections" })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/collections",
        headers: { origin, cookie: auth.cookie },
        payload: { name: "Test", category: "Viaggi" },
      })
    ).statusCode,
  ).toBe(403);
  for (const payload of [
    { name: "  ", category: "Viaggi" },
    { name: "x", category: "Sconosciuta" },
  ])
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/collections",
          headers: auth,
          payload,
        })
      ).statusCode,
    ).toBe(400);
});
it("isola foto e ricordi dei singoli viaggi e li rende condivisi fra i due account", async () => {
  const a = await album(),
    b = await album("Amsterdam");
  const first = (
      await save({ category: "Viaggi", collectionId: a.id })
    ).json<Memory>(),
    second = (
      await save({ category: "Viaggi", collectionId: b.id })
    ).json<Memory>();
  const response = await app.inject({
    url: "/api/collections/" + a.id,
    headers: partner,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().items.map((p: { id: string }) => p.id)).toEqual(
    first.photos.map((p) => p.id),
  );
  expect(response.json().collection).toMatchObject({
    memoryCount: 1,
    photoCount: 1,
    coverId: first.photos[0].id,
  });
  const list = await app.inject({
    url: "/api/memories?collectionId=" + a.id,
    headers: auth,
  });
  expect(list.json().items.map((m: Memory) => m.id)).toEqual([first.id]);
  expect(list.body).not.toContain(second.id);
});
it("non assegna ricordi ad album inesistenti o di un altro capitolo", async () => {
  const a = await album("Compleanni", "Anniversari");
  expect(
    (await save({ category: "Viaggi", collectionId: a.id })).statusCode,
  ).toBe(400);
  expect(
    (
      await save({
        category: "Viaggi",
        collectionId: "00000000-0000-4000-8000-000000000001",
      })
    ).statusCode,
  ).toBe(400);
  const memory = (await save({ category: "Viaggi" })).json<Memory>();
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/collections/" + a.id + "/memories",
        headers: auth,
        payload: { items: [{ id: memory.id, version: memory.version }] },
      })
    ).statusCode,
  ).toBe(400);
  expect((await detail(memory.id)).collectionId).toBeNull();
});
it("aggiunge più pagine in modo atomico e rifiuta versioni obsolete senza modifiche parziali", async () => {
  const a = await album("Weekend");
  const one = (await save({ category: "Viaggi" })).json<Memory>(),
    two = (await save({ category: "Viaggi" })).json<Memory>();
  const endpoint = "/api/collections/" + a.id + "/memories";
  expect(
    (
      await app.inject({
        method: "POST",
        url: endpoint,
        headers: auth,
        payload: {
          items: [
            { id: one.id, version: one.version },
            { id: two.id, version: 99 },
          ],
        },
      })
    ).statusCode,
  ).toBe(409);
  expect((await detail(one.id)).collectionId).toBeNull();
  expect(
    (
      await app.inject({
        method: "POST",
        url: endpoint,
        headers: auth,
        payload: {
          items: [
            { id: one.id, version: one.version },
            { id: two.id, version: two.version },
          ],
        },
      })
    ).statusCode,
  ).toBe(200);
  expect((await detail(one.id)).collectionId).toBe(a.id);
  expect((await detail(two.id)).collectionId).toBe(a.id);
});
it("conserva l’assegnazione nell’editor precedente e permette spostamento e rimozione espliciti", async () => {
  const a = await album("Primo"),
    b = await album("Secondo");
  let memory = (
    await save({ category: "Viaggi", collectionId: a.id })
  ).json<Memory>();
  memory = (
    await save(
      { category: "Viaggi", title: "Aggiornato senza il campo nuovo" },
      memory,
    )
  ).json<Memory>();
  expect(memory.collectionId).toBe(a.id);
  memory = (
    await save({ category: "Viaggi", collectionId: b.id }, memory)
  ).json<Memory>();
  expect(memory.collectionId).toBe(b.id);
  expect(memory.photos).toHaveLength(1);
  memory = (
    await save({ category: "Viaggi", collectionId: null }, memory)
  ).json<Memory>();
  expect(memory.collectionId).toBeNull();
});
it("rinomina un album con controllo di versione", async () => {
  const a = await album("Vecchio nome");
  const url = "/api/collections/" + a.id;
  expect(
    (
      await app.inject({
        method: "PUT",
        url,
        headers: auth,
        payload: { name: "Nuovo nome", description: "", version: a.version },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "PUT",
        url,
        headers: auth,
        payload: { name: "Nome obsoleto", version: a.version },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await app.inject({ url, headers: auth })).json().collection.name,
  ).toBe("Nuovo nome");
});
it("elimina solo l’album, preserva foto, ricordi e pagine nel cestino e aggiorna le versioni", async () => {
  const a = await album("Album da togliere"),
    one = (
      await save({ category: "Viaggi", collectionId: a.id })
    ).json<Memory>(),
    two = (
      await save({ category: "Viaggi", collectionId: a.id })
    ).json<Memory>();
  await app.inject({
    method: "DELETE",
    url: "/api/memories/" + two.id,
    headers: auth,
    payload: { version: two.version },
  });
  expect(
    (
      await app.inject({ url: "/api/collections/" + a.id, headers: auth })
    ).json().collection.photoCount,
  ).toBe(1);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/collections/" + a.id,
        headers: auth,
        payload: { version: 99 },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/collections/" + a.id,
        headers: auth,
        payload: { version: a.version },
      })
    ).statusCode,
  ).toBe(200);
  const active = await detail(one.id);
  expect(active.collectionId).toBeNull();
  expect(active.version).toBeGreaterThan(one.version);
  expect(active.photos).toHaveLength(1);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/memories/" + two.id + "/restore",
        headers: auth,
      })
    ).statusCode,
  ).toBe(200);
  expect((await detail(two.id)).collectionId).toBeNull();
  expect((await detail(two.id)).photos).toHaveLength(1);
  expect(
    (await app.inject({ url: "/api/collections/" + a.id, headers: auth }))
      .statusCode,
  ).toBe(404);
});
