import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { openDb, migrate } from "../src/db.js";
import { initializeUsers } from "../src/cli.js";
import { createApp } from "../src/app.js";
const origin = "http://localhost:3001",
  password = "DiarioTest2026!";
let app: FastifyInstance,
  directory: string,
  storage: ReturnType<typeof openDb>,
  cookie: string,
  csrf: string,
  time: number;
const control = { request: vi.fn() };
const config = {
  destinationId: "local",
  folder: "akai-ito",
  automatic: true,
  time: "03:30",
  daily: 7,
  weekly: 4,
  monthly: 6,
  localAcknowledged: true,
  keyAcknowledged: true,
  encryptionPassword: "SyntheticBackupKey2026!",
};
const request = (
  url: string,
  method: "GET" | "PUT" | "POST" = "GET",
  payload?: object,
) =>
  app.inject({
    url: "/api/backup/" + url,
    method,
    headers: { origin, cookie, "x-csrf-token": csrf },
    payload,
  });
beforeEach(async () => {
  time = Date.now();
  directory = await mkdtemp(path.join(tmpdir(), "akai-backup-test-"));
  storage = openDb(directory);
  migrate(storage.sqlite);
  await initializeUsers(storage.db, [
    { username: "alpha", name: "Alpha", password },
    { username: "bravo", name: "Bravo", password },
  ]);
  control.request.mockReset().mockResolvedValue({ available: true });
  app = await createApp({
    dataDir: directory,
    origin,
    secureCookies: false,
    loginLimit: 100,
    clock: () => time,
    backupControl: control,
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin },
    payload: { username: "alpha", password },
  });
  cookie = `akai_session=${res.cookies[0].value}`;
  csrf = res.json().csrf;
});
afterEach(async () => {
  await app.close();
  storage.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});
it("requires a session, CSRF and an unlocked diary before contacting the host", async () => {
  expect((await app.inject({ url: "/api/backup/status" })).statusCode).toBe(
    401,
  );
  expect(
    (
      await app.inject({
        url: "/api/backup/configuration",
        method: "PUT",
        headers: { origin, cookie },
        payload: config,
      })
    ).statusCode,
  ).toBe(403);
  storage.sqlite
    .prepare(
      "UPDATE session SET locked_at=? WHERE user_id=(SELECT id FROM users WHERE username='alpha')",
    )
    .run(time);
  storage.sqlite
    .prepare("UPDATE users SET lock_enabled=1 WHERE username='alpha'")
    .run();
  expect((await request("status")).statusCode).toBe(423);
  expect(
    (await request("actions", "POST", { action: "backup" })).statusCode,
  ).toBe(423);
  expect(control.request).not.toHaveBeenCalled();
});
it("requires recent password verification for changes, while status remains readable", async () => {
  time += 6 * 60_000;
  expect((await request("configuration", "PUT", config)).statusCode).toBe(403);
  expect(
    (await request("actions", "POST", { action: "backup" })).statusCode,
  ).toBe(403);
  expect((await request("status")).statusCode).toBe(200);
  const verified = await app.inject({
    url: "/api/auth/lock/reauth",
    method: "POST",
    headers: { origin, cookie, "x-csrf-token": csrf },
    payload: { password },
  });
  expect(verified.statusCode).toBe(200);
  expect((await request("configuration", "PUT", config)).statusCode).toBe(200);
  expect(control.request).toHaveBeenLastCalledWith(
    "POST",
    "/configure",
    config,
  );
});
it.each([
  { folder: "../../etc" },
  { time: "25:01" },
  { daily: -1 },
  { monthly: 121 },
  { automatic: "true" },
  { command: "anything" },
  { encryptionPassword: "secret\nBAD=1" },
])("rejects unsafe or unexpected configuration: %j", async (invalid) => {
  expect(
    (await request("configuration", "PUT", { ...config, ...invalid }))
      .statusCode,
  ).toBe(400);
  expect(control.request).not.toHaveBeenCalled();
});
it("exposes only the four explicit actions, preserving host conflicts", async () => {
  expect(
    (await request("actions", "POST", { action: "restore" })).statusCode,
  ).toBe(400);
  expect(
    (await request("actions", "POST", { action: "backup", command: "x" }))
      .statusCode,
  ).toBe(400);
  control.request.mockRejectedValue(
    Object.assign(new Error("Backup già in corso"), { statusCode: 409 }),
  );
  expect(
    (await request("actions", "POST", { action: "backup" })).statusCode,
  ).toBe(409);
});
it("reports unavailable rather than inventing a configured or successful backup", async () => {
  control.request.mockRejectedValue(new Error("private host error"));
  const res = await request("status");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    available: false,
    ready: false,
    automaticActive: false,
    snapshotCount: 0,
  });
  expect(res.body).not.toContain("private host error");
  expect(res.headers["cache-control"]).toContain("no-store");
});
