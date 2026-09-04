import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdaptiveDpr,
  Environment,
  Lightformer,
  OrbitControls,
  Sparkles,
  Stars,
} from "@react-three/drei";
import InteractivePhysicsWorld from "./InteractivePhysicsWorld";
import { pointerField, settingsStore, useSettings } from "../lib/store";

/* ────────────────────────────────────────────────────────────────────────
   SceneCanvas — browser-only WebGL entry point.
   In the Next.js reference architecture this is the `'use client'` module
   loaded via next/dynamic with ssr: false. Here it is React.lazy'd so the
   HUD shell paints first and the heavy bundle streams in afterwards.
   Everything inside <Suspense> so async chunks never block first paint.
   ──────────────────────────────────────────────────────────────────────── */

function OrbitLights() {
  const rig = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (rig.current) rig.current.rotation.y = clock.elapsedTime * 0.11;
  });
  return (
    <group ref={rig}>
      <pointLight position={[9, 3.5, 1]} color="#ff7847" intensity={34} distance={30} decay={2} />
      <pointLight position={[-9, -2.5, 3]} color="#2aa89b" intensity={28} distance={30} decay={2} />
    </group>
  );
}

export default function SceneCanvas() {
  const settings = useSettings();

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 50, position: [0, 1.6, 9.6], near: 0.1, far: 90 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={() => settingsStore.set({ sceneReady: true })}
      onPointerMove={() => {
        pointerField.active = true;
      }}
      onPointerLeave={() => {
        pointerField.active = false;
      }}
      onPointerDown={(e) => {
        if (e.button === 0) pointerField.downAt = performance.now();
      }}
    >
      <color attach="background" args={["#05080c"]} />
      <fog attach="fog" args={["#05080c", 14, 44]} />

      <ambientLight intensity={0.4} color="#93a7ba" />
      <directionalLight position={[7, 9, 5]} intensity={1.15} color="#e8f1f8" />
      <OrbitLights />

      {/* procedural IBL — rendered in-memory once, zero asset requests */}
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={1.6} position={[0, 6, -9]} scale={[12, 9, 1]} color="#33475a" />
        <Lightformer form="ring" intensity={2} position={[-7, 2, 4]} scale={4.5} color="#ffb454" />
        <Lightformer form="rect" intensity={1.4} position={[7, -1, 3]} scale={[7, 2.4, 1]} color="#2aa89b" />
        <Lightformer intensity={0.8} position={[0, -6, 6]} scale={[10, 4, 1]} color="#1b2733" />
      </Environment>

      <Stars radius={70} depth={42} count={2400} factor={3.4} saturation={0} fade speed={0.5} />
      <Sparkles count={110} scale={[17, 9, 17]} size={1.7} speed={0.32} color="#57e0d0" opacity={0.45} />
      <Sparkles count={60} scale={[12, 7, 12]} size={2.4} speed={0.22} color="#ffb454" opacity={0.35} />

      <Suspense fallback={null}>
        <InteractivePhysicsWorld />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        minDistance={4.5}
        maxDistance={16}
        minPolarAngle={Math.PI * 0.24}
        maxPolarAngle={Math.PI * 0.62}
        autoRotate={!settings.paused}
        autoRotateSpeed={0.45}
      />
      <AdaptiveDpr pixelated />
    </Canvas>
  );
}
