import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { migrate, openDb } from "../src/db.js";
import { initializeUsers } from "../src/cli.js";
import {
  extractPhotoMetadata,
  validatePhotoMetadata,
} from "../src/photo-metadata.js";
import { importPhotoMetadata } from "../src/import-photo-metadata.js";
import { media } from "../src/schema.js";
import {
  civilDayNumber,
  dateFromDayNumber,
  groupWorldPhotos,
  placeKey,
  visibleWorldPhotos,
  type WorldData,
  type WorldPhoto,
} from "@akai/shared";
import type { Memory } from "../../web/src/types";

/** Tiny standard EXIF TIFF fixture, inserted as JPEG APP1; independent of exifr. */
async function photograph({
  gps = true,
  date = "2024:02:29 23:59:59",
  latitude = 41,
}: { gps?: boolean; date?: string; latitude?: number } = {}) {
  const jpeg = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#d8c3a5" },
  })
    .jpeg()
    .toBuffer();
  const tiff = Buffer.alloc(178);
  tiff.write("II");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  const entry = (
    at: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    tiff.writeUInt32LE(value, at + 8);
  };
  tiff.writeUInt16LE(gps ? 2 : 1, 8);
  entry(10, 0x8769, 4, 1, 38);
  if (gps) entry(22, 0x8825, 4, 1, 56);
  tiff.writeUInt16LE(date ? 1 : 0, 38);
  if (date) {
    entry(40, 0x9003, 2, 20, 110);
    tiff.write(date + "\0", 110, 20, "ascii");
  }
  tiff.writeUInt16LE(4, 56);
  entry(58, 1, 2, 2, 78); // N\0 inline
  entry(70, 2, 5, 3, 130);
  entry(82, 3, 2, 2, 69); // E\0 inline
  entry(94, 4, 5, 3, 154);
  [latitude, 54, 0, 12, 30, 0].forEach((n, i) => {
    tiff.writeUInt32LE(n, 130 + i * 8);
    tiff.writeUInt32LE(1, 134 + i * 8);
  });
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1);
  marker.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, exif, jpeg.subarray(2)]);
}

describe("EXIF validati senza modificare le fotografie", () => {
  it("estrae GPS e data civile originale da un JPEG reale", async () => {
    const result = await extractPhotoMetadata(await photograph());
    expect(result).toEqual({
      latitude: 41.9,
      longitude: 12.5,
      capturedOn: "2024-02-29",
      locationSource: "exif",
    });
  });
  it("gestisce GPS assenti mantenendo la data dello scatto", async () => {
    expect(
      await extractPhotoMetadata(await photograph({ gps: false })),
    ).toEqual({
      latitude: null,
      longitude: null,
      capturedOn: "2024-02-29",
      locationSource: null,
    });
  });
  it("non usa la data upload quando manca DateTimeOriginal", async () => {
    expect(
      (await extractPhotoMetadata(await photograph({ date: "" }))).capturedOn,
    ).toBeNull();
  });
  it("legge lo stesso blocco EXIF da PNG e WebP", async () => {
    const original = await photograph();
    for (const format of ["png", "webp"] as const) {
      const converted = await sharp(original)
        .keepExif()
        .toFormat(format)
        .toBuffer();
      const result = await extractPhotoMetadata(converted);
      expect(result.latitude).toBeCloseTo(41.9);
      expect(result.capturedOn).toBe("2024-02-29");
    }
  });
  it("rifiuta GPS fuori intervallo e non inventa coordinate", async () => {
    expect(
      (await extractPhotoMetadata(await photograph({ latitude: 95 }))).latitude,
    ).toBeNull();
    for (const latitude of [NaN, Infinity, 91, -91, "41", null, undefined])
      expect(
        validatePhotoMetadata({ latitude, longitude: 12 }).locationSource,
      ).toBeNull();
    expect(validatePhotoMetadata({ latitude: 0, longitude: 0 }).latitude).toBe(
      0,
    );
    expect(
      validatePhotoMetadata({ latitude: 41, longitude: 181 }).longitude,
    ).toBeNull();
  });
  it("rifiuta date impossibili e orari non validi", async () => {
    for (const date of [
      "2023:02:29 10:00:00",
      "2024:13:01 10:00:00",
      "2024:01:01 24:00:00",
      "garbage",
    ])
      expect(
        validatePhotoMetadata({ DateTimeOriginal: date }).capturedOn,
      ).toBeNull();
    expect(await extractPhotoMetadata(Buffer.from("broken"))).toEqual({
      latitude: null,
      longitude: null,
      capturedOn: null,
      locationSource: null,
    });
  });
});

