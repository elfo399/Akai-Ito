import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Plus, Trash2, LockKeyhole } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Dialog } from "../components";
type Key = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
type Action = {
  type: "enable" | "disable" | "add" | "remove" | "timeout";
  id?: string;
};
export default function DiaryProtection() {
  const auth = useAuth(),
    client = useQueryClient(),
    [action, setAction] = useState<Action | null>(null),
    [password, setPassword] = useState(""),
    [name, setName] = useState("Il mio dispositivo"),
    [timeout, setTimeoutValue] = useState(auth.lock.timeoutSeconds),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const keys = useQuery({
    queryKey: ["passkeys", auth.user?.id],
    queryFn: () => api<{ items: Key[]; available: boolean }>("/auth/passkeys"),
  });
  const supported =
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    keys.data?.available;
  const open = (value: Action) => {
    setAction(value);
    setPassword("");
    setError("");
    setMessage("");
  };
  const register = async () =>
    auth.withDeviceVerification(async () => {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const data = await api<{
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        challengeId: string;
      }>("/auth/passkeys/options", { method: "POST" });
      const response = await startRegistration({ optionsJSON: data.options });
      await api("/auth/passkeys/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: data.challengeId, response, name }),
      });
    });
  const submit = async () => {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/lock/reauth", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      if (
        action.type === "add" ||
        (action.type === "enable" && !keys.data?.items.length)
      ) {
        if (!supported)
          throw new Error("Passkey non disponibili su questo dispositivo.");
        await register();
      }
      if (["enable", "disable", "timeout"].includes(action.type))
        await api("/auth/lock/preferences", {
          method: "PUT",
          body: JSON.stringify({
            enabled:
              action.type === "enable"
                ? true
                : action.type === "disable"
                  ? false
                  : auth.lock.enabled,
            timeoutSeconds: timeout,
          }),
        });
      if (action.type === "remove")
        await api("/auth/passkeys/" + encodeURIComponent(action.id!), {
          method: "DELETE",
        });
      await client.invalidateQueries({ queryKey: ["passkeys"] });
      await auth.refresh();
      setAction(null);
      setMessage("La protezione del tuo diario è aggiornata.");
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Verifica annullata. Riprova per completare la configurazione."
          : (e as Error).name === "InvalidStateError"
            ? "Questo dispositivo ha già una passkey per il tuo account. Scegli un altro dispositivo per aggiungerne una."
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="paper form-paper diary-protection">
      <span className="eyebrow">
        <Fingerprint size={15} /> ACCESSO SUL TUO DISPOSITIVO
      </span>
      <h2>Proteggi il nostro diario</h2>
      <p>Proteggi i vostri ricordi quando lasci il diario incustodito.</p>
      <p className="tiny">
        Il dispositivo sceglie tra volto, impronta o codice. Akai Ito non riceve
        dati biometrici. Le tue impostazioni sono indipendenti da quelle
        dell’altro account.
      </p>
      {keys.error && (
        <p className="error" role="alert">
          {keys.error.message}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        role="switch"
        aria-checked={auth.lock.enabled}
        disabled={busy || keys.isPending || (!auth.lock.enabled && !supported)}
        onClick={() => open({ type: auth.lock.enabled ? "disable" : "enable" })}
      >
        <LockKeyhole size={16} />
        {auth.lock.enabled
          ? "Disattiva blocco biometrico"
          : "Attiva blocco biometrico"}
      </button>
      {!supported && !keys.isPending && (
        <p className="tiny">
          Per configurare una passkey apri il diario tramite HTTPS in un browser
          compatibile, oppure usa localhost nella preview. La password rimane
          disponibile per lo sblocco.
        </p>
      )}
      <div className="protection-timeout">
        <label>
          Tempo prima del blocco
          <select
            value={timeout}
            onChange={(e) => setTimeoutValue(Number(e.target.value))}
          >
            <option value={0}>Subito</option>
            <option value={60}>Dopo 1 minuto</option>
            <option value={300}>Dopo 5 minuti</option>
            <option value={900}>Dopo 15 minuti</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={busy || timeout === auth.lock.timeoutSeconds}
          onClick={() => open({ type: "timeout" })}
        >
          Salva tempo di blocco
        </button>
      </div>
      {timeout === 0 && (
        <p className="tiny">
          Subito quando tutte le finestre sono in background; dopo un minuto
          senza interazioni se il diario resta aperto.
        </p>
      )}
      <h3>Le tue passkey</h3>
      {keys.data?.items.length ? (
        <ul className="passkey-list">
          {keys.data.items.map((key) => (
            <li key={key.id}>
              <div>
                <strong>{key.name}</strong>
                <small>
                  Registrata il{" "}
                  {new Date(key.createdAt).toLocaleDateString("it-IT")}
                  {key.lastUsedAt
                    ? " · Ultimo utilizzo " +
                      new Date(key.lastUsedAt).toLocaleDateString("it-IT")
                    : ""}
                </small>
              </div>
              <button
                className="icon-button"
                aria-label={"Rimuovi passkey " + key.name}
                disabled={
                  busy || (auth.lock.enabled && keys.data.items.length === 1)
                }
                onClick={() => open({ type: "remove", id: key.id })}
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Non hai ancora registrato una passkey.</p>
      )}
      {auth.lock.enabled && keys.data?.items.length === 1 && (
        <p className="tiny">
          Per rimuovere l’ultima passkey, disattiva prima il blocco.
        </p>
      )}
      <div className="protection-actions">
        <button
          className="button secondary"
          disabled={busy || !supported}
          onClick={() => open({ type: "add" })}
        >
          <Plus size={16} />
          Aggiungi una passkey
        </button>
        {auth.lock.enabled && (
          <button
            className="button secondary"
            onClick={() =>
              void auth.lockNow().catch((e) => setError(e.message))
            }
          >
            <LockKeyhole size={16} />
            Blocca adesso
          </button>
        )}
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && !action && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {action && (
        <Dialog
          title="Conferma la tua identità"
          onClose={() => {
            if (!busy) {
              setAction(null);
              setPassword("");
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
              Inserisci la password del tuo account per gestire la protezione.
            </p>
            <label>
              Password del tuo account
              <input
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {(action.type === "add" ||
              (action.type === "enable" && !keys.data?.items.length)) && (
              <label>
                Nome della passkey
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setPassword("");
                }}
              >
                Annulla
              </button>
              <button className="button" disabled={busy || !password}>
                {busy ? "Verifica in corso…" : "Conferma e continua"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
