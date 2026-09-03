/* ────────────────────────────────────────────────────────────────────────
   GRAVITON/01 — procedural spatial-audio engine.
   No binary assets ship with the repo: the drone bed is rendered once in
   an OfflineAudioContext (cheap, deterministic, cache-friendly) and handed
   to a THREE.PositionalAudio node attached to the primary cluster.
   Loop seams are removed with an equal-power crossfade in the PCM data.
   ──────────────────────────────────────────────────────────────────────── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneBuffer: AudioBuffer | null = null;
let pingBuffer: AudioBuffer | null = null;

/** Must be called from a user gesture (the consent gateway button). */
export function ensureAudioContext(): AudioContext {
  if (!ctx) {
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export function getMasterGain(): GainNode | null {
  return master;
}

export function setMuted(muted: boolean) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.08);
}

/** equal-power crossfade tail→head so the loop is seamless */
function crossfadeLoop(buffer: AudioBuffer, seconds: number) {
  const fade = Math.min(Math.floor(buffer.sampleRate * seconds), buffer.length / 4);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      const a = Math.sqrt(1 - t); // tail out
      const b = Math.sqrt(t); // head in
      const head = data[i];
      const tail = data[data.length - fade + i];
      data[i] = head * b + tail * a;
      data[data.length - fade + i] = tail * a;
    }
  }
}

/** layered drone: detuned low sines + slow AM + band-passed noise breath */
export async function renderDroneBuffer(): Promise<AudioBuffer> {
  if (droneBuffer) return droneBuffer;
  const sr = 44100;
  const dur = 6;
  const off = new OfflineAudioContext(2, sr * dur, sr);

  const bed = off.createGain();
  bed.gain.value = 0.5;
  bed.connect(off.destination);

  // harmonic stack — integer cycles over 6 s so phases align at the seam
  const voices: Array<[number, number, OscillatorType]> = [
    [54, 0.42, "sine"],
    [108, 0.22, "sine"],
    [162, 0.1, "triangle"],
    [216, 0.05, "sine"],
  ];
  for (const [freq, amp, type] of voices) {
    const osc = off.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = off.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(bed);
    osc.start(0);
    osc.stop(dur);
  }

  // slow amplitude breathing — exactly one cycle per loop
  const lfo = off.createOscillator();
  lfo.frequency.value = 1 / dur;
  const lfoDepth = off.createGain();
  lfoDepth.gain.value = 0.16;
  lfo.connect(lfoDepth).connect(bed.gain);
  lfo.start(0);
  lfo.stop(dur);

  // filtered noise "air"
  const noiseLen = sr * dur;
  const noiseBuf = off.createBuffer(1, noiseLen, sr);
  const nd = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < noiseLen; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brown-ish
    nd[i] = last * 3.2;
  }
  const noise = off.createBufferSource();
  noise.buffer = noiseBuf;
  const bp = off.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 620;
  bp.Q.value = 0.8;
  const ng = off.createGain();
  ng.gain.value = 0.05;
  // one sweep cycle per loop for a seamless filter wobble
  bp.frequency.setValueAtTime(620, 0);
  bp.frequency.linearRampToValueAtTime(980, dur / 2);
  bp.frequency.linearRampToValueAtTime(620, dur);
  noise.connect(bp).connect(ng).connect(bed);
  noise.start(0);
  noise.stop(dur);

  const rendered = await off.startRendering();
  crossfadeLoop(rendered, 0.12);
  droneBuffer = rendered;
  return rendered;
}

/** short metallic ping for impulse feedback */
export async function renderPingBuffer(): Promise<AudioBuffer> {
  if (pingBuffer) return pingBuffer;
  const sr = 44100;
  const dur = 0.5;
  const off = new OfflineAudioContext(2, Math.floor(sr * dur), sr);
  const osc = off.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1180, 0);
  osc.frequency.exponentialRampToValueAtTime(220, dur);
  const g = off.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.22, 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, dur);
  osc.connect(g).connect(off.destination);
  osc.start(0);
  osc.stop(dur);
  pingBuffer = await off.startRendering();
  return pingBuffer;
}

/** fire a non-positional ping through the master bus */
export async function playPing(strength = 1) {
  if (!ctx || !master) return;
  const buf = await renderPingBuffer();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = Math.min(1, Math.max(0.1, strength)) * 0.6;
  src.connect(g).connect(master);
  src.start();
}
