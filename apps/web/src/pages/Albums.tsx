import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Images,
  Plus,
  BookOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { MotionLink as Link, MemoryLink } from "../navigation";
import { api, photoUrl, formatDate } from "../api";
import type { Album, AlbumPhoto, Collection, MemoryList } from "../types";
import {
  PageHeading,
  Loading,
  ErrorState,
  MemoryCard,
  Dialog,
} from "../components";
import { Pagination } from "./Timeline";
import CollectionForm from "../components/CollectionForm";
import CollectionPicker from "../components/CollectionPicker";
export default function Albums() {
  const { category, collectionId } = useParams();
  return collectionId ? (
    <TripDiary key={collectionId} id={collectionId} />
  ) : category ? (
    <CategoryAlbums key={category} category={category} />
  ) : (
    <AlbumIndex />
  );
}
function AlbumIndex() {
  const query = useQuery({
    queryKey: ["albums"],
    queryFn: () => api<Album[]>("/albums"),
  });
  return (
    <div className="page">
      <PageHeading
        eyebrow="PICCOLE COLLEZIONI DI NOI"
        title="I nostri album"
        subtitle="Prima un capitolo. Poi, una storia tutta nostra."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="album-grid">
          {query.data.map((a, i) => (
            <Link
              key={a.category}
              to={"/albums/" + encodeURIComponent(a.category)}
              className={"album-cover album-color-" + i}
            >
              <div className="album-photo polaroid">
                <span className="tape" />
                {a.coverId ? (
                  <img
                    src={photoUrl(a.coverId)}
                    alt={a.category}
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder">
                    <Images size={42} />
                    <span>Una storia da cominciare.</span>
                  </div>
                )}
              </div>
              <div className="album-title">
                <h2>{a.category}</h2>
                <ArrowUpRight size={20} />
              </div>
              <span className="tiny">
                {a.count} FOTOGRAFIE ·{" "}
                {a.category === "Viaggi"
                  ? "I DIARI DEI NOSTRI VIAGGI"
                  : "LE NOSTRE STORIE DA SFOGLIARE"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
function CategoryAlbums({ category }: { category: string }) {
  const [creating, setCreating] = useState(false),
    [page, setPage] = useState(1);
  const albums = useQuery({
    queryKey: ["collections", category],
    queryFn: () =>
      api<Collection[]>(
        "/collections?category=" + encodeURIComponent(category),
      ),
  });
  const unassigned = useQuery({
    queryKey: ["memories", "unassigned", category, page],
    queryFn: () =>
      api<MemoryList>(
        "/memories?category=" +
          encodeURIComponent(category) +
          "&collectionId=unassigned&page=" +
          page,
      ),
  });
  return (
    <div className="page collection-category">
      <Link className="back-link" to="/albums">
        <ArrowLeft size={16} />
        Tutti gli album
      </Link>
      <PageHeading
        eyebrow="OGNI STORIA HA IL SUO DIARIO"
        title={category}
        subtitle={
          category === "Viaggi"
            ? "Una copertina per ogni viaggio. Dentro, soltanto i suoi ricordi."
            : "Piccoli album, ciascuno con la sua storia."
        }
        action={
          <button className="button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            {category === "Viaggi" ? "Nuovo viaggio" : "Nuovo album"}
          </button>
        }
      />
      {albums.isPending ? (
        <Loading />
      ) : albums.error ? (
        <ErrorState error={albums.error} retry={() => void albums.refetch()} />
      ) : albums.data.length ? (
        <div className="album-grid trip-albums">
          {albums.data.map((a, i) => (
            <Link
              key={a.id}
              to={"/albums/" + encodeURIComponent(category) + "/" + a.id}
              className={"album-cover trip-cover album-color-" + i}
            >
              <div className="album-photo polaroid">
                <span className="tape" />
                {a.coverId ? (
                  <img src={photoUrl(a.coverId)} alt={a.name} loading="lazy" />
                ) : (
                  <div className="photo-placeholder">
                    <BookOpen size={44} strokeWidth={1} />
                    <span>Il prossimo capitolo.</span>
                  </div>
                )}
                <span className="trip-book-spine" aria-hidden="true" />
              </div>
              <div className="album-title">
                <h2>{a.name}</h2>
                <ArrowUpRight size={20} />
              </div>
              <p className="tiny">
                {a.memoryCount} ricordi · {a.photoCount} foto
                {a.firstDate && <> · {formatDate(a.firstDate)}</>}
              </p>
              {a.description && <p className="trip-excerpt">{a.description}</p>}
            </Link>
          ))}
        </div>
      ) : (
        <section className="paper collection-empty">
          <BookOpen size={40} strokeWidth={1} />
          <h2>
            {category === "Viaggi"
              ? "Ogni viaggio, un piccolo diario."
              : "Diamo un nome alla prossima storia."}
          </h2>
          <p>
            Crea un album e raccogli al suo interno più ricordi e fotografie.
            Potrai aggiungerne altri in qualsiasi momento.
          </p>
          <button className="button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Crea il primo album
          </button>
        </section>
      )}
      {unassigned.isPending ? (
        <Loading />
      ) : unassigned.error ? (
        <ErrorState
          error={unassigned.error}
          retry={() => void unassigned.refetch()}
        />
      ) : (
        unassigned.data.total > 0 && (
          <section className="unassigned-memories">
            <div className="section-heading">
              <div>
                <span className="eyebrow">LE PAGINE GIÀ SCRITTE</span>
                <h2>Ricordi da organizzare</h2>
              </div>
              <span className="tiny">{unassigned.data.total} ricordi</span>
            </div>
            <p className="muted">
              Apri un ricordo e scegli il suo album da Modifica. Le fotografie
              rimarranno insieme al loro racconto.
            </p>
            <div className="memory-grid">
              {unassigned.data.items.map((m) => (
                <MemoryCard key={m.id} memory={m} />
              ))}
            </div>
            <Pagination
              page={page}
              total={unassigned.data.total}
              size={20}
              onChange={setPage}
            />
          </section>
        )
      )}
      {creating && (
        <CollectionForm
          category={category}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
function TripDiary({ id }: { id: string }) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") === "photos" ? "photos" : "diary",
    page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["collection", id, tab === "photos" ? page : 1],
    queryFn: () =>
      api<{ collection: Collection; items: AlbumPhoto[]; total: number }>(
        "/collections/" + id + "?page=" + (tab === "photos" ? page : 1),
      ),
  });
  const memories = useQuery({
    queryKey: ["memories", "collection", id, page],
    queryFn: () =>
      api<MemoryList>(
        "/memories?collectionId=" + id + "&order=asc&page=" + page,
      ),
    enabled: tab === "diary",
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const { collection: a, items, total } = query.data,
    base = "/albums/" + encodeURIComponent(a.category),
    newMemory =
      "/memories/new?album=" +
      id +
      "&category=" +
      encodeURIComponent(a.category);
  const pageChange = (value: number) =>
    setParams({ view: tab, page: String(value) });
  return (
    <div className="page trip-diary">
      <Link className="back-link" to={base}>
        <ArrowLeft size={16} />
        {a.category}: tutti gli album
      </Link>
      <header className="trip-heading paper">
        <div>
          <span className="eyebrow">
            IL DIARIO DEL NOSTRO {a.category === "Viaggi" ? "VIAGGIO" : "ALBUM"}
          </span>
          <h1>{a.name}</h1>
          {a.firstDate && (
            <p className="trip-dates">
              {formatDate(a.firstDate)}
              {a.lastDate !== a.firstDate && <> — {formatDate(a.lastDate!)}</>}
            </p>
          )}
          {a.description && <p className="handwritten">{a.description}</p>}
          <p className="tiny">
            {a.memoryCount} ricordi · {a.photoCount} fotografie
          </p>
        </div>
        <div className="trip-tools">
          <Link className="button" to={newMemory}>
            <Plus size={17} />
            Aggiungi un ricordo
          </Link>
          <button className="button secondary" onClick={() => setPicking(true)}>
            <BookOpen size={17} />
            Aggiungi ricordi esistenti
          </button>
          <button
            className="icon-button"
            aria-label="Modifica album"
            onClick={() => setEditing(true)}
          >
            <Pencil size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Elimina album"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>
      <nav className="collection-tabs" aria-label="Contenuti dell’album">
        <button
          className={tab === "diary" ? "active" : ""}
          aria-pressed={tab === "diary"}
          onClick={() => setParams({})}
        >
          <BookOpen size={17} />
          Il diario <span>{a.memoryCount}</span>
        </button>
        <button
          className={tab === "photos" ? "active" : ""}
          aria-pressed={tab === "photos"}
          onClick={() => setParams({ view: "photos" })}
        >
          <Images size={17} />
          Le fotografie <span>{a.photoCount}</span>
        </button>
      </nav>
      {tab === "diary" ? (
        memories.isPending ? (
          <Loading />
        ) : memories.error ? (
          <ErrorState
            error={memories.error}
            retry={() => void memories.refetch()}
          />
        ) : memories.data.items.length ? (
          <>
            <div className="memory-grid trip-memory-grid">
              {memories.data.items.map((m) => (
                <MemoryCard key={m.id} memory={m} />
              ))}
            </div>
            <Pagination
              page={page}
              total={memories.data.total}
              size={20}
              onChange={pageChange}
            />
          </>
        ) : (
          <CollectionEmpty to={newMemory} />
        )
      ) : items.length ? (
        <>
          <div className="album-photos">
            {items.map((p) => (
              <MemoryLink
                memoryId={p.memoryId}
                photoId={p.id}
                key={p.id}
                className="polaroid"
              >
                <img src={photoUrl(p.id)} alt={p.title} loading="lazy" />
                <span className="handwritten">{p.title}</span>
                <small>
                  {formatDate(p.eventDate)}
                  <ArrowUpRight size={15} />
                </small>
              </MemoryLink>
            ))}
          </div>
          <Pagination
            page={page}
            total={total}
            size={40}
            onChange={pageChange}
          />
        </>
      ) : (
        <CollectionEmpty to={newMemory} />
      )}
      {editing && (
        <CollectionForm
          category={a.category}
          initial={a}
          onClose={() => setEditing(false)}
        />
      )}
      {picking && (
        <CollectionPicker album={a} onClose={() => setPicking(false)} />
      )}
      {deleting && (
        <Dialog
          title="Togliere questa copertina?"
          onClose={() => setDeleting(false)}
        >
          <p>
            I ricordi e le fotografie rimarranno nel diario, tra i ricordi da
            organizzare. Verrà eliminato soltanto l’album “{a.name}”.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Annulla
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/collections/" + id, {
                    method: "DELETE",
                    body: JSON.stringify({ version: a.version }),
                  });
                  await client.invalidateQueries();
                  navigate(base);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Elimina solo l’album
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function CollectionEmpty({ to }: { to: string }) {
  return (
    <section className="paper collection-empty">
      <BookOpen size={40} strokeWidth={1} />
      <h2>Le prime pagine ci aspettano.</h2>
      <p>
        Aggiungi un ricordo a questo album oppure assegna un ricordo esistente
        da Modifica.
      </p>
      <Link className="button" to={to}>
        <Plus size={17} />
        Aggiungi un ricordo
      </Link>
    </section>
  );
}
