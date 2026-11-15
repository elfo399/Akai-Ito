import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { Memory, MemoryList, MemoryCardData } from "../types";
import { useMotion } from "../motion";
type Page = Pick<MemoryCardData, "id" | "title" | "eventDate" | "coverId">;
type RenderActions = (diary: ReactNode, browseStatus?: string) => ReactNode;
export default function DiaryBrowser({
  memory,
  children,
  renderActions,
}: {
  memory: Memory;
  children: ReactNode;
  renderActions?: RenderActions;
}) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const collectionId = memory.collectionId;
  useEffect(() => {
    if (collectionId || !params.has("browse")) return;
    const next = new URLSearchParams(params);
    next.delete("browse");
    setParams(next, { replace: true, state: location.state });
  }, [collectionId, params, setParams, location.state]);
  if (!collectionId)
    return (
      <>
        {children}
        {renderActions?.(null)}
      </>
    );
  return (
    <AlbumDiaryBrowser
      key={collectionId}
      memory={memory}
      collectionId={collectionId}
      renderActions={renderActions}
    >
      {children}
    </AlbumDiaryBrowser>
  );
}
function AlbumDiaryBrowser({
  memory,
  collectionId,
  children,
  renderActions,
}: {
  memory: Memory;
  collectionId: string;
  children: ReactNode;
  renderActions?: RenderActions;
}) {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient(),
    { effective } = useMotion();
  const enabled = params.get("browse") === "1";
  const [busy, setBusy] = useState(false),
    [moveError, setMoveError] = useState(""),
    touch = useRef<{ x: number; y: number } | null>(null),
    live = useRef(true);
  const request = useRef(0),
    pending = useRef(false),
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
    queryKey: ["diary-sequence", collectionId],
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
            "&collectionId=" +
            encodeURIComponent(collectionId),
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
  const canBrowse =
    enabled && !sequence.isPending && !sequence.error && index >= 0;
  const move = async (delta: number) => {
    const next = sequence.data?.[index + delta];
    if (!next || pending.current || !canBrowse) return;
    const token = ++request.current;
    pending.current = true;
    setBusy(true);
    setMoveError("");
    let navigated = false;
    const current = () =>
      live.current && active.current && token === request.current;
    try {
      const detail = await client.fetchQuery({
        queryKey: ["memory", next.id],
        queryFn: ({ signal }) =>
          api<Memory>("/memories/" + next.id, { signal }),
        staleTime: 0,
      });
      if (!current()) return;
      if (detail.collectionId !== collectionId) {
        await sequence.refetch();
        if (current())
          setMoveError(
            "L’album è cambiato. Le pagine sono state aggiornate: riprova.",
          );
        return;
      }
      document.documentElement.dataset.pageDirection =
        delta > 0 ? "next" : "previous";
      void navigate("/memories/" + next.id + "?browse=1", {
        viewTransition: effective === "full",
        state: { ...location.state, focusPhoto: next.coverId },
      });
      navigated = true;
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiError && error.status === 404)
        await sequence.refetch();
      if (current())
        setMoveError(
          "Non è stato possibile aprire questa pagina. Riprova o aggiorna il diario.",
        );
    } finally {
      if (!navigated && current()) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (!enabled) return;
    const key = (event: KeyboardEvent) => {
      if (
        document.querySelector("dialog[open], [popover]:popover-open") ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,button,a,[contenteditable=true]",
          ) &&
          !event.target.closest(".memory-actions-trigger"))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void move(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [
    enabled,
    index,
    sequence.data,
    sequence.error,
    busy,
    effective,
    canBrowse,
  ]);
  const toolbar = (
    <section
      className="diary-browser paper"
      ref={ref}
      tabIndex={enabled ? 0 : undefined}
      aria-label="Sfoglia il diario"
    >
      {!enabled ? (
        <>
          <span className="handwritten">Le pagine di questo album.</span>
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
            disabled={busy || !canBrowse || index <= 0}
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
            ) : index < 0 ? (
              "Questo ricordo non è più tra le pagine dell’album."
            ) : (
              `Pagina ${index + 1} di ${sequence.data.length}`
            )}
            <small>Frecce della tastiera · scorri sul racconto</small>
          </div>
          <button
            className="icon-button"
            aria-label="Ricordo successivo"
            disabled={
              busy || !canBrowse || index >= (sequence.data?.length ?? 0) - 1
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
              pending.current = false;
              setBusy(false);
              navigate(location.pathname, {
                replace: true,
                state: location.state,
              });
            }}
          >
            <X size={17} />
          </button>
          {moveError && (
            <p className="diary-navigation-error" role="alert">
              {moveError}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMoveError("");
                  void sequence.refetch();
                }}
              >
                Aggiorna il diario
              </button>
            </p>
          )}
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
      {renderActions
        ? renderActions(
            toolbar,
            enabled
              ? index >= 0
                ? `Pagina ${index + 1} di ${sequence.data?.length ?? 0}`
                : "Diario"
              : undefined,
          )
        : toolbar}
    </div>
  );
}
