import { useEffect, useRef, useState, type ReactNode } from "react";

/** The same open-ended knot is used on the cover, navigation and favicon. */
export function ThreadMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={"thread-mark " + className}
      viewBox="0 0 88 64"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 49C15 56 28 49 37 39C45 30 47 16 36 15C23 13 20 27 31 36L44 47C52 39 67 30 64 21C60 9 45 14 44 25C43 36 56 51 70 46C79 43 77 35 72 36C66 37 72 48 86 43" />
    </svg>
  );
}

export function WashiTape({ rose = false }: { rose?: boolean }) {
  return (
    <span className={"tape" + (rose ? " tape-rose" : "")} aria-hidden="true" />
  );
}

export function PaperCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={"paper " + className}>{children}</div>;
}

/** Re-measure only when content resizes. The thread passes through every knot. */
export function TimelineThread() {
  const ref = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState({ path: "M40 0V100", height: 100 });
  useEffect(() => {
    const container = ref.current!.parentElement!;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const height = container.clientHeight;
      const points = [
        0,
        ...Array.from(container.querySelectorAll(".thread-knot")).map(
          (node) => {
            const box = node.getBoundingClientRect();
            return box.top - bounds.top + box.height / 2;
          },
        ),
        height,
      ];
      let path = "M40 0";
      points.slice(1).forEach((y, index) => {
        const previous = points[index];
        const bend = index % 2 ? 22 : -22;
        path += `C${40 + bend} ${previous + (y - previous) / 3},${40 - bend} ${previous + ((y - previous) * 2) / 3},40 ${y}`;
      });
      setDrawing({ path, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <svg
      ref={ref}
      className="timeline-thread"
      viewBox={`0 0 80 ${drawing.height}`}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path className="thread-shadow" d={drawing.path} />
      <path className="thread-ink" d={drawing.path} pathLength="1" />
    </svg>
  );
}

export function StoryEnding() {
  return (
    <div className="thread-ending">
      <svg
        className="story-bridge"
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 0C0 45 50 5 50 50" />
      </svg>
      <svg viewBox="0 0 160 130" fill="none" aria-hidden="true">
        <path d="M80 0C52 19 108 32 80 53C64 65 47 60 51 78C55 93 79 107 80 107C84 104 113 87 109 73C105 58 83 59 80 75C77 62 57 61 53 73" />
      </svg>
      <p className="handwritten">
        Il nostro filo ha ancora infinite storie da raccontare...
      </p>
      <span className="eyebrow">E NOI, TUTTO IL TEMPO PER VIVERLE.</span>
    </div>
  );
}
