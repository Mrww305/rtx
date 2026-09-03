import { useEffect } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Edge-friendly dynamic viewport fix.
   CSS owns the first paint via `height: 100dvh` (see `.stage-h` in
   index.css). This hook layers an exact `--vh` custom property on top for
   older mobile browsers — strictly inside useEffect so no browser API is
   ever touched during server rendering.
   ──────────────────────────────────────────────────────────────────────── */
export function useViewportHeight() {
  useEffect(() => {
    const el = document.documentElement;

    const set = () => {
      el.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    };
    set();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(set);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
}
