import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Clock3, Download, ShieldCheck } from "lucide-react";
import type {
  BackupAction,
  BackupConfiguration,
  BackupStatus,
} from "@akai/shared";
import { api, formatTime } from "../api";
import { Dialog, ErrorState, Loading } from "../components";
import "../backup-settings.css";

const when = (value?: string) =>
  value ? formatTime(value) : "Non ancora eseguito";
const actions = {
  backup: "Crea una copia adesso",
  verify: "Verifica l’ultima copia",
  "test-restore": "Prova il recupero",
  disable: "Sospendi i backup automatici",
};
export default function BackupSettings() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["backup-status"],
    queryFn: () => api<BackupStatus>("/backup/status"),
    refetchInterval: (q) =>
      q.state.data?.job?.result === "running" ? 2500 : false,
    refetchOnWindowFocus: true,
  });
  if (query.isPending) return <Loading />;
  if (query.error && !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const status = query.data!;
  if (!status.available)
    return (
      <section className="paper form-paper backup-settings">
        <span className="eyebrow">
          <Archive size={15} /> MEMORY VAULT
        </span>
        <h2>Una copia dei nostri ricordi</h2>
        <p>
          Il collegamento al servizio di backup non è disponibile. La
          configurazione e le copie esistenti vengono conservate.
        </p>
        <button
          className="button secondary"
          onClick={() => void query.refetch()}
        >
          Riprova collegamento
        </button>
      </section>
    );
  return (
    <BackupForm
      status={status}
      started={(id, action) =>
        client.setQueryData<BackupStatus>(["backup-status"], (current) =>
          current
            ? {
                ...current,
                job: {
                  id,
                  action,
                  result: "running",
                  phase: "queued",
                  startedAt: new Date().toISOString(),
                },
              }
            : current,
        )
      }
      refresh={async () => {
        await query.refetch();
      }}
      connectionLost={!!query.error}
    />
  );
}

