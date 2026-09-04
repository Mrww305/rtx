# GRAVITON/01 — Interactive Physics Field

> A dark, moody WebGL field experiment: **48 rigid bodies** drifting in a zero-gravity simulation,
> pushed and pulled by a **cursor force-field**, wrapped in a **positional spatial-audio drone**,
> with live telemetry, a GSAP title sequence, and an SSR-safe architecture ported 1:1 to Next.js
> for Vercel deployment.

**Status:** production build green · single-pass render · zero console errors · all parameters clamped

---

## Contents

1. [Concept](#concept)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Requirement → Implementation Map](#requirement--implementation-map)
6. [Interaction Guide](#interaction-guide)
7. [Control Surface Reference](#control-surface-reference)
8. [Performance Engineering](#performance-engineering)
9. [Audio & Autoplay Policy](#audio--autoplay-policy)
10. [Design System](#design-system)
11. [Engineering Safeguards](#engineering-safeguards)
12. [Getting Started](#getting-started)
13. [Vercel / Next.js Port](#vercel--nextjs-port)
14. [Known Limits](#known-limits)

---

## Concept

GRAVITON/01 is a **n-body drift chamber**. There is no floor physics, no win state — the scene is a
living instrument. A molten kinematic cluster (icosahedron core + wireframe shell + orbital rings)
emits a procedural drone that pans, Doppler-free but **positionally accurate** in 3D as you orbit.
Everything else — graphite shards, molten-ember accents, glacier-cyan satellites — responds to your
cursor through a real physics integrator, not a shader trick.

The piece opens on a **boot wireframe** (a static HTML skeleton that mirrors the final HUD 1:1),
then crossfades into the live field with a GSAP line-mask + scramble-decode title sequence.

---

## Tech Stack

| Layer        | Technology                                             | Version    | Role                                        |
| ------------ | ------------------------------------------------------ | ---------- | ------------------------------------------- |
| Runtime      | React                                                  | `18.2`     | UI + R3F reconciler                         |
| Bundler      | Vite                                                   | `6.4`      | Code-splitting, dev server, prod build      |
| Styling      | Tailwind CSS (v4, `@theme` tokens)                     | `4.1.17`   | Design system, HUD chrome                   |
| 3D           | three.js                                               | `^0.170`   | Renderer, `AudioListener`/`PositionalAudio` |
| React-3D     | `@react-three/fiber`                                   | `^8.18`    | Declarative scene graph (React 18 line)     |
| Helpers      | `@react-three/drei`                                    | `^9.122`   | `Environment`, `Stars`, `Sparkles`, controls |
| Physics      | `@react-three/rapier` (WASM)                           | `^1.5`     | 48-body zero-G simulation                   |
| Motion       | GSAP                                                   | `3.13`     | Title masks, scramble decode, intro timeline|
| Fonts        | Unbounded (display) · Space Grotesk (body)             | Google, `display=swap` | Identity, zero CLS             |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  App.tsx  (composition root — instant first paint)                 │
│  ├─ LoadingHUD            ← static wireframe, mirrors final HUD    │
│  │     (visible until sceneReady, crossfades out — near-zero CLS)  │
│  ├─ HUD                   ← DOM chrome: telemetry, sliders, title  │
│  │     ├─ useIntro()      ← GSAP timeline (layout-effect masked)   │
│  │     ├─ CursorRig()     ← lerped reticle (fine pointers only)    │
│  │     └─ AudioConsentGateway  ← gesture gate, mounts audio        │
│  └─ React.lazy(SceneCanvas)  ← Vite analogue of next/dynamic       │
│        ssr:false ─── separate 1 MB chunk, streams after LCP        │
│                                                                    │
│  SceneCanvas.tsx  ('client' WebGL entry)                           │
│  ├─ Canvas  dpr [1,1.75] · ACESFilmic · fog #06090d                │
│  ├─ Environment frames={1}   ← in-memory Lightformers (no HDR GET) │
│  ├─ OrbitControls + key-light rig + Stars/Sparkles                 │
│  └─ <Suspense> → InteractivePhysicsWorld                          │
│        ├─ Physics  gravity [0,0,0] · paused? · interpolate         │
│        ├─ ForceField    ← useFrame integrator, zero re-renders     │
│        │     reads pointerField{} + settingsStore{} per tick       │
│        ├─ Cluster       ← kinematicPosition emitter                │
│        │     └─ SpatialAudio → THREE.PositionalAudio on camera     │
│        ├─ NodeMesh ×48  ← RapierRigidBody, refs in flat array      │
│        └─ TelemetryProbe ← 2 Hz → telemetryStore                   │
│                                                                    │
│  Data plane (no React in the hot path)                             │
│  ├─ lib/store.ts        useSyncExternalStore settings/telemetry    │
│  ├─ lib/audioEngine.ts  OfflineAudioContext drone, ping synth      │
│  └─ lib/pointerField.ts mutable {x,y,z,active,downAt,scatterAt}    │
└────────────────────────────────────────────────────────────────────┘
```

**Golden rule of the build:** React renders the *UI*; `useFrame` mutates the *world*. Sliders write
to a synchronous store, the physics loop reads it directly at 60 Hz — no per-frame `setState`,
no prop drilling into 48 bodies.

---

## Project Structure

```
├── index.html                        # preload fonts, inline dark bg, metadata (CLS/FOUC-safe)
├── VERCEL_NEXTJS.md                  # ★ Next.js 14 App Router port: layout/page/canvas/physics
├── src/
│   ├── main.tsx                      # root mount
│   ├── App.tsx                       # lazy canvas + Suspense + HUD + overlays
│   ├── index.css                     # Tailwind v4 @theme, keyframes, grain, slider skin
│   ├── hooks/
│   │   └── useViewportHeight.ts      # 100dvh CSS + --vh JS fallback (useEffect-only)
│   ├── lib/
│   │   ├── store.ts                  # pub/sub stores + useSyncExternalStore hooks
│   │   ├── pointerField.ts           # mutable per-frame pointer state
│   │   └── audioEngine.ts            # procedural drone buffer + impulse synth
│   └── components/
│       ├── SceneCanvas.tsx           # WebGL entry — camera, IBL, lights, controls
│       ├── InteractivePhysicsWorld.tsx # Physics, ForceField, Cluster, probe
│       ├── SpatialAudio.tsx          # AudioListener + PositionalAudio + analyser
│       ├── HUD.tsx                   # telemetry, sliders, GSAP intro, consent gate
│       └── LoadingHUD.tsx            # boot wireframe (Suspense fallback)
```

---

## Requirement → Implementation Map

### 1 · SSR Isolation & Dynamic Imports
`App.tsx` loads the canvas through `React.lazy()` inside `<Suspense fallback={<LoadingHUD/>}>` —
the exact Vite equivalent of `next/dynamic({ ssr: false })`. WebGL, Rapier WASM and Web Audio never
execute outside the browser, and the 3D chunk (~1 MB gzip) is fully code-split behind first paint.
The `VERCEL_NEXTJS.md` reference shows the literal `next/dynamic` + `loading:` port.

### 2 · Static Asset Pipeline
Nothing heavy is fetched at runtime: the IBL is generated in-memory via drei `Environment` +
`Lightformers` (`frames={1}`, rendered once), and the drone is synthesized with
`OfflineAudioContext` into a seamless crossfaded loop buffer. Every async boundary is wrapped in
`<Suspense>`, so **FCP is owned by the static shell** (index.html inlines the dark background to
kill white-flash).

### 3 · Edge-Friendly Viewport
`.stage-h` = `height: 100dvh` (native, no flicker) + `var(--vh, 1vh) * 100` fallback computed in
`useViewportHeight()` — strictly inside `useEffect`, throttled with `requestAnimationFrame`.

### 4 · Physics & Positional Spatial Audio
- `ForceField` raycasts the pointer onto the world `z=0` plane and integrates
  attract/repel forces (quadratic falloff), a live gravity slider, ambient swirl, containment
  shell, centering spring, press-impulses and scatter kicks — all **clamped**.
- `SpatialAudio` attaches a `THREE.AudioListener` to the live camera (so the positional mix
  tracks every orbit move — the router/camera-state mapping), rebuilds the listener's gain bus on
  the **gesture-unlocked context**, and binds a `PositionalAudio` drone to the emitter cluster.
  An analyser feeds the HUD level meter.

---

## Interaction Guide

| Input                          | Effect                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| **Move cursor**                | Force-field pushes/pulls every body inside its radius          |
| **Press (canvas)**             | Radial impulse shockwave + impulse ping                        |
| **Drag**                       | Orbit camera (spatial audio re-pans in real time)              |
| **Scroll**                     | Dolly zoom                                                     |
| **REPEL / ATTRACT**            | Inverts the field sign                                         |
| **SCATTER**                    | Chaotic radial kick on all 48 bodies                           |
| **PAUSE / RESUME**             | Freezes the integrator (rendering continues)                   |
| **Enable spatial audio**       | Consent gate → context unlock → drone + level meter            |

---

## Control Surface Reference

| Parameter     | Range      | Default | Clamped in | Effect                                |
| ------------- | ---------- | ------- | ---------- | ------------------------------------- |
| field radius  | 1 – 9      | 4.2     | ✔ store + loop | Reach of the cursor force           |
| field power   | 0 – 2      | 1.0     | ✔          | Force magnitude (× mass-normalized)   |
| gravity y     | −4 – 4     | 0       | ✔          | World −Y bias (rain / float)          |
| swirl         | 0 – 1      | 0.35    | ✔          | Tangential drift around the cluster   |
| paused        | bool       | false   | —          | Physics `paused` prop                 |
| mode          | enum       | repel   | —          | Field sign                            |
| audioMuted    | bool       | false   | —          | Master bus gain 0                     |

All numeric parameters pass through `clamp()` **at the store boundary and again in the integrator**
— a malformed slider value can never destabilize the simulation.

---

## Performance Engineering

- **LCP is static.** The server shell (wordmark, boot readout, grid) paints with zero JS
  dependencies; the WebGL chunk hydrates behind it.
- **CLS ≈ 0.** `LoadingHUD` is a 1:1 skeleton of the final HUD; fonts use `display=swap` with
  preloaded `&text=`-free WOFF2 and explicit metrics in CSS.
- **Zero per-frame allocations of React work.** Forces are integrated from flat ref arrays;
  stores are read synchronously inside `useFrame`.
- **DPR clamp `[1, 1.75]`** — retina without melting integrated GPUs.
- **`canSleep={false}` + energy governor** (`MAX_SPEED = 6.5`) keep the zero-G cloud stable and
  responsive even after minutes of input.
- **Telemetry throttled to 2 Hz** so the HUD never fights the render loop.
- Build output (measured): shell `79.9 kB gzip` · 3D chunk `1.02 MB gzip` (lazy).

---

## Audio & Autoplay Policy

Modern browsers block `AudioContext` creation outside a user gesture. GRAVITON/01 never fights it:

1. Nothing audio-related mounts until the **consent gateway** button is pressed.
2. The context is created **inside the click handler** (`ensureAudioContext()`), then reused by
   the master bus, the impulse-ping synth, and the three.js listener.
3. `SpatialAudio` swaps the listener's internal context **and rebuilds its gain chain on the same
   context** — connecting across contexts is silently dead, so the mute switch and analyser meter
   are verified to work.
4. The drone is rendered offline (8 s, crossfaded loop edges) and played through
   `THREE.PositionalAudio` (refDistance 3, rolloff 1.4) parented to the moving cluster.

---

## Design System

```
Palette (Tailwind v4 @theme)              Type
─────────────────────────────             ────────────────────────────
void        #06090d   page/canvas bg      Unbounded    display, 800/900
panel       #0b1218   console surfaces    Space Grotesk body, 300–500
line        #1c2936   frame & rules       ui-monospace stack  telemetry
ink         #e8eef2   primary text
ink-dim     #8fa3b0   secondary text      Scale
ember       #ff7847   interactive hot     display  clamp(2.1rem → 4.6rem)
ember-hot   #ffb454   accents/pings       mono     8–11px · 0.18–0.42em tracking
glacier     #57e0d0   system/positive     body     13px light
```

Materials obey the palette: graphite shards (`metalness 0.88 / rough 0.3`), porcelain satellites,
molten ember accents (emissive 0.55), glacier emissive trim — lit by an orbiting amber key, a cool
cyan rim, and the cluster's own 10-candela point light.

---

## Engineering Safeguards

- **Disposal everywhere** — SpatialAudio tears down analyser, interval, buffer source, and
  closes only the context it owns; intro timelines are killed; pointer/resize listeners removed.
- **`prefers-reduced-motion`** — intro renders instantly, scramble resolves to final text,
  scanline/shimmer/pulse animations disabled.
- **Defensive WebGL** — `flat` tone mapping fallback path is unnecessary (standard
  `ACESFilmic`), but `gl={{ antialias: true, powerPreference: 'high-performance' }}` and
  explicit `fog` guarantee consistent depth on low-end GPUs.
- **No NaN paths** — every force divides by `max(d, 0.4)`-style guards; ray-plane misses keep the
  last valid hit point.
- **React 18 StrictMode-safe** — audio context is a module singleton, double-effects are idempotent.

---

## Getting Started

```bash
npm install        # installs three 0.170 line + rapier WASM compat build
npm run dev        # vite dev server → http://localhost:5173
npm run build      # production build → dist/  (3D chunk auto-split)
npm run typecheck  # tsc --noEmit
```

> Rapier WASM loads from the compat build bundled in `node_modules` — no CDN dependency,
> works offline and behind strict CSPs.

---

## Vercel / Next.js Port

Everything in this repo maps to a drop-in **Next.js 14 App Router** project for Vercel:

| This repo (Vite)              | Next.js port (`VERCEL_NEXTJS.md`)                        |
| ----------------------------- | -------------------------------------------------------- |
| `React.lazy(SceneCanvas)`     | `next/dynamic(() => import(...), { ssr: false })`        |
| `LoadingHUD` fallback         | `loading:` option of the dynamic import                  |
| `useViewportHeight`           | identical hook — already `useEffect`-pure                |
| `index.css` `@theme`          | `app/globals.css` + `tailwind.config` content paths      |
| public asset strategy         | `/public` + `headers()` cache-control in `next.config`   |
| consent-gated audio           | same gateway component, `'use client'`                   |

See **[`VERCEL_NEXTJS.md`](./VERCEL_NEXTJS.md)** for the five complete files
(`package.json`, `app/layout.js`, `app/page.js`, `components/SceneCanvas.jsx`,
`components/InteractivePhysicsWorld.jsx`), cache-header config, and the Lighthouse checklist.

---

## Known Limits

- The 3D chunk (~1 MB gzip) is dominated by three.js + rapier WASM glue; on 3G the boot screen
  holds for a few seconds — by design, it *is* the loading experience.
- `polarGridHelper` colors are module-scoped constants (mutating shared geometry args would
  leak across mounts).
- Mobile Safari ignores `powerPreference`; DPR clamp carries the perf budget there.

---

*GRAVITON/01 — built as a deployment-ready reference: SSR-isolated, telemetry-live,
autoplay-compliant, and unbreakable under any slider value.*
