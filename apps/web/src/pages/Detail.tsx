import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Trash2,
  X,
  Send,
  Heart,
  Download,
  Images,
} from "lucide-react";
import { api, formatDate, formatTime, photoUrl } from "../api";
import type { Memory, Comment, Photo } from "../types";
import { useAuth } from "../auth";
import { Loading, ErrorState, Avatar, Dialog, Thread } from "../components";
const PhotoPositionDialog = lazy(
  () => import("../components/PhotoPositionDialog"),
);
export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["memory", id],
    queryFn: () => api<Memory>("/memories/" + id),
  });
  const [lightbox, setLightbox] = useState<number | null>(null),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [positionPhoto, setPositionPhoto] = useState<Photo | null>(null);
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const m = query.data;
  return (
    <article className="page detail-page">
      <Link to="/timeline" className="back-link">
        <ArrowLeft size={16} />
        Tra i nostri ricordi
      </Link>
      {location.state?.notice && (
        <p className="success" role="status">
          {location.state.notice}
        </p>
      )}
      <div className="detail-header">
        <span className="eyebrow">
          {m.category} <span>·</span>{" "}
          <time className="date-stamp" dateTime={m.eventDate}>
            {formatDate(m.eventDate)}
          </time>
        </span>
        <h1>{m.title}</h1>
        <div className="detail-byline">
          <span>Una pagina di {m.author}</span>
          {m.location && (
            <span>
              <MapPin size={15} />
              {m.location}
            </span>
          )}
        </div>
        <div className="detail-tools">
          <Link className="button secondary" to={`/memories/${m.id}/edit`}>
            <Pencil size={16} />
            Modifica
          </Link>
          <button
            className="icon-button"
            aria-label="Sposta nel cestino"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <section className="diary-page paper">
        <Thread />
        <span className="eyebrow story-label">DA QUESTO GIORNO, CON AMORE</span>
        <p className="memory-description">
          {m.description || "A volte bastano le immagini, per ricordare tutto."}
        </p>
        {m.photos.length ? (
          <div className="detail-gallery">
            {m.photos.map((p, i) => (
              <div className="gallery-item" key={p.id}>
                <button
                  className="polaroid gallery-photo"
                  key={p.id}
                  onClick={() => setLightbox(i)}
                  aria-label={"Apri fotografia " + (i + 1)}
                >
                  <img
                    src={photoUrl(p.id, i === 0 ? "display" : "thumb")}
                    alt={`${m.title} — fotografia ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                  <span className="handwritten">
                    {i === 0 ? "Un pezzetto di noi." : formatDate(m.eventDate)}
                  </span>
                </button>
                <div className="photo-location-actions">
                  <small>
                    {p.locationSource === "exif"
                      ? "Posizione EXIF"
                      : p.locationSource === "manual"
                        ? p.latitude === null
                          ? "Posizione rimossa"
                          : "Posizione manuale"
                        : "Senza posizione"}
                  </small>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setPositionPhoto(p)}
                    aria-label={
                      (p.latitude === null ? "Imposta" : "Modifica") +
                      " posizione foto " +
                      (i + 1)
                    }
                  >
                    <MapPin size={14} />
                    {p.latitude === null
                      ? "Imposta posizione"
                      : "Modifica posizione"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-photos">
            <Images size={32} strokeWidth={1} />
            <p>
              Un ricordo fatto di parole. Puoi aggiungere le foto quando vuoi.
            </p>
          </div>
        )}
        <p className="modified tiny">
          Ultima modifica: {formatTime(m.updatedAt)}
        </p>
      </section>
      <Comments memoryId={m.id} />
      {positionPhoto && (
        <Suspense fallback={<Loading />}>
          <PhotoPositionDialog
            photo={positionPhoto}
            memory={m}
            onClose={() => setPositionPhoto(null)}
          />
        </Suspense>
      )}
      {lightbox !== null && (
        <Lightbox
          photos={m.photos}
          initial={lightbox}
          title={m.title}
          onClose={() => setLightbox(null)}
        />
      )}{" "}
      {deleting && (
        <Dialog
          title="Mettiamo via questo ricordo?"
          onClose={() => setDeleting(false)}
        >
          <p>
            Resterà nel cestino, recuperabile per 30 giorni prima della pulizia
            di manutenzione.
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
              Teniamolo qui
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/memories/" + m.id, {
                    method: "DELETE",
                    body: JSON.stringify({ version: m.version }),
                  });
                  await client.invalidateQueries();
                  navigate("/timeline");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sposta nel cestino
            </button>
          </div>
        </Dialog>
      )}
    </article>
  );
}
function Lightbox({
  photos,
  initial,
  title,
  onClose,
}: {
  photos: Photo[];
  initial: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const touch = useRef<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const next = (delta: number) =>
    setIndex((i) => (i + delta + photos.length) % photos.length);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = before;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="lightbox"
      aria-label={"Galleria: " + title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          next(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          next(1);
        }
      }}
    >
      <div className="lightbox-toolbar">
        <span aria-live="polite" aria-atomic="true">
          {index + 1} / {photos.length}
        </span>
        <p className="lightbox-title">{title}</p>
        <a
          href={photoUrl(photos[index].id, "original")}
          className="icon-button"
          aria-label="Scarica originale"
        >
          <Download />
        </a>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Chiudi galleria"
          autoFocus
        >
          <X />
        </button>
      </div>
      <div
        className="lightbox-view"
        onTouchStart={(e) => {
          touch.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touch.current !== null) {
            const delta = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(delta) > 45) next(delta > 0 ? -1 : 1);
          }
          touch.current = null;
        }}
      >
        <button
          className="icon-button"
          onClick={() => next(-1)}
          aria-label="Foto precedente"
          disabled={photos.length < 2}
        >
          <ChevronLeft />
        </button>
        <img
          key={photos[index].id}
          src={photoUrl(photos[index].id, "display")}
          alt={`${title}, fotografia ${index + 1}`}
        />
        <button
          className="icon-button"
          onClick={() => next(1)}
          aria-label="Foto successiva"
          disabled={photos.length < 2}
        >
          <ChevronRight />
        </button>
      </div>
    </dialog>
  );
}
function Comments({ memoryId }: { memoryId: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["comments", memoryId],
    queryFn: () => api<Comment[]>("/memories/" + memoryId + "/comments"),
  });
  const [body, setBody] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [editBody, setEditBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const mutate = async (url: string, method: string, data?: object) => {
    setBusy(true);
    setError("");
    try {
      await api(url, { method, body: data ? JSON.stringify(data) : undefined });
      await client.invalidateQueries({ queryKey: ["comments", memoryId] });
      await client.invalidateQueries({ queryKey: ["memories"] });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="comments-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LE PAROLE CHE RESTANO</span>
          <h2>
            I nostri pensieri <Heart size={22} strokeWidth={1} />
          </h2>
        </div>
        <span className="handwritten">a margine di questo giorno</span>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="comment-list">
          {!query.data.length && (
            <p className="muted">
              C’è spazio per il primo pensiero, anche una sola parola.
            </p>
          )}
          {query.data.map((c) => (
            <div
              className={
                "comment paper " +
                (c.authorId === user!.id ? "comment-own" : "comment-partner")
              }
              key={c.id}
            >
              <Avatar id={c.authorId} name={c.author} avatar={c.avatar} />
              <div className="comment-content">
                <div className="comment-author">
                  <strong>
                    {c.author}
                    <small>
                      {c.authorId === user!.id
                        ? "Il tuo biglietto"
                        : "Un biglietto per te"}
                    </small>
                  </strong>
                  <time dateTime={c.createdAt}>
                    {formatTime(c.createdAt)}
                    {c.updatedAt !== c.createdAt ? " · modificato" : ""}
                  </time>
                </div>
                {editing === c.id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await mutate("/comments/" + c.id, "PUT", {
                          body: editBody,
                        })
                      )
                        setEditing(null);
                    }}
                  >
                    <label className="sr-only" htmlFor="edit-comment">
                      Modifica pensiero
                    </label>
                    <textarea
                      id="edit-comment"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      required
                      maxLength={3000}
                    />
                    <div className="comment-actions">
                      <button className="text-link" disabled={busy}>
                        Salva
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setEditing(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  </form>
                ) : (
                  <p>{c.body}</p>
                )}
                {c.authorId === user!.id && editing !== c.id && (
                  <div className="comment-actions">
                    <button
                      className="text-link"
                      onClick={() => {
                        setEditing(c.id);
                        setEditBody(c.body);
                      }}
                    >
                      <Pencil size={13} />
                      Modifica
                    </button>
                    <button
                      className="text-link"
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 size={13} />
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        className="comment-form paper"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate("/memories/" + memoryId + "/comments", "POST", {
              body,
            })
          )
            setBody("");
        }}
      >
        <Avatar id={user!.id} name={user!.name} avatar={user!.avatar} />
        <label>
          <span className="sr-only">Il tuo pensiero</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={3000}
            rows={3}
            placeholder="Che cosa ti fa tornare in mente?"
          />
        </label>
        <button className="button" disabled={busy || !body.trim()}>
          <Send size={16} />
          Lascia un pensiero
        </button>
      </form>
      {deleteId && (
        <Dialog
          title="Eliminare questo pensiero?"
          onClose={() => setDeleteId(null)}
        >
          <p>Questa operazione è definitiva.</p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteId(null)}
            >
              Annulla
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (await mutate("/comments/" + deleteId, "DELETE"))
                  setDeleteId(null);
              }}
            >
              Elimina pensiero
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
