import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, Camera } from "lucide-react";
import { daysTogether } from "@akai/shared";
import { api, formatDate, photoUrl } from "../api";
import type { Settings, MemoryList } from "../types";
import {
  Loading,
  ErrorState,
  Thread,
  AddMemory,
  MemoryCard,
  Empty,
} from "../components";
import { PaperCard, WashiTape } from "../scrapbook";
import { usePaperDepth } from "../motion";
export default function Home() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const memories = useQuery({
    queryKey: ["memories", "recent"],
    queryFn: () => api<MemoryList>("/memories?order=recent"),
  });
  const depth = usePaperDepth(
    Boolean(
      settings.data && memories.data && !settings.error && !memories.error,
    ),
  );
  if (settings.isPending || memories.isPending) return <Loading />;
  if (settings.error || memories.error)
    return (
      <ErrorState
        error={(settings.error ?? memories.error)!}
        retry={() => {
          void settings.refetch();
          void memories.refetch();
        }}
      />
    );
  const s = settings.data!.settings;
  const names =
    s.coupleNames || settings.data!.users.map((u) => u.name).join(" & ");
  return (
    <div className="home">
      <div className="diary-label">
        <span>UN DIARIO DA SCRIVERE IN DUE</span>
        <span>RICORDI, NON COSE.</span>
      </div>
      <section className="cover-section paper-depth" ref={depth}>
        <PaperCard className="cover-copy">
          <WashiTape />
          <span className="eyebrow">
            <span className="little-line" /> LA NOSTRA STORIA, UNA PAGINA ALLA
            VOLTA
          </span>
          <h1>
            Il nostro
            <br />
            <em>filo rosso.</em>
          </h1>
          <p className="cover-names">{names}</p>
          <p className="cover-description">
            I grandi viaggi e le piccole cose.
            <br />
            Tutti i momenti che ci fanno dire: noi.
          </p>
          {s.startDate ? (
            <div className="together">
              <Heart size={20} strokeWidth={1.3} />
              <div>
                <strong>
                  <b>{daysTogether(s.startDate).toLocaleString("it-IT")}</b>{" "}
                  giorni insieme
                </strong>
                <span>
                  Il nostro filo si è intrecciato il {formatDate(s.startDate)}
                </span>
              </div>
            </div>
          ) : (
            <Link className="together setup-link" to="/settings">
              <Heart size={20} />
              <span>
                Da quando è cominciata la nostra storia?
                <small>Imposta la nostra data</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          )}
          <AddMemory />
          <span className="letter-signature handwritten">
            Con te, un giorno alla volta.
          </span>
        </PaperCard>
        <div className="cover-art">
          <span className="vertical-note">momenti da tenere stretti</span>
          <div className="cover-polaroid polaroid">
            <WashiTape rose />
            {s.cover ? (
              <img
                src={photoUrl(s.cover, "display")}
                alt="La nostra fotografia di copertina"
              />
            ) : (
              <Link className="cover-placeholder" to="/settings">
                <Camera size={48} strokeWidth={1} />
                <span>La nostra foto preferita</span>
                <small>Scegli la copertina in Impostazioni</small>
              </Link>
            )}
            <p className="handwritten">
              Il mio posto preferito è con te.
              <Heart size={19} strokeWidth={1.3} />
            </p>
          </div>
          <div className="postage">
            赤い糸<small>DESTINATI A TROVARCI</small>
          </div>
          <Thread />
          <span className="art-caption handwritten">
            noi, in ogni universo.
          </span>
        </div>
      </section>
      <nav className="diary-index" aria-label="Sfoglia il diario">
        <a href="#recent">
          <span>01</span> Le ultime pagine <ArrowRight size={17} />
        </a>
        <Link to="/timeline">
          <span>02</span> Il filo dei ricordi <ArrowRight size={17} />
        </Link>
        <Link to="/albums">
          <span>03</span> Le nostre fotografie <ArrowRight size={17} />
        </Link>
      </nav>
      <div className="section-divider">
        <span /> <Heart size={14} strokeWidth={1} /> <span />
      </div>
      <section className="recent-section" id="recent">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DA CONSERVARE, DA RIVIVERE</span>
            <h2>Le ultime pagine del diario</h2>
          </div>
          <Link to="/timeline" className="text-link">
            Tutti i nostri ricordi
            <ArrowRight size={16} />
          </Link>
        </div>
        {memories.data!.items.length ? (
          <div className="memory-grid">
            {memories.data!.items.slice(0, 3).map((m) => (
              <MemoryCard key={m.id} memory={m} />
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </section>
      <div className="home-quote">
        <span className="eyebrow">LA LEGGENDA DEL FILO ROSSO</span>
        <p>
          Il filo può allungarsi, aggrovigliarsi,
          <br />
          ma non si spezzerà mai.
        </p>
        <Thread />
      </div>
    </div>
  );
}
