import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../components";
import { api } from "../api";
import type { Collection } from "../types";
export default function CollectionForm({
  category,
  initial,
  onClose,
  onSaved,
}: {
  category: string;
  initial?: Collection;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? ""),
    [description, setDescription] = useState(initial?.description ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  return (
    <Dialog
      title={
        initial ? "Rinomina il nostro album" : "Un album per una nuova storia"
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api<{ id: string }>(
              initial ? "/collections/" + initial.id : "/collections",
              {
                method: initial ? "PUT" : "POST",
                body: JSON.stringify({
                  name,
                  description,
                  category,
                  version: initial?.version,
                }),
              },
            );
            await client.invalidateQueries({ queryKey: ["collections"] });
            await client.invalidateQueries({ queryKey: ["collection"] });
            onSaved?.(result.id);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Un diario in cui raccogliere le giornate, i racconti e le fotografie
          di{" "}
          {category === "Viaggi"
            ? "un viaggio"
            : "un momento della vostra storia"}
          .
        </p>
        <label>
          Nome dell’album
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              category === "Viaggi"
                ? "Barcellona, Amsterdam, un weekend al mare…"
                : "Come chiamiamo questa storia?"
            }
          />
        </label>
        <label>
          Due parole su questa storia
          <textarea
            rows={3}
            maxLength={3000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Annulla
          </button>
          <button className="button" disabled={busy || !name.trim()}>
            {busy ? "Salvo…" : initial ? "Salva album" : "Crea album"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