function BackupForm({
  status,
  refresh,
  connectionLost,
  started,
}: {
  status: BackupStatus;
  refresh: () => Promise<void>;
  connectionLost: boolean;
  started: (id: string, action: string) => void;
}) {
  const [form, setForm] = useState<BackupConfiguration>(() => ({
    destinationId: "local",
    folder: "akai-ito",
    automatic: false,
    time: "03:30",
    daily: 7,
    weekly: 4,
    monthly: 6,
    localAcknowledged: false,
    keyAcknowledged: false,
    ...status.configuration,
  }));
  const [secret, setSecret] = useState(""),
    [confirm, setConfirm] = useState(""),
    [accountPassword, setAccountPassword] = useState("");
  const [pending, setPending] = useState<"configure" | BackupAction | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const working = busy || status.job?.result === "running";
  const selected = status.destinations.find((d) => d.id === form.destinationId);
  const update = <K extends keyof BackupConfiguration>(
    key: K,
    value: BackupConfiguration[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  const open = (action: "configure" | BackupAction) => {
    setError("");
    setMessage("");
    if (action === "configure") {
      if (!selected?.writable) {
        setError("Scegli una destinazione disponibile e scrivibile.");
        return;
      }
      if (selected.local && !form.localAcknowledged) {
        setError(
          "Conferma di aver compreso i limiti della copia sul Raspberry.",
        );
        return;
      }
      if (
        !status.keyConfigured &&
        (secret.length < 12 || secret !== confirm || !form.keyAcknowledged)
      ) {
        setError(
          "Scegli una password di almeno 12 caratteri, ripetila e conferma di averla conservata separatamente.",
        );
        return;
      }
    }
    setAccountPassword("");
    setPending(action);
  };
  const submit = async () => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/lock/reauth", {
        method: "POST",
        body: JSON.stringify({ password: accountPassword }),
      });
      setAccountPassword("");
      let result: { jobId?: string };
      if (pending === "configure")
        result = await api("/backup/configuration", {
          method: "PUT",
          body: JSON.stringify({
            ...form,
            ...(!status.keyConfigured ? { encryptionPassword: secret } : {}),
          }),
        });
      else
        result = await api("/backup/actions", {
          method: "POST",
          body: JSON.stringify({ action: pending }),
        });
      if (result.jobId)
        started(result.jobId, pending === "configure" ? "prepare" : pending);
      if (pending === "disable") update("automatic", false);
      setSecret("");
      setConfirm("");
      setPending(null);
      setMessage(
        pending === "disable"
          ? "I backup automatici sono sospesi. Le copie già salvate restano disponibili."
          : "Operazione avviata. Puoi seguirne lo stato qui sotto.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="backup-settings">
      <section className="paper form-paper backup-summary">
        <span className="eyebrow">
          <Archive size={15} /> MEMORY VAULT
        </span>
        <h2>Custodiamo la nostra storia</h2>
        <p>
          Una copia cifrata del diario, delle fotografie e degli album. Queste
          impostazioni valgono per entrambi.
        </p>
        <div className="backup-status-line">
          <span
            className={
              status.automaticActive ? "backup-dot active" : "backup-dot"
            }
          />
          <strong>
            {status.automaticActive
              ? "Backup automatici attivi"
              : "Backup automatici disattivati"}
          </strong>
          {status.automaticActive && (
            <span>Ogni giorno alle {status.configuration?.time}</span>
          )}
        </div>
        <dl className="backup-facts">
          <div>
            <dt>Ultima copia riuscita</dt>
            <dd>{when(status.lastSuccess?.finishedAt)}</dd>
          </div>
          <div>
            <dt>Copie disponibili</dt>
            <dd>{status.snapshotCount}</dd>
          </div>
          <div>
            <dt>Ultima prova di recupero</dt>
            <dd>{when(status.lastRestoreTest?.finishedAt)}</dd>
          </div>
        </dl>
        {status.lastAttempt?.result === "failed" && (
          <p className="error" role="alert">
            L’ultimo tentativo di backup non è riuscito. L’ultima copia riuscita
            resta disponibile.
          </p>
        )}
        {status.job && (
          <div
            className={"backup-job " + status.job.result}
            role="status"
            aria-live="polite"
          >
            <ShieldCheck size={19} />
            <span>
              <strong>
                {status.job.result === "running"
                  ? "Operazione in corso…"
                  : status.job.result === "success"
                    ? "Operazione completata"
                    : "Operazione non riuscita"}
              </strong>
              <small>
                {status.job.result === "running"
                  ? "La copia può rendere il diario irraggiungibile per qualche istante. Attendi qui: lo stato si aggiorna da solo."
                  : status.job.result === "failed"
                    ? "Controlla la destinazione e riprova. I backup automatici si attivano solo dopo la prima copia riuscita."
                    : when(status.job.finishedAt)}
              </small>
            </span>
          </div>
        )}
        {connectionLost && (
          <p role="status">Il diario si sta riconnettendo durante la copia…</p>
        )}
        <div className="backup-tools">
          {(["backup", "verify", "test-restore"] as const).map((action) => (
            <button
              key={action}
              className="button secondary"
              disabled={
                working ||
                !status.ready ||
                (action !== "backup" && !status.snapshotCount)
              }
              onClick={() => open(action)}
            >
              {action === "backup" ? (
                <Download size={15} />
              ) : (
                <ShieldCheck size={15} />
              )}
              {actions[action]}
            </button>
          ))}
          {(status.automaticActive || status.configuration?.automatic) && (
            <button
              className="text-link"
              disabled={busy}
              onClick={() => open("disable")}
            >
              {actions.disable}
            </button>
          )}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Aggiorna stato
          </button>
        </div>
      </section>
      <form
        className="paper form-paper backup-configuration"
        onSubmit={(e) => {
          e.preventDefault();
          open("configure");
        }}
      >
        <span className="eyebrow">
          <Clock3 size={15} /> IL POSTO SICURO DEL DIARIO
        </span>
        <h2>Configura le copie</h2>
        <fieldset disabled={working}>
          <div className="backup-fields">
            <label>
              Destinazione
              <select
                value={form.destinationId}
                onChange={(e) => update("destinationId", e.target.value)}
              >
                {!selected && (
                  <option value={form.destinationId}>
                    Destinazione non disponibile
                  </option>
                )}
                {status.destinations.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.writable}>
                    {d.label}
                    {!d.writable ? " — non scrivibile" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cartella del diario
              <input
                required
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
                maxLength={48}
                value={form.folder}
                onChange={(e) => update("folder", e.target.value)}
              />
              <small>Lettere, numeri, trattini e underscore.</small>
            </label>
          </div>
          {selected && (
            <p className="backup-path">
              {selected.path}/{form.folder}
              <span>
                {new Intl.NumberFormat("it-IT", {
                  maximumFractionDigits: 1,
                }).format(selected.availableBytes / 1024 ** 3)}{" "}
                GB liberi
              </span>
            </p>
          )}
          {selected?.local && (
            <label className="backup-check backup-notice">
              <input
                type="checkbox"
                checked={form.localAcknowledged}
                onChange={(e) => update("localAcknowledged", e.target.checked)}
              />
              <span>
                Ho compreso che una copia sullo stesso Raspberry protegge dagli
                errori, ma non dal guasto del disco. Per questo serve un disco
                esterno o un NAS.
              </span>
            </label>
          )}
          <p className="tiny">
            I dischi USB e i NAS già montati sul Raspberry compariranno tra le
            destinazioni. Il diario non formatta e non monta dispositivi.
          </p>
          <div className="backup-rule" />
          {status.keyConfigured ? (
            <p className="backup-key">
              <ShieldCheck size={18} /> Password di cifratura già custodita sul
              Raspberry. Viene conservata anche cambiando destinazione.
            </p>
          ) : (
            <>
              <h3>La chiave delle nostre copie</h3>
              <p className="tiny">
                Scegli una password dedicata ai backup. Conservala anche fuori
                dal Raspberry: senza di lei le copie non possono essere
                recuperate.
              </p>
              <div className="backup-fields">
                <label>
                  Password di cifratura
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </label>
                <label>
                  Ripeti la password di cifratura
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              </div>
              <label className="backup-check">
                <input
                  type="checkbox"
                  checked={form.keyAcknowledged}
                  onChange={(e) => update("keyAcknowledged", e.target.checked)}
                />
                <span>
                  Ho conservato la password in un posto sicuro, separato dal
                  Raspberry.
                </span>
              </label>
            </>
          )}
          <div className="backup-rule" />
          <label className="backup-check">
            <input
              type="checkbox"
              checked={form.automatic}
              onChange={(e) => update("automatic", e.target.checked)}
            />
            <span>
              <strong>Crea automaticamente una copia ogni giorno</strong>
              <small>
                Si attiva dopo che la preparazione e la prima copia sono
                riuscite.
              </small>
            </span>
          </label>
          <label className="backup-time">
            Orario — Europe/Rome
            <input
              type="time"
              required
              value={form.time}
              onChange={(e) => update("time", e.target.value)}
            />
          </label>
          <h3>Quante copie conserviamo</h3>
          <div className="backup-retention">
            {(
              [
                ["daily", "Giornaliere", 365],
                ["weekly", "Settimanali", 104],
                ["monthly", "Mensili", 120],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={max}
                  required
                  value={form[key]}
                  onChange={(e) => update(key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <p className="tiny">
            L’ultima copia riuscita viene sempre conservata. Le copie più
            vecchie si eliminano solo dopo un nuovo backup riuscito.
          </p>
          <button className="button" type="submit" disabled={working}>
            Salva e prepara i backup
          </button>
        </fieldset>
      </form>
      {error && !pending && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {pending && (
        <Dialog
          title={
            pending === "configure"
              ? "Proteggiamo le nostre copie"
              : actions[pending]
          }
          onClose={() => {
            if (!busy) {
              setPending(null);
              setAccountPassword("");
              setError("");
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p>
              Conferma con la password del tuo account per{" "}
              {pending === "configure"
                ? "salvare la configurazione"
                : "avviare questa operazione"}
              .
            </p>
            <label>
              Password del tuo account
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={busy || !accountPassword}>
              {busy ? "Attendi…" : "Conferma"}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
