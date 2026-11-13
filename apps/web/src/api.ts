export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (init.method && init.method !== "GET") headers.set("X-CSRF-Token", csrf);
  const res = await fetch("/api" + url, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ message: "Il server non è raggiungibile." }));
    if (res.status === 401 && !url.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(res.status, error.message ?? "Operazione non riuscita.");
  }
  return res.json();
}
export const photoUrl = (
  id: string,
  size: "thumb" | "display" | "original" = "thumb",
) => `/api/media/${id}/${size}`;
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Rome",
  }).format(new Date(date + "T12:00:00Z"));
export const formatTime = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(date));
