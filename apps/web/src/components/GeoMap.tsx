import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  Polyline,
} from "react-leaflet";
import { DomEvent, divIcon, latLngBounds } from "leaflet";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  LocateFixed,
} from "lucide-react";
import {
  groupWorldPhotos,
  type MapConfig,
  type WorldPhoto,
  type PhotoGroup,
} from "@akai/shared";
import { formatDate, photoUrl } from "../api";
import { useReducedMotion } from "../world-hooks";
import { journeyLine, motionTokens } from "../experience";
import { MemoryLink } from "../navigation";
import "leaflet/dist/leaflet.css";
import "../world.css";

const heart =
  "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 21S2 14 2 7a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 14-10 14Z'/></svg>";
function pin(photos: WorldPhoto[]) {
  if (photos.length > 1) {
    const group = document.createElement("div");
    group.className = "pin-cluster";
    const symbol = document.createElement("span");
    symbol.innerHTML = heart;
    const count = document.createElement("b");
    count.textContent = photos.length > 999 ? "999+" : String(photos.length);
    if (photos.length > 99) group.classList.add("pin-cluster-large");
    group.append(symbol, count);
    return divIcon({
      className: "akai-map-pin akai-map-cluster",
      html: group,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -16],
    });
  }
  const element = document.createElement("div");
  element.className = "photo-pin";
  const frame = document.createElement("span");
  frame.className = "pin-photo";
  const image = document.createElement("img");
  image.src = photoUrl(photos[0].id);
  image.alt = "";
  image.loading = "lazy";
  const badge = document.createElement("span");
  badge.className = "pin-heart";
  badge.innerHTML = heart;
  frame.append(image);
  element.append(frame, badge);
  return divIcon({
    className: "akai-map-pin",
    html: element,
    iconSize: [44, 48],
    iconAnchor: [22, 46],
    popupAnchor: [0, -40],
  });
}
const chosenPin = divIcon({
  className: "chosen-pin",
  html: heart,
  iconSize: [36, 42],
  iconAnchor: [18, 40],
});
export type Point = { latitude: number; longitude: number };

function MapSetup({
  photos,
  onSelect,
  point,
}: {
  photos: WorldPhoto[];
  onSelect?: (point: Point) => void;
  point?: Point | null;
}) {
  const map = useMap();
  const reduced = useReducedMotion();
  const fitButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (fitButton.current) DomEvent.disableClickPropagation(fitButton.current);
  }, []);
  useMapEvents({
    click: (event) =>
      onSelect?.({
        latitude: Math.max(-90, Math.min(90, event.latlng.lat)),
        longitude: ((((event.latlng.lng + 180) % 360) + 360) % 360) - 180,
      }),
  });
  useEffect(() => {
    const element = map.getContainer();
    element.setAttribute(
      "aria-label",
      onSelect
        ? "Mappa per scegliere una posizione. Usa anche i campi latitudine e longitudine."
        : "Mappa dei nostri ricordi. Usa le frecce per spostarti e più o meno per lo zoom.",
    );
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ animate: false }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [map, onSelect]);
  useEffect(() => {
    if (point) map.panTo([point.latitude, point.longitude], { animate: false });
  }, [map, point?.latitude, point?.longitude]);
  return (
    <button
      ref={fitButton}
      type="button"
      className="map-fit"
      aria-label={
        onSelect ? "Centra sul punto scelto" : "Mostra tutti i luoghi visibili"
      }
      onClick={() => {
        if (onSelect && point)
          map.setView(
            [point.latitude, point.longitude],
            Math.max(6, map.getZoom()),
            { animate: !reduced },
          );
        else if (photos.length)
          map.fitBounds(
            latLngBounds(photos.map((p) => [p.latitude, p.longitude])),
            { padding: [48, 48], maxZoom: 12, animate: !reduced },
          );
        else map.setView([22, 10], 2, { animate: !reduced });
      }}
    >
      <LocateFixed size={19} />
    </button>
  );
}

