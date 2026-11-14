import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Globe2,
  Heart,
  Pause,
  Play,
  RotateCcw,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import {
  civilDayNumber,
  dateFromDayNumber,
  groupWorldPhotos,
  placeKey,
  romeToday,
  visibleWorldPhotos,
  type WorldData,
} from "@akai/shared";
import { api, formatDate, photoUrl } from "../api";
import { PageHeading, Loading, ErrorState, AddMemory } from "../components";
import GeoMap from "../components/GeoMap";
import { WashiTape } from "../scrapbook";
import { useReducedMotion } from "../world-hooks";
import "../world.css";

export default function World() {
  const query = useQuery({
    queryKey: ["world"],
    queryFn: () => api<WorldData>("/world"),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return <WorldDiary data={query.data} />;
}
function WorldDiary({ data }: { data: WorldData }) {
  const today = romeToday(),
    last = civilDayNumber(today);
  const first = Math.min(last, civilDayNumber(data.firstDate ?? today));
  const [day, setDay] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [postcardLimit, setPostcardLimit] = useState(12);
  const reduced = useReducedMotion();
  const selected = Math.max(first, Math.min(last, day)),
    date = dateFromDayNumber(selected);
  const photos = useMemo(
    () => visibleWorldPhotos(data.photos, date),
    [data.photos, date],
  );
  const places = useMemo(() => new Set(photos.map(placeKey)).size, [photos]);
  const collections = useMemo(() => groupWorldPhotos(photos, 19), [photos]);
  useEffect(() => {
    if (!playing || reduced) return;
    const interval = window.setInterval(
      () =>
        setDay((value) =>
          Math.min(last, value + Math.max(1, Math.ceil((last - first) / 100))),
        ),
      250,
    );
    return () => window.clearInterval(interval);
  }, [playing, reduced, first, last]);
  useEffect(() => {
    if (selected >= last || reduced) setPlaying(false);
  }, [selected, last, reduced]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  const choose = (value: number) => {
    setPlaying(false);
    setDay(Math.min(last, Math.max(first, value)));
  };
  return (
    <div className="page world-page">
      <PageHeading
        eyebrow="LE NOSTRE PICCOLE COORDINATE"
        title="Il nostro mondo"
        subtitle="Ogni luogo custodisce un pezzo della nostra storia."
      />
      <section
        className="world-sheet paper"
        aria-label="Mappa fotografica e viaggio nel tempo"
      >
        <WashiTape />
        <div className="world-map-heading">
          <span className="handwritten">
            <Globe2 size={19} /> I posti in cui siamo stati noi.
          </span>
          <Heart size={19} strokeWidth={1.3} aria-hidden="true" />
        </div>
        <GeoMap config={data.config} photos={photos} />
        {!data.photos.length && (
          <div className="world-empty">
            <MapNote />
            {data.unlocatedCount ? (
              <>
                <h2>Le nostre foto cercano un posto.</h2>
                <p>
                  Apri un ricordo e scegli “Imposta posizione” sotto una
                  fotografia. Anche gli scatti senza GPS possono trovare il loro
                  punto nel mondo.
                </p>
                <Link className="text-link" to="/timeline">
                  Sfoglia i ricordi <ArrowUpRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <h2>Un mondo ancora da raccontare.</h2>
                <p>
                  Le fotografie con coordinate appariranno qui. Ogni viaggio
                  comincia con un piccolo ricordo.
                </p>
                <AddMemory />
              </>
            )}
          </div>
        )}
        <div className="world-time">
          <div className="time-heading">
            <div>
              <span className="eyebrow">IL NOSTRO FILO, FINO A QUI</span>
              <time dateTime={date}>{formatDate(date)}</time>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => choose(last)}
            >
              <CalendarDays size={16} />
              Torna a oggi
            </button>
          </div>
          <label className="sr-only" htmlFor="world-date-range">
            Mostra fotografie scattate fino alla data selezionata, inclusa
          </label>
          <input
            id="world-date-range"
            className="time-thread"
            type="range"
            min={first}
            max={last}
            step="1"
            value={selected}
            disabled={first === last}
            aria-valuetext={formatDate(date)}
            onChange={(e) => choose(Number(e.target.value))}
          />
          <div className="time-endpoints">
            <span>{formatDate(dateFromDayNumber(first))}</span>
            <span>Oggi</span>
          </div>
          <div className="world-controls">
            <div className="playback-controls">
              <button
                className="button"
                type="button"
                disabled={reduced || !data.photos.length || first === last}
                onClick={() => {
                  if (playing) setPlaying(false);
                  else {
                    if (selected >= last) setDay(first);
                    setPlaying(true);
                  }
                }}
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
                {playing
                  ? "Pausa"
                  : selected > first && selected < last
                    ? "Riprendi la storia"
                    : "Rivivi la nostra storia"}
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Riavvia dall’inizio"
                disabled={!data.photos.length || first === last}
                onClick={() => {
                  setDay(first);
                  setPlaying(!reduced);
                }}
              >
                <RotateCcw size={19} />
              </button>
            </div>
            <label className="world-date-input">
              Un giorno preciso
              <input
                type="date"
                min={dateFromDayNumber(first)}
                max={today}
                value={date}
                onChange={(e) => {
                  if (e.target.value && e.target.validity.valid)
                    choose(civilDayNumber(e.target.value));
                }}
              />
            </label>
          </div>
          <p
            className="world-counts"
            role="status"
            aria-live={playing ? "off" : "polite"}
          >
            <strong>{photos.length}</strong> fotografie <span>·</span>{" "}
            <strong>{places}</strong> luoghi{" "}
            <span className="count-date">fino al {formatDate(date)}</span>
          </p>
          {reduced && (
            <p className="tiny">
              La riproduzione automatica è disattivata per rispettare la tua
              preferenza di movimento ridotto. Puoi scegliere ogni data
              manualmente.
            </p>
          )}
          {!!data.unlocatedCount && (
            <p className="tiny">
              {data.unlocatedCount} fotografie senza posizione restano nel
              diario. Puoi collocarle dalla pagina del ricordo.
            </p>
          )}
        </div>
      </section>
      {!!data.photos.length && !photos.length && (
        <p className="world-no-results paper">
          Nessuna fotografia con posizione fino a questo giorno. Il nostro
          viaggio deve ancora cominciare.
        </p>
      )}
      {!!collections.length && (
        <section
          className="world-places"
          aria-label="Fotografie visibili, accessibili anche senza usare la mappa"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">DA UN PUNTO A UN RICORDO</span>
              <h2>Cartoline dal nostro mondo</h2>
            </div>
            <span className="handwritten">piccoli posti, grandi noi.</span>
          </div>
          <div className="world-postcards">
            {collections.slice(0, postcardLimit).map((group) => (
              <Link
                key={group.key}
                to={"/memories/" + group.photos[0].memoryId}
                className="polaroid"
              >
                <img
                  src={photoUrl(group.photos[0].id)}
                  alt={group.photos[0].title}
                  loading="lazy"
                />
                <span className="handwritten">
                  {group.photos[0].location || group.photos[0].title}
                </span>
                <small>
                  {formatDate(group.photos[0].date)} · {group.photos.length}{" "}
                  foto
                </small>
              </Link>
            ))}
          </div>
          {collections.length > postcardLimit && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setPostcardLimit((value) => value + 12)}
            >
              Sfoglia altre cartoline
            </button>
          )}
        </section>
      )}
      <p className="map-privacy tiny">
        Le foto e le posizioni sono private. La cartografia esterna riceve
        richieste per le aree visualizzate, senza fotografie o richieste di
        geocodifica.
      </p>
    </div>
  );
}
function MapNote() {
  return (
    <span className="map-note-icon" aria-hidden="true">
      <Globe2 size={28} strokeWidth={1} />
      <Heart size={15} />
    </span>
  );
}
