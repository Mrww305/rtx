import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Physics, RigidBody, BallCollider } from "@react-three/rapier";
import type { RigidBody as RapierRigidBody } from "@dimforge/rapier3d-compat";
import SpatialAudio from "./SpatialAudio";
import {
  clamp,
  pointerField,
  settingsStore,
  telemetryStore,
  useSettings,
} from "../lib/store";
import { playPing } from "../lib/audioEngine";

/* ────────────────────────────────────────────────────────────────────────
   InteractivePhysicsWorld — the simulation core.
   · zero-G Rapier world; gravity is a live slider applied as per-body force
   · cursor raycast onto the z=0 plane drives an attract/repel force field
   · press = radial impulse pulse, scatter button = chaotic kick
   · containment + weak spring + swirl keep the cloud composed on camera
   · kinematic cluster acts as the positional-audio emitter
   ──────────────────────────────────────────────────────────────────────── */

const NODE_COUNT = 48;
const CONTAIN_R = 7.6;
const MAX_SPEED = 6.5;

const GRID_COLOR_A = new THREE.Color("#1a2836");
const GRID_COLOR_B = new THREE.Color("#101a25");

interface NodeDef {
  pos: [number, number, number];
  vel: [number, number, number];
  spin: [number, number, number];
  scale: number;
  variant: number;
  color: string;
  metal: number;
  rough: number;
  emissive: string;
  emissiveIntensity: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function makeDefs(count: number): NodeDef[] {
  const defs: NodeDef[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = rnd(2.8, 6.8);
    const accent = Math.random();
    const base =
      accent < 0.34
        ? { color: "#33424f", emissive: "#000000", ei: 0, metal: 0.88, rough: 0.3 }
        : accent < 0.62
          ? { color: "#212d3a", emissive: "#000000", ei: 0, metal: 0.9, rough: 0.22 }
          : accent < 0.78
            ? { color: "#c9d4dc", emissive: "#0a0f14", ei: 0.1, metal: 0.75, rough: 0.38 }
            : accent < 0.88
              ? { color: "#ff7847", emissive: "#ff7847", ei: 0.55, metal: 0.5, rough: 0.3 }
              : accent < 0.95
                ? { color: "#ffb454", emissive: "#ffb454", ei: 0.45, metal: 0.5, rough: 0.32 }
                : { color: "#57e0d0", emissive: "#57e0d0", ei: 0.5, metal: 0.5, rough: 0.3 };
    defs.push({
      pos: [Math.cos(theta) * r, rnd(-2.6, 3.2), Math.sin(theta) * r],
      vel: [rnd(-0.5, 0.5), rnd(-0.3, 0.3), rnd(-0.5, 0.5)],
      spin: [rnd(-0.7, 0.7), rnd(-0.7, 0.7), rnd(-0.7, 0.7)],
      scale: rnd(0.15, 0.4),
      variant: Math.floor(Math.random() * 4),
      color: base.color,
      metal: base.metal,
      rough: base.rough,
      emissive: base.emissive,
      emissiveIntensity: base.ei,
    });
  }
  return defs;
}

const NodeMesh = memo(function NodeMesh({
  def,
  register,
}: {
  def: NodeDef;
  register: (i: number, el: RapierRigidBody | null) => void;
}) {
  const idx = useRef(-1);
  if (idx.current === -1) idx.current = registerRefCounter++;
  return (
    <RigidBody
      ref={(el) => register(idx.current, el)}
      position={def.pos}
      linearVelocity={def.vel}
      angularVelocity={def.spin}
      colliders="ball"
      linearDamping={0.5}
      angularDamping={0.75}
      canSleep={false}
      ccd
    >
      <mesh scale={def.scale}>
        {def.variant === 0 && <octahedronGeometry args={[1, 0]} />}
        {def.variant === 1 && <boxGeometry args={[1.15, 1.15, 1.15]} />}
        {def.variant === 2 && <tetrahedronGeometry args={[1.25, 0]} />}
        {def.variant === 3 && <icosahedronGeometry args={[1, 0]} />}
        <meshStandardMaterial
          color={def.color}
          metalness={def.metal}
          roughness={def.rough}
          emissive={def.emissive}
          emissiveIntensity={def.emissiveIntensity}
        />
      </mesh>
    </RigidBody>
  );
});

let registerRefCounter = 0;

/* per-frame force integrator — reads stores directly, never re-renders */
function ForceField({ bodies }: { bodies: React.MutableRefObject<(RapierRigidBody | null)[]> }) {
  const radial = useMemo(() => new THREE.Vector3(), []);
  const force = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const lastPulse = useRef(-1);
  const lastScatter = useRef(-1);

  useFrame((state) => {
    // project the pointer onto the z=0 world plane
    raycaster.setFromCamera(state.pointer, state.camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      pointerField.x = hit.x;
      pointerField.y = hit.y;
      pointerField.z = hit.z;
    }

    const s = settingsStore.get();
    const p = pointerField;
    const R = clamp(s.fieldRadius, 1, 9);
    const P = clamp(s.fieldPower, 0, 2);
    const G = clamp(s.gravity, -4, 4);
    const SW = clamp(s.swirl, 0, 1);

    const pulse = p.downAt !== lastPulse.current && p.downAt > 0;
    const scatter = p.scatterAt !== lastScatter.current && p.scatterAt > 0;

    for (const body of bodies.current) {
      if (!body) continue;
      const t = body.translation();
      radial.set(t.x, t.y, t.z);
      const len = radial.length();
      const mass = body.mass();

      // soft containment shell
      if (len > CONTAIN_R) {
        force.copy(radial).normalize().multiplyScalar(-(len - CONTAIN_R) * 3.2 * mass);
        body.addForce(force, true);
      }
      if (t.y < -4.4) body.addForce({ x: 0, y: (-4.4 - t.y) * 2.4 * mass, z: 0 }, true);
      if (t.y > 5.2) body.addForce({ x: 0, y: (5.2 - t.y) * 2.4 * mass, z: 0 }, true);

      // weak centering spring → loose orbital cloud
      force.copy(radial).multiplyScalar(-0.22 * mass);
      body.addForce(force, true);

      // live gravity slider (world -Y)
      if (G !== 0) body.addForce({ x: 0, y: G * mass, z: 0 }, true);

      // ambient swirl (tangential drift)
      if (SW > 0 && len > 0.01) {
        tangent.set(0, 1, 0).cross(radial).normalize().multiplyScalar(SW * 0.5 * mass);
        body.addForce(tangent, true);
      }

      // cursor force-field with quadratic falloff
      if (p.active && P > 0.01) {
        force.set(p.x - t.x, p.y - t.y, p.z - t.z);
        const d = force.length();
        if (d < R && d > 0.001) {
          const fall = 1 - d / R;
          const dir = s.mode === "attract" ? 1 : -1;
          force.normalize().multiplyScalar(dir * P * fall * fall * 30 * mass);
          body.addForce(force, true);
        }
      }

      // press → radial impulse pulse
      if (pulse) {
        force.set(t.x - p.x, t.y - p.y, t.z - p.z);
        const d = Math.max(force.length(), 0.4);
        const reach = R * 1.7;
        if (d < reach) {
          force.normalize().multiplyScalar((1 - d / reach) * 6 * mass);
          body.applyImpulse(force, true);
        }
      }

      // scatter command → chaotic kick
      if (scatter) {
        force
          .set(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5)
          .normalize()
          .multiplyScalar(rnd(2.2, 5.4) * mass);
        body.applyImpulse(force, true);
      }

      // energy governor — keeps the sim unbreakable
      const v = body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
    }

    if (pulse) {
      lastPulse.current = p.downAt;
      void playPing(0.8);
    }
    if (scatter) {
      lastScatter.current = p.scatterAt;
      void playPing(1);
    }
  });

  return null;
}

/* primary geometric cluster — kinematic body + positional audio emitter */
function Cluster({ audioOn }: { audioOn: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const inner = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    body.current?.setNextKinematicTranslation({
      x: Math.sin(t * 0.31) * 0.6,
      y: 0.45 + Math.cos(t * 0.22) * 0.42,
      z: Math.sin(t * 0.16) * 0.45,
    });
    if (inner.current) {
      inner.current.rotation.y = t * 0.16;
      inner.current.rotation.x = Math.sin(t * 0.09) * 0.22;
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <BallCollider args={[1.18]} />
      <group ref={inner}>
        {/* molten core */}
        <mesh>
          <icosahedronGeometry args={[0.78, 1]} />
          <meshStandardMaterial color="#131c26" metalness={0.95} roughness={0.2} />
        </mesh>
        {/* amber wire shell */}
        <mesh>
          <icosahedronGeometry args={[1.02, 1]} />
          <meshBasicMaterial color="#ffb454" wireframe transparent opacity={0.4} />
        </mesh>
        {/* orbital rings */}
        <mesh rotation={[Math.PI / 2.3, 0.4, 0]}>
          <torusGeometry args={[1.55, 0.014, 8, 96]} />
          <meshBasicMaterial color="#57e0d0" transparent opacity={0.5} />
        </mesh>
        <mesh rotation={[Math.PI / 1.7, -0.7, 0.5]}>
          <torusGeometry args={[1.92, 0.009, 8, 96]} />
          <meshBasicMaterial color="#ff7847" transparent opacity={0.32} />
        </mesh>
        {/* satellites */}
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.55, Math.sin(a) * 0.22, Math.sin(a) * 1.55]}>
              <octahedronGeometry args={[0.13, 0]} />
              <meshStandardMaterial
                color="#c9d4dc"
                metalness={0.9}
                roughness={0.25}
                emissive="#ffb454"
                emissiveIntensity={0.35}
              />
            </mesh>
          );
        })}
        <pointLight color="#ffb454" intensity={10} distance={10} decay={2} />
        {audioOn && <SpatialAudio />}
      </group>
    </RigidBody>
  );
}