function PhotoPopup({ group }: { group: PhotoGroup }) {
  const [index, setIndex] = useState(0);
  const photo = group.photos[Math.min(index, group.photos.length - 1)];
  return (
    <div className="world-popup">
      <MemoryLink
        memoryId={photo.memoryId}
        photoId={photo.id}
        aria-label={"Apri il ricordo: " + photo.title}
      >
        <img src={photoUrl(photo.id)} alt={photo.title} loading="lazy" />
      </MemoryLink>
      <span className="date">{formatDate(photo.date)}</span>
      <h3>{photo.title}</h3>
      {photo.location && <p>{photo.location}</p>}
      <small>
        {photo.dateSource === "exif" ? "Data dello scatto" : "Data del ricordo"}{" "}
        ·{" "}
        {photo.locationSource === "exif"
          ? "Posizione EXIF"
          : "Posizione manuale"}
      </small>
      <Link className="text-link" to={"/memories/" + photo.memoryId}>
        Riapri questa pagina <ArrowUpRight size={15} />
      </Link>
      {group.photos.length > 1 && (
        <div className="popup-pages">
          <button
            type="button"
            aria-label="Fotografia precedente nel luogo"
            onClick={() =>
              setIndex(
                (i) => (i - 1 + group.photos.length) % group.photos.length,
              )
            }
          >
            <ChevronLeft size={19} />
          </button>
          <span aria-live="polite">
            {Math.min(index + 1, group.photos.length)} / {group.photos.length}
          </span>
          <button
            type="button"
            aria-label="Fotografia successiva nel luogo"
            onClick={() => setIndex((i) => (i + 1) % group.photos.length)}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      )}
    </div>
  );
}
function PhotoMarkers({
  photos,
  maxZoom,
}: {
  photos: WorldPhoto[];
  maxZoom: number;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const groups = useMemo(() => groupWorldPhotos(photos, zoom), [photos, zoom]);
  return (
    <>
      {groups.map((group) => (
        <GroupMarker
          key={group.key}
          group={group}
          zoom={zoom}
          maxZoom={maxZoom}
        />
      ))}
    </>
  );
}
function GroupMarker({
  group,
  zoom,
  maxZoom,
}: {
  group: PhotoGroup;
  zoom: number;
  maxZoom: number;
}) {
  const map = useMap();
  // Retain thumbnail DOM between timeline ticks if the group's cover/count has not changed.
  const icon = useMemo(
    () => pin(group.photos),
    [group.photos[0].id, group.photos.length],
  );
  return (
    <Marker
      position={[group.latitude, group.longitude]}
      icon={icon}
      title={`${group.photos.length} fotografie: ${group.photos[0].title}`}
      alt={`${group.photos.length} fotografie: ${group.photos[0].title}`}
    >
      <Popup maxWidth={280} minWidth={180} autoPanPadding={[16, 16]}>
        <PhotoPopup
          key={group.photos.map((p) => p.id).join(":")}
          group={group}
        />
        {group.photos.length > 1 && zoom < maxZoom && (
          <button
            type="button"
            className="text-link cluster-zoom"
            onClick={() =>
              map.setView(
                [group.latitude, group.longitude],
                Math.min(maxZoom, zoom + 2),
                { animate: false },
              )
            }
          >
            Esplora questo gruppo
          </button>
        )}
      </Popup>
    </Marker>
  );
}

export default function GeoMap({
  config,
  photos = [],
  point,
  onSelect,
  focus,
  visited = [],
  traveling,
  onInteract,
}: {
  config: MapConfig;
  photos?: WorldPhoto[];
  point?: Point | null;
  onSelect?: (point: Point) => void;
  focus?: WorldPhoto;
  visited?: WorldPhoto[];
  traveling?: boolean;
  onInteract?: () => void;
}) {
  const reduced = useReducedMotion();
  const [tileError, setTileError] = useState(false);
  return (
    <div className={"geo-map " + (onSelect ? "geo-picker" : "")}>
      <MapContainer
        center={point ? [point.latitude, point.longitude] : [22, 10]}
        zoom={
          point
            ? Math.min(6, config.maxZoom)
            : window.innerWidth <= 620
              ? 0
              : window.innerWidth <= 1000
                ? 1
                : 2
        }
        minZoom={0}
        maxZoom={config.maxZoom}
        zoomAnimation={!reduced}
        fadeAnimation={!reduced}
        markerZoomAnimation={!reduced}
        scrollWheelZoom={false}
        worldCopyJump
        keyboard
        attributionControl={false}
      >
        <TileLayer
          url={config.tileUrl}
          maxZoom={config.maxZoom}
          keepBuffer={0}
          updateWhenIdle
          eventHandlers={{
            tileerror: () => setTileError(true),
            tileload: () => setTileError(false),
          }}
        />
        <MapSetup photos={photos} point={point} onSelect={onSelect} />
        <TravelCamera
          focus={focus}
          traveling={traveling}
          maxZoom={config.maxZoom}
          onInteract={onInteract}
        />
        <GeographicThread visited={visited} animate={traveling !== false} />
        {onSelect ? (
          point && (
            <Marker
              position={[point.latitude, point.longitude]}
              icon={chosenPin}
              title="Posizione selezionata"
            />
          )
        ) : (
          <PhotoMarkers photos={photos} maxZoom={config.maxZoom} />
        )}
      </MapContainer>
      <div className="map-attribution">
        <a
          href={config.attributionUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {config.attribution}
        </a>
      </div>
      {tileError && (
        <p className="map-tile-error" role="status">
          La cartografia non è disponibile. Puoi comunque consultare i ricordi e
          scegliere le coordinate.
        </p>
      )}
    </div>
  );
}

function TravelCamera({
  focus,
  traveling,
  maxZoom,
  onInteract,
}: {
  focus?: WorldPhoto;
  traveling?: boolean;
  maxZoom: number;
  onInteract?: () => void;
}) {
  const map = useMap(),
    reduced = useReducedMotion(),
    last = useRef<string | undefined>(undefined);
  useMapEvents({ dragstart: () => onInteract?.() });
  useEffect(() => {
    if (!focus) {
      map.stop();
      last.current = undefined;
      return;
    }
    const changed = last.current !== focus.id;
    last.current = focus.id;
    map.stop();
    if (traveling === false && !changed) return;
    const distance = map
      .getCenter()
      .distanceTo([focus.latitude, focus.longitude]);
    const zoom = Math.min(
      maxZoom,
      distance > 3000000 ? 4 : distance > 500000 ? 5 : 7,
    );
    if (changed && distance < 10 && map.getZoom() >= 4) return;
    if (reduced)
      map.setView([focus.latitude, focus.longitude], zoom, { animate: false });
    else
      map.flyTo([focus.latitude, focus.longitude], zoom, {
        duration: distance > 3000000 ? 2.2 : motionTokens.camera / 1000,
        easeLinearity: 0.25,
      });
    return () => {
      map.stop();
    };
  }, [
    map,
    focus?.id,
    focus?.latitude,
    focus?.longitude,
    traveling,
    reduced,
    maxZoom,
  ]);
  return null;
}
function GeographicThread({
  visited,
  animate,
}: {
  visited: WorldPhoto[];
  animate: boolean;
}) {
  const line = useMemo(() => journeyLine(visited), [visited]);
  if (line.length < 2) return null;
  const copies = (points: [number, number][]): [number, number][][] => [
    points,
    points.map(([lat, lng]) => [lat, lng - 360]),
    points.map(([lat, lng]) => [lat, lng + 360]),
  ];
  return (
    <>
      {line.length > 2 && (
        <Polyline
          positions={copies(line.slice(0, -1))}
          className="geographic-thread"
          pathOptions={{ color: "#a83232", weight: 2, opacity: 0.75 }}
          interactive={false}
        />
      )}
      <Polyline
        key={visited.at(-1)?.id}
        positions={copies(line.slice(-2))}
        className={"geographic-thread " + (animate ? "geographic-leg" : "")}
        pathOptions={{ color: "#a83232", weight: 2, opacity: 0.75 }}
        interactive={false}
        eventHandlers={{
          add: (event) => {
            event.target.getElement()?.setAttribute("pathLength", "1");
          },
        }}
      />
    </>
  );
}
