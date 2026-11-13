import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "./auth";
import { formatDate, photoUrl } from "./api";
import type { MemoryCardData } from "./types";
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
        赤い糸
        <Thread />
      </span>
      <span className="brand-letters">
        AKAI ITO<small>Il diario del nostro filo rosso.</small>
      </span>
    </Link>
  );
}
const links = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/timeline", icon: BookHeart, label: "Timeline" },
  { to: "/albums", icon: Images, label: "Album" },
  { to: "/settings", icon: Settings, label: "Impostazioni" },
];
export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useTransientError();
  return (
    <>
      <a className="skip" href="#content">
        Vai al contenuto
      </a>
      <header className="site-header">
        <Logo />
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {links.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={pathname === to ? "active" : ""}>
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
      <main id="content">{children}</main>
      <footer>
        <span>赤い糸</span> Ogni ricordo è un nodo nel filo che ci unisce.
        <Heart size={14} />
      </footer>
      <nav className="mobile-nav" aria-label="Navigazione mobile">
        {links.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={pathname === to ? "active" : ""}>
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
  return (
    <Link to={`/memories/${memory.id}`} className="memory-card polaroid">
      <span className="tape" />
      <div className="photo-frame">
        {memory.coverId ? (
          <img
            src={photoUrl(memory.coverId)}
            alt={memory.title}
            loading="lazy"
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
        <h3>
          {memory.title}
          <ArrowUpRight size={18} />
        </h3>
        <p>{memory.description}</p>
        <div className="card-meta">
          <span>Di {memory.author}</span>
          <span>
            <ImageIcon size={13} />
            {memory.photoCount}
            <MessageCircle size={13} />
            {memory.commentCount}
          </span>
        </div>
      </div>
    </Link>
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
    el.showModal();
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = bodyOverflow;
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
