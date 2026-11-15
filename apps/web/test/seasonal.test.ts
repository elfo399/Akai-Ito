import { describe, expect, it } from "vitest";
import { seasonFor } from "../src/experience";
import { formatDate } from "../src/api";
import {
  localCivilDate,
  framedParticleX,
  makeParticles,
  particleCount,
  particleLevel,
  particlesEnabled,
  seasonMode,
  selectActiveMemory,
  transitionLayers,
  type ParticleLayer,
  type Season,
} from "../src/seasonal";

describe("Particelle: calendario civile e preferenze", () => {
  it("le farfalle estive restano nel budget senza cambiare le altre stagioni", () => {
    for (const season of ["spring", "autumn", "winter"] as const)
      expect(particleCount(375, "delicate", false, false, season)).toBe(
        particleCount(375, "delicate"),
      );
    expect(particleCount(375, "delicate", false, false, "summer")).toBeLessThan(
      particleCount(375, "immersive", false, false, "summer"),
    );
    expect(
      particleCount(375, "immersive", false, false, "summer"),
    ).toBeLessThanOrEqual(10);
    expect(
      particleCount(1440, "immersive", false, false, "summer"),
    ).toBeLessThanOrEqual(25);
  });
  it("distribuisce le particelle sui margini visibili del dettaglio, anche su mobile", () => {
    for (const width of [375, 430, 1100, 1440]) {
      for (const position of [0, 0.5, 1])
        for (const wind of [-1, 0, 1]) {
          const left = framedParticleX(position, 0, width, 32, wind);
          const right = framedParticleX(position, 1, width, 32, wind);
          expect(left).toBeGreaterThan(10);
          expect(left).toBeLessThan(32);
          expect(right).toBeGreaterThan(width - 32);
          expect(right + left).toBeCloseTo(width);
        }
    }
    expect(framedParticleX(0, 0, 0, 32, 0)).toBe(0);
  });
  it("una data non valida non impedisce di leggere il ricordo", () => {
    expect(formatDate("")).toBe("Data non disponibile");
    expect(formatDate("2026-02-30")).toBe("Data non disponibile");
    expect(formatDate("2026-03-01")).toBe("1 marzo 2026");
  });
  it("conserva la data locale senza una conversione UTC", () => {
    const date = new Date(2026, 2, 1, 0, 1);
    expect(localCivilDate(date)).toBe("2026-03-01");
    expect(seasonFor(localCivilDate(date))).toBe("spring");
    expect(seasonFor("2026-02-30")).toBe("standard");
    expect(seasonFor("2026-03-01T00:00:00Z")).toBe("standard");
  });
  it("usa default delicati anche per valori salvati sconosciuti", () => {
    expect(particleLevel(null)).toBe("delicate");
    expect(particleLevel("errato")).toBe("delicate");
    expect(particleLevel("off")).toBe("off");
    expect(seasonMode("errato")).toBe("auto");
    expect(seasonMode("current")).toBe("current");
  });
  it("rispetta tutti gli interruttori e il movimento ridotto del sistema", () => {
    expect(particlesEnabled("delicate", "full", true, false)).toBe(true);
    expect(particlesEnabled("immersive", "reduced", true, false)).toBe(true);
    expect(particlesEnabled("off", "full", true, false)).toBe(false);
    expect(particlesEnabled("immersive", "off", true, false)).toBe(false);
    expect(particlesEnabled("immersive", "full", false, false)).toBe(false);
    expect(particlesEnabled("immersive", "full", true, true)).toBe(false);
  });
  it("limita la densità su telefono, con effetti ridotti e nelle viste discrete", () => {
    expect(particleCount(375, "delicate")).toBe(5);
    expect(particleCount(430, "immersive")).toBe(9);
    expect(particleCount(1440, "delicate")).toBe(12);
    expect(particleCount(1440, "immersive")).toBe(23);
    expect(particleCount(1440, "immersive", true)).toBeLessThan(23);
    expect(particleCount(1440, "immersive", false, true)).toBeLessThan(23);
    expect(particleCount(0, "immersive")).toBe(0);
    expect(particleCount(1440, "off")).toBe(0);
  });
});
describe("Ricordo nella zona di lettura", () => {
  const top = { id: "a", date: "2026-03-01", top: 0, bottom: 400 };
  const center = { id: "b", date: "2026-08-01", top: 350, bottom: 850 };
  it("sceglie il ricordo centrale, escludendo quelli fuori dalla banda", () => {
    expect(
      selectActiveMemory(
        [top, center, { ...top, id: "c", top: 900, bottom: 1200 }],
        1000,
      )?.id,
    ).toBe("b");
  });
  it("mantiene il ricordo corrente quando due pagine hanno peso simile", () => {
    const items = [
      { ...top, bottom: 500 },
      { ...center, top: 520, bottom: 1000 },
    ];
    expect(selectActiveMemory(items, 1000, "a")?.id).toBe("a");
    expect(
      selectActiveMemory([{ ...top, bottom: 210 }, center], 1000, "a")?.id,
    ).toBe("b");
  });
  it("non sostituisce una data non valida con quella di un altro ricordo", () => {
    const active = selectActiveMemory([top, { ...center, date: "" }], 1000);
    expect(active?.id).toBe("b");
    expect(seasonFor(active?.date)).toBe("standard");
  });
  it("gestisce sequenze vuote, spazi tra le card e dimensioni nulle", () => {
    expect(selectActiveMemory([], 1000)).toBeUndefined();
    expect(selectActiveMemory([{ ...top, bottom: 190 }], 1000)).toBeUndefined();
    expect(selectActiveMemory([center], 0)).toBeUndefined();
  });
});
describe("Generazione e transizioni delle quattro stagioni", () => {
  it("distribuisce dimensioni, posizioni e velocità senza valori non finiti", () => {
    let seed = 19;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const season of ["spring", "summer", "autumn", "winter"] as Season[]) {
      const items = makeParticles(season, 23, random);
      expect(items).toHaveLength(23);
      expect(new Set(items.map((p) => p.speed)).size).toBeGreaterThan(20);
      expect(new Set(items.map((p) => p.x)).size).toBeGreaterThan(20);
      for (const particle of items) {
        expect(Object.values(particle).every(Number.isFinite)).toBe(true);
        expect(particle.size).toBeGreaterThan(0);
        expect(particle.opacity).toBeLessThan(1);
      }
    }
  });
  it("non accumula sistemi durante cambi stagionali rapidi", () => {
    let layers: ParticleLayer[] = [];
    for (const season of [
      "spring",
      "summer",
      "autumn",
      "winter",
      "spring",
    ] as Season[]) {
      layers = transitionLayers(layers, season, 12);
      expect(layers.length).toBeLessThanOrEqual(2);
      expect(layers.at(-1)?.season).toBe(season);
    }
  });
  it("riusa la stagione precedente durante un ritorno e adegua la densità", () => {
    const spring = {
      season: "spring" as const,
      particles: makeParticles("spring", 12),
      alpha: 0.7,
    };
    const summer = {
      season: "summer" as const,
      particles: makeParticles("summer", 12),
      alpha: 0.3,
    };
    const layers = transitionLayers([spring, summer], "spring", 5);
    expect(layers.at(-1)).toBe(spring);
    expect(layers.at(-1)?.alpha).toBe(0.7);
    expect(layers.at(-1)?.particles).toHaveLength(5);
  });
  it("una data standard lascia soltanto le particelle in uscita", () => {
    const layers = transitionLayers([], "standard", 12);
    expect(layers).toEqual([]);
    const spring = transitionLayers([], "spring", 12);
    expect(transitionLayers(spring, "standard", 12)).toEqual(spring);
  });
});
