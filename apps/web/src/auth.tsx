import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setCsrf } from "./api";
import type { User } from "./types";
import { useQueryClient } from "@tanstack/react-query";
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Auth>(null!);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const client = useQueryClient();
  const refresh = async () => {
    try {
      const data = await api<{ user: User; csrf: string }>("/auth/me");
      setUser(data.user);
      setCsrf(data.csrf);
      setError("");
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const handler = () => {
      setUser(null);
      setCsrf("");
      client.clear();
    };
    window.addEventListener("session-expired", handler);
    return () => window.removeEventListener("session-expired", handler);
  }, []);
  const login = async (username: string, password: string) => {
    const data = await api<{ user: User; csrf: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    client.clear();
    setUser(data.user);
    setCsrf(data.csrf);
    setError("");
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setCsrf("");
    client.clear();
  };
  return (
    <Context value={{ user, loading, error, refresh, login, logout }}>
      {children}
    </Context>
  );
}
