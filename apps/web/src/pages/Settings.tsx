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
  SlidersHorizontal,
  ArrowUpRight,
  Archive,
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
import DiaryProtection from "../components/DiaryProtection";
import { MotionSettings } from "../motion";
import SeasonalParticleSettings from "../components/SeasonalParticleSettings";
import BackupSettings from "../components/BackupSettings";
import "../settings.css";
const sections = [
  {
    id: "backup",
    label: "Backup",
    note: "Copie e recupero dei ricordi",
    icon: Archive,
  },
  {
    id: "diary",
    label: "Il nostro diario",
    note: "Nomi, data e copertina",
    icon: Heart,
  },
  {
    id: "account",
    label: "Il tuo account",
    note: "Profilo e password",
    icon: UserRound,
  },
  {
    id: "appearance",
    label: "Aspetto",
    note: "Effetti e stagioni",
    icon: SlidersHorizontal,
  },
] as const;
type SettingsSection = (typeof sections)[number]["id"];
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
  const [section, setSection] = useState<SettingsSection>("diary"),
    [feedbackSection, setFeedbackSection] = useState<SettingsSection>("diary");
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
    setFeedbackSection(section);
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
        title="Impostazioni"
        subtitle="Le piccole cose che rendono questo diario nostro."
      />
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div
            className="settings-tabs"
            role="tablist"
            aria-label="Sezioni delle impostazioni"
          >
            {sections.map(({ id, label, note, icon: Icon }, index) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={"settings-tab-" + id}
                aria-controls={"settings-panel-" + id}
                aria-selected={section === id}
                tabIndex={section === id ? 0 : -1}
                onClick={() => setSection(id)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === "ArrowRight" || event.key === "ArrowDown")
                    next = (index + 1) % sections.length;
                  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                    next = (index + sections.length - 1) % sections.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = sections.length - 1;
                  else return;
                  event.preventDefault();
                  setSection(sections[next].id);
                  document
                    .getElementById("settings-tab-" + sections[next].id)
                    ?.focus();
                }}
              >
                <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{note}</small>
                </span>
              </button>
            ))}
          </div>
          <Link className="settings-trash" to="/trash">
            <Trash2 size={17} strokeWidth={1.5} aria-hidden="true" />
            <span>
              Cestino<small>Recupera un ricordo</small>
            </span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <p className="settings-sidebar-note handwritten">
            Un po’ di cura, anche qui.
          </p>
        </aside>
        <div className="settings-content">
          <section
            role="tabpanel"
            id="settings-panel-backup"
            aria-labelledby="settings-tab-backup"
            hidden={section !== "backup"}
            tabIndex={0}
          >
            {section === "backup" && <BackupSettings />}
          </section>
          {feedbackSection === section && message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          {feedbackSection === section && error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <section
            role="tabpanel"
            id="settings-panel-diary"
            aria-labelledby="settings-tab-diary"
            hidden={section !== "diary"}
            tabIndex={0}
          >
            <form
              className="paper form-paper settings-story"
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
              <span className="eyebrow">IL NOSTRO DIARIO</span>
              <h2>La nostra storia</h2>
              <p>
                I nomi, il primo giorno e una foto che parla di noi. Queste
                informazioni sono condivise.
              </p>
              <div className="settings-story-fields">
                <div>
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
                </div>
                <div className="settings-cover-field">
                  <p className="field-label" id="cover-label">
                    La nostra foto di copertina
                  </p>
                  <div className="settings-cover">
                    {cover ? (
                      <img src={photoUrl(cover)} alt="Copertina selezionata" />
                    ) : (
                      <div className="settings-cover-empty">
                        <Camera size={28} strokeWidth={1} />
                        <span>Una foto tutta nostra</span>
                      </div>
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
                          className="button secondary"
                          onClick={() => setCover(null)}
                        >
                          Rimuovi copertina
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-form-footer">
                <span>Visibile a entrambi</span>
                <button className="button" disabled={busy}>
                  <Save size={16} />
                  Salva la nostra storia
                </button>
              </div>
            </form>
          </section>
          <section
            role="tabpanel"
            id="settings-panel-account"
            aria-labelledby="settings-tab-account"
            hidden={section !== "account"}
            tabIndex={0}
          >
            <div className="settings-account">
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
                <span className="eyebrow">IL TUO PROFILO</span>
                <h2>Il tuo angolo</h2>
                <p>Il nome e la foto con cui firmi i tuoi ricordi.</p>
                <div className="profile-avatar">
                  <Avatar
                    id={user!.id}
                    name={user!.name}
                    avatar={user!.avatar}
                  />
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
                            await api("/profile/avatar", {
                              method: "POST",
                              body,
                            });
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
                    setFeedbackSection("account");
                    setMessage("");
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
                <span className="eyebrow">
                  <LockKeyhole size={13} aria-hidden="true" /> ACCESSO PERSONALE
                </span>
                <h2>Una chiave solo tua</h2>
                <p>Gestisci la password con cui entri nel diario.</p>
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
              <DiaryProtection />
            </div>
          </section>
          <section
            role="tabpanel"
            id="settings-panel-appearance"
            aria-labelledby="settings-tab-appearance"
            hidden={section !== "appearance"}
            tabIndex={0}
          >
            <MotionSettings />
            <SeasonalParticleSettings />
          </section>
        </div>
      </div>
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
