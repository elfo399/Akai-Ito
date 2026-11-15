import { useEffect, useState } from "react";
import { seasonFor } from "./experience";
import {
  localCivilDate,
  particleTuning,
  selectActiveMemory,
  type ParticleSeason,
} from "./seasonal";

export type SeasonScope = "current" | "timeline" | "detail" | "album" | "none";
/** Read only the existing page markers. No queries, per-frame state or extra timeline. */
export function useActiveSeason(
  scope: SeasonScope,
  pageKey: string,
  enabled: boolean,
) {
  const [active, setActive] = useState<{
    key: string;
    season: ParticleSeason;
  }>();
  const key = scope + ":" + pageKey;
  const fallback =
    scope === "current" || scope === "album"
      ? seasonFor(localCivilDate())
      : "standard";
  useEffect(() => {
    if (!enabled || scope === "none") return;
    let evaluateTimer = 0,
      settleTimer = 0,
      midnight = 0;
    let selected = "",
      candidate = "",
      disposed = false;
    const main = document.getElementById("content");
    if (!main) return;
    const selector =
      scope === "detail"
        ? ".detail-page[data-particle-date]"
        : scope === "timeline"
          ? ".timeline .memory-card[data-particle-date]"
          : ".memory-card[data-particle-date]";
    let nodes: HTMLElement[] = [];
    const publish = (season: ParticleSeason) =>
      setActive((previous) =>
        previous?.key === key && previous.season === season
          ? previous
          : { key, season },
      );
    const evaluate = () => {
      if (disposed || document.hidden) return;
      if (scope === "current") {
        publish(seasonFor(localCivilDate()));
        return;
      }
      const items = nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          id: node.dataset.particleId ?? "detail",
          date: node.dataset.particleDate ?? "",
          top: bounds.top,
          bottom: bounds.bottom,
        };
      });
      const next =
        scope === "detail"
          ? items[0]
          : selectActiveMemory(items, window.innerHeight, selected);
      // Keep the last atmosphere while crossing the space between two pages.
      if (!next && nodes.length) return;
      const nextId = next?.id ?? "",
        season = next ? seasonFor(next.date) : fallback;
      const signature = nextId + ":" + season;
      if (signature === candidate) return;
      candidate = signature;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        selected = nextId;
        publish(season);
      }, particleTuning.settle);
    };
    const schedule = () => {
      window.clearTimeout(evaluateTimer);
      window.clearTimeout(settleTimer);
      candidate = "";
      evaluateTimer = window.setTimeout(evaluate, 90);
    };
    const intersection = new IntersectionObserver(schedule, {
      rootMargin: "-20% 0px -20% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    const discover = () => {
      const next = Array.from(main.querySelectorAll<HTMLElement>(selector));
      if (
        next.length === nodes.length &&
        next.every((node, i) => node === nodes[i])
      )
        return;
      intersection.disconnect();
      nodes = next;
      nodes.forEach((node) => intersection.observe(node));
      schedule();
    };
    const mutations = new MutationObserver(() => {
      discover();
      schedule();
    });
    if (scope !== "current") {
      mutations.observe(main, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-particle-date"],
      });
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      discover();
    }
    const dayChange = () => {
      if (scope === "current" || (scope === "album" && !nodes.length))
        publish(seasonFor(localCivilDate()));
      const now = new Date(),
        next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = window.setTimeout(
        dayChange,
        next.getTime() - now.getTime() + 100,
      );
    };
    const visible = () => {
      if (!document.hidden) {
        schedule();
        window.clearTimeout(midnight);
        dayChange();
      }
    };
    document.addEventListener("visibilitychange", visible);
    dayChange();
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(evaluateTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(midnight);
      intersection.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [key, scope, enabled, fallback]);
  return active?.key === key ? active.season : fallback;
}
