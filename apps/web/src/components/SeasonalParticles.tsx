import { useEffect, useLayoutEffect, useRef } from "react";
import { useMotion } from "../motion";
import {
  particleCount,
  framedParticleX,
  particleTuning,
  transitionLayers,
  type ParticleLayer,
  type ParticleLevel,
  type ParticleSeason,
} from "../seasonal";
import "../seasonal.css";

function shapes() {
  return {
    petals: [
      new Path2D("M0 1C-1 .4-1.1-.4-.35-.95L0-.65 .3-1C1-.5 .9 .4 0 1Z"),
      new Path2D("M0 1C-.9 .5-1-.2-.45-.9L-.1-.65 .15-1C1-.7 1 .5 0 1Z"),
      new Path2D("M0 .9C-1 .2-.7-.7-.1-1L.1-.7 .45-.85C1-.2 .7 .6 0 .9Z"),
    ],
    leaves: [
      new Path2D("M0 1C-1 .3-.9-.4 0-1C.8-.5 1 .3 0 1Z"),
      new Path2D(
        "M0 1L-.25 .5-.75 .55-.6 .15-1-.1-.65-.3-.7-.7-.25-.55 0-1 .2-.55 .7-.7 .6-.25 1-.1 .6 .2 .75 .55 .25 .5Z",
      ),
      new Path2D(
        "M0 1C-.4 .5-.8 .6-.6 .2C-1-.2-.5-.3-.5-.6C-.7-.9-.1-.7 0-1C.2-.7 .7-.9 .5-.5C1-.3 .6 0 .6 .2C.9 .6 .3 .5 0 1Z",
      ),
    ],
    butterflyWing: new Path2D(
      "M0-.25C-.3-1.25-1.25-1.15-1.05-.35C-1.35 .05-.95 .5-.5 .35C-.65 .9-.12 .8 0 .28Z",
    ),
    butterflyBody: new Path2D(
      "M0 .5Q-.04 .1 0-.5M0-.45Q-.12-.7-.3-.72M0-.45Q.12-.7 .3-.72",
    ),
  };
}