let directory: string, app: FastifyInstance, original: Buffer;
let a: Record<string, string>, b: Record<string, string>;
const origin = "http://localhost:5173",
  password = randomBytes(24).toString("hex");
function multipart(memory: object, images: Buffer[]) {
  const boundary = randomUUID(),
    parts: Buffer[] = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify({ memory, photos: images.map((_, i) => "new:" + i), cover: images.length ? "new:0" : null })}\r\n`,
      ),
    ];
  for (const image of images)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      image,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
async function create(
  images = [original],
  date = "2025-05-10",
): Promise<Memory> {
  const form = multipart(
    {
      title: "Un luogo condiviso",
      description: "Un ricordo reale del test.",
      eventDate: date,
      location: "Roma",
      category: "Viaggi",
    },
    images,
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/memories",
    headers: { ...a, "content-type": form.contentType },
    payload: form.body,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}
const world = async (query = "", headers = a) =>
  (await app.inject({ url: "/api/world" + query, headers })).json<WorldData>();
const location = (
  photoId: string,
  version: number,
  latitude: number | null,
  longitude: number | null,
  headers = a,
) =>
  app.inject({
    method: "PUT",
    url: `/api/media/${photoId}/location`,
    headers,
    payload: { version, latitude, longitude },
  });
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "akai-world-"));
  const { db, sqlite } = openDb(directory);
  migrate(sqlite);
  await initializeUsers(db, [
    { username: "world-first", name: "Uno", password },
    { username: "world-second", name: "Due", password },
  ]);
  sqlite.close();
  app = await createApp({
    dataDir: directory,
    origin,
    secureCookies: false,
    loginLimit: 100,
  });
  const login = async (username: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin },
      payload: { username, password },
    });
    expect(res.statusCode).toBe(200);
    return {
      origin,
      cookie: res.cookies[0].name + "=" + res.cookies[0].value,
      "x-csrf-token": res.json().csrf,
    };
  };
  a = await login("world-first");
  b = await login("world-second");
  original = await photograph();
});
afterAll(async () => {
  await app?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("Mondo e posizioni, API protette", () => {
  it("richiede autenticazione per mappa, configurazione e aggiornamento", async () => {
    for (const url of ["/api/world", "/api/world/config"])
      expect((await app.inject({ url })).statusCode).toBe(401);
    expect(
      (await location(randomUUID(), 1, 41, 12, { origin })).statusCode,
    ).toBe(401);
  });
  it("salva EXIF durante upload e restituisce solo metadati necessari", async () => {
    const m = await create();
    expect(m.photos[0]).toMatchObject({
      latitude: 41.9,
      longitude: 12.5,
      capturedOn: "2024-02-29",
      locationSource: "exif",
    });
    const result = await world();
    expect(result.photos.find((p) => p.id === m.photos[0].id)).toMatchObject({
      date: "2024-02-29",
      dateSource: "exif",
      memoryId: m.id,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /\.original|\/app\/data|password|csrf/,
    );
    const download = await app.inject({
      url: `/api/media/${m.photos[0].id}/original`,
      headers: a,
    });
    expect(download.rawPayload).toEqual(original);
    const thumb = await app.inject({
      url: `/api/media/${m.photos[0].id}/thumb`,
      headers: a,
    });
    expect((await sharp(thumb.rawPayload).metadata()).exif).toBeUndefined();
  });
  it("applica il filtro temporale inclusivo alla data EXIF", async () => {
    const m = await create();
    const id = m.photos[0].id;
    expect(
      (await world("?until=2024-02-28")).photos.some((p) => p.id === id),
    ).toBe(false);
    expect(
      (await world("?until=2024-02-29")).photos.some((p) => p.id === id),
    ).toBe(true);
    expect(
      (await app.inject({ url: "/api/world?until=2024-02-30", headers: a }))
        .statusCode,
    ).toBe(400);
  });
  it("usa la data evento senza EXIF e mantiene le foto senza GPS fuori dai pin", async () => {
    const m = await create(
      [await photograph({ date: "" }), await photograph({ gps: false })],
      "2023-06-12",
    );
    const result = await world();
    expect(result.photos.find((p) => p.id === m.photos[0].id)).toMatchObject({
      date: "2023-06-12",
      dateSource: "event",
    });
    expect(result.photos.some((p) => p.id === m.photos[1].id)).toBe(false);
    expect(result.unlocatedCount).toBeGreaterThan(0);
  });
  it("consente a entrambi gli utenti inserimento, correzione e rimozione", async () => {
    const m = await create([await photograph({ gps: false })]);
    const id = m.photos[0].id;
    expect((await location(id, 1, 45, 9)).statusCode).toBe(200);
    expect((await world("", b)).photos.find((p) => p.id === id)).toMatchObject({
      latitude: 45,
      longitude: 9,
      locationSource: "manual",
    });
    expect((await location(id, 2, -33, 151, b)).statusCode).toBe(200);
    expect((await world()).photos.find((p) => p.id === id)?.latitude).toBe(-33);
    expect((await location(id, 3, null, null)).statusCode).toBe(200);
    expect((await world()).photos.some((p) => p.id === id)).toBe(false);
    const detail = (
      await app.inject({ url: "/api/memories/" + m.id, headers: a })
    ).json<Memory>();
    expect(detail.photos[0]).toMatchObject({
      latitude: null,
      longitude: null,
      locationSource: "manual",
    });
    expect(detail.version).toBe(4);
  });
  it("rifiuta CSRF, coordinate parziali e fuori intervallo, e versioni obsolete", async () => {
    const m = await create(),
      id = m.photos[0].id;
    expect(
      (await location(id, 1, 42, 13, { cookie: a.cookie, origin })).statusCode,
    ).toBe(403);
    expect((await location(id, 1, 91, 13)).statusCode).toBe(400);
    expect((await location(id, 1, 42, null)).statusCode).toBe(400);
    expect((await location(id, 1, 42, 13)).statusCode).toBe(200);
    expect((await location(id, 1, 43, 14, b)).statusCode).toBe(409);
    expect((await world()).photos.find((p) => p.id === id)?.latitude).toBe(42);
  });
  it("esclude i ricordi eliminati e ne impedisce gli aggiornamenti geografici", async () => {
    const m = await create();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/memories/" + m.id,
          headers: a,
          payload: { version: m.version },
        })
      ).statusCode,
    ).toBe(200);
    expect((await world()).photos.some((p) => p.memoryId === m.id)).toBe(false);
    expect((await location(m.photos[0].id, 2, 42, 13)).statusCode).toBe(404);
  });
  it("configura CSP solo sul provider tile e conserva referrer compatibile OSM", async () => {
    const response = await app.inject({ url: "/api/world", headers: a });
    expect(response.headers["content-security-policy"]).toContain(
      "https://tile.openstreetmap.org",
    );
    expect(response.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.json().config.attribution).toContain("OpenStreetMap");
  });
});

describe("Importazione esplicita e compatibilità", () => {
  it("dry-run, applicazione idempotente, originali intatti e priorità alle scelte manuali", async () => {
    const automatic = await create(),
      manual = await create(),
      removed = await create();
    await location(manual.photos[0].id, 1, 43, 11);
    await location(removed.photos[0].id, 1, null, null);
    const { db, sqlite } = openDb(directory);
    db.update(media)
      .set({
        latitude: null,
        longitude: null,
        capturedOn: null,
        locationSource: null,
      })
      .where(eq(media.id, automatic.photos[0].id))
      .run();
    const old = db
      .select()
      .from(media)
      .where(eq(media.id, automatic.photos[0].id))
      .get()!;
    sqlite.close();
    const originalPath = path.join(directory, "media", old.original),
      before = await readFile(originalPath);
    const dry = await importPhotoMetadata(directory);
    expect(dry.wouldUpdate).toBeGreaterThan(0);
    expect(dry.updated).toBe(0);
    const verifyDry = await world();
    expect(verifyDry.photos.some((p) => p.id === old.id)).toBe(false);
    const applied = await importPhotoMetadata(directory, true);
    expect(applied.updated).toBe(1);
    expect(applied.manualProtected).toBeGreaterThan(0);
    expect(applied.withoutGps).toBeGreaterThan(0);
    const repeated = await importPhotoMetadata(directory, true);
    expect(repeated.updated).toBe(0);
    expect(await readFile(originalPath)).toEqual(before);
    const result = await world();
    expect(result.photos.find((p) => p.id === old.id)?.latitude).toBe(41.9);
    expect(
      result.photos.find((p) => p.id === manual.photos[0].id)?.latitude,
    ).toBe(43);
    expect(result.photos.some((p) => p.id === removed.photos[0].id)).toBe(
      false,
    );
  });
  it("aggiunge colonne senza ricreare tabelle o alterare record V1", async () => {
    const legacy = await mkdtemp(path.join(tmpdir(), "akai-world-v1-"));
    const { sqlite } = openDb(legacy);
    try {
      const sql = await readFile(
        fileURLToPath(
          new URL("../migrations/0001_initial.sql", import.meta.url),
        ),
        "utf8",
      );
      sqlite.exec(sql);
      sqlite.exec(
        "CREATE TABLE _migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO _migrations VALUES('0001_initial.sql', '2024-01-01');",
      );
      sqlite.exec(
        "INSERT INTO users VALUES('u','old','Name','hash',NULL); INSERT INTO memories VALUES('m','Titolo','2024-01-01','Testo','Viaggi','Roma','u',7,'before','before',NULL); INSERT INTO memory_media VALUES('p','m',0,1,'old.original','display.webp','thumb.webp');",
      );
      migrate(sqlite);
      migrate(sqlite);
      const row = sqlite
        .prepare("SELECT * FROM memory_media WHERE id='p'")
        .get();
      expect(row).toMatchObject({
        original: "old.original",
        latitude: null,
        longitude: null,
        captured_on: null,
        location_source: null,
      });
      expect(
        sqlite.prepare("SELECT version FROM memories WHERE id='m'").get(),
      ).toEqual({ version: 7 });
      expect(
        sqlite.prepare("SELECT count(*) AS n FROM _migrations").get(),
      ).toEqual({ n: 3 });
    } finally {
      sqlite.close();
      await rm(legacy, { recursive: true, force: true });
    }
  });
});

describe("Tempo e raggruppamenti fotografici", () => {
  const photo = (
    id: string,
    latitude = 41.9,
    longitude = 12.5,
    date = "2024-02-29",
  ): WorldPhoto => ({
    id,
    memoryId: id,
    title: id,
    location: "",
    date,
    latitude,
    longitude,
    locationSource: "manual",
    dateSource: "event",
  });
  it("raggruppa grandi collezioni coincidenti senza perdere fotografie", () => {
    const input = Array.from({ length: 10000 }, (_, i) => photo(String(i)));
    const groups = groupWorldPhotos(input, 2);
    expect(groups).toHaveLength(1);
    expect(groups[0].photos).toHaveLength(10000);
  });
  it("filtra inclusivamente senza cambiare l'array originale", () => {
    const input = [photo("a"), photo("b", 41, 12, "2024-03-01")];
    expect(visibleWorldPhotos(input, "2024-02-29").map((p) => p.id)).toEqual([
      "a",
    ]);
    expect(input).toHaveLength(2);
  });
  it("raggruppa foto coincidenti e vicine, separandole allo zoom", () => {
    const input = [
      photo("a"),
      photo("b"),
      photo("c", 41.91, 12.51),
      photo("d", -33, 151),
    ];
    expect(
      groupWorldPhotos(input, 5)
        .map((g) => g.photos.length)
        .sort(),
    ).toEqual([1, 3]);
    expect(
      groupWorldPhotos(input, 19)
        .map((g) => g.photos.length)
        .sort(),
    ).toEqual([1, 1, 2]);
    expect(new Set(input.map(placeKey)).size).toBe(3);
  });
  it("raggruppa anche a cavallo dell'antimeridiano", () => {
    const result = groupWorldPhotos(
      [photo("a", 0, 179.9), photo("b", 0, -179.9)],
      2,
    );
    expect(result).toHaveLength(1);
    expect(Math.abs(result[0].longitude)).toBeCloseTo(180);
  });
  it("mantiene date civili corrette nei cambi ora legale e anni bisestili", () => {
    for (const date of ["2024-02-29", "2024-03-31", "2024-10-27"])
      expect(dateFromDayNumber(civilDayNumber(date))).toBe(date);
  });
});
