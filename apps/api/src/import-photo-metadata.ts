import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { openDb } from "./db.js";
import { media, memories } from "./schema.js";
import { extractPhotoMetadata } from "./photo-metadata.js";

/** Explicit offline maintenance. No filenames, IDs or coordinates are logged. */
export async function importPhotoMetadata(dataDir: string, apply = false) {
  const { db, sqlite } = openDb(dataDir);
  const summary = {
    dryRun: !apply,
    scanned: 0,
    withoutGps: 0,
    manualProtected: 0,
    wouldUpdate: 0,
    updated: 0,
    errors: 0,
  };
  try {
    const photos = db
      .select({ photo: media })
      .from(media)
      .innerJoin(memories, eq(media.memoryId, memories.id))
      .where(isNull(memories.deletedAt))
      .all();
    for (const { photo } of photos) {
      summary.scanned++;
      try {
        if (path.basename(photo.original) !== photo.original)
          throw new Error("Invalid storage name");
        const metadata = await extractPhotoMetadata(
          await readFile(path.join(dataDir, "media", photo.original)),
        );
        if (metadata.latitude === null) summary.withoutGps++;
        if (photo.locationSource === "manual") summary.manualProtected++;
        const canLocate =
          photo.locationSource !== "manual" &&
          photo.latitude === null &&
          photo.longitude === null &&
          metadata.latitude !== null;
        const canDate =
          photo.capturedOn === null && metadata.capturedOn !== null;
        if (!canLocate && !canDate) continue;
        summary.wouldUpdate++;
        if (!apply) continue;
        // Re-read under the write transaction: a concurrent manual correction wins.
        db.transaction((tx) => {
          const current = tx
            .select()
            .from(media)
            .where(eq(media.id, photo.id))
            .get();
          if (
            !current ||
            !tx
              .select()
              .from(memories)
              .where(
                and(
                  eq(memories.id, photo.memoryId),
                  isNull(memories.deletedAt),
                ),
              )
              .get()
          )
            return;
          const locate =
            current.locationSource !== "manual" &&
            current.latitude === null &&
            current.longitude === null &&
            metadata.latitude !== null;
          const date =
            current.capturedOn === null && metadata.capturedOn !== null;
          if (!locate && !date) return;
          tx.update(media)
            .set({
              ...(locate
                ? {
                    latitude: metadata.latitude,
                    longitude: metadata.longitude,
                    locationSource: "exif" as const,
                  }
                : {}),
              ...(date ? { capturedOn: metadata.capturedOn } : {}),
            })
            .where(eq(media.id, photo.id))
            .run();
          tx.update(memories)
            .set({
              version: sql`${memories.version}+1`,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(memories.id, photo.memoryId))
            .run();
          summary.updated++;
        });
      } catch {
        summary.errors++;
      }
    }
    return summary;
  } finally {
    sqlite.close();
  }
}
