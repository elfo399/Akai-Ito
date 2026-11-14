import { useEffect, useState, useRef } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  categories,
  memoryInput,
  romeToday,
  type MemoryInput,
} from "@akai/shared";
import {
  ImagePlus,
  Star,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Save,
  LoaderCircle,
} from "lucide-react";
import { api, ApiError, photoUrl } from "../api";
import type { Memory, Settings, Collection } from "../types";
import CollectionForm from "../components/CollectionForm";
import { PageHeading, Loading, ErrorState, Dialog } from "../components";
type Selected = { key: string; url: string; file?: File };
export default function Editor() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["memory", id],
    queryFn: () => api<Memory>("/memories/" + id),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (id && query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <EditorForm
      key={(id ?? "new") + ":" + (query.data?.version ?? 0)}
      initial={query.data}
    />
  );
}
function EditorForm({ initial }: { initial?: Memory }) {
  const [search] = useSearchParams();
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const collectionQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<Collection[]>("/collections"),
  });
  const config = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const limits = config.data?.uploadLimits ?? { maxFiles: 20, maxImageMB: 15 };
  const navigate = useNavigate(),
    client = useQueryClient();
  const [photos, setPhotos] = useState<Selected[]>(
      initial?.photos.map((p) => ({ key: p.id, url: photoUrl(p.id) })) ?? [],
    ),
    [cover, setCover] = useState<string | null>(
      initial?.photos.find((p) => p.isCover)?.id ?? null,
    ),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<MemoryInput>({
    resolver: zodResolver(memoryInput),
    defaultValues: initial ?? {
      title: "",
      eventDate: romeToday(),
      description: "",
      category:
        categories.find((value) => value === search.get("category")) ??
        "Momenti speciali",
      location: "",
      collectionId: search.get("album") || null,
    },
  });
  const category = watch("category"),
    previousCategory = useRef(category);
  useEffect(() => {
    if (previousCategory.current !== category) {
      setValue("collectionId", null, { shouldDirty: true });
      previousCategory.current = category;
    }
  }, [category, setValue]);
  const photoDirty = useRef(false);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!saved && (isDirty || photoDirty.current)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty, saved]);
  useEffect(() => {
    const guardLink = (event: MouseEvent) => {
      if (
        saved ||
        !(isDirty || photoDirty.current) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", guardLink, true);
    return () => document.removeEventListener("click", guardLink, true);
  }, [isDirty, saved]);
  const choose = (files: FileList | null) => {
    if (!files) return;
    setError("");
    const fresh: Selected[] = [];
    for (const file of Array.from(files)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > limits.maxImageMB * 1024 * 1024
      ) {
        setError(
          `Scegli foto JPEG, PNG o WebP, fino a ${limits.maxImageMB} MB ciascuna.`,
        );
        continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      fresh.push({ key: crypto.randomUUID(), url, file });
    }
    if (photos.filter((p) => p.file).length + fresh.length > limits.maxFiles) {
      setError(
        `Puoi caricare al massimo ${limits.maxFiles} nuove foto alla volta.`,
      );
      fresh.forEach((p) => URL.revokeObjectURL(p.url));
      return;
    }
    photoDirty.current = true;
    setPhotos((p) => [...p, ...fresh]);
    if (!cover && fresh.length) setCover(fresh[0].key);
  };
  const move = (i: number, delta: number) => {
    photoDirty.current = true;
    setPhotos((p) => {
      const a = [...p];
      [a[i], a[i + delta]] = [a[i + delta], a[i]];
      return a;
    });
  };
  return (
    <div className="page editor-page">
      <Link
        className="back-link"
        to={initial ? "/memories/" + initial.id : "/timeline"}
      >
        <ArrowLeft size={16} />
        Torna al diario
      </Link>
      <PageHeading
        eyebrow={
          initial ? "RITOCCARE UN RICORDO" : "UN ALTRO NODO NEL NOSTRO FILO"
        }
        title={
          initial
            ? "Riapriamo questa pagina"
            : "Una nuova pagina della nostra storia"
        }
        subtitle="Le piccole cose meritano di essere ricordate."
      />
      <form
        className="editor-layout"
        aria-busy={isSubmitting}
        onSubmit={handleSubmit(async (memory) => {
          setError("");
          const form = new FormData();
          let n = 0;
          const keys = photos.map((p) => (p.file ? "new:" + n++ : p.key));
          form.append(
            "payload",
            JSON.stringify({
              memory,
              version: initial?.version,
              photos: keys,
              cover: cover
                ? (keys[photos.findIndex((p) => p.key === cover)] ?? null)
                : null,
            }),
          );
          photos.forEach((p) => {
            if (p.file) form.append("photos", p.file);
          });
          try {
            const result = await api<Memory>(
              initial ? "/memories/" + initial.id : "/memories",
              { method: initial ? "PUT" : "POST", body: form },
            );
            setSaved(true);
            await client.invalidateQueries();
            navigate("/memories/" + result.id, {
              state: {
                notice: "Il ricordo è al sicuro, tra le nostre pagine.",
              },
            });
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) setConflict(true);
            else setError((e as Error).message);
          }
        })}
      >
        <fieldset className="paper form-paper" disabled={isSubmitting}>
          <legend className="sr-only">Le parole del ricordo</legend>
          <span className="corner-label handwritten">le parole</span>
          <label>
            Un titolo per questo momento *
            <input
              autoFocus
              maxLength={160}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : undefined}
              placeholder="Come chiameremo questo ricordo?"
              {...register("title")}
            />
            {errors.title && (
              <span className="field-error" id="title-error" role="alert">
                Il titolo è obbligatorio (massimo 160 caratteri).
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              Quando è successo? *
              <input
                type="date"
                aria-invalid={!!errors.eventDate}
                aria-describedby={errors.eventDate ? "date-error" : undefined}
                {...register("eventDate")}
              />
              {errors.eventDate && (
                <span className="field-error" id="date-error" role="alert">
                  Scegli una data valida.
                </span>
              )}
            </label>
            <label>
              Il nostro capitolo
              <select {...register("category")}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Album {category === "Viaggi" ? "del viaggio" : "di questo ricordo"}
            <select
              {...register("collectionId", {
                setValueAs: (value) => value || null,
              })}
              value={watch("collectionId") ?? ""}
              disabled={collectionQuery.isPending || !!collectionQuery.error}
            >
              <option value="">Da organizzare — nessun album</option>
              {collectionQuery.data
                ?.filter((a) => a.category === category)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {collectionQuery.error ? (
            <p className="error" role="alert">
              Gli album non sono disponibili.{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => void collectionQuery.refetch()}
              >
                Riprova
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="text-link"
              onClick={() => setCreatingAlbum(true)}
            >
              + Crea un nuovo album in {category}
            </button>
          )}
          <label>
            Dove eravamo?
            <input
              maxLength={200}
              placeholder="Un posto da ricordare (facoltativo)"
              {...register("location")}
            />
          </label>
          <label>
            Raccontiamolo
            <textarea
              rows={9}
              maxLength={12000}
              placeholder="Cosa è successo, cosa abbiamo provato… anche un piccolo dettaglio, per non dimenticarlo."
              {...register("description")}
            />
          </label>
        </fieldset>
        <fieldset
          className="paper form-paper photo-editor"
          disabled={isSubmitting}
        >
          <legend className="sr-only">Le fotografie del ricordo</legend>
          <span className="corner-label handwritten">le fotografie</span>
          <h2>Frammenti di quel giorno</h2>
          <p>
            La stella sceglie la copertina. Le frecce riordinano i nostri
            momenti.
          </p>
          <label
            className={"upload-zone " + (dragging ? "is-dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!isSubmitting) choose(e.dataTransfer.files);
            }}
          >
            <ImagePlus size={32} strokeWidth={1} />
            <strong>Scegli o trascina qui le fotografie</strong>
            <span>
              JPEG, PNG o WebP · fino a {limits.maxFiles} foto,{" "}
              {limits.maxImageMB} MB ciascuna
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                choose(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <p className="photo-count" role="status">
            {photos.length
              ? `${photos.length} fotografie da custodire`
              : "Anche una sola fotografia può raccontare tutto."}
          </p>
          <div className="upload-previews">
            {photos.map((p, i) => (
              <div
                className={
                  "upload-preview " + (cover === p.key ? "selected-cover" : "")
                }
                key={p.key}
              >
                <img
                  src={p.url}
                  alt={"Fotografia " + (i + 1)}
                  className={p.file ? "photo-fresh" : undefined}
                />
                <div className="preview-caption">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {cover === p.key && (
                    <span>
                      <Star size={12} aria-hidden="true" /> Copertina
                    </span>
                  )}
                </div>
                <div className="photo-actions">
                  <button
                    type="button"
                    aria-label={"Usa foto " + (i + 1) + " come copertina"}
                    aria-pressed={cover === p.key}
                    onClick={() => {
                      photoDirty.current = true;
                      setCover(p.key);
                    }}
                  >
                    <Star
                      size={16}
                      fill={cover === p.key ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label={`Sposta foto ${i + 1} prima`}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={i === photos.length - 1}
                    aria-label={`Sposta foto ${i + 1} dopo`}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Rimuovi foto ${i + 1}`}
                    onClick={() => {
                      photoDirty.current = true;
                      setPhotos(photos.filter((v) => v.key !== p.key));
                      if (cover === p.key)
                        setCover(
                          photos.find((v) => v.key !== p.key)?.key ?? null,
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="editor-footer">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span className="tiny">
            * Campi obbligatori · Questo ricordo sarà di entrambi.
          </span>
          <span className="save-status" role="status">
            {isSubmitting
              ? "Salvataggio e caricamento delle foto in corso…"
              : isDirty || photoDirty.current
                ? "Modifiche non salvate"
                : "Una pagina tutta da scrivere"}
          </span>
          <button className="button" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Save size={17} />
            )}
            {isSubmitting
              ? "Custodisco il ricordo…"
              : "Salva il nostro ricordo"}
          </button>
        </div>
      </form>
      {creatingAlbum && (
        <CollectionForm
          category={category}
          onClose={() => setCreatingAlbum(false)}
          onSaved={(id) => setValue("collectionId", id, { shouldDirty: true })}
        />
      )}
      {leaving && (
        <Dialog
          title="Lasciamo questa pagina?"
          onClose={() => setLeaving(null)}
        >
          <p>
            Ci sono modifiche non salvate. Se esci, le parole e le fotografie
            aggiunte in questa pagina andranno perse.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setLeaving(null)}
            >
              Continua a scrivere
            </button>
            <button
              className="button"
              onClick={() => {
                setSaved(true);
                navigate(leaving);
              }}
            >
              Esci senza salvare
            </button>
          </div>
        </Dialog>
      )}
      {conflict && (
        <Dialog
          title="Questa pagina è cambiata"
          onClose={() => setConflict(false)}
        >
          <p>
            L’altra persona ha aggiornato il ricordo mentre lo modificavi. Il
            tuo salvataggio non ha sovrascritto le sue modifiche. Ricaricando
            perderai le modifiche locali.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setConflict(false)}
            >
              Torna alle mie modifiche
            </button>
            <button
              className="button"
              onClick={() => {
                setConflict(false);
                void client.invalidateQueries({
                  queryKey: ["memory", initial?.id],
                });
              }}
            >
              Ricarica versione aggiornata
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
