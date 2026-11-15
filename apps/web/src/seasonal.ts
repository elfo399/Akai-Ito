import { seasonFor, type Intensity } from "./experience";

export type Season = Exclude<ReturnType<typeof seasonFor>, "standard">;
export type ParticleSeason = Season | "standard";
export type ParticleLevel = "off" | "delicate" | "immersive";
export type SeasonMode = "auto" | "current";
export const seasonNames: Record<Season, string> = {
  spring: "Primavera",
  summer: "Estate",
  autumn: "Autunno",
  winter: "Inverno",
};
export const particleTuning = {
  fade: 1.5,
  settle: 450,
  pixelRatio: 1.5,
  maxPixels: 2_400_000,
  spring: {
    colors: ["#df9eb4", "#efb6c7", "#d58ca5"],
    size: [6, 12],
    speed: [17, 31],
    sway: 25,
    spin: 0.24,
  },
  summer: {
    colors: ["#b96959", "#c88067", "#a95b58"],
    size: [7, 10],
    speed: [5, 10],
    sway: 18,
    spin: 0.08,
  },
  autumn: {
    colors: ["#a75a42", "#c5844f", "#b29443", "#865947"],
    size: [7, 14],
    speed: [19, 34],
    sway: 35,
    spin: 0.36,
  },
  winter: {
    colors: ["#fffdf5", "#f7f7f0", "#f5f8f7"],
    size: [2.4, 4.5],
    speed: [12, 26],
    sway: 15,
    spin: 0.07,
  },
} as const;

export function particleLevel(value: string | null): ParticleLevel {
  return value === "off" || value === "immersive" ? value : "delicate";
}
export function seasonMode(value: string | null): SeasonMode {
  return value === "current" ? "current" : "auto";
}
export function localCivilDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function particlesEnabled(
  level: ParticleLevel,
  motion: Intensity,
  seasons: boolean,
  systemReduced: boolean,
) {
  return level !== "off" && motion !== "off" && seasons && !systemReduced;
}
export function particleCount(
  width: number,
  level: ParticleLevel,
  reduced = false,
  quiet = false,
  season?: ParticleSeason,
) {
  if (level === "off" || width <= 0) return 0;
  const base =
    width < 600
      ? level === "immersive"
        ? 9
        : 5
      : level === "immersive"
        ? 23
        : 12;
  const count =
    season === "summer"
      ? width < 600
        ? level === "immersive"
          ? 6
          : 4
        : level === "immersive"
          ? 13
          : 8
      : base;
  return Math.max(
    2,
    Math.round(count * (reduced ? 0.55 : 1) * (quiet ? 0.65 : 1)),
  );
}
/** Keep detail particles in two soft edge lanes, without increasing density. */
export function framedParticleX(
  position: number,
  side: number,
  width: number,
  gutter: number,
  wind: number,
) {
  if (width <= 0) return 0;
  const lane = Math.min(width / 3, Math.max(24, gutter));
  const x = 10 + (lane - 20) * (0.15 + position * 0.7 + wind * 0.12);
  return side % 2 ? width - x : x;
}
export type VisibleMemory = {
  id: string;
  date: string;
  top: number;
  bottom: number;
};
/** Central reading band plus hysteresis, independent from dates and timezones. */
export function selectActiveMemory(
  items: VisibleMemory[],
  height: number,
  currentId?: string,
) {
  if (height <= 0) return undefined;
  const center = height * 0.5,
    start = height * 0.2,
    end = height * 0.8;
  let best: VisibleMemory | undefined,
    score = Infinity;
  const distance = (item: VisibleMemory) =>
    Math.abs(
      (Math.max(item.top, start) + Math.min(item.bottom, end)) / 2 - center,
    );
  for (const item of items) {
    if (item.bottom <= start || item.top >= end || item.bottom <= item.top)
      continue;
    const next = distance(item);
    if (next < score) {
      best = item;
      score = next;
    }
  }
  const current = items.find(
    (item) =>
      item.id === currentId &&
      item.bottom > start &&
      item.top < end &&
      item.bottom > item.top,
  );
  return current && distance(current) <= score + height * 0.08 ? current : best;
}

export type Particle = {
  x: number;
  y: number;
  depth: number;
  size: number;
  speed: number;
  phase: number;
  angle: number;
  spin: number;
  opacity: number;
  variant: number;
};
export function makeParticles(
  season: Season,
  count: number,
  random = Math.random,
): Particle[] {
  const config = particleTuning[season];
  const range = (a: number, b: number) => a + (b - a) * random();
  return Array.from({ length: count }, () => {
    const depth = range(0.55, 1);
    return {
      x: range(0, 1),
      y: range(0, 1),
      depth,
      size: range(config.size[0], config.size[1]) * depth,
      speed: range(config.speed[0], config.speed[1]) * depth,
      phase: range(0, Math.PI * 2),
      angle: range(-Math.PI, Math.PI),
      spin: range(-config.spin, config.spin),
      opacity: range(0.4, 0.72),
      variant: Math.floor(random() * 12),
    };
  });
}

export type ParticleLayer = {
  season: Season;
  particles: Particle[];
  alpha: number;
};
/** Reuse an outgoing season when returning quickly; never retain more than two layers. */
export function transitionLayers(
  layers: ParticleLayer[],
  target: ParticleSeason,
  count: number,
): ParticleLayer[] {
  if (target === "standard") return layers.slice(-2);
  const existing = layers.find((layer) => layer.season === target);
  const incoming = existing ?? {
    season: target,
    particles: makeParticles(target, count),
    alpha: 0,
  };
  if (incoming.particles.length !== count)
    incoming.particles = makeParticles(target, count);
  const outgoing = layers
    .filter((layer) => layer !== incoming)
    .sort((a, b) => b.alpha - a.alpha)[0];
  return outgoing ? [outgoing, incoming] : [incoming];
}