/* fps + camera azimuth + cursor readouts, throttled 2 Hz */
function TelemetryProbe() {
  const acc = useRef({ t: 0, f: 0 });
  useFrame((state, dt) => {
    const a = acc.current;
    a.t += dt;
    a.f += 1;
    if (a.t >= 0.5) {
      const cam = state.camera.position;
      telemetryStore.set({
        fps: Math.min(240, Math.round(a.f / a.t)),
        camAzimuth: Math.round((Math.atan2(cam.x, cam.z) * 180) / Math.PI),
        cursor: [
          Math.round(pointerField.x * 10) / 10,
          Math.round(pointerField.y * 10) / 10,
          Math.round(pointerField.z * 10) / 10,
        ],
      });
      a.t = 0;
      a.f = 0;
    }
  });
  return null;
}

export default function InteractivePhysicsWorld() {
  const settings = useSettings();
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const defs = useMemo(() => {
    registerRefCounter = 0;
    return makeDefs(NODE_COUNT);
  }, []);
  const register = useCallback((idx: number, el: RapierRigidBody | null) => {
    bodies.current[idx] = el;
  }, []);

  useEffect(() => {
    telemetryStore.set({ bodies: NODE_COUNT });
  }, []);

  return (
    <Physics gravity={[0, 0, 0]} paused={settings.paused} interpolate>
      <ForceField bodies={bodies} />
      <TelemetryProbe />
      <Cluster audioOn={settings.audioConsented} />

      {defs.map((def, i) => (
        <NodeMesh key={i} def={def} register={register} />
      ))}

      {/* reference floor — polar grid, purely visual */}
      <polarGridHelper
        args={[13, 12, 6, 64, GRID_COLOR_A, GRID_COLOR_B]}
        position={[0, -4.5, 0]}
      />
    </Physics>
  );
}
