import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart, RotateCcw, SlidersHorizontal } from "lucide-react";
import { categories } from "@akai/shared";
import { api } from "../api";
import type { MemoryList } from "../types";
import {
  PageHeading,
  AddMemory,
  Loading,
  ErrorState,
  Empty,
  MemoryCard,
} from "../components";
import { TimelineThread, StoryEnding } from "../scrapbook";
import { useKnotReveal, useReducedMotion } from "../motion";
import FloatingActions from "../components/FloatingActions";
import "../timeline-filters.css";
export default function Timeline() {
  const [search, setSearch] = useSearchParams();
  const order = search.get("order") === "asc" ? "asc" : "desc",
    year = search.get("year") ?? "",
    category = search.get("category") ?? "",
    page = Math.max(1, Number(search.get("page")) || 1);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearch(next, { replace: true });
  };
  const ref = useRef<HTMLDivElement>(null);
  const activeFilters = Number(Boolean(year)) + Number(Boolean(category));
  const reset = () => {
    const next = new URLSearchParams(search);
    for (const key of ["year", "category", "order", "page"]) next.delete(key);
    setSearch(next, { replace: true });
  };
  const params = new URLSearchParams({
    order,
    page: String(page),
    ...(year ? { year } : {}),
    ...(category ? { category } : {}),
  });
  const query = useQuery({
    queryKey: ["memories", "timeline", order, year, category, page],
    queryFn: () => api<MemoryList>("/memories?" + params),
  });
  useKnotReveal(ref, query.data?.items.map((item) => item.id).join(":"));
  return (
    <div className="page timeline-page">
      <PageHeading
        eyebrow="IL NOSTRO DIARIO"
        title="I fili della nostra storia"
        subtitle="Ogni momento ci ha portati fin qui."
        action={<AddMemory />}
      />
      <p className="timeline-filter-summary" role="status">
        {[
          year || (!category ? "Tutti i ricordi" : ""),
          category,
          order === "desc" ? "Dal più recente" : "Dall’inizio",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <FloatingActions
        label="Filtri della timeline"
        title="Tra le nostre pagine"
        eyebrow="SCEGLI COSA RILEGGERE"
        triggerText="Filtri"
        status={activeFilters ? `Filtri · ${activeFilters}` : undefined}
        icon={<SlidersHorizontal size={18} />}
        panelClassName="timeline-filters-panel"
      >
        {(close) => (
          <>
            <div className="timeline-filter-fields">
              <div>
                <label htmlFor="timeline-year">Anno</label>
                <select
                  id="timeline-year"
                  value={year}
                  onChange={(e) => update("year", e.target.value)}
                >
                  <option value="">Tutti gli anni</option>
                  {(query.data?.years ?? (year ? [year] : [])).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="timeline-category">Capitolo</label>
                <select
                  id="timeline-category"
                  value={category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="">Tutte le categorie</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="timeline-order">Ordine</label>
                <select
                  id="timeline-order"
                  value={order}
                  onChange={(e) => update("order", e.target.value)}
                >
                  <option value="desc">Dal più recente</option>
                  <option value="asc">Dall’inizio</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="memory-floating-action timeline-filter-reset"
              disabled={!activeFilters && order === "desc"}
              onClick={() => {
                reset();
                close();
              }}
            >
              <RotateCcw size={16} />
              Azzera filtri
            </button>
          </>
        )}
      </FloatingActions>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <Empty
          title={
            year || category ? "Nessun ricordo tra queste pagine." : undefined
          }
          text={
            year || category
              ? "Prova a scegliere un altro anno o un’altra categoria."
              : undefined
          }
          action={!year && !category}
        />
      ) : (
        <>
          <div className="timeline" ref={ref}>
            <TimelineThread />
            {query.data.items.map((m, i) => (
              <div
                key={m.id}
                className={"timeline-entry " + (i % 2 ? "right" : "left")}
              >
                <span className="thread-knot" aria-hidden="true">
                  <Heart size={12} />
                </span>
                {(i === 0 ||
                  m.eventDate.slice(0, 4) !==
                    query.data.items[i - 1].eventDate.slice(0, 4)) && (
                  <span className="year-stamp">{m.eventDate.slice(0, 4)}</span>
                )}
                <MemoryCard memory={m} />
              </div>
            ))}
          </div>
          <StoryEnding />
          <Pagination
            page={page}
            total={query.data.total}
            size={20}
            onChange={(value) => update("page", String(value))}
          />
        </>
      )}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (p: number) => void;
}) {
  const reduced = useReducedMotion();
  return total > size ? (
    <div className="pagination">
      <button
        className="button secondary"
        disabled={page === 1}
        onClick={() => {
          onChange(page - 1);
          window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
        }}
      >
        Precedente
      </button>
      <span>
        {page} / {Math.ceil(total / size)}
      </span>
      <button
        className="button secondary"
        disabled={page * size >= total}
        onClick={() => {
          onChange(page + 1);
          window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
        }}
      >
        Successiva
      </button>
    </div>
  ) : null;
}
