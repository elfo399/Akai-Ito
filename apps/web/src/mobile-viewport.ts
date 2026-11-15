import { useEffect } from "react";

export function viewportMetrics(input: {
  layoutHeight: number;
  visualHeight: number;
  visualTop: number;
  referenceHeight: number;
  editing: boolean;
  mobile: boolean;
}) {
  const bottom = Math.max(
    0,
    input.layoutHeight - input.visualHeight - input.visualTop,
  );
  // Toolbars alone should not hide navigation. A large shrink plus an editable
  // field is a keyboard hint, for both visual-only and content-resizing browsers.
  const keyboard =
    input.mobile &&
    input.editing &&
    input.referenceHeight - input.visualHeight >
      Math.max(150, input.referenceHeight * 0.22);
  return { bottom, keyboard };
}

export function displayMode(standaloneMedia: boolean, iosStandalone?: boolean) {
  return standaloneMedia || iosStandalone ? "standalone" : "browser";
}

export function useMobileViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const standalone = matchMedia("(display-mode: standalone)");
    const mobile = matchMedia("(max-width: 1000px) and (pointer: coarse)");
    let referenceHeight = window.innerHeight,
      previousWidth = window.innerWidth;
    let frame = 0;
    let nav: Element | null = null;
    const update = () => {
      frame = 0;
      root.dataset.displayMode = displayMode(
        standalone.matches,
        (navigator as Navigator & { standalone?: boolean }).standalone,
      );
      // Do not counteract pinch zoom or change the user's zoom scale.
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const active = document.activeElement;
      const editing =
        (active instanceof HTMLTextAreaElement && !active.readOnly) ||
        (active instanceof HTMLInputElement &&
          !active.readOnly &&
          /^(text|search|email|url|tel|password|number)$/.test(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);
      const height = viewport?.height ?? window.innerHeight;
      if (Math.abs(window.innerWidth - previousWidth) > 80) {
        referenceHeight = window.innerHeight;
        previousWidth = window.innerWidth;
      }
      if (!editing)
        referenceHeight = Math.max(referenceHeight, window.innerHeight, height);
      const { bottom, keyboard } = viewportMetrics({
        layoutHeight: window.innerHeight,
        visualHeight: height,
        visualTop: viewport?.offsetTop ?? 0,
        referenceHeight,
        editing,
        mobile: mobile.matches,
      });
      root.style.setProperty("--visual-height", `${height}px`);
      root.style.setProperty("--visual-top", `${viewport?.offsetTop ?? 0}px`);
      root.style.setProperty("--viewport-bottom", `${bottom}px`);
      root.dataset.keyboardOpen = String(keyboard);
      const current = document.querySelector(".mobile-nav");
      if (current !== nav) {
        resize.disconnect();
        nav = current;
        if (nav) resize.observe(nav);
      }
      root.style.setProperty(
        "--navigation-height",
        `${Math.ceil(nav?.getBoundingClientRect().height ?? 0)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
    for (const name of ["resize", "orientationchange"])
      window.addEventListener(name, schedule);
    for (const name of ["focusin", "focusout"])
      document.addEventListener(name, schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    standalone.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      for (const name of ["resize", "orientationchange"])
        window.removeEventListener(name, schedule);
      for (const name of ["focusin", "focusout"])
        document.removeEventListener(name, schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      standalone.removeEventListener("change", schedule);
      for (const property of [
        "--visual-height",
        "--visual-top",
        "--viewport-bottom",
        "--navigation-height",
      ])
        root.style.removeProperty(property);
      delete root.dataset.keyboardOpen;
      delete root.dataset.displayMode;
    };
  }, []);
}
