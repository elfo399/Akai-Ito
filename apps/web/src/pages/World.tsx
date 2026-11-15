import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Globe2,
  Heart,
  Pause,
  Play,
  RotateCcw,
  CalendarDays,
  ArrowUpRight,
  MapPinned,
  X,
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
import MapJourney, { useMapJourney } from "../components/MapJourney";
import "../diary-map.css";
import FloatingActions from "../components/FloatingActions";
import "../world-actions.css";

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
  const [search] = useSearchParams();
  const stage = useRef<HTMLDivElement>(null);
  const today = romeToday(),
    last = civilDayNumber(today);
  const first = Math.min(last, civilDayNumber(data.firstDate ?? today));
  const [day, setDay] = useState(last);
  const [postcardLimit, setPostcardLimit] = useState(12);
  const reduced = useReducedMotion();
  const journey = useMapJourney(data.photos, (date) =>
    setDay(civilDayNumber(date)),
  );
  const playing = journey.playing;
  const focused = data.photos.find((photo) => photo.id === search.get("photo"));
  const selected = Math.max(first, Math.min(last, day)),
    date = dateFromDayNumber(selected);
  const photos = useMemo(
    () => visibleWorldPhotos(data.photos, date),
    [data.photos, date],
  );
  const places = useMemo(() => new Set(photos.map(placeKey)).size, [photos]);
  const collections = useMemo(() => groupWorldPhotos(photos, 19), [photos]);
  useEffect(() => {
    if (focused) setDay(Math.min(last, civilDayNumber(focused.date)));
  }, [focused?.id]);
  const choose = (value: number) => {
    journey.dismiss();
    setDay(Math.min(last, Math.max(first, value)));
  };
  const startJourney = () => {
    journey.start();
    requestAnimationFrame(() => {
      stage.current?.scrollIntoView({ block: "start", behavior: "instant" });
      stage.current
        ?.querySelector<HTMLElement>(".journey-panel")
        ?.focus({ preventScroll: true });
    });
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
          <div>
            <span className="eyebrow">
              <MapPinned size={14} aria-hidden="true" /> COORDINATE DA CUSTODIRE
            </span>
            <h2>L’atlante dei nostri ricordi</h2>
            <p className="handwritten">I posti in cui siamo stati noi.</p>
          </div>
          <span className="atlas-stamp" aria-hidden="true">
            <Globe2 size={24} strokeWidth={1} />
            <span>IL NOSTRO MONDO</span>
            <Heart size={12} strokeWidth={1.2} />
          </span>
        </div>
        <div className="world-map-stage" ref={stage}>
          <div className="world-atlas-map">
            <GeoMap
              config={data.config}
              photos={photos}
              focus={
                journey.photo ??
                photos.find((photo) => photo.id === focused?.id)
              }
              visited={journey.visited}
              traveling={journey.open ? playing : undefined}
              onInteract={journey.open ? journey.pause : undefined}
              showScale
            />
            <span className="atlas-compass" aria-hidden="true">
              <svg viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="30" />
                <circle cx="50" cy="50" r="33" strokeDasharray="1 5" />
                <path d="M50 18L57 43L82 50L57 57L50 82L43 57L18 50L43 43Z" />
                <path className="compass-north" d="M50 18L50 50L43 43Z" />
                <path className="compass-south" d="M50 50L50 82L57 57Z" />
                <circle cx="50" cy="50" r="3" />
                <text x="50" y="11" textAnchor="middle">
                  N
                </text>
                <text x="50" y="98" textAnchor="middle">
                  S
                </text>
                <text x="94" y="54" textAnchor="middle">
                  E
                </text>
                <text x="6" y="54" textAnchor="middle">
                  O
                </text>
              </svg>
            </span>
          </div>
          {journey.open && journey.stops[journey.index] && (
            <MapJourney
              stop={journey.stops[journey.index]}
              index={journey.index}
              total={journey.stops.length}
              playing={playing}
              next={journey.next}
              restart={journey.restart}
              toggle={journey.toggle}
              close={journey.close}
            />
          )}
        </div>
        <div className="atlas-caption">
          <span className="handwritten">Il mondo è più bello, con te.</span>
          <span>
            <Heart size={12} aria-hidden="true" /> Ogni segno, un ricordo da
            ritrovare.
          </span>
        </div>
        {search.has("photo") && !focused && (
          <p className="tiny">
            Questa fotografia non ha una posizione disponibile nella mappa.
          </p>
        )}
        {!data.photos.length && (
          <div className="world-empty">
            <MapNote />
            {data.unlocatedCount ? (
              <>
                <h2>Le nostre foto cercano un posto.</h2>
                <p>
                  Apri un ricordo e scegli “Imposta posizione” dal menu Azioni.
                  Anche gli scatti senza GPS possono trovare il loro punto nel
                  mondo.
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
              Movimento automatico disattivato. Puoi scegliere le date e le
              tappe manualmente.
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

      <FloatingActions
        label="Azioni della mappa"
        title="Il mondo, un giorno alla volta"
        eyebrow="IL NOSTRO ATLANTE"
        triggerRef={journey.launcher}
        panelClassName="world-actions-panel"
        status={
          journey.open
            ? `Tappa ${journey.index + 1} di ${journey.stops.length}`
            : undefined
        }
        icon={journey.open ? <MapPinned size={18} /> : undefined}
      >
        {(close) => (
          <>
            <button
              className="memory-floating-action"
              type="button"
              disabled={!journey.stops.length}
              onClick={() => {
                close();
                if (!journey.open) startJourney();
                else if (reduced) journey.close();
                else journey.toggle();
              }}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
              {playing
                ? "Pausa"
                : journey.open
                  ? reduced
                    ? "Esci dal viaggio"
                    : "Riprendi la storia"
                  : "Rivivi la nostra storia"}
            </button>
            <button
              className="memory-floating-action"
              type="button"
              disabled={!journey.stops.length}
              onClick={() => {
                close();
                if (!journey.open) startJourney();
                else journey.restart();
              }}
            >
              <RotateCcw size={17} />
              Riavvia dall’inizio
            </button>
            {journey.open && !reduced && (
              <button
                className="memory-floating-action"
                type="button"
                onClick={() => {
                  close();
                  journey.close();
                }}
              >
                <X size={17} />
                Esci dal viaggio
              </button>
            )}
            <button
              className="memory-floating-action"
              type="button"
              onClick={() => {
                close();
                choose(last);
              }}
            >
              <CalendarDays size={17} />
              Torna a oggi
            </button>
            <div className="world-action-dates">
              <label htmlFor="world-date-range">
                Il nostro filo, fino a qui
              </label>
              <time dateTime={date}>{formatDate(date)}</time>
              <input
                id="world-date-range"
                className="time-thread"
                type="range"
                min={first}
                max={last}
                step="1"
                value={selected}
                disabled={first === last}
                aria-label="Mostra fotografie scattate fino alla data selezionata, inclusa"
                aria-valuetext={formatDate(date)}
                onChange={(e) => choose(Number(e.target.value))}
              />
              <div className="time-endpoints">
                <span>{formatDate(dateFromDayNumber(first))}</span>
                <span>Oggi</span>
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
              {reduced && (
                <p className="tiny">
                  Movimento automatico disattivato. Visita le tappe manualmente.
                </p>
              )}
            </div>
          </>
        )}
      </FloatingActions>
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
