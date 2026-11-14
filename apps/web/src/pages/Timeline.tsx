import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Heart } from "lucide-react";
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
export default function Timeline() {
  const [order, setOrder] = useState("desc"),
    [year, setYear] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1);
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
  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="IL NOSTRO DIARIO"
        title="I fili della nostra storia"
        subtitle="Ogni momento ci ha portati fin qui."
        action={<AddMemory />}
      />
      <div className="filters paper">
        <label className="inline-label">
          Anno
          <select
            value={year}
            onChange={(e) => change(() => setYear(e.target.value))}
          >
            <option value="">Tutti gli anni</option>
            {(query.data?.years ?? (year ? [year] : [])).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="inline-label">
          Capitolo
          <select
            value={category}
            onChange={(e) => change(() => setCategory(e.target.value))}
          >
            <option value="">Tutte le categorie</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          className="text-link sort-button"
          onClick={() =>
            change(() => setOrder(order === "desc" ? "asc" : "desc"))
          }
        >
          <ArrowDownUp size={16} />
          {order === "desc" ? "Dal più recente" : "Dall’inizio"}
        </button>
      </div>
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
          <div className="timeline">
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
            onChange={setPage}
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
  return total > size ? (
    <div className="pagination">
      <button
        className="button secondary"
        disabled={page === 1}
        onClick={() => {
          onChange(page - 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
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
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Successiva
      </button>
    </div>
  ) : null;
}
