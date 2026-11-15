import { useLocation } from "react-router-dom";
import { useMotion } from "../motion";
import { particlesEnabled } from "../seasonal";
import { useActiveSeason, type SeasonScope } from "../useActiveSeason";
import SeasonalParticles from "./SeasonalParticles";

export default function SeasonalAtmosphere() {
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
  return (
    <>
      <div
        className="seasonal-paper-atmosphere"
        aria-hidden="true"
        data-active-season={season}
      />
      {enabled && (
        <div
          className="seasonal-atmosphere"
          aria-hidden="true"
          data-active-season={season}
          data-particle-scope={scope}
        >
          <SeasonalParticles
            season={season}
            level={motion.particles}
            quiet={scope === "current" || scope === "album"}
            framed={scope === "detail"}
          />
        </div>
      )}
    </>
  );
}
