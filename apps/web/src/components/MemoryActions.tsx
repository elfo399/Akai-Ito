import { type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  MapPin,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { photoUrl } from "../api";
import type { Photo } from "../types";
import FloatingActions from "./FloatingActions";

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
  const positionLabel = (photo: Photo) =>
    photo.latitude === null ? "Imposta posizione" : "Modifica posizione";
  return (
    <FloatingActions
      label="Azioni del ricordo"
      title="Un gesto per ricordare"
      eyebrow="QUESTA PAGINA"
      status={browseStatus}
      icon={browseStatus ? <BookOpen size={18} /> : undefined}
    >
      {(close) => (
        <>
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
        </>
      )}
    </FloatingActions>
  );
}
