import { z } from "zod";
import type { MapConfig } from "@akai/shared";
export function mapConfig(): MapConfig {
  const tileUrl =
    process.env.MAP_TILE_URL ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const url = new URL(tileUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !["{z}", "{x}", "{y}"].every((token) => tileUrl.includes(token))
  )
    throw new Error(
      "MAP_TILE_URL deve essere un template HTTPS con {z}, {x}, {y}.",
    );
  const attributionUrl =
    process.env.MAP_ATTRIBUTION_URL ??
    "https://www.openstreetmap.org/copyright";
  if (new URL(attributionUrl).protocol !== "https:")
    throw new Error("MAP_ATTRIBUTION_URL deve usare HTTPS.");
  return {
    tileUrl,
    attribution: process.env.MAP_ATTRIBUTION ?? "© OpenStreetMap contributors",
    attributionUrl,
    maxZoom: z.coerce
      .number()
      .int()
      .min(2)
      .max(20)
      .parse(process.env.MAP_MAX_ZOOM ?? 19),
  };
}
