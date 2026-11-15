import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { savedDiaryScroll, clearDiaryScroll } from "./diary-scroll";
import {
  particleLevel,
  seasonMode,
  type ParticleLevel,
  type SeasonMode,
} from "./seasonal";
import {
  effectiveIntensity,
  motionTokens,
  seasonFor,
  type Intensity,
} from "./experience";
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage is optional. */
  }
}
const Context = createContext<{
  preference: Intensity;
  effective: Intensity;
  systemReduced: boolean;
  seasons: boolean;
  particles: ParticleLevel;
  particleSeason: SeasonMode;
  setParticles: (value: ParticleLevel) => void;
  setParticleSeason: (value: SeasonMode) => void;
  setPreference: (value: Intensity) => void;
  setSeasons: (value: boolean) => void;
}>({
  preference: "full",
  effective: "full",
  systemReduced: false,
  seasons: true,
  particles: "delicate",
  particleSeason: "auto",
  setParticles: () => {},
  setParticleSeason: () => {},
  setPreference: () => {},
  setSeasons: () => {},
});
export const useMotion = () => useContext(Context);
export const useReducedMotion = () => useMotion().effective !== "full";
export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Intensity>(() => {
    const value = read("akai-motion");
    return value === "reduced" || value === "off" ? value : "full";
  });
  const [seasons, setSeasons] = useState(() => read("akai-seasons") !== "off");
  const [particles, setParticles] = useState(() =>
    particleLevel(read("akai-particles")),
  );
  const [particleSeason, setParticleSeason] = useState(() =>
    seasonMode(read("akai-particle-season")),
  );
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const effective = effectiveIntensity(preference, systemReduced);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(media.matches);
    const storage = () => {
      const value = read("akai-motion");
      setPreference(value === "off" || value === "reduced" ? value : "full");
      setSeasons(read("akai-seasons") !== "off");
      setParticles(particleLevel(read("akai-particles")));
      setParticleSeason(seasonMode(read("akai-particle-season")));
    };
    media.addEventListener("change", change);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = effective;
    for (const [key, value] of Object.entries(motionTokens))
      document.documentElement.style.setProperty(
        `--motion-${key}`,
        `${value}ms`,
      );
  }, [effective]);
  return (
    <Context
      value={{
        preference,
        effective,
        systemReduced,
        seasons,
        particles,
        particleSeason,
        setParticles: (value) => {
          setParticles(value);
          save("akai-particles", value);
        },
        setParticleSeason: (value) => {
          setParticleSeason(value);
          save("akai-particle-season", value);
        },
        setPreference: (value) => {
          setPreference(value);
          save("akai-motion", value);
        },
        setSeasons: (value) => {
          setSeasons(value);
          save("akai-seasons", value ? "on" : "off");
        },
      }}
    >
      {children}
    </Context>
  );
}
export function MotionSettings() {
  const motion = useMotion();
  return (
    <section
      className="paper form-paper experience-settings"
      aria-labelledby="experience-settings-title"
    >
      <span className="eyebrow">ASPETTO E MOVIMENTO</span>
      <h2 id="experience-settings-title">Il ritmo del diario</h2>
      <p>
        Scegli come accompagnare i tuoi ricordi. Le preferenze si salvano
        automaticamente su questo dispositivo.
      </p>
      <fieldset className="settings-motion-options">
        <legend>Intensità degli effetti</legend>
        {(
          [
            [
              "full",
              "Completi",
              "Transizioni, sviluppo delle foto e piccoli movimenti.",
            ],
            [
              "reduced",
              "Ridotti",
              "Transizioni discrete, senza zoom o parallasse.",
            ],
            [
              "off",
              "Disattivati",
              "Sfoglia con calma, senza animazioni decorative.",
            ],
          ] as const
        ).map(([value, label, description]) => (
          <label key={value} className="settings-motion-option">
            <input
              type="radio"
              name="motion-intensity"
              value={value}
              checked={motion.preference === value}
              onChange={() => motion.setPreference(value)}
            />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {motion.systemReduced && (
        <p className="tiny" role="status">
          Il sistema richiede movimento ridotto: zoom automatici, parallasse e
          intro e particelle rimangono disattivati anche scegliendo effetti
          completi.
        </p>
      )}
      <label className="experience-checkbox">
        <input
          type="checkbox"
          checked={motion.seasons}
          onChange={(e) => motion.setSeasons(e.target.checked)}
        />
        <span>
          <strong>Atmosfera stagionale dei ricordi</strong>
          <small>
            I colori del diario seguono la stagione di ogni ricordo.
          </small>
        </span>
      </label>
      <p className="settings-preference-note">
        Il movimento ridotto del sistema viene sempre rispettato.
      </p>
    </section>
  );
}
export function useSeason(date?: string) {
  const { seasons } = useMotion();
  return seasons ? seasonFor(date) : "standard";
}
export function SeasonAccent({ date }: { date?: string }) {
  const season = useSeason(date);
  if (season === "standard") return null;
  const names = {
    spring: "Primavera",
    summer: "Estate",
    autumn: "Autunno",
    winter: "Inverno",
  };
  const paths = {
    spring: "M16 28V15M16 19C4 20 5 7 12 10C8 0 24 0 20 10C29 6 30 21 16 19Z",
    summer:
      "M16 2V6M16 26V30M2 16H6M26 16H30M6 6L9 9M23 23L26 26M26 6L23 9M9 23L6 26M23 16A7 7 0 1 1 9 16A7 7 0 1 1 23 16",
    autumn:
      "M6 27L25 7M10 23C-1 4 20 11 27 3C31 19 20 30 10 23ZM14 18L11 12M18 14L24 15",
    winter:
      "M16 2V30M4 9L28 23M4 23L28 9M12 5L16 9L20 5M12 27L16 23L20 27M4 14L9 12L8 7M24 25L23 20L28 18",
  };
  return (
    <span className="season-accent" data-season={season}>
      <svg viewBox="0 0 32 32" aria-hidden="true" fill="none">
        <path d={paths[season]} />
      </svg>
      {names[season]}
    </span>
  );
}
const seenPhotos = new Set<string>();
export function useDevelopPhoto(key: string) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (!image) return;
    delete image.dataset.developed;
    if (seenPhotos.has(key)) return;
    let visible = false;
    const reveal = () => {
      if (!visible || !image.complete || !image.naturalWidth) return;
      image.dataset.developed = "true";
      seenPhotos.add(key);
      observer.disconnect();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25,
        );
        reveal();
      },
      { threshold: 0.25 },
    );
    image.addEventListener("load", reveal);
    observer.observe(image);
    return () => {
      observer.disconnect();
      image.removeEventListener("load", reveal);
    };
  }, [key]);
  return ref;
}
export function usePaperDepth(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      reduced ||
      !matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = element.getBoundingClientRect();
        element.style.setProperty(
          "--depth-x",
          `${((event.clientX - box.left) / box.width - 0.5) * 5}px`,
        );
        element.style.setProperty(
          "--depth-y",
          `${((event.clientY - box.top) / box.height - 0.5) * 4}px`,
        );
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty("--depth-x", "0px");
      element.style.setProperty("--depth-y", "0px");
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", reset);
    return () => {
      reset();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", reset);
    };
  }, [reduced, ready]);
  return ref;
}
export function useKnotReveal(
  ref: RefObject<HTMLElement | null>,
  content?: string,
) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            (entry.target as HTMLElement).dataset.reached = "true";
            observer.unobserve(entry.target);
          }
      },
      { rootMargin: "-10% 0px -30% 0px", threshold: 0.5 },
    );
    root
      .querySelectorAll(".thread-knot")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ref, reduced, content]);
}
export function Intro() {
  const { user } = useAuth(),
    { effective } = useMotion();
  const [visible, setVisible] = useState(false),
    skip = useRef<HTMLButtonElement>(null);
  const complete = useRef(false);
  const dismiss = () => {
    complete.current = true;
    try {
      sessionStorage.setItem("akai-intro", "seen");
    } catch {
      /* Optional storage. */
    }
    setVisible(false);
  };
  useEffect(() => {
    if (!user || effective !== "full") {
      setVisible(false);
      return;
    }
    let seen = complete.current;
    try {
      seen ||= sessionStorage.getItem("akai-intro") === "seen";
    } catch {
      /* Bounded timer also works without storage. */
    }
    if (seen) return;
    setVisible(true);
    const timer = window.setTimeout(dismiss, motionTokens.intro);
    return () => clearTimeout(timer);
  }, [user?.id, effective]);
  useEffect(() => {
    if (!visible) return;
    const opener = document.activeElement;
    skip.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Tab") {
        event.preventDefault();
        skip.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [visible]);
  return visible ? (
    <div
      className="diary-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Benvenuto nel diario"
    >
      <svg viewBox="0 0 500 140" aria-hidden="true">
        <path
          pathLength="1"
          d="M0 90C90 130 120 30 200 65C220 76 238 106 258 100C276 84 300 60 288 43C273 24 251 42 253 59C243 38 214 37 216 56C218 78 250 105 280 91C338 66 401 101 500 73"
        />
      </svg>
      <h1>
        赤い糸 <span>Akai Ito</span>
      </h1>
      <p className="handwritten">
        Ogni ricordo è un nodo nel filo che ci unisce.
      </p>
      <button ref={skip} className="text-link" onClick={dismiss}>
        Salta introduzione
      </button>
    </div>
  ) : null;
}
const positions = new Map<string, number>(),
  timelinePositions = new Map<string, number>();
export function RouteViewport() {
  const location = useLocation();
  const { phase } = useAuth();
  useEffect(() => {
    const old = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = old;
    };
  }, []);
  useLayoutEffect(() => {
    if (phase !== "unlocked") return;
    const url = location.pathname + location.search,
      diaryTarget = savedDiaryScroll(url),
      target =
        diaryTarget ??
        positions.get(location.key) ??
        (location.pathname === "/timeline" ? timelinePositions.get(url) : 0) ??
        0;
    let restored = false,
      frame = 0;
    const track = () => {
      if (!restored) return;
      positions.set(location.key, scrollY);
      if (location.pathname === "/timeline")
        timelinePositions.set(url, scrollY);
    };
    const restore = () => {
      const main = document.getElementById("content");
      if (!main || main.querySelector('.status[role="status"]')) return;
      window.scrollTo({ top: target, behavior: "instant" });
      if (diaryTarget !== null) clearDiaryScroll();
      // URL-backed filters can update the page while their popover stays open.
      // Keep keyboard focus on the field until the user leaves the panel.
      if (!document.activeElement?.closest("[popover]:popover-open"))
        main.focus({ preventScroll: true });
      restored = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    observer.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
    frame = requestAnimationFrame(restore);
    window.addEventListener("scroll", track, { passive: true });
    return () => {
      track();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", track);
    };
  }, [location.key, phase]);
  return null;
}
export const photoTransition = (
  id: string,
  enabled: boolean,
): CSSProperties => ({ viewTransitionName: enabled ? `photo-${id}` : "none" });
