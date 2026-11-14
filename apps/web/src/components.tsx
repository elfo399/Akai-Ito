import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useViewTransitionState } from "react-router-dom";
import { MotionLink as Link, MemoryLink } from "./navigation";
import {
  BookHeart,
  Heart,
  Home,
  Images,
  Settings,
  Plus,
  ArrowUpRight,
  Image as ImageIcon,
  MessageCircle,
  LogOut,
  LoaderCircle,
  RefreshCcw,
  Globe2,
} from "lucide-react";
import { useAuth } from "./auth";
import { formatDate, photoUrl } from "./api";
import type { MemoryCardData } from "./types";
import { ThreadMark, WashiTape } from "./scrapbook";
import {
  Intro,
  SeasonAccent,
  photoTransition,
  useDevelopPhoto,
  useMotion,
  useSeason,
} from "./motion";
export function Thread({ className = "" }: { className?: string }) {
  return (
    <svg
      className={"red-thread " + className}
      viewBox="0 0 500 130"
      fill="none"
      aria-hidden="true"
    >
      <path d="M-20 100C90 146 98 27 183 57S283 131 325 63c27-51-24-49-31-21-8-29-57-24-33 9 18 22 66 31 104 28s73-25 154-4" />
    </svg>
  );
}
export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Akai Ito, home">
      <span className="brand-mark">
        <ThreadMark />
      </span>
      <span className="brand-letters">
        AKAI ITO<small>赤い糸 · Il nostro filo rosso</small>
      </span>
    </Link>
  );
}
const links = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/timeline", icon: BookHeart, label: "Timeline" },
  { to: "/albums", icon: Images, label: "Album" },
  { to: "/world", icon: Globe2, label: "Il nostro mondo" },
  { to: "/settings", icon: Settings, label: "Impostazioni" },
];
export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const transitioning = useViewTransitionState(pathname);
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useTransientError();
  const isActive = (to: string) =>
    to === "/"
      ? pathname === "/"
      : pathname.startsWith(to) ||
        (to === "/timeline" && pathname.startsWith("/memories")) ||
        (to === "/settings" && pathname === "/trash");
  return (
    <>
      <Intro />
      <a className="skip" href="#content">
        Vai al contenuto
      </a>
      <header className="site-header">
        <Logo />
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {links.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={isActive(to) ? "active" : ""}
              aria-current={isActive(to) ? "page" : undefined}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-user">
          <Avatar id={user!.id} name={user!.name} avatar={user!.avatar} />
          <span>{user!.name}</span>
          <button
            className="icon-button"
            title="Esci"
            aria-label="Esci"
            onClick={() =>
              void logout().catch((e) => setLogoutError(e.message))
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      {logoutError && (
        <p role="alert" className="error">
          {logoutError}
        </p>
      )}
      <main
        id="content"
        tabIndex={-1}
        className={transitioning ? "route-transitioning" : ""}
      >
        {children}
      </main>
      <footer>
        <span>赤い糸</span> Ogni ricordo è un nodo nel filo che ci unisce.
        <Heart size={14} />
      </footer>
      <nav className="mobile-nav" aria-label="Navigazione mobile">
        {links.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={isActive(to) ? "active" : ""}
            aria-current={isActive(to) ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
import { useState } from "react";
export function useTransientError(): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  return [value, setValue];
}
export function Avatar({
  id,
  name,
  avatar,
}: {
  id: string;
  name: string;
  avatar: string | null;
}) {
  return avatar ? (
    <img className="avatar" src={`/api/avatars/${id}`} alt={name} />
  ) : (
    <span className="avatar initials" aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Loading() {
  return (
    <div className="status" role="status">
      <LoaderCircle className="spin" /> Sfogliamo il diario…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="status" role="alert">
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCcw size={16} />
          Riprova
        </button>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p className="handwritten">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function AddMemory({ first = false }: { first?: boolean }) {
  return (
    <Link className="button" to="/memories/new">
      <Plus size={18} />
      {first ? "Aggiungi il nostro primo ricordo" : "Aggiungi un ricordo"}
    </Link>
  );
}
export function Empty({
  title = "Ogni storia comincia con un primo ricordo.",
  text = "Un giorno speciale, un piccolo viaggio, una domenica qualunque. Qui c’è spazio per tutto ciò che siamo.",
  action = true,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  return (
    <section className="empty paper">
      <div className="empty-drawing">
        <BookHeart size={66} strokeWidth={1} />
        <Thread />
      </div>
      <span className="eyebrow">Una pagina ancora da scrivere</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <AddMemory first />}
    </section>
  );
}
export function MemoryCard({ memory }: { memory: MemoryCardData }) {
  const { effective } = useMotion();
  const season = useSeason(memory.eventDate);
  const develop = useDevelopPhoto(memory.coverId ?? memory.id);
  return (
    <MemoryLink
      memoryId={memory.id}
      photoId={memory.coverId}
      className="memory-card polaroid"
      data-season={season}
    >
      <WashiTape rose />
      <div className="photo-frame">
        {memory.coverId ? (
          <img
            src={photoUrl(memory.coverId)}
            alt={memory.title}
            loading="lazy"
            ref={develop}
            className="photo-develop"
            style={photoTransition(memory.id, effective === "full")}
          />
        ) : (
          <div className="photo-placeholder">
            <BookHeart size={48} strokeWidth={1} />
            <span>Un momento da custodire</span>
          </div>
        )}
        <span className="category-label">{memory.category}</span>
      </div>
      <div className="polaroid-caption">
        <span className="date">{formatDate(memory.eventDate)}</span>
        <SeasonAccent date={memory.eventDate} />
        <h3>
          {memory.title}
          <ArrowUpRight size={18} />
        </h3>
        <p>{memory.description}</p>
        <div className="card-meta">
          <span>Di {memory.author}</span>
          <span>
            <ImageIcon size={14} aria-hidden="true" />
            <span aria-label={`${memory.photoCount} fotografie`}>
              {memory.photoCount}
            </span>
            <MessageCircle size={14} aria-hidden="true" />
            <span aria-label={`${memory.commentCount} commenti`}>
              {memory.commentCount}
            </span>
          </span>
        </div>
      </div>
    </MemoryLink>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const opener = document.activeElement;
    el.showModal();
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = bodyOverflow;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className="dialog paper"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
