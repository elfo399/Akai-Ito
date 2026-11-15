import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, X } from "lucide-react";
import "../memory-actions.css";

export default function FloatingActions({
  label,
  title,
  eyebrow,
  status,
  triggerText = "Azioni",
  icon,
  triggerRef,
  panelClassName = "",
  children,
}: {
  label: string;
  title: string;
  eyebrow: string;
  status?: string;
  triggerText?: string;
  icon?: ReactNode;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const id = useId(),
    panelId = "floating-actions-" + id;
  const panel = useRef<HTMLDivElement>(null),
    localTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? localTrigger;
  const [open, setOpen] = useState(false);
  const close = () => {
    if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  return createPortal(
    <div className="memory-floating-tools">
      <button
        ref={trigger}
        type="button"
        className="memory-actions-trigger"
        popoverTarget={panelId}
        aria-label={status ? label + ", " + status : label}
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? <X size={18} /> : (icon ?? <Ellipsis size={21} />)}
        <span>{status ?? triggerText}</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-labelledby={panelId + "-title"}
        className={"memory-actions-panel " + panelClassName}
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
      >
        <div className="memory-actions-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={panelId + "-title"}>{title}</h2>
          </div>
          <button
            type="button"
            className="memory-actions-close"
            aria-label={"Chiudi " + label.toLocaleLowerCase("it-IT")}
            onClick={close}
          >
            <X size={17} />
          </button>
        </div>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
