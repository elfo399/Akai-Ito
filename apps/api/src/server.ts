import path from "node:path";
import { createApp } from "./app.js";
import { dataDirectory, projectRoot } from "./config.js";
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const app = await createApp({
  dataDir: dataDirectory(),
  origin,
  secureCookies: process.env.COOKIE_SECURE !== "false",
  trustProxy: process.env.TRUST_PROXY === "true",
  webDir: path.join(projectRoot, "apps/web/dist"),
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
console.info("Akai Ito in ascolto sulla porta " + (process.env.PORT ?? 3000));
