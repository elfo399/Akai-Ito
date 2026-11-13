import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import sharp from "sharp";
import { and, eq, isNull, asc, desc, sql, lt } from "drizzle-orm";
import { z, ZodError } from "zod";
import {
  memoryInput,
  commentInput,
  passwordInput,
  civilDate,
  categories,
} from "@akai/shared";
import { openDb } from "./db.js";
import {
  users,
  sessions,
  settings,
  memories,
  media,
  comments,
} from "./schema.js";

type Identity = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  sessionId: string;
  csrf: string;
};
declare module "fastify" {
  interface FastifyRequest {
    identity: Identity | null;
  }
}
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const now = () => new Date().toISOString();
export type AppOptions = {
  dataDir: string;
  origin: string;
  secureCookies: boolean;
  webDir?: string;
  trustProxy?: boolean;
  loginLimit?: number;
};

export async function createApp(options: AppOptions) {
  const allowedOrigins = new Set([options.origin]);
  const configuredOrigin = new URL(options.origin);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  // Local preview may be opened by hostname or IP. Keep the same scheme and
  // port, and retain exact-origin checks for HTTPS / Secure cookies.
  if (
    !options.secureCookies &&
    configuredOrigin.protocol === "http:" &&
    loopbackHosts.includes(configuredOrigin.hostname) &&
    !configuredOrigin.username &&
    !configuredOrigin.password &&
    configuredOrigin.pathname === "/" &&
    !configuredOrigin.search &&
    !configuredOrigin.hash
  ) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(configuredOrigin);
      alias.hostname = hostname;
      allowedOrigins.add(alias.origin);
    }
  }
  const { db, sqlite } = openDb(options.dataDir);
  if (
    !sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      )
      .get()
  ) {
    sqlite.close();
    throw new Error("Database non inizializzato: eseguire npm run migrate");
  }
  const storage = path.join(options.dataDir, "media");
  await mkdir(storage, { recursive: true });
  sharp.concurrency(2);
  sharp.cache({ memory: 16, files: 0, items: 40 });
  const app = Fastify({
    logger: false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 1024 * 1024,
  });
  app.decorateRequest("identity", null);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "blob:", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  const maxFiles = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .parse(process.env.MAX_UPLOAD_FILES ?? 20),
    maxImageMB = z.coerce
      .number()
      .positive()
      .max(100)
      .parse(process.env.MAX_IMAGE_MB ?? 15),
    maxBytes = maxImageMB * 1024 * 1024;
  await app.register(multipart, {
    limits: {
      files: maxFiles,
      fileSize: maxBytes,
      fields: 1,
      fieldSize: 65536,
      parts: maxFiles + 1,
    },
  });
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) => {
      const code = error instanceof ZodError ? 400 : (error.statusCode ?? 500);
      reply.code(code).send({
        message:
          error instanceof ZodError
            ? "Controlla i campi inseriti."
            : code >= 500
              ? "Si è verificato un errore. Riprova."
              : error.message,
      });
    },
  );
  app.addHook("onClose", async () => {
    sqlite.close();
  });
  app.addHook("onRequest", async (req, reply) => {
    const route = req.routeOptions.url;
    if (!route?.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!req.headers.origin || !allowedOrigins.has(req.headers.origin))
        fail(403, "Origine della richiesta non valida.");
      if (req.headers["sec-fetch-site"] === "cross-site")
        fail(403, "Richiesta non consentita.");
    }
    if (route === "/api/health" || route === "/api/auth/login") return;
    const token = req.cookies.akai_session;
    if (!token) fail(401, "Accedi al diario per continuare.");
    const session = db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        avatar: users.avatar,
        sessionId: sessions.id,
        csrf: sessions.csrf,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, hash(token)),
          sql`${sessions.expires} > ${Date.now()}`,
        ),
      )
      .get();
    if (!session) fail(401, "Sessione scaduta. Accedi nuovamente.");
    req.identity = session;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrf = req.headers["x-csrf-token"];
      if (
        typeof csrf !== "string" ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
      )
        fail(403, "Token di sicurezza non valido. Ricarica la pagina.");
    }
  });
  const identity = (r: FastifyRequest) => r.identity!;
  const idParam = (r: FastifyRequest) =>
    z.object({ id: z.string().uuid() }).parse(r.params).id;
  const activeMemory = (id: string) =>
    db
      .select()
      .from(memories)
      .where(and(eq(memories.id, id), isNull(memories.deletedAt)))
      .get() ?? fail(404, "Ricordo non trovato.");
  const versionCheck = (id: string, version: number) => {
    const row = activeMemory(id);
    if (row.version !== version)
      fail(
        409,
        "Questo ricordo è cambiato. Ricarica la versione aggiornata prima di salvare.",
      );
    return row;
  };
  const clean = async (files: string[]) => {
    await Promise.all(
      files.map((f) => unlink(path.join(storage, f)).catch(() => {})),
    );
  };
  async function processImage(buffer: Buffer, mimetype: string) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimetype))
      fail(400, "Sono consentite soltanto immagini JPEG, PNG e WebP.");
    const magic = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? "image/jpeg"
      : buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
    if (magic !== mimetype)
      fail(400, "Il contenuto del file non corrisponde al tipo dichiarato.");
    const id = randomUUID();
    const files = [`${id}.original`, `${id}.webp`, `${id}.thumb.webp`];
    try {
      const image = sharp(buffer, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const info = await image.metadata();
      const types: Record<string, string> = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      if (
        !info.format ||
        types[info.format] !== mimetype ||
        (info.pages ?? 1) > 1
      )
        fail(400, "Il contenuto del file non è una fotografia valida.");
      // Decode completely before saving; output strips EXIF/GPS metadata.
      const display = await image
        .rotate()
        .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();
      const thumb = await sharp(display)
        .resize(600, 600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      await writeFile(path.join(storage, files[0]), buffer, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(path.join(storage, files[1]), display, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(path.join(storage, files[2]), thumb, {
        flag: "wx",
        mode: 0o600,
      });
      return { id, original: files[0], display: files[1], thumb: files[2] };
    } catch (error) {
      await clean(files);
      if ((error as { statusCode?: number }).statusCode) throw error;
      return fail(400, "Immagine danneggiata, troppo grande o non supportata.");
    }
  }
  const photoRows = (id: string) =>
    db
      .select({
        id: media.id,
        position: media.position,
        isCover: media.isCover,
      })
      .from(media)
      .where(eq(media.memoryId, id))
      .orderBy(asc(media.position))
      .all();
  function detail(id: string) {
    const m = activeMemory(id);
    const author = db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, m.authorId))
      .get();
    return { ...m, author: author?.name, photos: photoRows(id) };
  }

  app.get("/api/health", async () => {
    sqlite.prepare("SELECT 1").get();
    return { status: "ok" };
  });
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: options.loginLimit ?? 8, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const input = z
        .object({
          username: z.string().min(1).max(80),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const user = db
        .select()
        .from(users)
        .where(eq(users.username, input.username.toLowerCase().trim()))
        .get();
      // A real Argon2 operation also runs for unknown users.
      const valid = user
        ? await argon2.verify(user.password, input.password)
        : await argon2
            .hash(input.password, { type: argon2.argon2id })
            .then(() => false);
      if (!valid || !user) fail(401, "Nome utente o password non corretti.");
      db.delete(sessions).where(lt(sessions.expires, Date.now())).run();
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(32).toString("hex");
      db.insert(sessions)
        .values({
          id: hash(token),
          csrf,
          userId: user.id,
          expires: Date.now() + 30 * 86400000,
        })
        .run();
      reply.setCookie("akai_session", token, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: options.secureCookies,
        maxAge: 30 * 86400,
      });
      return {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
        },
        csrf,
      };
    },
  );
  app.get("/api/auth/me", async (req) => {
    const { sessionId: _s, csrf, ...user } = identity(req);
    return { user, csrf };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    db.delete(sessions)
      .where(eq(sessions.id, identity(req).sessionId))
      .run();
    reply.clearCookie("akai_session", { path: "/" });
    return { ok: true };
  });
  app.put(
    "/api/auth/password",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
          .object({ current: z.string().max(128), password: passwordInput })
          .parse(req.body),
        user = db
          .select()
          .from(users)
          .where(eq(users.id, identity(req).id))
          .get()!;
      if (!(await argon2.verify(user.password, input.current)))
        fail(400, "La password attuale non è corretta.");
      const password = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      db.transaction((tx) => {
        tx.update(users).set({ password }).where(eq(users.id, user.id)).run();
        tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
      });
      reply.clearCookie("akai_session", { path: "/" });
      return { ok: true };
    },
  );
  app.get("/api/settings", async () => ({
    uploadLimits: { maxFiles, maxImageMB },
    settings: db.select().from(settings).get(),
    users: db
      .select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(users)
      .all(),
  }));
  app.put("/api/settings", async (req) => {
    const input = z
      .object({
        coupleNames: z.string().trim().max(160),
        startDate: civilDate.nullable(),
        cover: z.string().uuid().nullable(),
      })
      .parse(req.body);
    if (input.cover) {
      const p = db.select().from(media).where(eq(media.id, input.cover)).get();
      if (!p) fail(400, "Copertina non valida.");
      activeMemory(p.memoryId);
    }
    db.update(settings).set(input).where(eq(settings.id, 1)).run();
    return { ok: true };
  });
  app.put("/api/profile", async (req) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(req.body);
    db.update(users)
      .set(input)
      .where(eq(users.id, identity(req).id))
      .run();
    return { ok: true };
  });
  app.post("/api/profile/avatar", async (req) => {
    let result: Awaited<ReturnType<typeof processImage>> | undefined;
    const previous = identity(req).avatar;
    try {
      for await (const part of req.parts({
        limits: { files: 1, fields: 0, parts: 1 },
      })) {
        if (part.type !== "file") fail(400, "Scegli una fotografia.");
        result = await processImage(await part.toBuffer(), part.mimetype);
      }
      if (!result) fail(400, "Scegli una fotografia.");
      db.update(users)
        .set({ avatar: result.thumb })
        .where(eq(users.id, identity(req).id))
        .run();
    } catch (e) {
      if (result) await clean([result.original, result.display, result.thumb]);
      throw e;
    }
    await clean([
      result.original,
      result.display,
      ...(previous ? [previous] : []),
    ]);
    return { ok: true };
  });
  app.get("/api/avatars/:id", async (req, reply) => {
    const user = db
      .select({ avatar: users.avatar })
      .from(users)
      .where(eq(users.id, idParam(req)))
      .get();
    if (!user?.avatar) fail(404, "Avatar non disponibile.");
    reply.type("image/webp").header("Cache-Control", "private, no-store");
    return reply.send(createReadStream(path.join(storage, user.avatar)));
  });

  app.get("/api/memories", async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        order: z.enum(["asc", "desc", "recent"]).default("desc"),
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional(),
        category: z.enum(categories).optional(),
        trash: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.query);
    const where = and(
      q.trash === "true"
        ? sql`${memories.deletedAt} IS NOT NULL`
        : isNull(memories.deletedAt),
      q.year ? sql`substr(${memories.eventDate},1,4) = ${q.year}` : undefined,
      q.category ? eq(memories.category, q.category) : undefined,
    );
    const rows = db
      .select({
        id: memories.id,
        title: memories.title,
        eventDate: memories.eventDate,
        description: sql<string>`substr(${memories.description},1,240)`,
        category: memories.category,
        author: users.name,
        version: memories.version,
        deletedAt: memories.deletedAt,
        photoCount: sql<number>`(select count(*) from memory_media where memory_id = ${memories.id})`,
        commentCount: sql<number>`(select count(*) from comments where memory_id = ${memories.id})`,
        coverId: sql<
          string | null
        >`(select id from memory_media where memory_id = ${memories.id} order by is_cover desc, position asc limit 1)`,
      })
      .from(memories)
      .innerJoin(users, eq(users.id, memories.authorId))
      .where(where)
      .orderBy(
        q.order === "asc"
          ? asc(memories.eventDate)
          : q.order === "recent"
            ? desc(memories.createdAt)
            : desc(memories.eventDate),
        desc(memories.id),
      )
      .limit(20)
      .offset((q.page - 1) * 20)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(memories)
      .where(where)
      .get()!.count;
    const years = db
      .selectDistinct({ year: sql<string>`substr(${memories.eventDate},1,4)` })
      .from(memories)
      .where(isNull(memories.deletedAt))
      .orderBy(sql`1 desc`)
      .all()
      .map((r) => r.year);
    return { items: rows, total, page: q.page, years };
  });
  app.get("/api/memories/:id", async (req) => detail(idParam(req)));
  async function saveMemory(req: FastifyRequest, editing: boolean) {
    const saved: {
      id: string;
      original: string;
      display: string;
      thumb: string;
    }[] = [];
    let committed = false;
    try {
      let payload: unknown;
      for await (const part of req.parts()) {
        if (part.type === "field") {
          if (part.fieldname !== "payload" || payload !== undefined)
            fail(400, "Dati non validi.");
          try {
            payload = JSON.parse(String(part.value));
          } catch {
            fail(400, "Dati non validi.");
          }
        } else {
          saved.push(await processImage(await part.toBuffer(), part.mimetype));
        }
      }
      const input = z
        .object({
          memory: memoryInput,
          version: z.number().int().positive().optional(),
          photos: z.array(z.string()).max(200),
          cover: z.string().nullable(),
        })
        .parse(payload);
      const id = editing ? idParam(req) : randomUUID();
      const old = editing
        ? db.select().from(media).where(eq(media.memoryId, id)).all()
        : [];
      const expected = new Map(old.map((p) => [p.id, p]));
      const ordered = input.photos.map((key) => {
        if (key.startsWith("new:")) {
          const n = Number(key.slice(4));
          return Number.isInteger(n) ? saved[n] : undefined;
        }
        return expected.get(key);
      });
      if (
        ordered.some((p) => !p) ||
        new Set(ordered.map((p) => p!.id)).size !== ordered.length ||
        saved.some((p) => !ordered.includes(p)) ||
        (input.cover !== null && !input.photos.includes(input.cover))
      )
        fail(400, "Ordine o copertina delle fotografie non validi.");
      db.transaction((tx) => {
        if (editing) {
          versionCheck(id, input.version ?? 0);
          const updated = tx
            .update(memories)
            .set({
              ...input.memory,
              version: sql`${memories.version}+1`,
              updatedAt: now(),
            })
            .where(
              and(
                eq(memories.id, id),
                eq(memories.version, input.version ?? 0),
                isNull(memories.deletedAt),
              ),
            )
            .run();
          if (updated.changes !== 1)
            fail(409, "Il ricordo è cambiato. Ricarica la pagina.");
        } else
          tx.insert(memories)
            .values({
              id,
              ...input.memory,
              authorId: identity(req).id,
              createdAt: now(),
              updatedAt: now(),
            })
            .run();
        const removed = old.filter((p) => !ordered.some((o) => o!.id === p.id));
        for (const p of removed) {
          tx.update(settings)
            .set({ cover: null })
            .where(eq(settings.cover, p.id))
            .run();
          tx.delete(media).where(eq(media.id, p.id)).run();
        }
        ordered.forEach((p, position) => {
          const row = p!;
          const isCover =
            input.photos[position] === (input.cover ?? input.photos[0]);
          if (expected.has(row.id))
            tx.update(media)
              .set({ position, isCover })
              .where(eq(media.id, row.id))
              .run();
          else
            tx.insert(media)
              .values({ ...row, memoryId: id, position, isCover })
              .run();
        });
      });
      committed = true;
      await clean(
        old
          .filter((p) => !ordered.some((o) => o!.id === p.id))
          .flatMap((p) => [p.original, p.display, p.thumb]),
      );
      return detail(id);
    } catch (error) {
      if (!committed)
        await clean(saved.flatMap((p) => [p.original, p.display, p.thumb]));
      throw error;
    }
  }
  app.post("/api/memories", async (req, reply) => {
    const result = await saveMemory(req, false);
    return reply.code(201).send(result);
  });
  app.put("/api/memories/:id", async (req) => saveMemory(req, true));
  app.delete("/api/memories/:id", async (req) => {
    const id = idParam(req);
    const { version } = z.object({ version: z.number().int() }).parse(req.body);
    db.transaction((tx) => {
      versionCheck(id, version);
      tx.update(memories)
        .set({ deletedAt: now(), updatedAt: now(), version: version + 1 })
        .where(eq(memories.id, id))
        .run();
      tx.update(settings)
        .set({ cover: null })
        .where(
          sql`${settings.cover} IN (SELECT id FROM memory_media WHERE memory_id=${id})`,
        )
        .run();
    });
    return { ok: true };
  });
  app.post("/api/memories/:id/restore", async (req) => {
    const id = idParam(req);
    const row = db.select().from(memories).where(eq(memories.id, id)).get();
    if (!row?.deletedAt) fail(404, "Ricordo non presente nel cestino.");
    db.update(memories)
      .set({ deletedAt: null, updatedAt: now(), version: row.version + 1 })
      .where(eq(memories.id, id))
      .run();
    return { ok: true };
  });
  app.delete("/api/memories/:id/permanent", async (req) => {
    const id = idParam(req);
    const input = z
      .object({ confirmation: z.literal("ELIMINA") })
      .parse(req.body);
    void input;
    const row = db.select().from(memories).where(eq(memories.id, id)).get();
    if (!row?.deletedAt) fail(400, "Sposta prima il ricordo nel cestino.");
    const photos = db.select().from(media).where(eq(media.memoryId, id)).all();
    db.delete(memories).where(eq(memories.id, id)).run();
    await clean(photos.flatMap((p) => [p.original, p.display, p.thumb]));
    return { ok: true };
  });
  app.get("/api/media/:id/:size", async (req, reply) => {
    const { id, size } = z
      .object({
        id: z.string().uuid(),
        size: z.enum(["thumb", "display", "original"]),
      })
      .parse(req.params);
    const p = db.select().from(media).where(eq(media.id, id)).get();
    if (!p) fail(404, "Fotografia non trovata.");
    activeMemory(p.memoryId);
    const file = path.join(storage, p[size]);
    if (!existsSync(file)) fail(404, "Fotografia non disponibile.");
    reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (size === "original") {
      const metadata = await sharp(await readFile(file)).metadata();
      reply
        .type(`image/${metadata.format === "jpeg" ? "jpeg" : metadata.format}`)
        .header("Content-Disposition", "attachment");
    } else reply.type("image/webp");
    return reply.send(createReadStream(file));
  });
  app.get("/api/memories/:id/comments", async (req) => {
    const id = idParam(req);
    activeMemory(id);
    return db
      .select({
        id: comments.id,
        body: comments.body,
        authorId: comments.authorId,
        author: users.name,
        avatar: users.avatar,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.memoryId, id))
      .orderBy(asc(comments.createdAt))
      .all();
  });
  app.post("/api/memories/:id/comments", async (req, reply) => {
    const id = idParam(req);
    activeMemory(id);
    const input = commentInput.parse(req.body);
    const comment = {
      id: randomUUID(),
      memoryId: id,
      authorId: identity(req).id,
      ...input,
      createdAt: now(),
      updatedAt: now(),
    };
    db.insert(comments).values(comment).run();
    return reply.code(201).send(comment);
  });
  for (const method of ["PUT", "DELETE"] as const)
    app.route({
      method,
      url: "/api/comments/:id",
      handler: async (req) => {
        const id = idParam(req);
        const c = db.select().from(comments).where(eq(comments.id, id)).get();
        if (!c) fail(404, "Pensiero non trovato.");
        activeMemory(c.memoryId);
        if (c.authorId !== identity(req).id)
          fail(403, "Puoi modificare soltanto i tuoi pensieri.");
        if (method === "PUT")
          db.update(comments)
            .set({ ...commentInput.parse(req.body), updatedAt: now() })
            .where(eq(comments.id, id))
            .run();
        else db.delete(comments).where(eq(comments.id, id)).run();
        return { ok: true };
      },
    });
  app.get("/api/albums", async () =>
    categories.map((category) => {
      const where = and(
        eq(memories.category, category),
        isNull(memories.deletedAt),
      );
      const cover = db
        .select({
          id: media.id,
        })
        .from(media)
        .innerJoin(memories, eq(memories.id, media.memoryId))
        .where(where)
        .orderBy(desc(memories.eventDate), asc(media.position))
        .limit(1)
        .get();
      const count = db
        .select({ count: sql<number>`count(*)` })
        .from(media)
        .innerJoin(memories, eq(memories.id, media.memoryId))
        .where(where)
        .get()!.count;
      return { category, count, coverId: cover?.id ?? null };
    }),
  );
  app.get("/api/albums/:category", async (req) => {
    const { category } = z
      .object({ category: z.enum(categories) })
      .parse(req.params);
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).default(1) })
      .parse(req.query);
    const where = and(
      eq(memories.category, category),
      isNull(memories.deletedAt),
    );
    return {
      items: db
        .select({
          id: media.id,
          memoryId: media.memoryId,
          title: memories.title,
          eventDate: memories.eventDate,
        })
        .from(media)
        .innerJoin(memories, eq(memories.id, media.memoryId))
        .where(where)
        .orderBy(desc(memories.eventDate), asc(media.position))
        .limit(40)
        .offset((page - 1) * 40)
        .all(),
      total: db
        .select({ count: sql<number>`count(*)` })
        .from(media)
        .innerJoin(memories, eq(memories.id, media.memoryId))
        .where(where)
        .get()!.count,
      page,
    };
  });
  if (options.webDir && existsSync(options.webDir)) {
    await app.register(fastifyStatic, {
      root: options.webDir,
      wildcard: false,
      setHeaders(response, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`))
          response.header(
            "Cache-Control",
            "public, max-age=31536000, immutable",
          );
        else response.header("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ message: "Risorsa non trovata." })
        : reply.sendFile("index.html", { cacheControl: false }),
    );
  }
  return app;
}