/** One canvas, one RAF, two bounded crossfade layers. No React updates per frame. */
export default function SeasonalParticles({
  season,
  level,
  quiet = false,
  preview = false,
  paused = false,
  framed = false,
  foreground = false,
}: {
  season: ParticleSeason;
  level: ParticleLevel;
  quiet?: boolean;
  preview?: boolean;
  paused?: boolean;
  framed?: boolean;
  foreground?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { effective } = useMotion();
  const options = useRef({
    season,
    level,
    quiet,
    preview,
    paused,
    framed,
    foreground,
    reduced: effective === "reduced",
  });
  useLayoutEffect(() => {
    options.current = {
      season,
      level,
      quiet,
      preview,
      paused,
      framed,
      foreground,
      reduced: effective === "reduced",
    };
  }, [season, level, quiet, preview, paused, framed, foreground, effective]);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const paths = shapes();
    let layers: ParticleLayer[] = [],
      target: ParticleSeason = "standard";
    let frame = 0,
      last = 0,
      elapsed = 0,
      width = 0,
      height = 0,
      ratio = 1,
      count = -1;
    let inView = false,
      blocked = false,
      disposed = false;
    let geometryDirty = true,
      gutter = 40;
    let protectedAreas: DOMRect[] = [];
    const invalidateGeometry = () => {
      geometryDirty = true;
    };
    const updateGeometry = () => {
      geometryDirty = false;
      if (!options.current.framed || options.current.foreground) {
        protectedAreas = [];
        return;
      }
      const photo = document
        .querySelector(".detail-page .gallery-photo")
        ?.getBoundingClientRect();
      gutter = photo ? Math.min(photo.left, width - photo.right) - 6 : 32;
      protectedAreas = Array.from(
        document.querySelectorAll(
          ".site-header, .mobile-nav, .detail-header, .detail-page > .back-link, .detail-page > .success, .gallery-photo, .detail-story-block, .detail-story-meta, .photo-location-actions, .detail-page .memory-description, .detail-tools, .diary-browser, .detail-page .modified, .detail-page .no-photos, .comments-section",
        ),
        (node) => node.getBoundingClientRect(),
      ).filter(
        (rect) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < height,
      );
    };
    const runnable = () =>
      !disposed &&
      inView &&
      !blocked &&
      !document.hidden &&
      !options.current.paused &&
      width > 0 &&
      height > 0 &&
      (options.current.season !== "standard" || layers.length > 0);
    const clear = () => ctx.clearRect(0, 0, width, height);
    const draw = (delta: number) => {
      const opts = options.current;
      if (geometryDirty) updateGeometry();
      const amount = particleCount(
        preview ? window.innerWidth : width,
        opts.level,
        opts.reduced,
        opts.quiet,
        opts.season,
      );
      if (target !== opts.season || amount !== count) {
        target = opts.season;
        count = amount;
        layers = transitionLayers(layers, target, count);
        el.dataset.particleCount = String(count);
      }
      clear();
      elapsed += delta;
      const speed = opts.reduced ? 0.55 : opts.level === "delicate" ? 0.8 : 1;
      for (const layer of layers) {
        const incoming = layer.season === target;
        layer.alpha = Math.max(
          0,
          Math.min(
            1,
            layer.alpha + (incoming ? delta : -delta) / particleTuning.fade,
          ),
        );
        const config = particleTuning[layer.season];
        for (let i = 0; i < layer.particles.length; i++) {
          const p = layer.particles[i];
          if (layer.season === "summer") {
            p.y -= (p.speed * speed * delta) / height;
            if (p.y < -0.04) {
              p.y = 1.04;
              p.x = Math.random();
            }
          } else {
            p.y += (p.speed * speed * delta) / height;
            if (p.y > 1.04) {
              p.y = -0.04;
              p.x = Math.random();
            }
          }
          const phase = elapsed * speed * (0.4 + p.depth * 0.25) + p.phase;
          let x = p.x * width + Math.sin(phase) * config.sway * p.depth;
          let y = p.y * height;
          let alpha =
            p.opacity * layer.alpha * (opts.level === "delicate" ? 0.8 : 1);
          if (opts.quiet || opts.reduced) alpha *= 0.75;
          if (layer.season === "summer") {
            x += Math.cos(phase * 0.37) * 14;
            y += Math.sin(phase * 0.52) * 7;
            alpha *= Math.min(
              1,
              Math.max(0, (p.y + 0.02) * 12),
              Math.max(0, (1.02 - p.y) * 12),
            );
          } else {
            alpha *= Math.min(
              1,
              Math.max(0, (p.y + 0.02) * 12),
              Math.max(0, (1.02 - p.y) * 12),
            );
            if (layer.season === "autumn")
              x += Math.sin(phase * 0.38) * 26 + (p.y - 0.5) * 65;
          }
          if (opts.foreground)
            // Spread a few particles across the screen, including the middle,
            // while retaining individual sway instead of forming rigid columns.
            x =
              ((i + 0.18 + p.x * 0.64) / layer.particles.length) * width +
              Math.sin(phase) * config.sway * 0.6;
          else if (opts.framed)
            x = framedParticleX(p.x, i, width, gutter, Math.sin(phase));
          ctx.save();
          ctx.translate(x, y);
          ctx.globalAlpha = alpha;
          ctx.rotate(
            p.angle + elapsed * speed * p.spin + Math.sin(phase) * 0.22,
          );
          const color = config.colors[p.variant % config.colors.length];
          ctx.fillStyle = color;
          if (layer.season === "summer") {
            const size = Math.min(
              p.size,
              opts.framed && width < 600 ? 7.5 : 10,
            );
            const flap = 0.45 + (0.55 * (Math.sin(phase * 2.2) + 1)) / 2;
            ctx.globalAlpha = Math.min(0.86, alpha * 1.55);
            ctx.scale(size, size);
            ctx.save();
            ctx.scale(flap, 1);
            ctx.fill(paths.butterflyWing);
            ctx.scale(-1, 1);
            ctx.fill(paths.butterflyWing);
            ctx.restore();
            ctx.strokeStyle = "#805149";
            ctx.lineWidth = 0.08;
            ctx.lineCap = "round";
            ctx.stroke(paths.butterflyBody);
          } else if (layer.season === "winter") {
            ctx.strokeStyle = "#4f6f88bf";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (p.variant % 3 === 0) {
              ctx.strokeStyle = "#738c9f";
              ctx.lineWidth = 0.75;
              for (let arm = 0; arm < 3; arm++) {
                ctx.rotate(Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(0, -p.size * 1.6);
                ctx.lineTo(0, p.size * 1.6);
                ctx.stroke();
              }
            }
          } else {
            ctx.scale(
              Math.min(p.size, opts.framed && width < 600 ? 8 : Infinity) *
                (0.65 + Math.abs(Math.cos(phase * 0.45)) * 0.35),
              Math.min(p.size, opts.framed && width < 600 ? 8 : Infinity),
            );
            ctx.fill(
              (layer.season === "spring" ? paths.petals : paths.leaves)[
                p.variant % 3
              ],
            );
            if (layer.season === "autumn") {
              ctx.strokeStyle = "#694b3870";
              ctx.lineWidth = 0.065;
              ctx.beginPath();
              ctx.moveTo(0, 1.15);
              ctx.lineTo(0, -0.75);
              ctx.moveTo(0, 0.3);
              ctx.lineTo(-0.4, -0.1);
              ctx.moveTo(0, 0);
              ctx.lineTo(0.35, -0.35);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
      // Desktop detail keeps its protected content. Mobile intentionally floats
      // across photographs and text, with pointer events disabled on the layer.
      if (opts.framed && !opts.foreground) {
        for (const rect of protectedAreas)
          ctx.clearRect(
            rect.left - 5,
            rect.top - 5,
            rect.width + 10,
            rect.height + 10,
          );
      }
      for (let i = layers.length - 1; i >= 0; i--)
        if (layers[i].alpha <= 0 && layers[i].season !== target)
          layers.splice(i, 1);
      if (el.dataset.layers !== String(layers.length))
        el.dataset.layers = String(layers.length);
    };
    const tick = (now: number) => {
      frame = 0;
      if (!runnable()) {
        last = 0;
        el.dataset.running = "false";
        return;
      }
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      // Tolerate sub-millisecond RAF jitter instead of skipping a third 60 Hz frame.
      if (!last || now - last >= 1000 / 30 - 1) {
        last = now;
        draw(delta);
      }
      if (el.dataset.running !== "true") el.dataset.running = "true";
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (runnable()) {
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        el.dataset.running = "false";
      }
    };
    const resize = () => {
      geometryDirty = true;
      const bounds = el.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (width && height) {
        ratio = Math.min(
          window.devicePixelRatio || 1,
          particleTuning.pixelRatio,
          Math.sqrt(particleTuning.maxPixels / (width * height)),
        );
        el.width = Math.max(1, Math.round(width * ratio));
        el.height = Math.max(1, Math.round(height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw(0);
      }
      sync();
    };
    const modal = () => {
      geometryDirty = true;
      blocked = !!document.querySelector("dialog[open], .diary-intro");
      if (blocked) clear();
      sync();
    };
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(el);
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    visibility.observe(el);
    const dialogs = new MutationObserver(modal);
    dialogs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "hidden"],
    });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", invalidateGeometry, { passive: true });
    const contentSize = new ResizeObserver(invalidateGeometry);
    const content = document.getElementById("content");
    if (content) contentSize.observe(content);
    // React props can change while a paused loop is idle.
    const preferences = new MutationObserver(() => {
      geometryDirty = true;
      sync();
    });
    preferences.observe(el, {
      attributes: true,
      attributeFilter: [
        "data-paused",
        "data-season",
        "data-level",
        "data-framed",
        "data-foreground",
      ],
    });
    modal();
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      visibility.disconnect();
      dialogs.disconnect();
      preferences.disconnect();
      contentSize.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", invalidateGeometry);
      clear();
    };
  }, [preview]);
  return (
    <canvas
      ref={canvas}
      className="seasonal-canvas"
      aria-hidden="true"
      data-season={season}
      data-level={level}
      data-paused={paused}
      data-framed={framed}
      data-foreground={foreground}
    />
  );
}
