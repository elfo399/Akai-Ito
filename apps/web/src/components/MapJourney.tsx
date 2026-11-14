import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { romeToday, type WorldPhoto } from "@akai/shared";
import { journeyStops, motionTokens, type JourneyStop } from "../experience";
import { useMotion } from "../motion";
import { formatDate, photoUrl } from "../api";
import { MemoryLink } from "../navigation";
export function useMapJourney(
  photos: WorldPhoto[],
  selectDate: (date: string) => void,
) {
  const stops = useMemo(() => journeyStops(photos, romeToday()), [photos]);
  const { effective } = useMotion();
  const [open, setOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const photo = open
    ? stops[Math.min(index, stops.length - 1)]?.photo
    : undefined;
  const select = useRef(selectDate);
  select.current = selectDate;
  const start = () => {
    setIndex(0);
    setOpen(true);
    setPlaying(effective === "full");
  };
  const close = () => {
    setPlaying(false);
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (photo) select.current(photo.date);
  }, [photo?.id]);
  useEffect(() => {
    if (!open || !playing || effective !== "full" || !stops.length) return;
    const timer = window.setTimeout(() => {
      if (index >= stops.length - 1) {
        setPlaying(false);
        select.current(romeToday());
      } else setIndex((value) => value + 1);
    }, motionTokens.stop);
    return () => clearTimeout(timer);
  }, [open, playing, effective, index, stops.length, cycle]);
  useEffect(() => {
    if (effective !== "full") setPlaying(false);
  }, [effective]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        close();
      }
    };
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open]);
  return {
    open,
    playing,
    index,
    stops,
    photo,
    launcher,
    start,
    close,
    pause: () => setPlaying(false),
    toggle: () => setPlaying((value) => !value),
    restart: () => {
      setIndex(0);
      setCycle((value) => value + 1);
      setPlaying(effective === "full");
    },
    next: () => {
      setPlaying(false);
      setIndex((value) => Math.min(stops.length - 1, value + 1));
    },
    visited: open ? stops.slice(0, index + 1).map((stop) => stop.photo) : [],
  };
}
export default function MapJourney({
  stop,
  index,
  total,
  playing,
  next,
  restart,
  toggle,
  close,
}: {
  stop: JourneyStop;
  index: number;
  total: number;
  playing: boolean;
  next: () => void;
  restart: () => void;
  toggle: () => void;
  close: () => void;
}) {
  const { effective } = useMotion();
  const [photoIndex, setPhotoIndex] = useState(0);
  useEffect(() => setPhotoIndex(0), [stop.key]);
  const photo = stop.photos[Math.min(photoIndex, stop.photos.length - 1)];
  return (
    <section
      className="journey-panel paper"
      tabIndex={-1}
      aria-label="Viaggio cinematografico"
    >
      <button
        className="icon-button journey-close"
        aria-label="Esci dal viaggio"
        onClick={close}
      >
        <X size={19} />
      </button>
      <span className="eyebrow">
        TAPPA {index + 1} DI {total}
      </span>
      <MemoryLink
        memoryId={photo.memoryId}
        photoId={photo.id}
        className="polaroid journey-photo"
      >
        <img key={photo.id} src={photoUrl(photo.id)} alt={photo.title} />
        <span className="handwritten">{photo.title}</span>
      </MemoryLink>
      <time dateTime={photo.date}>{formatDate(photo.date)}</time>
      <p>{photo.location || "Un posto nella nostra storia"}</p>
      {stop.photos.length > 1 && (
        <div className="journey-photo-pages">
          <button
            className="icon-button"
            aria-label="Foto precedente della tappa"
            onClick={() =>
              setPhotoIndex(
                (value) =>
                  (value - 1 + stop.photos.length) % stop.photos.length,
              )
            }
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {photoIndex + 1} / {stop.photos.length} foto
          </span>
          <button
            className="icon-button"
            aria-label="Foto successiva della tappa"
            onClick={() =>
              setPhotoIndex((value) => (value + 1) % stop.photos.length)
            }
          >
            <ChevronRight size={17} />
          </button>
        </div>
      )}
      <div
        className="journey-progress"
        role="progressbar"
        aria-label="Progresso del viaggio"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
      >
        <span style={{ transform: `scaleX(${(index + 1) / total})` }} />
      </div>
      <div className="journey-actions">
        <button
          className="icon-button"
          aria-label="Riavvia il viaggio"
          onClick={restart}
        >
          <RotateCcw size={18} />
        </button>
        <button
          className="button"
          disabled={effective !== "full"}
          onClick={toggle}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "Pausa" : "Riprendi"}
        </button>
        <button
          className="icon-button"
          aria-label="Tappa successiva"
          disabled={index >= total - 1}
          onClick={next}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="journey-legend">
        Il filo unisce simbolicamente i ricordi, senza indicare un itinerario
        stradale.
      </p>
      {effective !== "full" && (
        <p className="tiny">
          Movimento ridotto: visita le tappe con “Tappa successiva”.
        </p>
      )}
    </section>
  );
}
