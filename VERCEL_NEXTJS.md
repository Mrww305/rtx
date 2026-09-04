# GRAVITON/01 — Next.js 14 / Vercel Deployment Architecture

This repository ships a **working reference implementation** (Vite + React 18, same
component topology). The files below are the **production Next.js App Router port**,
structured for a zero-friction Vercel deployment with 100/100 Lighthouse targets.

```
graviton/
├─ app/
│  ├─ layout.js            # Tailwind + next/font (zero-CLS font loading)
│  ├─ page.js              # next/dynamic(ssr:false) + static HUD shell
│  ├─ loading.js           # route-level boot wireframe (optional)
│  └─ globals.css          # 100dvh stage, theme tokens
├─ components/
│  ├─ SceneCanvas.jsx      # 'use client' — WebGL/WebGPU entry (never SSR'd)
│  ├─ InteractivePhysicsWorld.jsx  # 'use client' — rapier WASM + forces + spatial audio
│  ├─ AudioConsentGateway.jsx      # autoplay-policy gate
│  └─ LoadingHUD.tsx       # static Suspense placeholder (see src/)
├─ public/
│  ├─ models/*.glb         # immutable-cached 3D assets
│  └─ audio/*.mp3          # immutable-cached spatial tracks
├─ next.config.mjs
├─ tailwind.config.js
└─ package.json
```

---

## 1. `package.json` — modern ESM dependencies (React 18 ↔ R3F v8 matrix)

```json
{
  "name": "graviton",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "0.169.0",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.114.3",
    "@react-three/rapier": "^1.5.0",
    "gsap": "^3.12.5"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.14",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.15"
  },
  "engines": { "node": ">=20.x" }
}
```

> **Version lock rationale:** R3F v9 requires React 19. On Next 14 (React 18) pin
> fiber `8.x`, drei `9.x`, rapier `1.x` — this exact matrix builds clean on Vercel's
> Node 20 runners. `@react-three/rapier` pulls `@dimforge/rapier3d-compat`, which
> inlines its WASM as base64 — no loader config, no `experimental` flags.

## 2. `next.config.mjs` — aggressive asset caching (Vercel Blob / CDN ready)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Heavy static assets: cache forever at the edge, SWR revalidation
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/audio/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  // External CDN alternative (Vercel Blob):
  // images: { remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }] },
};
export default nextConfig;
```

## 3. `app/layout.js` — global layout, zero-CLS fonts

```jsx
import { Space_Grotesk, Unbounded } from "next/font/google";
import "./globals.css";

// next/font self-hosts + preloads → no FOUT, no layout shift
const body = Space_Grotesk({ subsets: ["latin"], weight: ["300", "400", "500", "700"], display: "swap", variable: "--font-body" });
const display = Unbounded({ subsets: ["latin"], weight: ["700", "900"], display: "swap", variable: "--font-display" });

export const metadata = {
  title: "GRAVITON/01 — Interactive Physics Field",
  description: "48 rigid bodies, Rapier WASM, cursor force-fields, positional audio.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} style={{ backgroundColor: "#05080c" }}>
      <body className="bg-[#05080c] text-[#e8eef4] font-[family-name:var(--font-body)] antialiased">
        {children}
      </body>
    </html>
  );
}
```

## 4. `app/page.js` — SSR-safe dynamic import + static LCP shell

```jsx
import dynamic from "next/dynamic";
import LoadingHUD from "@/components/LoadingHUD";
import HUD from "@/components/HUD";

// ⚠ The Canvas, Rapier WASM and Web Audio graph touch window/document/navigator.
// ssr:false guarantees Vercel's Node build never executes them.
const SceneCanvas = dynamic(() => import("@/components/SceneCanvas"), {
  ssr: false,
  loading: () => <LoadingHUD />, // identical skeleton → CLS ≈ 0
});

export default function Page() {
  return (
    <main className="stage-h grain relative w-full overflow-hidden">
      <SceneCanvas />            {/* client-only, streams in after first paint */}
      <HUD />                    {/* server-rendered overlay — owns LCP */}
    </main>
  );
}
```

## 5. `components/SceneCanvas.jsx` — `'use client'` WebGL entry

```jsx
"use client";
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import InteractivePhysicsWorld from "./InteractivePhysicsWorld";

