import { useState } from "react";
import { Fingerprint, Heart, LockKeyhole, LogOut } from "lucide-react";
import { useAuth } from "../auth";
import { ThreadMark } from "../scrapbook";

export default function DiaryGate() {
  const auth = useAuth(),
    [passwordMode, setPasswordMode] = useState(false),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = auth.phase === "locked";
  const supported =
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    auth.lock.webauthnAvailable;
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setPassword("");
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Verifica annullata. Riprova o usa la password."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="diary-gate" aria-busy={busy}>
      <section className="paper diary-gate-card">
        <ThreadMark />
        <p className="eyebrow">赤い糸 — Akai Ito</p>
        <p className="handwritten">I nostri ricordi, custoditi insieme.</p>
        <LockKeyhole size={28} strokeWidth={1} />
        <h1>
          {locked
            ? "Il nostro diario è protetto."
            : "Custodiamo i nostri ricordi."}
        </h1>
        {!locked ? (
          <>
            <p role="status">
              {auth.error || "Verifichiamo l’accesso al diario…"}
            </p>
            {auth.error && (
              <button
                className="button secondary"
                onClick={() => void auth.refresh()}
              >
                Riprova
              </button>
            )}
          </>
        ) : (
          <>
            <p>Sblocca con il metodo di sicurezza del dispositivo.</p>
            {!passwordMode ? (
              <>
                <button
                  className="button"
                  disabled={busy || !supported}
                  onClick={() => void work(auth.unlockPasskey)}
                >
                  <Fingerprint size={18} />
                  Sblocca il diario
                </button>
                {!supported && (
                  <p className="tiny">
                    Le passkey non sono disponibili in questo browser. Puoi
                    usare la password.
                  </p>
                )}
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setPasswordMode(true)}
                >
                  Usa la password
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void work(() => auth.unlockPassword(password));
                }}
              >
                <label>
                  Password del tuo account
                  <input
                    autoFocus
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="button" disabled={busy || !password}>
                  Sblocca con la password
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setPasswordMode(false);
                    setPassword("");
                    setError("");
                  }}
                >
                  Torna alla passkey
                </button>
              </form>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {auth.user && (
          <button
            className="text-link gate-logout"
            disabled={busy}
            onClick={() => void work(auth.logout)}
          >
            <LogOut size={15} />
            Esci dal diario
          </button>
        )}
        <Heart size={17} strokeWidth={1} aria-hidden="true" />
      </section>
    </main>
  );
}
