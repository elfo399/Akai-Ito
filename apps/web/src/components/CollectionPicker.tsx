import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Loading, ErrorState } from "../components";
import { api, formatDate, photoUrl } from "../api";
import type { Collection, MemoryList } from "../types";
import { Pagination } from "../pages/Timeline";
export default function CollectionPicker({
  album,
  onClose,
}: {
  album: Collection;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState(new Map<string, number>()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["memories", "unassigned", album.category, page],
    queryFn: () =>
      api<MemoryList>(
        "/memories?category=" +
          encodeURIComponent(album.category) +
          "&collectionId=unassigned&page=" +
          page,
      ),
  });
  return (
    <Dialog title={"Aggiungi pagine a “" + album.name + "”"} onClose={onClose}>
      <p>
        Scegli i ricordi da raccogliere in questo album. Ogni ricordo porta con
        sé tutte le sue fotografie.
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.total ? (
        <p className="muted">
          Tutti i ricordi di questo capitolo hanno già un album. Per spostarne
          uno, aprilo e cambia l’album da Modifica.
        </p>
      ) : (
        <>
          <div className="collection-picker-list">
            {query.data.items.map((m) => (
              <label className="collection-picker-item" key={m.id}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.has(m.id)}
                  onChange={(e) =>
                    setSelected((values) => {
                      const next = new Map(values);
                      if (e.target.checked) next.set(m.id, m.version);
                      else next.delete(m.id);
                      return next;
                    })
                  }
                />
                {m.coverId && <img src={photoUrl(m.coverId)} alt="" />}
                <span>
                  {m.title}
                  <small>
                    {formatDate(m.eventDate)} · {m.photoCount} foto
                  </small>
                </span>
              </label>
            ))}
          </div>
          <Pagination
            page={page}
            total={query.data.total}
            size={20}
            onChange={setPage}
          />
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Annulla
        </button>
        <button
          className="button"
          disabled={busy || !selected.size}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/collections/" + album.id + "/memories", {
                method: "POST",
                body: JSON.stringify({
                  items: Array.from(selected, ([id, version]) => ({
                    id,
                    version,
                  })),
                }),
              });
              await client.invalidateQueries();
              onClose();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Raccolgo le pagine…"
            : "Aggiungi " + selected.size + " ricordi"}
        </button>
      </div>
    </Dialog>
  );
}