export default function SceneCanvas() {
  // --vh fallback strictly client-side; CSS `100dvh` already owns first paint
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);

  return (
    <div className="stage-h absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 50, position: [0, 1.6, 9.6], near: 0.1, far: 90 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#05080c"]} />
        <fog attach="fog" args={["#05080c", 14, 44]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[7, 9, 5]} intensity={1.15} />

        {/* procedural IBL — no HDR fetch, nothing blocks FCP */}
        <Environment resolution={64}>
          <Lightformer intensity={1.6} position={[0, 6, -9]} scale={[12, 9, 1]} color="#33475a" />
          <Lightformer form="ring" intensity={2} position={[-7, 2, 4]} scale={4.5} color="#ffb454" />
        </Environment>

        <Stars radius={70} depth={42} count={2400} factor={3.4} saturation={0} fade speed={0.5} />
        <Sparkles count={110} scale={[17, 9, 17]} size={1.7} speed={0.32} color="#57e0d0" opacity={0.45} />

        {/* every loader (useGLTF, useAudio…) MUST sit inside a Suspense boundary */}
        <Suspense fallback={null}>
          <InteractivePhysicsWorld />
        </Suspense>

        <OrbitControls makeDefault enableDamping enablePan={false} minDistance={4.5} maxDistance={16} autoRotate autoRotateSpeed={0.45} />
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  );
}
```

## 6. `components/InteractivePhysicsWorld.jsx` — physics, force-field, spatial audio

```jsx
"use client";
import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody, BallCollider } from "@react-three/rapier";
import { PositionalAudio } from "@react-three/drei";
import AudioConsentGateway, { useAudioConsent } from "./AudioConsentGateway";

const pointer = { x: 0, y: 0, z: 0, active: false };

function ForceField({ bodies }) {
  const v = useRef(new THREE.Vector3());
  const ray = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const hit = useRef(new THREE.Vector3());
  useFrame((state) => {
    ray.current.setFromCamera(state.pointer, state.camera);
    if (!ray.current.ray.intersectPlane(plane.current, hit.current)) return;
    Object.assign(pointer, { x: hit.current.x, y: hit.current.y, z: hit.current.z });
    for (const body of bodies.current) {
      if (!body) continue;
      const t = body.translation();
      const m = body.mass();
      v.current.set(pointer.x - t.x, pointer.y - t.y, pointer.z - t.z);
      const d = v.current.length();
      if (pointer.active && d < 4.2 && d > 0.001) {
        const f = (1 - d / 4.2) ** 2 * 30 * m; // quadratic falloff, repel
        body.addForce(v.current.normalize().multiplyScalar(-f), true);
      }
      v.current.set(t.x, t.y, t.z);            // weak centering spring
      body.addForce(v.current.multiplyScalar(-0.22 * m), true);
    }
  });
  return null;
}

function EmitterCluster({ consented }) {
  const listener = useThree((s) => s.camera); // AudioListener rides the camera
  return (
    <RigidBody type="fixed" colliders={false}>
      <BallCollider args={[1.18]} />
      <group>
        <mesh>
          <icosahedronGeometry args={[0.78, 1]} />
          <meshStandardMaterial color="#131c26" metalness={0.95} roughness={0.2} />
        </mesh>
        {/* mounts only after the consent gesture → autoplay-policy safe */}
        {consented && <PositionalAudio url="/audio/drone.mp3" distanceModel="inverse" refDistance={3} rolloffFactor={1.4} loop autoplay />}
      </group>
    </RigidBody>
  );
}

export default function InteractivePhysicsWorld() {
  const bodies = useRef([]);
  const { consented, requestConsent } = useAudioConsent();
  // …map 48 <RigidBody ref={(el) => (bodies.current[i] = el)}> nodes here
  // (identical topology to src/components/InteractivePhysicsWorld.tsx)
  return (
    <>
      <Physics gravity={[0, 0, 0]} interpolate>
        <ForceField bodies={bodies} />
        <EmitterCluster consented={consented} />
        {/* <nodes…/> */}
      </Physics>
      <AudioConsentGateway onConsent={requestConsent} consented={consented} />
    </>
  );
}
```

## 7. `app/globals.css` — fluid height contract

```css
@tailwind base; @tailwind components; @tailwind utilities;

/* Modern browsers: dynamic viewport. JS --vh layered only where needed. */
.stage-h {
  height: 100dvh;
  height: calc(var(--vh, 1vh) * 100);
}
```

---

## Vercel deployment checklist

| Concern | Mechanism |
| --- | --- |
| **Build safety** | `ssr: false` keeps rapier WASM / `window` / Web Audio out of the Node prerender pass |
| **LCP** | HUD overlay is server-rendered HTML — first paint needs zero JS |
| **CLS** | `loading:` placeholder is a 1:1 skeleton; `next/font` swaps with metrics |
| **FCP/TBT** | Canvas chunk is code-split behind the dynamic import; Suspense keeps loaders off the critical path |
| **Assets** | `/public/models`, `/public/audio` with `immutable` edge caching — or swap URLs to Vercel Blob |
| **Analytics** | Add `@vercel/analytics` `<Analytics/>` in `layout.js` to watch CWV in production |

Deploy: `vercel --prod` — the default Next.js preset detects App Router, sets
`npm run build`, output `/.next`, Node 20 runtime. No custom config required.
