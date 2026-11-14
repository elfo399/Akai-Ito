import { describe, expect, it } from "vitest";
import {
  effectiveIntensity,
  journeyLine,
  journeyStops,
  seasonFor,
} from "../src/experience";
import type { WorldPhoto } from "@akai/shared";
const photo = (
  id: string,
  date: string,
  memoryId = id,
  latitude = 41.9,
  longitude = 12.5,
): WorldPhoto => ({
  id,
  date,
  memoryId,
  latitude,
  longitude,
  title: id,
  location: "",
  dateSource: "event",
  locationSource: "manual",
});
describe("Preferenze immersive e stagioni", () => {
  it("non scavalca il movimento ridotto del sistema", () => {
    expect(effectiveIntensity("full", true)).toBe("reduced");
    expect(effectiveIntensity("off", true)).toBe("off");
    expect(effectiveIntensity("reduced", false)).toBe("reduced");
  });
  it("segue la data del ricordo per tutte le stagioni e i loro confini", () => {
    for (const [date, season] of [
      ["2024-02-29", "winter"],
      ["2024-03-01", "spring"],
      ["2024-05-31", "spring"],
      ["2024-06-01", "summer"],
      ["2024-08-31", "summer"],
      ["2024-09-01", "autumn"],
      ["2024-11-30", "autumn"],
      ["2024-12-01", "winter"],
    ])
      expect(seasonFor(date)).toBe(season);
  });
  it("usa l'atmosfera standard quando una data manca o non è valida", () => {
    expect(seasonFor()).toBe("standard");
    expect(seasonFor("2023-02-29")).toBe("standard");
  });
});
describe("Viaggio ricavato dalle fotografie del diario", () => {
  it("ordina cronologicamente senza cambiare gli oggetti originali", () => {
    const photos = [photo("b", "2025-01-01"), photo("a", "2024-01-01")];
    expect(
      journeyStops(photos, "2026-01-01").map((stop) => stop.photo.id),
    ).toEqual(["a", "b"]);
    expect(photos[0].id).toBe("b");
  });
  it("riunisce scatti dello stesso ricordo e luogo ma conserva i ritorni in altre date", () => {
    const photos = [
      photo("a", "2024-01-01", "m"),
      photo("b", "2024-01-01", "m"),
      photo("c", "2025-01-01", "other"),
    ];
    const stops = journeyStops(photos, "2026-01-01");
    expect(stops).toHaveLength(2);
    expect(stops[0].photos).toHaveLength(2);
  });
  it("mantiene tappe diverse quando un ricordo comprende luoghi diversi", () => {
    expect(
      journeyStops(
        [photo("a", "2024-01-01", "m"), photo("b", "2024-01-01", "m", 35, 139)],
        "2026-01-01",
      ),
    ).toHaveLength(2);
  });
  it("esclude date sconosciute, scatti futuri e coordinate invalide; include oggi", () => {
    const items = [
      photo("a", "2026-01-01"),
      photo("b", "2026-01-02"),
      photo("c", ""),
      photo("d", "2024-01-01", "d", NaN),
      photo("e", "2024-01-01", "e", 91),
    ];
    expect(journeyStops(items, "2026-01-01").map((s) => s.photo.id)).toEqual([
      "a",
    ]);
    expect(journeyStops([], "2026-01-01")).toEqual([]);
  });
  it("non crea tratti per fotografie coincidenti e non attraversa tutto il mondo al cambio di data", () => {
    const a = photo("a", "2024-01-01", "a", 0, 179),
      b = photo("b", "2024-01-02", "b", 0, -179);
    expect(journeyLine([a, a, b])).toEqual([
      [0, 179],
      [0, 181],
    ]);
    expect(journeyLine([b, a])).toEqual([
      [0, -179],
      [0, -181],
    ]);
    expect(journeyLine([a])).toEqual([[0, 179]]);
  });
});
