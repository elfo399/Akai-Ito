import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { api, formatDate, formatTime } from "../api";
import type { MemoryList, MemoryCardData } from "../types";
import { PageHeading, Loading, ErrorState, Empty, Dialog } from "../components";
import { Pagination } from "./Timeline";
export default function Trash() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["memories", "trash", page],
    queryFn: () => api<MemoryList>("/memories?trash=true&page=" + page),
  });
  const client = useQueryClient();
  const [selected, setSelected] = useState<MemoryCardData | null>(null),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mutate = async (id: string, permanent = false) => {
    setError("");
    setBusy(true);
    try {
      await api("/memories/" + id + (permanent ? "/permanent" : "/restore"), {
        method: permanent ? "DELETE" : "POST",
        body: permanent ? JSON.stringify({ confirmation: confirm }) : undefined,
      });
      setSelected(null);
      setConfirm("");
      setPage(1);
      await client.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <Link to="/settings" className="back-link">
        <ArrowLeft size={16} />
        Impostazioni
      </Link>
      <PageHeading
        eyebrow="C’È ANCORA UN POSTO PER LORO"
        title="Le pagine messe da parte"
        subtitle="A volte, un ricordo ha solo bisogno di essere ritrovato."
      />
      <p className="muted">
        I ricordi restano recuperabili per 30 giorni. Dopo questo periodo la
        pulizia di manutenzione può eliminarli definitivamente.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <Empty
          title="Nessuna pagina messa da parte."
          text="Tutti i nostri ricordi sono al loro posto."
          action={false}
        />
      ) : (
        <>
          <div className="trash-list">
            {query.data.items.map((m) => (
              <div className="paper trash-item" key={m.id}>
                <div>
                  <h2>{m.title}</h2>
                  <p>
                    {formatDate(m.eventDate)} · Nel cestino dal{" "}
                    {formatTime(m.deletedAt!)}
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void mutate(m.id)}
                >
                  <RotateCcw size={16} />
                  Ripristina
                </button>
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={"Elimina definitivamente " + m.title}
                  onClick={() => {
                    setSelected(m);
                    setConfirm("");
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
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
      {selected && (
        <Dialog
          title="Eliminare per sempre questo ricordo?"
          onClose={() => setSelected(null)}
        >
          <p>
            “{selected.title}”, con tutte le fotografie e i pensieri, non sarà
            più recuperabile.
          </p>
          <label>
            Scrivi ELIMINA per confermare
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Annulla
            </button>
            <button
              className="button"
              disabled={confirm !== "ELIMINA" || busy}
              onClick={() => void mutate(selected.id, true)}
            >
              Elimina definitivamente
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
