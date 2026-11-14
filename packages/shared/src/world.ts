export type PhotoLocation = {
  latitude: number | null;
  longitude: number | null;
  capturedOn: string | null;
  locationSource: "exif" | "manual" | null;
};
export type WorldPhoto = {
  id: string;
  memoryId: string;
  title: string;
  location: string;
  date: string;
  dateSource: "exif" | "event";
  latitude: number;
  longitude: number;
  locationSource: "exif" | "manual";
};
export type MapConfig = {
  tileUrl: string;
  attribution: string;
  attributionUrl: string;
  maxZoom: number;
};
export type WorldData = {
  photos: WorldPhoto[];
  firstDate: string | null;
  unlocatedCount: number;
  config: MapConfig;
};
export const visibleWorldPhotos = (photos: WorldPhoto[], until: string) =>
  photos.filter((photo) => photo.date <= until);
export const placeKey = (photo: { latitude: number; longitude: number }) =>
  `${photo.latitude.toFixed(5)},${photo.longitude.toFixed(5)}`;
export const civilDayNumber = (date: string) =>
  Math.floor(Date.parse(date + "T12:00:00Z") / 86400000);
export const dateFromDayNumber = (day: number) =>
  new Date(day * 86400000).toISOString().slice(0, 10);

export type PhotoGroup = {
  key: string;
  latitude: number;
  longitude: number;
  photos: WorldPhoto[];
};
/** Spatial hash + union/find: cluster neighbours across cell edges and the date line. */
export function groupWorldPhotos(
  photos: WorldPhoto[],
  zoom: number,
  radius = 68,
): PhotoGroup[] {
  const size = 256 * 2 ** zoom;
  const cellCount = Math.max(1, Math.floor(size / radius));
  const cellSize = size / cellCount;
  const cells = new Map<
    string,
    {
      id: number;
      x: number;
      y: number;
      count: number;
      column: number;
      row: number;
    }
  >();
  const photoCells: number[] = [];
  for (const photo of photos) {
    const lat =
      (Math.min(85.05112878, Math.max(-85.05112878, photo.latitude)) *
        Math.PI) /
      180;
    const x = (((photo.longitude + 180) / 360) * size) % size;
    const y =
      ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size;
    const column = Math.floor(x / cellSize),
      row = Math.floor(y / cellSize),
      key = `${column},${row}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { id: cells.size, x: 0, y: 0, count: 0, column, row };
      cells.set(key, cell);
    }
    cell.x += x;
    cell.y += y;
    cell.count++;
    photoCells.push(cell.id);
  }
  const parent = Array.from(cells.values(), (cell) => cell.id);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  // Compare neighbouring cell centres, never every pair of photographs. This
  // also keeps thousands of photos at one location inexpensive on a Raspberry.
  for (const cell of cells.values()) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const other = cells.get(
          `${(cell.column + dx + cellCount) % cellCount},${cell.row + dy}`,
        );
        if (other && other.id !== cell.id) {
          const deltaX = Math.abs(cell.x / cell.count - other.x / other.count),
            distanceX = Math.min(deltaX, size - deltaX);
          if (
            Math.hypot(distanceX, cell.y / cell.count - other.y / other.count) <
            radius
          )
            parent[root(cell.id)] = root(other.id);
        }
      }
  }
  const groups = new Map<number, WorldPhoto[]>();
  photos.forEach((photo, i) => {
    const key = root(photoCells[i]);
    const group = groups.get(key) ?? [];
    group.push(photo);
    groups.set(key, group);
  });
  return Array.from(groups.values()).map((items) => {
    const ordered = [...items].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    const radians = ordered.map((p) => (p.longitude * Math.PI) / 180);
    return {
      key: ordered[0].id,
      latitude:
        ordered.reduce((sum, p) => sum + p.latitude, 0) / ordered.length,
      longitude:
        (Math.atan2(
          radians.reduce((s, r) => s + Math.sin(r), 0),
          radians.reduce((s, r) => s + Math.cos(r), 0),
        ) *
          180) /
        Math.PI,
      photos: ordered,
    };
  });
}
