import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, setCsrf, invalidatePrivateResponses } from "./api";
import type { User } from "./types";
import { diaryScrollKey, clearDiaryScroll } from "./diary-scroll";
import "./diary-lock.css";

export type LockState = {
  enabled: boolean;
  timeoutSeconds: number;
  locked: boolean;
  deadline: number | null;
  serverTime: number;
  webauthnAvailable: boolean;
};
type Phase = "checking" | "unlocked" | "locked" | "guest";
const emptyLock: LockState = {
  enabled: false,
  timeoutSeconds: 300,
  locked: false,
  deadline: null,
  serverTime: 0,
  webauthnAvailable: false,
};
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  phase: Phase;
  lock: LockState;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockPassword: (password: string) => Promise<void>;
  unlockPasskey: () => Promise<void>;
  lockNow: () => Promise<void>;
  withDeviceVerification: <T>(work: () => Promise<T>) => Promise<T>;
};
const Context = createContext<Auth>(null!);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [phase, setPhase] = useState<Phase>("checking"),
    [lock, setLock] = useState<LockState>(emptyLock),
    [validationVersion, setValidationVersion] = useState(0),
    [error, setError] = useState("");
  const current = useRef({ user, phase, lock });
  current.current = { user, phase, lock };
  const sequence = useRef(0),
    verification = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const [tabId] = useState(() => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    // Presence metadata is not an authentication proof. Keep password access
    // working even where the secure-context-only randomUUID API is absent.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });
  const mask = useCallback(
    (hard = true, cancelValidation = true) => {
      if (cancelValidation) ++sequence.current;
      const root = document.documentElement;
      if (
        root.dataset.diaryShield !== "true" &&
        current.current.phase === "unlocked"
      ) {
        try {
          sessionStorage.setItem(
            diaryScrollKey,
            JSON.stringify({
              path: location.pathname + location.search,
              y: scrollY,
            }),
          );
        } catch {
          /* Optional scroll restoration. */
        }
      }
      root.dataset.diaryShield = "true";
      root.dataset.diaryProtected = "true";
      invalidatePrivateResponses();
      focusManager.setFocused(false);
      void client.cancelQueries();
      if (hard) {
        client.clear();
        setPhase("checking");
      }
    },
    [client],
  );
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await api<{ user: User; csrf: string; lock: LockState }>(
        "/auth/me",
      );
      if (request !== sequence.current) return;
      if (data.lock.locked && !current.current.lock.locked)
        channel.current?.postMessage({ type: "locked", userId: data.user.id });
      if (data.lock.locked) mask(true, false);
      else if (current.current.phase === "unlocked") clearDiaryScroll();
      setUser(data.user);
      setCsrf(data.csrf);
      setLock(data.lock);
      setError("");
      setPhase(data.lock.locked ? "locked" : "unlocked");
    } catch (e) {
      if (request !== sequence.current) return;
      if (e instanceof ApiError && e.status === 401) {
        mask(true, false);
        setUser(null);
        setCsrf("");
        setLock(emptyLock);
        setPhase("guest");
        setError("");
        client.clear();
      } else {
        mask(true, false);
        setError((e as Error).message);
        setPhase("checking");
      }
    } finally {
      if (request === sequence.current)
        setValidationVersion((value) => value + 1);
    }
  }, [client, mask]);
  const validate = useCallback(async () => {
    mask(false);
    await refresh();
  }, [mask, refresh]);
  const broadcast = (type: string) =>
    channel.current?.postMessage({ type, userId: current.current.user?.id });
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.diaryProtected = String(phase !== "unlocked");
    if (!document.hidden) {
      delete root.dataset.diaryShield;
      focusManager.setFocused(phase === "unlocked");
    }
  }, [phase, validationVersion]);
  useEffect(() => {
    void refresh();
    const expired = () => {
      ++sequence.current;
      mask();
      setUser(null);
      setCsrf("");
      setLock(emptyLock);
      setPhase("guest");
      setValidationVersion((value) => value + 1);
    };
    const locked = () => {
      mask();
      void refresh();
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("diary-locked", locked);
    const bc =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("akai-diary-lock")
        : null;
    channel.current = bc;
    if (bc)
      bc.onmessage = (event) => {
        if (event.data?.userId === current.current.user?.id) void validate();
      };
    return () => {
      ++sequence.current;
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("diary-locked", locked);
      bc?.close();
      channel.current = null;
    };
  }, [mask, refresh, validate]);
  useEffect(() => {
    if (!user) return;
    let idle = 0,
      flush = 0,
      pending = false,
      lastSent = 0,
      disposed = false;
    const schedule = (state: LockState) => {
      clearTimeout(idle);
      if (state.locked || state.deadline === null || disposed) return;
      idle = window.setTimeout(
        () => {
          if (!document.hidden) void validate();
        },
        Math.max(0, state.deadline - state.serverTime) + 25,
      );
    };
    const touch = async () => {
      if (
        disposed ||
        pending ||
        document.hidden ||
        document.documentElement.dataset.diaryShield === "true" ||
        !current.current.lock.enabled ||
        current.current.phase !== "unlocked"
      )
        return;
      pending = true;
      lastSent = performance.now();
      try {
        const state = await api<LockState>("/auth/lock/activity", {
          method: "POST",
          body: JSON.stringify({ tabId }),
        });
        if (
          !disposed &&
          document.documentElement.dataset.diaryShield !== "true"
        ) {
          setLock(state);
          schedule(state);
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 423)) void validate();
      } finally {
        pending = false;
      }
    };
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        document.hidden ||
        !current.current.lock.enabled ||
        document.documentElement.dataset.diaryShield === "true" ||
        current.current.phase !== "unlocked"
      )
        return;
      if (performance.now() - lastSent >= 15_000) void touch();
      else if (!flush)
        flush = window.setTimeout(
          () => {
            flush = 0;
            void touch();
          },
          15_000 - (performance.now() - lastSent),
        );
    };
    const hide = () => {
      if (verification.current) {
        document.documentElement.dataset.diaryShield = "true";
        document.documentElement.dataset.diaryProtected = "true";
        return;
      }
      if (!current.current.lock.enabled) return;
      mask(false);
      clearTimeout(idle);
      clearTimeout(flush);
      flush = 0;
      void api<LockState>("/auth/lock/visibility", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ tabId, hidden: true }),
      })
        .then((state) => {
          if (!disposed) setLock(state);
        })
        .catch(() => {
          /* Resume always rechecks the server. */
        });
    };
    const resume = () => {
      if (
        document.hidden ||
        verification.current ||
        !current.current.lock.enabled
      )
        return;
      void validate();
    };
    const visibility = () => (document.hidden ? hide() : resume());
    const blur = () => {
      if (!verification.current && current.current.lock.enabled) mask(false);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("blur", blur);
    for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
      window.addEventListener(name, activity, { passive: true });
    if (phase === "unlocked" && lock.enabled) {
      schedule(lock);
      void touch();
    }
    return () => {
      disposed = true;
      clearTimeout(idle);
      clearTimeout(flush);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("blur", blur);
      for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
        window.removeEventListener(name, activity);
    };
  }, [
    user?.id,
    phase,
    lock.enabled,
    lock.timeoutSeconds,
    validationVersion,
    tabId,
    mask,
    validate,
  ]);
  const withDeviceVerification = async <T,>(work: () => Promise<T>) => {
    verification.current = true;
    try {
      return await work();
    } finally {
      verification.current = false;
      if (document.hidden) {
        mask(false);
        void api("/auth/lock/visibility", {
          method: "POST",
          keepalive: true,
          body: JSON.stringify({ tabId, hidden: true }),
        }).catch(() => {});
      } else if (document.documentElement.dataset.diaryShield === "true")
        await validate();
    }
  };
  const login = async (username: string, password: string) => {
    const data = await api<{ user: User; csrf: string; lock: LockState }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    ++sequence.current;
    client.clear();
    setUser(data.user);
    setCsrf(data.csrf);
    setLock(data.lock);
    setError("");
    setPhase("unlocked");
    channel.current?.postMessage({ type: "changed", userId: data.user.id });
  };
  const logout = async () => {
    mask();
    ++sequence.current;
    try {
      await api("/auth/logout", { method: "POST" });
      broadcast("changed");
      setUser(null);
      setCsrf("");
      setLock(emptyLock);
      setError("");
      setPhase("guest");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };
  const unlocked = async () => {
    broadcast("unlocked");
    await refresh();
  };
  const unlockPassword = async (password: string) => {
    await api("/auth/lock/password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    await unlocked();
  };
  const unlockPasskey = async () =>
    withDeviceVerification(async () => {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const data = await api<{
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
        challengeId: string;
      }>("/auth/lock/options", { method: "POST" });
      const response = await startAuthentication({ optionsJSON: data.options });
      await api("/auth/lock/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: data.challengeId, response }),
      });
      await unlocked();
    });
  const lockNow = async () => {
    const state = await api<LockState>("/auth/lock/manual", { method: "POST" });
    if (!state.locked) {
      await refresh();
      return;
    }
    mask();
    setLock(state);
    setPhase(state.locked ? "locked" : "unlocked");
    broadcast("locked");
  };
  return (
    <Context
      value={{
        user,
        loading: phase === "checking",
        phase,
        lock,
        error,
        refresh: async () => {
          await refresh();
          broadcast("changed");
        },
        login,
        logout,
        unlockPassword,
        unlockPasskey,
        lockNow,
        withDeviceVerification,
      }}
    >
      {children}
      {createPortal(
        <div className="privacy-curtain" aria-hidden="true">
          <span>赤い糸</span>
          <p>I nostri ricordi, custoditi insieme.</p>
        </div>,
        document.body,
      )}
    </Context>
  );
}
