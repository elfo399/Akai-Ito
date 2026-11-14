import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, X } from "lucide-react";
import { api } from "../api";
import type { Memory, MemoryList, MemoryCardData } from "../types";
import { useMotion } from "../motion";
type Page = Pick<MemoryCardData, "id" | "title" | "eventDate" | "coverId">;
export default function DiaryBrowser({
  memory,
  children,
}: {
  memory: Memory;
  children: ReactNode;
}) {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient(),
    { effective } = useMotion();
  const enabled = params.get("browse") === "1";
  const [busy, setBusy] = useState(false),
    touch = useRef<{ x: number; y: number } | null>(null),
    live = useRef(true);
  const request = useRef(0),
    active = useRef(enabled);
  active.current = enabled;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const sequence = useQuery({
    queryKey: ["diary-sequence", memory.collectionId ?? "all"],
    enabled,
    staleTime: 15000,
    queryFn: async ({ signal }) => {
      const result: Page[] = [];
      let page = 1,
        total = Infinity;
      while (result.length < total) {
        const data = await api<MemoryList>(
          "/memories?order=asc&page=" +
            page++ +
            (memory.collectionId ? "&collectionId=" + memory.collectionId : ""),
          { signal },
        );
        total = data.total;
        result.push(
          ...data.items.map(({ id, title, eventDate, coverId }) => ({
            id,
            title,
            eventDate,
            coverId,
          })),
        );
        if (!data.items.length) break;
      }
      return result;
    },
  });
  const index = sequence.data?.findIndex((page) => page.id === memory.id) ?? -1;
  const move = async (delta: number) => {
    const next = sequence.data?.[index + delta];
    if (!next || busy || index < 0) return;
    const token = ++request.current;
    setBusy(true);
    try {
      await client.ensureQueryData({
        queryKey: ["memory", next.id],
        queryFn: () => api<Memory>("/memories/" + next.id),
      });
    } catch {
      /* Normal detail errors stay available. */
    }
    if (!live.current || !active.current || token !== request.current) return;
    document.documentElement.dataset.pageDirection =
      delta > 0 ? "next" : "previous";
    navigate("/memories/" + next.id + "?browse=1", {
      viewTransition: effective === "full",
      state: { ...location.state, focusPhoto: next.coverId },
    });
  };
  useEffect(() => {
    if (!enabled) return;
    const key = (event: KeyboardEvent) => {
      if (
        document.querySelector("dialog[open]") ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,button,a,[contenteditable=true]",
          ))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void move(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [enabled, index, sequence.data, busy, effective]);
  const toolbar = (
    <section
      className="diary-browser paper"
      ref={ref}
      tabIndex={enabled ? 0 : undefined}
      aria-label="Sfoglia il diario"
    >
      {!enabled ? (
        <>
          <span className="handwritten">
            {memory.collectionId
              ? "Le pagine di questo album."
              : "Un ricordo tira l'altro."}
          </span>
          <button
            className="button secondary"
            onClick={() =>
              navigate(location.pathname + "?browse=1", {
                replace: true,
                state: location.state,
              })
            }
          >
            <BookOpen size={17} />
            Sfoglia il diario
          </button>
        </>
      ) : (
        <>
          <button
            className="icon-button"
            aria-label="Ricordo precedente"
            disabled={busy || index <= 0}
            onClick={() => void move(-1)}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="diary-page-number" role="status">
            {sequence.isPending ? (
              "Cerco le nostre pagine…"
            ) : sequence.error ? (
              <button
                className="text-link"
                onClick={() => void sequence.refetch()}
              >
                Riprova a sfogliare
              </button>
            ) : (
              `Pagina ${index + 1} di ${sequence.data.length}`
            )}
            <small>Frecce della tastiera · scorri sul racconto</small>
          </div>
          <button
            className="icon-button"
            aria-label="Ricordo successivo"
            disabled={
              busy || index < 0 || index >= (sequence.data?.length ?? 0) - 1
            }
            onClick={() => void move(1)}
          >
            <ArrowRight size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Esci da Sfoglia il diario"
            onClick={() => {
              active.current = false;
              request.current++;
              setBusy(false);
              navigate(location.pathname, {
                replace: true,
                state: location.state,
              });
            }}
          >
            <X size={17} />
          </button>
        </>
      )}
    </section>
  );
  return (
    <div className="diary-reader">
      <div
        className="diary-browse-zone"
        onTouchStart={(event) => {
          if (
            !enabled ||
            (event.target instanceof Element &&
              event.target.closest("button,a,input,textarea"))
          )
            return;
          touch.current = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
          };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || !enabled || window.getSelection()?.toString()) return;
          const dx = event.changedTouches[0].clientX - start.x,
            dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6)
            void move(dx < 0 ? 1 : -1);
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        {children}
      </div>
      {toolbar}
    </div>
  );
}
