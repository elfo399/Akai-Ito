import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  type LinkProps,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Memory } from "./types";
import { useMotion } from "./motion";
export function MotionLink(props: LinkProps) {
  const { effective } = useMotion();
  return <Link {...props} viewTransition={effective === "full"} />;
}
export function MemoryLink({
  memoryId,
  photoId,
  ...props
}: Omit<LinkProps, "to" | "state"> & {
  memoryId: string;
  photoId?: string | null;
}) {
  const client = useQueryClient(),
    location = useLocation(),
    navigate = useNavigate(),
    { effective } = useMotion();
  const live = useRef(true),
    request = useRef(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return (
    <Link
      {...props}
      to={"/memories/" + memoryId}
      aria-busy={busy}
      onClick={async (event) => {
        props.onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target
        )
          return;
        event.preventDefault();
        const token = ++request.current;
        setBusy(true);
        try {
          await Promise.all([
            client.ensureQueryData({
              queryKey: ["memory", memoryId],
              queryFn: () => api<Memory>("/memories/" + memoryId),
            }),
            effective === "full"
              ? new Promise((resolve) => setTimeout(resolve, 180))
              : Promise.resolve(),
          ]);
        } catch {
          /* The detail page owns its error state. */
        }
        if (!live.current || token !== request.current) return;
        setBusy(false);
        navigate("/memories/" + memoryId, {
          viewTransition: effective === "full",
          state: {
            from: location.pathname + location.search,
            focusPhoto: photoId,
          },
        });
      }}
    />
  );
}
