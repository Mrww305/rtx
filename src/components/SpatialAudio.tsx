import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { getAudioContext, getMasterGain, renderDroneBuffer, setMuted } from "../lib/audioEngine";
import { settingsStore, telemetryStore } from "../lib/store";

/* ────────────────────────────────────────────────────────────────────────
   SpatialAudio — mounts only AFTER the consent gateway has been accepted
   (satisfies browser autoplay policies). It attaches a THREE.AudioListener
   to the active camera — the listener therefore inherits every camera /
   orbit move automatically — and binds a positional drone to the primary
   geometric cluster. An analyser feeds the HUD level meter.
   ──────────────────────────────────────────────────────────────────────── */
export default function SpatialAudio() {
  const camera = useThree((s) => s.camera);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const ctx = getAudioContext();
    if (!ctx || !groupRef.current) return;

    // listener rides the camera → positional mix follows orbit state.
    // THREE.AudioListener spawns its own AudioContext internally — swap in
    // the gesture-unlocked one AND rebuild its gain bus on the same context,
    // otherwise nodes would connect across contexts (silently dead output).
    const listener = new THREE.AudioListener();
    const abandoned = listener.context as unknown as AudioContext;
    const internals = listener as unknown as { context: AudioContext; gain: GainNode };
    internals.context = ctx;
    internals.gain.disconnect();
    internals.gain = ctx.createGain();
    const bus = getMasterGain();
    internals.gain.connect(bus ?? ctx.destination);
    if (abandoned !== ctx) void abandoned.close().catch(() => undefined);
    camera.add(listener);

    const drone = new THREE.PositionalAudio(listener);
    drone.setRefDistance(3);
    drone.setMaxDistance(40);
    drone.setRolloffFactor(1.4);
    drone.setLoop(true);
    drone.setVolume(0.9);

    let disposed = false;
    renderDroneBuffer().then((buf) => {
      if (disposed) return;
      drone.setBuffer(buf);
      drone.play();
    });
    groupRef.current.add(drone);

    // analyser → HUD "AUDIO LVL" meter, throttled ~10 Hz
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    drone.getOutput().connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const meter = window.setInterval(() => {
      analyser.getByteTimeDomainData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) {
        const v = (bins[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bins.length);
      telemetryStore.set({ audioLevel: Math.min(1, rms * 3.2) });
    }, 100);

    const syncMute = () => setMuted(settingsStore.get().audioMuted);
    syncMute();
    const unsub = settingsStore.subscribe(syncMute);

    return () => {
      disposed = true;
      unsub();
      window.clearInterval(meter);
      if (drone.isPlaying) drone.stop();
      groupRef.current?.remove(drone);
      camera.remove(listener);
    };
  }, [camera]);

  return <group ref={groupRef} />;
}
