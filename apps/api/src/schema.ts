import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  avatar: text("avatar"),
  lockEnabled: integer("lock_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  lockTimeout: integer("lock_timeout").notNull().default(300),
});
export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  csrf: text("csrf").notNull(),
  expires: integer("expires").notNull(),
  lastActivity: integer("last_activity").notNull().default(0),
  backgroundAt: integer("background_at"),
  lockedAt: integer("locked_at"),
  verifiedAt: integer("verified_at").notNull().default(0),
});
export const settings = sqliteTable("couple_settings", {
  id: integer("id").primaryKey(),
  coupleNames: text("couple_names").notNull().default(""),
  startDate: text("start_date"),
  cover: text("cover"),
});
export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("collections_category").on(t.category)],
);
export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    eventDate: text("event_date").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    location: text("location").notNull(),
    collectionId: text("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    index("memories_date").on(t.eventDate),
    index("memories_category").on(t.category),
    index("memories_collection").on(t.collectionId),
  ],
);
export const media = sqliteTable(
  "memory_media",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    isCover: integer("is_cover", { mode: "boolean" }).notNull().default(false),
    original: text("original").notNull(),
    display: text("display").notNull(),
    thumb: text("thumb").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    capturedOn: text("captured_on"),
    locationSource: text("location_source", { enum: ["exif", "manual"] }),
  },
  (t) => [index("media_memory").on(t.memoryId)],
);
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("comments_memory").on(t.memoryId)],
);
