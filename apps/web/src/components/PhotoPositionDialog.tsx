import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MapConfig } from "@akai/shared";
import { MapPin, Save, Trash2 } from "lucide-react";
import { api, ApiError, photoUrl } from "../api";
import type { Memory, Photo } from "../types";
import { Dialog, Loading, ErrorState } from "../components";
import "../world.css";
const GeoMap = lazy(() => import("./GeoMap"));

export default function PhotoPositionDialog({
  photo,
  memory,
  onClose,
}: {
  photo: Photo;
  memory: Memory;
  onClose: () => void;
}) {
  const config = useQuery({
    queryKey: ["world-config"],
    queryFn: () => api<MapConfig>("/world/config"),
    staleTime: Infinity,
  });
  const client = useQueryClient();
  const [latitude, setLatitude] = useState(photo.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(photo.longitude?.toString() ?? "");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const lat = latitude.trim() === "" ? NaN : Number(latitude),
    lng = longitude.trim() === "" ? NaN : Number(longitude);
  const valid =
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180;
  const point = valid ? { latitude: lat, longitude: lng } : null;
  const save = async (remove = false) => {
    setBusy(true);
    setError("");
    try {
      await api(`/media/${photo.id}/location`, {
        method: "PUT",
        body: JSON.stringify({
          latitude: remove ? null : lat,
          longitude: remove ? null : lng,
          version: memory.version,
        }),
      });
      await client.invalidateQueries({ queryKey: ["memory", memory.id] });
      await client.invalidateQueries({ queryKey: ["world"] });
      await client.invalidateQueries({ queryKey: ["memories"] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Un posto nel nostro mondo"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="position-photo">
        <img src={photoUrl(photo.id)} alt={memory.title} />
        <div>
          <p>{memory.title}</p>
          <small>
            {photo.locationSource === "exif"
              ? "Posizione letta dai metadati EXIF"
              : photo.locationSource === "manual"
                ? photo.latitude === null
                  ? "Posizione rimossa manualmente"
                  : "Posizione scelta manualmente"
                : "Questa fotografia non ha una posizione"}
          </small>
        </div>
      </div>
      <p id="position-help">
        Tocca un punto sulla mappa oppure inserisci le coordinate. La posizione
        sarà condivisa soltanto nel vostro diario.
      </p>
      {config.isPending ? (
        <Loading />
      ) : config.error ? (
        <ErrorState error={config.error} retry={() => void config.refetch()} />
      ) : (
        <Suspense fallback={<Loading />}>
          <GeoMap
            config={config.data}
            point={point}
            onSelect={(p) => {
              if (!busy) {
                setLatitude(p.latitude.toFixed(6));
                setLongitude(p.longitude.toFixed(6));
              }
            }}
          />
        </Suspense>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy && !conflict) void save();
        }}
        aria-busy={busy}
      >
        <fieldset disabled={busy || conflict} className="position-fields">
          <label>
            Latitudine
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              required
              value={latitude}
              aria-describedby="position-help"
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Da −90 a 90"
            />
          </label>
          <label>
            Longitudine
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Da −180 a 180"
            />
          </label>
        </fieldset>
        <p className="tiny">
          <MapPin size={13} aria-hidden="true" /> Salvando, la posizione sarà
          indicata come manuale. Rimuovendola, non verrà ripristinata dalle
          successive importazioni EXIF.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              await client.invalidateQueries({
                queryKey: ["memory", memory.id],
              });
              onClose();
            }}
          >
            Ricarica i dati aggiornati
          </button>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Annulla
          </button>
          {photo.latitude !== null && (
            <button
              type="button"
              className="button secondary danger"
              disabled={busy || conflict}
              onClick={() => void save(true)}
            >
              <Trash2 size={16} />
              Rimuovi posizione
            </button>
          )}
          <button className="button" disabled={!valid || busy || conflict}>
            <Save size={16} />
            {busy ? "Salvo il punto…" : "Salva posizione"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
