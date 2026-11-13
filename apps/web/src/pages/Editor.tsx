import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
} from "lucide-react";
import { api, ApiError, photoUrl } from "../api";
import type { Memory, Settings } from "../types";
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
  const urls = useRef<string[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<MemoryInput>({
    resolver: zodResolver(memoryInput),
    defaultValues: initial ?? {
      title: "",
      eventDate: romeToday(),
      description: "",
      category: "Momenti speciali",
      location: "",
    },
  });
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
        <section className="paper form-paper">
          <span className="corner-label handwritten">le parole</span>
          <label>
            Un titolo per questo momento *
            <input
              autoFocus
              maxLength={160}
              placeholder="Come chiameremo questo ricordo?"
              {...register("title")}
            />
            {errors.title && (
              <span className="field-error">
                Il titolo è obbligatorio (massimo 160 caratteri).
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              Quando è successo? *
              <input type="date" {...register("eventDate")} />
              {errors.eventDate && (
                <span className="field-error">Scegli una data valida.</span>
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
        </section>
        <section className="paper form-paper photo-editor">
          <span className="corner-label handwritten">le fotografie</span>
          <h2>Frammenti di quel giorno</h2>
          <p>
            La stella sceglie la copertina. Le frecce riordinano i nostri
            momenti.
          </p>
          <label className="upload-zone">
            <ImagePlus size={32} strokeWidth={1} />
            <strong>Aggiungi le fotografie</strong>
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
          <div className="upload-previews">
            {photos.map((p, i) => (
              <div
                className={
                  "upload-preview " + (cover === p.key ? "selected-cover" : "")
                }
                key={p.key}
              >
                <img src={p.url} alt={"Fotografia " + (i + 1)} />
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
                    aria-label="Sposta prima"
                    onClick={() => move(i, -1)}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={i === photos.length - 1}
                    aria-label="Sposta dopo"
                    onClick={() => move(i, 1)}
                  >
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Rimuovi foto"
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
        </section>
        <div className="editor-footer">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span className="tiny">
            * Campi obbligatori · Questo ricordo sarà di entrambi.
          </span>
          <button className="button" disabled={isSubmitting}>
            <Save size={17} />
            {isSubmitting
              ? "Custodisco il ricordo…"
              : "Salva il nostro ricordo"}
          </button>
        </div>
      </form>
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
