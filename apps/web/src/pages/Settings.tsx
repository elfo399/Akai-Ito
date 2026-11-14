import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Save,
  Camera,
  Trash2,
  LockKeyhole,
  UserRound,
  Heart,
  Check,
} from "lucide-react";
import { api, photoUrl } from "../api";
import type { Settings, MemoryList, Memory } from "../types";
import { useAuth } from "../auth";
import {
  PageHeading,
  Loading,
  ErrorState,
  Avatar,
  Dialog,
} from "../components";
import { Pagination } from "./Timeline";
export default function SettingsPage() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return <SettingsForms initial={query.data} />;
}
function SettingsForms({ initial }: { initial: Settings }) {
  const { user, refresh } = useAuth();
  const client = useQueryClient();
  const [names, setNames] = useState(initial.settings.coupleNames),
    [date, setDate] = useState(initial.settings.startDate ?? ""),
    [cover, setCover] = useState(initial.settings.cover),
    [name, setName] = useState(user!.name),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [picker, setPicker] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page settings-page">
      <PageHeading
        eyebrow="PRENDIAMOCI CURA DEL NOSTRO DIARIO"
        title="Le nostre piccole impostazioni"
        subtitle="Tutto quello che ci rende noi."
      />
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <form
          className="paper form-paper"
          onSubmit={(e) => {
            e.preventDefault();
            void save(async () => {
              await api("/settings", {
                method: "PUT",
                body: JSON.stringify({
                  coupleNames: names,
                  startDate: date || null,
                  cover,
                }),
              });
              await client.invalidateQueries({ queryKey: ["settings"] });
            }, "La copertina del nostro diario è aggiornata.");
          }}
        >
          <Heart className="section-icon" size={24} strokeWidth={1} />
          <h2>La nostra storia</h2>
          <p>Queste informazioni sono condivise.</p>
          <label>
            I nostri nomi
            <input
              value={names}
              onChange={(e) => setNames(e.target.value)}
              maxLength={160}
              placeholder={initial.users.map((u) => u.name).join(" & ")}
            />
          </label>
          <label>
            Il giorno in cui tutto è iniziato
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="field-label" id="cover-label">
            La nostra foto di copertina
          </p>
          <div className="settings-cover">
            {cover ? (
              <img src={photoUrl(cover)} alt="Copertina selezionata" />
            ) : (
              <Camera size={35} strokeWidth={1} />
            )}
            <div>
              <button
                className="button secondary"
                type="button"
                onClick={() => setPicker(true)}
                aria-describedby="cover-label"
              >
                Scegli dal diario
              </button>
              {cover && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setCover(null)}
                >
                  Rimuovi copertina
                </button>
              )}
            </div>
          </div>
          <button className="button" disabled={busy}>
            <Save size={16} />
            Salva la nostra storia
          </button>
        </form>
        <div className="settings-personal">
          <form
            className="paper form-paper"
            onSubmit={(e) => {
              e.preventDefault();
              void save(async () => {
                await api("/profile", {
                  method: "PUT",
                  body: JSON.stringify({ name }),
                });
                await refresh();
                await client.invalidateQueries();
              }, "Il tuo profilo è aggiornato.");
            }}
          >
            <UserRound className="section-icon" size={24} strokeWidth={1} />
            <h2>Il tuo angolo</h2>
            <div className="profile-avatar">
              <Avatar id={user!.id} name={user!.name} avatar={user!.avatar} />
              <label className="button secondary">
                Cambia avatar
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const body = new FormData();
                      body.append("avatar", file);
                      void save(async () => {
                        await api("/profile/avatar", { method: "POST", body });
                        await refresh();
                        await client.invalidateQueries();
                      }, "Avatar aggiornato.");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <label>
              Nome visualizzato
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              <Save size={16} />
              Salva il tuo profilo
            </button>
          </form>
          <form
            className="paper form-paper"
            onSubmit={(e) => {
              e.preventDefault();
              if (password !== confirm) {
                setError("Le nuove password non coincidono.");
                return;
              }
              void save(async () => {
                await api("/auth/password", {
                  method: "PUT",
                  body: JSON.stringify({ current, password }),
                });
                await refresh();
              }, "Password aggiornata. Accedi nuovamente.");
            }}
          >
            <LockKeyhole className="section-icon" size={22} strokeWidth={1} />
            <h2>Una chiave solo tua</h2>
            <label>
              Password attuale
              <input
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label>
              Nuova password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>
                Almeno 12 caratteri. Le tue sessioni saranno revocate.
              </small>
            </label>
            <label>
              Ripeti la nuova password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Cambia password
            </button>
          </form>
        </div>
      </div>
      <Link className="trash-link paper" to="/trash">
        <Trash2 size={23} strokeWidth={1} />
        <div>
          <strong>Le pagine messe da parte</strong>
          <p>Apri il cestino e recupera un ricordo.</p>
        </div>
        <span>Apri il cestino →</span>
      </Link>
      {picker && (
        <PhotoPicker
          onClose={() => setPicker(false)}
          onSelect={(id) => {
            setCover(id);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
function PhotoPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [page, setPage] = useState(1),
    [memoryId, setMemoryId] = useState("");
  const query = useQuery({
    queryKey: ["memories", "picker", page],
    queryFn: () => api<MemoryList>("/memories?page=" + page),
  });
  const memory = useQuery({
    queryKey: ["memory", memoryId],
    queryFn: () => api<Memory>("/memories/" + memoryId),
    enabled: !!memoryId,
  });
  return (
    <Dialog title="La foto che parla di noi" onClose={onClose}>
      <p>Scegli un ricordo, poi la fotografia che vuoi sulla copertina.</p>
      {memoryId ? (
        <>
          <button className="text-link" onClick={() => setMemoryId("")}>
            ← Altri ricordi
          </button>
          {memory.isPending ? (
            <Loading />
          ) : memory.error ? (
            <ErrorState error={memory.error} />
          ) : (
            <div className="picker-grid">
              {memory.data.photos.map((p) => (
                <button key={p.id} onClick={() => onSelect(p.id)}>
                  <img src={photoUrl(p.id)} alt="Scegli questa fotografia" />
                  <Check size={18} />
                </button>
              ))}
            </div>
          )}
        </>
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          {!query.data.items.length && (
            <p>Prima aggiungi un ricordo con almeno una fotografia.</p>
          )}
          <div className="picker-grid">
            {query.data.items
              .filter((m) => m.photoCount)
              .map((m) => (
                <button key={m.id} onClick={() => setMemoryId(m.id)}>
                  <img src={photoUrl(m.coverId!)} alt="" />
                  <span>{m.title}</span>
                </button>
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
      <button className="button secondary" onClick={onClose}>
        Chiudi
      </button>
    </Dialog>
  );
}
