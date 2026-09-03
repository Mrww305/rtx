import { lazy, Suspense } from "react";
import HUD from "./components/HUD";
import LoadingHUD from "./components/LoadingHUD";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { useSettings } from "./lib/store";

/* ────────────────────────────────────────────────────────────────────────
   GRAVITON/01 — composition root.
   The WebGL/physics bundle is lazy-loaded (the Vite analogue of Next.js
   `next/dynamic(..., { ssr: false })`): the HUD shell + boot wireframe
   paint on the first byte, the heavy client chunk streams in afterwards,
   and the two crossfade — protecting FCP, LCP and CLS.
   ──────────────────────────────────────────────────────────────────────── */
const SceneCanvas = lazy(() => import("./components/SceneCanvas"));

export default function App() {
  useViewportHeight();
  const { sceneReady } = useSettings();

  return (
    <main className="stage-h grain relative w-full overflow-hidden bg-void font-body text-ink">
      {/* static boot wireframe — visible until the canvas reports ready */}
      <div
        aria-hidden={sceneReady}
        className={`absolute inset-0 z-0 transition-opacity duration-700 ${
          sceneReady ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <LoadingHUD />
      </div>

      {/* browser-only WebGL/rapier bundle */}
      <div
        className={`absolute inset-0 z-[1] cursor-none transition-opacity duration-1000 ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <Suspense fallback={null}>
          <SceneCanvas />
        </Suspense>
      </div>

      {/* cinematic vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 42%, transparent 55%, rgba(3,6,10,0.55) 100%)",
        }}
      />

      {/* DOM overlay — paints instantly, owns LCP */}
      <HUD />
    </main>
  );
}
