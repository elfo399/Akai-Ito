import { civilDate, placeKey, type WorldPhoto } from "@akai/shared";
export type Intensity = "full" | "reduced" | "off";
export const motionTokens = {
  feedback: 200,
  reveal: 480,
  page: 850,
  photo: 900,
  intro: 2000,
  slide: 6500,
  stop: 5400,
  camera: 1600,
} as const;
export function effectiveIntensity(
  preference: Intensity,
  systemReduced: boolean,
): Intensity {
  return preference === "off" ? "off" : systemReduced ? "reduced" : preference;
}
export function seasonFor(
  date?: string,
): "spring" | "summer" | "autumn" | "winter" | "standard" {
  if (!date || !civilDate.safeParse(date).success) return "standard";
  const month = Number(date.slice(5, 7));
  return month >= 3 && month <= 5
    ? "spring"
    : month >= 6 && month <= 8
      ? "summer"
      : month >= 9 && month <= 11
        ? "autumn"
        : "winter";
}
export type JourneyStop = {
  key: string;
  photo: WorldPhoto;
  photos: WorldPhoto[];
};
export function journeyStops(
  photos: WorldPhoto[],
  today: string,
): JourneyStop[] {
  const groups = new Map<string, WorldPhoto[]>();
  for (const photo of photos) {
    if (
      !civilDate.safeParse(photo.date).success ||
      photo.date > today ||
      !Number.isFinite(photo.latitude) ||
      !Number.isFinite(photo.longitude) ||
      Math.abs(photo.latitude) > 90 ||
      Math.abs(photo.longitude) > 180
    )
      continue;
    const key = photo.memoryId + ":" + placeKey(photo),
      group = groups.get(key) ?? [];
    group.push(photo);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, items]) => {
    const photos = [...items].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    return { key, photo: photos[0], photos };
  }).sort(
    (a, b) =>
      a.photo.date.localeCompare(b.photo.date) || a.key.localeCompare(b.key),
  );
}
export function journeyLine(photos: WorldPhoto[]): [number, number][] {
  const line: [number, number][] = [];
  for (const photo of photos) {
    let longitude = photo.longitude;
    const previous = line.at(-1);
    if (previous) {
      while (longitude - previous[1] > 180) longitude -= 360;
      while (longitude - previous[1] < -180) longitude += 360;
      if (previous[0] === photo.latitude && previous[1] === longitude) continue;
    }
    line.push([photo.latitude, longitude]);
  }
  return line;
}
