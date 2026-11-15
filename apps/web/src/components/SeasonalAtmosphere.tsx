import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useMotion } from "../motion";
import { particlesEnabled } from "../seasonal";
import { useActiveSeason, type SeasonScope } from "../useActiveSeason";
import SeasonalParticles from "./SeasonalParticles";

export default function SeasonalAtmosphere() {
  const [foreground, setForeground] = useState(
    () => matchMedia("(max-width: 1000px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 1000px)");
    const update = () => setForeground(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const location = useLocation(),
    motion = useMotion();
  const path = location.pathname;
  const scope: SeasonScope =
    path === "/"
      ? "current"
      : path === "/timeline"
        ? "timeline"
        : /^\/memories\/[^/]+$/.test(path) && path !== "/memories/new"
          ? "detail"
          : /^\/albums(?:\/|$)/.test(path)
            ? "album"
            : "none";
  const atmosphereEnabled = scope !== "none" && motion.seasons;
  const enabled =
    atmosphereEnabled &&
    particlesEnabled(
      motion.particles,
      motion.effective,
      motion.seasons,
      motion.systemReduced,
    );
  const season = useActiveSeason(
    motion.particleSeason === "current" && scope !== "none" ? "current" : scope,
    path + location.search,
    atmosphereEnabled,
  );
  if (!atmosphereEnabled) return null;
  const particles = enabled ? (
    <div
      className="seasonal-atmosphere"
      aria-hidden="true"
      data-active-season={season}
      data-particle-scope={scope}
      data-particle-layer={foreground ? "foreground" : "background"}
    >
      <SeasonalParticles
        season={season}
        level={motion.particles}
        quiet={scope === "current" || scope === "album"}
        framed={scope === "detail"}
        foreground={foreground}
      />
    </div>
  ) : null;
  return (
    <>
      <div
        className="seasonal-paper-atmosphere"
        aria-hidden="true"
        data-active-season={season}
      />
      {foreground ? createPortal(particles, document.body) : particles}
    </>
  );
}
