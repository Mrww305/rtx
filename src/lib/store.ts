import { useSyncExternalStore } from "react";

/* ────────────────────────────────────────────────────────────────────────
   GRAVITON/01 — shared state.
   Two stores: `settings` (user intent, written by the HUD control surface)
   and `telemetry` (simulation readouts, throttled ~4 Hz from the Canvas).
   A mutable `pointerField` singleton is read directly by the physics
   useFrame loop — zero React re-renders on pointer movement.
   ──────────────────────────────────────────────────────────────────────── */

export type FieldMode = "repel" | "attract";

export interface Settings {
  mode: FieldMode;
  fieldRadius: number; // world units, clamped 1..9
  fieldPower: number; // 0..2
  gravity: number; // -4..4 (positive pulls down)
  swirl: number; // 0..1 ambient tangential drift
  paused: boolean;
  audioConsented: boolean;
  audioMuted: boolean;
  sceneReady: boolean;
}

export interface Telemetry {
  fps: number;
  bodies: number;
  camAzimuth: number; // degrees
  cursor: [number, number, number];
  audioLevel: number; // 0..1 RMS from analyser
  engine: string;
}

function createStore<T extends object>(initial: T) {
  let state: T = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const settingsStore = createStore<Settings>({
  mode: "repel",
  fieldRadius: 4.2,
  fieldPower: 1.0,
  gravity: -0.9,
  swirl: 0.35,
  paused: false,
  audioConsented: false,
  audioMuted: false,
  sceneReady: false,
});

export const telemetryStore = createStore<Telemetry>({
  fps: 0,
  bodies: 48,
  camAzimuth: 0,
  cursor: [0, 0, 0],
  audioLevel: 0,
  engine: "rapier3d · wasm",
});

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

export function useTelemetry(): Telemetry {
  return useSyncExternalStore(telemetryStore.subscribe, telemetryStore.get);
}

/* ── pointer force-field singleton (read inside useFrame, never in render) ── */
export const pointerField = {
  x: 0,
  y: 0,
  z: 0,
  active: false, // pointer currently over the canvas
  downAt: -1, // performance.now() of last press → radial pulse
  scatterAt: -1, // performance.now() of last scatter command
};


