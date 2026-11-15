import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { displayMode, viewportMetrics } from "../src/mobile-viewport";

describe("PWA assets and scope", () => {
  it("keeps every internal route, including login and deep links, in scope", async () => {
    const manifest = JSON.parse(
      await readFile("apps/web/public/manifest.webmanifest", "utf8"),
    );
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      name: "Akai Ito — Il nostro filo rosso",
      short_name: "Akai Ito",
    });
    const origin = "https://diary.example";
    for (const path of [
      "/",
      "/timeline?year=2026",
      "/albums/Viaggi/trip",
      "/memories/photo",
      "/memories/photo/edit",
      "/memories/new",
      "/world?photo=one",
      "/settings",
      "/login",
    ])
      expect(
        new URL(path, origin).href.startsWith(
          new URL(manifest.scope, origin).href,
        ),
      ).toBe(true);
  });
  it("ships actual PNGs of the declared sizes and an opaque Apple icon", async () => {
    const manifest = JSON.parse(
      await readFile("apps/web/public/manifest.webmanifest", "utf8"),
    );
    for (const icon of [
      ...manifest.icons,
      { src: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ]) {
      const meta = await sharp(
        await readFile("apps/web/public" + icon.src),
      ).metadata();
      expect(meta.format).toBe("png");
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.hasAlpha).toBe(false);
    }
    expect(
      manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"),
    ).toBe(true);
  });
});

describe("viewport changes", () => {
  const base = {
    layoutHeight: 844,
    visualHeight: 844,
    visualTop: 0,
    referenceHeight: 844,
    mobile: true,
    editing: false,
  };
  it("does not confuse browser toolbars with the keyboard", () => {
    expect(viewportMetrics({ ...base, visualHeight: 750 })).toEqual({
      bottom: 94,
      keyboard: false,
    });
    expect(
      viewportMetrics({ ...base, visualHeight: 750, editing: true }).keyboard,
    ).toBe(false);
    expect(viewportMetrics({ ...base, visualHeight: 420 }).keyboard).toBe(
      false,
    );
  });
  it("recognizes visual-only and layout-resizing keyboards while typing", () => {
    expect(
      viewportMetrics({ ...base, visualHeight: 420, editing: true }),
    ).toEqual({ bottom: 424, keyboard: true });
    expect(
      viewportMetrics({
        ...base,
        layoutHeight: 420,
        visualHeight: 420,
        editing: true,
      }),
    ).toEqual({ bottom: 0, keyboard: true });
    expect(
      viewportMetrics({
        ...base,
        visualHeight: 420,
        visualTop: 100,
        editing: true,
      }).bottom,
    ).toBe(324);
  });
  it("keeps desktop controls visible and never produces a negative inset", () => {
    expect(
      viewportMetrics({
        ...base,
        visualHeight: 420,
        editing: true,
        mobile: false,
      }).keyboard,
    ).toBe(false);
    expect(viewportMetrics({ ...base, visualHeight: 850 }).bottom).toBe(0);
  });
  it("recognizes both manifest standalone and the iOS standalone flag", () => {
    expect(displayMode(false)).toBe("browser");
    expect(displayMode(true)).toBe("standalone");
    expect(displayMode(false, true)).toBe("standalone");
  });
});
