import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { formatDate, photoUrl } from "../api";
import type { Memory } from "../types";
import { useMotion, useSeason } from "../motion";
import { motionTokens } from "../experience";
export default function PhotoCinema({
  memory,
  onClose,
}: {
  memory: Memory;
  onClose: () => void;
}) {
  const { effective } = useMotion(),
    season = useSeason(memory.eventDate);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(effective === "full"),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [previous, setPrevious] = useState<string | null>(null);
  const [retry, setRetry] = useState(0),
    [replay, setReplay] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    touch = useRef<{ x: number; y: number } | null>(null),
    last = useRef<string | null>(null);
  const photo = memory.photos[index],
    source = photoUrl(photo.id, "display");
  const move = (delta: number) => {
    setPlaying(false);
    setIndex((i) => Math.max(0, Math.min(memory.photos.length - 1, i + delta)));
  };
  useEffect(() => {
    const element = dialog.current!,
      opener = document.activeElement,
      overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    setPrevious(last.current);
    setReady(false);
    setFailed(false);
    image.src = source;
    const load = async () => {
      try {
        await image.decode();
        if (cancelled) return;
        setPrevious(last.current);
        last.current = source;
        setReady(true);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setPlaying(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      image.src = "";
    };
  }, [source, retry]);
  useEffect(() => {
    if (!ready || !playing || effective !== "full") return;
    const next = memory.photos[index + 1];
    const preload = next ? new Image() : null;
    if (preload && next) preload.src = photoUrl(next.id, "display");
    const timer = window.setTimeout(() => {
      if (index >= memory.photos.length - 1) setPlaying(false);
      else setIndex((i) => i + 1);
    }, motionTokens.slide);
    return () => {
      clearTimeout(timer);
      if (preload) preload.src = "";
    };
  }, [index, ready, playing, effective, memory.photos]);
  useEffect(() => {
    if (effective !== "full") setPlaying(false);
  }, [effective]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  return (
    <dialog
      ref={dialog}
      className="photo-cinema"
      data-season={season}
      aria-label={"Rivivi questo momento: " + memory.title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.code === "Space" && event.target === dialog.current) {
          event.preventDefault();
          if (effective === "full") setPlaying((value) => !value);
        }
      }}
    >
      <header className="cinema-heading">
        <div>
          <span className="eyebrow">RIVIVI QUESTO MOMENTO</span>
          <h2>{memory.title}</h2>
          <time dateTime={memory.eventDate}>
            {formatDate(memory.eventDate)}
          </time>
        </div>
        <button
          className="icon-button"
          aria-label="Esci dalla modalità cinematografica"
          autoFocus
          onClick={onClose}
        >
          <X size={23} />
        </button>
      </header>
      <div
        className="cinema-stage"
        data-playing={playing && ready && effective === "full"}
        onTouchStart={(event) => {
          touch.current = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
          };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = event.changedTouches[0].clientX - start.x,
            dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
            move(dx < 0 ? 1 : -1);
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        {previous && (
          <img
            className="cinema-previous"
            src={previous}
            alt=""
            aria-hidden="true"
          />
        )}
        {ready && (
          <div key={source + replay} className="cinema-frame">
            <img
              className="cinema-current"
              src={source}
              alt={`${memory.title} — fotografia ${index + 1}`}
            />
          </div>
        )}
        {!ready && !failed && (
          <p className="cinema-loading" role="status">
            La prossima fotografia sta arrivando…
          </p>
        )}
        {failed && (
          <div className="cinema-loading" role="alert">
            <p>Questa fotografia non è disponibile.</p>
            <button
              className="button secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Riprova
            </button>
          </div>
        )}
      </div>
      <div
        className="cinema-controls"
        role="group"
        aria-label="Controlli delle fotografie"
      >
        <button
          className="icon-button"
          aria-label="Fotografia precedente"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={23} />
        </button>
        <button
          className="button cinema-play"
          disabled={effective !== "full" || !ready}
          onClick={() => {
            if (index === memory.photos.length - 1 && !playing) {
              setIndex(0);
              setReplay((value) => value + 1);
            }
            setPlaying((value) => !value);
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
          {playing ? "Pausa" : "Avvia"}
        </button>
        <span role="status" aria-live={playing ? "off" : "polite"}>
          {index + 1} / {memory.photos.length}
        </span>
        <button
          className="icon-button"
          aria-label="Fotografia successiva"
          disabled={index === memory.photos.length - 1}
          onClick={() => move(1)}
        >
          <ChevronRight size={23} />
        </button>
        <button className="text-link" onClick={onClose}>
          Esci
        </button>
      </div>
      {memory.description && (
        <p className="cinema-story">{memory.description}</p>
      )}
      {effective !== "full" && (
        <p className="cinema-motion-note">
          Movimento automatico disattivato. Sfoglia le fotografie con le frecce.
        </p>
      )}
    </dialog>
  );
}
