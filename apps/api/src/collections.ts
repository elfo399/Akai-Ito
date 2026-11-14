import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { categories } from "@akai/shared";
import type { openDb } from "./db.js";
import { collections, memories, media } from "./schema.js";
const input = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(categories),
  description: z.string().trim().max(3000).default(""),
});
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function registerCollections(
  app: FastifyInstance,
  db: ReturnType<typeof openDb>["db"],
) {
  const id = (req: FastifyRequest) =>
    z.object({ id: z.string().uuid() }).parse(req.params).id;
  const get = (key: string) =>
    db.select().from(collections).where(eq(collections.id, key)).get() ??
    fail(404, "Album non trovato.");
  const summary = {
    id: collections.id,
    name: collections.name,
    category: collections.category,
    description: collections.description,
    version: collections.version,
    // Keep the outer qualifier: single-table selections otherwise unqualify
    // interpolated columns, binding the inner query's id instead.
    memoryCount: sql<number>`(select count(*) from memories m where m.collection_id = collections.id and m.deleted_at is null)`,
    photoCount: sql<number>`(select count(*) from memory_media p join memories m on p.memory_id=m.id where m.collection_id=collections.id and m.deleted_at is null)`,
    firstDate: sql<
      string | null
    >`(select min(event_date) from memories m where m.collection_id=collections.id and m.deleted_at is null)`,
    lastDate: sql<
      string | null
    >`(select max(event_date) from memories m where m.collection_id=collections.id and m.deleted_at is null)`,
    coverId: sql<
      string | null
    >`(select p.id from memory_media p join memories m on p.memory_id=m.id where m.collection_id=collections.id and m.deleted_at is null order by m.event_date asc,p.is_cover desc,p.position asc,p.id asc limit 1)`,
  };
  app.get("/api/collections", async (req) => {
    const { category } = z
      .object({ category: z.enum(categories).optional() })
      .parse(req.query);
    return db
      .select(summary)
      .from(collections)
      .where(category ? eq(collections.category, category) : undefined)
      .orderBy(desc(collections.createdAt), asc(collections.id))
      .all();
  });
  app.post("/api/collections", async (req, reply) => {
    const data = input.parse(req.body),
      key = randomUUID(),
      date = new Date().toISOString();
    db.insert(collections)
      .values({ id: key, ...data, createdAt: date, updatedAt: date })
      .run();
    return reply.code(201).send(get(key));
  });
  app.get("/api/collections/:id", async (req) => {
    const key = id(req);
    get(key);
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).default(1) })
      .parse(req.query);
    const where = and(
      eq(memories.collectionId, key),
      isNull(memories.deletedAt),
    );
    return {
      collection: db
        .select(summary)
        .from(collections)
        .where(eq(collections.id, key))
        .get()!,
      items: db
        .select({
          id: media.id,
          memoryId: memories.id,
          title: memories.title,
          eventDate: memories.eventDate,
        })
        .from(media)
        .innerJoin(memories, eq(memories.id, media.memoryId))
        .where(where)
        .orderBy(asc(memories.eventDate), asc(memories.id), asc(media.position))
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
  app.put("/api/collections/:id", async (req) => {
    const key = id(req),
      data = input
        .omit({ category: true })
        .extend({ version: z.number().int().positive() })
        .parse(req.body);
    get(key);
    const result = db
      .update(collections)
      .set({
        name: data.name,
        description: data.description,
        version: data.version + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(collections.id, key), eq(collections.version, data.version)),
      )
      .run();
    if (result.changes !== 1)
      fail(409, "L’album è cambiato. Ricarica prima di salvare.");
    return get(key);
  });
  app.post("/api/collections/:id/memories", async (req) => {
    const key = id(req),
      { items } = z
        .object({
          items: z
            .array(
              z.object({
                id: z.string().uuid(),
                version: z.number().int().positive(),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(req.body);
    if (new Set(items.map((item) => item.id)).size !== items.length)
      fail(400, "Seleziona ogni ricordo una sola volta.");
    db.transaction((tx) => {
      const album = get(key);
      for (const item of items) {
        const memory = tx
          .select()
          .from(memories)
          .where(and(eq(memories.id, item.id), isNull(memories.deletedAt)))
          .get();
        if (!memory) fail(404, "Uno dei ricordi non è più disponibile.");
        if (memory.category !== album.category)
          fail(
            400,
            "I ricordi devono appartenere allo stesso capitolo dell’album.",
          );
        if (memory.version !== item.version)
          fail(
            409,
            "Un ricordo è cambiato. Ricarica prima di aggiungerlo all’album.",
          );
      }
      for (const item of items)
        tx.update(memories)
          .set({
            collectionId: key,
            version: item.version + 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(memories.id, item.id))
          .run();
    });
    return { ok: true };
  });
  app.delete("/api/collections/:id", async (req) => {
    const key = id(req),
      { version } = z
        .object({ version: z.number().int().positive() })
        .parse(req.body);
    db.transaction((tx) => {
      const row = get(key);
      if (row.version !== version)
        fail(409, "L’album è cambiato. Ricarica prima di eliminarlo.");
      tx.update(memories)
        .set({
          collectionId: null,
          version: sql`${memories.version}+1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(memories.collectionId, key))
        .run();
      tx.delete(collections).where(eq(collections.id, key)).run();
    });
    return { ok: true };
  });
}
