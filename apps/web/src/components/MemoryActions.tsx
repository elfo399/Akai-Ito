import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronDown,
  Ellipsis,
  MapPin,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { photoUrl } from "../api";
import type { Photo } from "../types";
import "../memory-actions.css";

export default function MemoryActions({
  memoryId,
  photos,
  locatedId,
  diary,
  browseStatus,
  onCinema,
  onPosition,
  onDelete,
}: {
  memoryId: string;
  photos: Photo[];
  locatedId?: string;
  diary: ReactNode;
  browseStatus?: string;
  onCinema: () => void;
  onPosition: (photo: Photo) => void;
  onDelete: () => void;
}) {
  const id = useId(),
    panelId = "memory-actions-" + id;
  const panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  const positionLabel = (photo: Photo) =>
    photo.latitude === null ? "Imposta posizione" : "Modifica posizione";
  return createPortal(
    <div className="memory-floating-tools">
      <button
        ref={trigger}
        type="button"
        className="memory-actions-trigger"
        popoverTarget={panelId}
        aria-label={
          browseStatus
            ? "Azioni del ricordo, " + browseStatus
            : "Azioni del ricordo"
        }
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? (
          <X size={18} />
        ) : browseStatus ? (
          <BookOpen size={18} />
        ) : (
          <Ellipsis size={21} />
        )}
        <span>{browseStatus ?? "Azioni"}</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-labelledby={panelId + "-title"}
        className="memory-actions-panel"
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
      >
        <div className="memory-actions-heading">
          <div>
            <span className="eyebrow">QUESTA PAGINA</span>
            <h2 id={panelId + "-title"}>Un gesto per ricordare</h2>
          </div>
          <button
            type="button"
            className="memory-actions-close"
            aria-label="Chiudi azioni del ricordo"
            popoverTarget={panelId}
            popoverTargetAction="hide"
          >
            <X size={17} />
          </button>
        </div>
        {diary && <div className="memory-diary-action">{diary}</div>}
        {photos.length > 0 && (
          <button
            type="button"
            className="memory-floating-action"
            onClick={() => {
              close();
              onCinema();
            }}
          >
            <Play size={17} />
            Rivivi questo momento
          </button>
        )}
        {locatedId && (
          <Link
            className="memory-floating-action"
            to={"/world?photo=" + locatedId}
            onClick={close}
          >
            <MapPin size={17} />
            Ritrova questo luogo
          </Link>
        )}
        <Link
          className="memory-floating-action"
          to={"/memories/" + memoryId + "/edit"}
          onClick={close}
        >
          <Pencil size={17} />
          Modifica il ricordo
        </Link>
        {photos.length === 1 && (
          <button
            type="button"
            className="memory-floating-action"
            onClick={() => {
              close();
              onPosition(photos[0]);
            }}
          >
            <MapPin size={17} />
            {positionLabel(photos[0]) + " della foto"}
          </button>
        )}
        {photos.length > 1 && (
          <details className="memory-position-menu">
            <summary className="memory-floating-action">
              <MapPin size={17} />
              Posizione delle foto
              <ChevronDown size={15} />
            </summary>
            <div>
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={positionLabel(photo) + " foto " + (index + 1)}
                  onClick={() => {
                    close();
                    onPosition(photo);
                  }}
                >
                  <img src={photoUrl(photo.id)} alt="" loading="lazy" />
                  <span>
                    Fotografia {index + 1}
                    <small>{positionLabel(photo)}</small>
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="memory-actions-divider" />
        <button
          type="button"
          className="memory-floating-action memory-trash-action"
          onClick={() => {
            close();
            onDelete();
          }}
        >
          <Trash2 size={16} />
          Sposta nel cestino
        </button>
      </div>
    </div>,
    document.body,
  );
}
