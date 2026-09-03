import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ensureAudioContext } from "../lib/audioEngine";
import {
  clamp,
  pointerField,
  settingsStore,
  useSettings,
  useTelemetry,
} from "../lib/store";

/* ────────────────────────────────────────────────────────────────────────
   HUD — the server-friendly overlay chrome: wordmark, live telemetry,
   GSAP-driven title sequence, the control surface, and the audio consent
   gateway. Pure DOM — paints instantly, never blocks the WebGL bundle.
   ──────────────────────────────────────────────────────────────────────── */

const SCRAMBLE = "█▓▒░<>/\\|=+*#@";

function useIntro(ready: boolean) {
  // layout effect → children are masked before the ready frame paints
  useLayoutEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = document.querySelectorAll("[data-reveal]");
    const lines = document.querySelectorAll(".mask-line > span");
    const panels = document.querySelectorAll("[data-panel]");

    if (reduced) {
      gsap.set([reveals, lines, panels], { y: 0, yPercent: 0, opacity: 1 });
      const kicker = document.querySelector<HTMLElement>("[data-scramble]");
      if (kicker && kicker.dataset.text) kicker.textContent = kicker.dataset.text;
      return;
    }

    gsap.set(reveals, { y: 22, opacity: 0 });
    gsap.set(lines, { yPercent: 114 });
    gsap.set(panels, { y: 30, opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(reveals, { y: 0, opacity: 1, duration: 0.65, stagger: 0.07 }, 0.05)
      .to(lines, { yPercent: 0, duration: 1.05, stagger: 0.14 }, 0.2)
      .to(panels, { y: 0, opacity: 1, duration: 0.7, stagger: 0.1 }, 0.55);

    // scramble-decode the kicker line
    const kicker = document.querySelector<HTMLElement>("[data-scramble]");
    if (kicker) {
      const text = kicker.dataset.text ?? "";
      const obj = { p: 0 };
      tl.to(
        obj,
        {
          p: 1,
          duration: 1.1,
          ease: "none",
          onUpdate: () => {
            kicker.textContent = text
              .split("")
              .map((c, i) =>
                c === " "
                  ? " "
                  : i < obj.p * text.length
                    ? c
                    : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
              )
              .join("");
          },
        },
        0.3,
      );
    }
    return () => {
      tl.kill();
    };
  }, [ready]);
}

/* custom reticle — lerped ring + hard dot, fine pointers only */
function CursorRig() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let tx = -100,
      ty = -100,
      x = -100,
      y = -100,
      scale = 1,
      raf = 0;

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (ring.current) ring.current.style.opacity = "1";
      if (dot.current) dot.current.style.opacity = "1";
    };
    const down = () => (scale = 0.55);
    const up = () => (scale = 1);

    const loop = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      if (ring.current)
        ring.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
      if (dot.current)
        dot.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div
        ref={ring}
        className="pointer-events-none fixed left-0 top-0 z-50 h-9 w-9 rounded-full border border-ember/70 opacity-0 transition-opacity duration-300"
        aria-hidden="true"
      />
      <div
        ref={dot}
        className="pointer-events-none fixed left-0 top-0 z-50 h-1 w-1 rounded-full bg-glacier opacity-0"
        aria-hidden="true"
      />
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  return (
    <label className="block group">
      <span className="mb-1 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
        <span className="transition-colors group-hover:text-ink-dim">{label}</span>
        <span className="text-ember">{format(value)}</span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value), min, max))}
      />
    </label>
  );
}

/* ── audio consent gateway: nothing audio-related mounts before the gesture ── */
function AudioConsentGateway() {
  const { audioConsented, audioMuted } = useSettings();
  const { audioLevel } = useTelemetry();

  if (!audioConsented) {
    return (
      <button
        onClick={() => {
          ensureAudioContext(); // created inside the gesture → autoplay-safe
          settingsStore.set({ audioConsented: true });
        }}
        className="corner-ticks group flex w-full items-center justify-between border border-line bg-panel/80 px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim transition-all duration-200 hover:border-ember hover:text-ink"
      >
        <span className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-ember">
            <path d="M2 6v4h3l4 3V3L5 6H2z" fill="currentColor" />
            <path d="M11.5 5.5a3.5 3.5 0 010 5M13.2 3.8a6 6 0 010 8.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          enable spatial audio
        </span>
        <span className="text-ember transition-transform duration-200 group-hover:translate-x-0.5">→</span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between border border-line bg-panel/80 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em]">
      <span className="flex items-center gap-2 text-ink-dim">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${audioMuted ? "bg-ink-faint" : "bg-glacier status-dot"}`} />
        audio {audioMuted ? "muted" : "live"}
      </span>
      <span className="flex items-center gap-3">
        <span className="flex h-2.5 items-end gap-[2px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-[3px] bg-glacier/80 transition-[height] duration-100"
              style={{ height: audioMuted ? 2 : Math.max(2, audioLevel * 10 * (0.4 + ((i * 37) % 10) / 14)) }}
            />
          ))}
        </span>
        <button
          onClick={() => settingsStore.set({ audioMuted: !audioMuted })}
          className="text-ink-faint underline-offset-4 transition-colors hover:text-ember hover:underline"
        >
          {audioMuted ? "unmute" : "mute"}
        </button>
      </span>
    </div>
  );
}

export default function HUD() {
  const s = useSettings();
  const t = useTelemetry();
  useIntro(s.sceneReady);

  const set = (patch: Parameters<typeof settingsStore.set>[0]) => settingsStore.set(patch);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      style={{ visibility: s.sceneReady ? "visible" : "hidden" }}
    >
      <CursorRig />

      {/* frame */}
      <div className="absolute inset-3 border border-line-soft sm:inset-4" aria-hidden="true" />

      {/* ── top-left: wordmark + sim status ── */}
      <header className="absolute left-6 top-6 sm:left-8 sm:top-7">
        <div data-reveal className="flex items-baseline gap-3">
          <span className="font-display text-sm font-bold tracking-[0.28em] text-ink">
            GRAVITON<span className="text-ember">/01</span>
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint sm:inline">
            r3f · rapier · wasm
          </span>
        </div>
        <div data-reveal className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.paused ? "bg-ink-faint" : "bg-ember status-dot"}`} />
          <span className={s.paused ? "text-ink-faint" : "text-ink-dim"}>
            {s.paused ? "simulation standby" : "physics live"}
          </span>
        </div>
      </header>

      {/* ── top-right: telemetry ── */}
      <div data-reveal className="absolute right-6 top-6 hidden text-right font-mono text-[9px] uppercase tracking-[0.18em] sm:right-8 sm:top-7 md:block">
        <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
          <span className="text-ink-faint">fps</span>
          <span className={t.fps > 0 && t.fps < 45 ? "text-ember-hot" : "text-glacier"}>{t.fps || "—"}</span>
          <span className="text-ink-faint">bodies</span>
          <span className="text-ink-dim">{t.bodies}</span>
          <span className="text-ink-faint">cam az</span>
          <span className="text-ink-dim">{t.camAzimuth}°</span>
          <span className="text-ink-faint">cursor</span>
          <span className="text-ink-dim">
            {t.cursor[0].toFixed(1)} · {t.cursor[1].toFixed(1)} · {t.cursor[2].toFixed(1)}
          </span>
          <span className="text-ink-faint">engine</span>
          <span className="text-ink-dim">{t.engine}</span>
        </div>
      </div>

      {/* ── bottom-left: title block ── */}
      <div className="absolute bottom-20 left-6 max-w-xl sm:bottom-14 sm:left-8 lg:bottom-16">
        <p
          data-reveal
          data-scramble
          data-text="FIELD EXPERIMENT — N-BODY DRIFT 48"
          className="mb-3 font-mono text-[10px] uppercase tracking-[0.42em] text-glacier"
        >
          &nbsp;
        </p>
        <h1 className="font-display font-black leading-[0.98] tracking-tight text-ink">
          <span className="mask-line text-[clamp(2.1rem,6vw,4.6rem)]">
            <span className="block">GRAVITY,</span>
          </span>
          <span className="mask-line text-[clamp(2.1rem,6vw,4.6rem)]">
            <span className="block text-ink-faint">
              NEGOTI<span className="text-ember">A</span>TED.
            </span>
          </span>
        </h1>
        <p data-reveal className="mt-4 max-w-sm text-[13px] font-light leading-relaxed text-ink-dim">
          A live rigid-body field under your cursor. Drag to orbit, <span className="text-ink">press to send a
          shockwave</span>, tune the field below — the drone follows the cluster in 3D space.
        </p>
      </div>

      {/* ── bottom-right: control surface ── */}
      <div data-panel className="pointer-events-auto absolute bottom-6 right-6 w-[248px] sm:bottom-8 sm:right-8 sm:w-[268px]">
        <div className="corner-ticks border border-line bg-panel/85 p-4 backdrop-blur-[2px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-ink-faint">field console</span>
            <span className="font-mono text-[9px] tracking-[0.18em] text-ember">
              {s.mode === "repel" ? "− REPULSE" : "+ ATTRACT"}
            </span>
          </div>

          {/* mode toggle */}
          <div className="mb-3 grid grid-cols-2 border border-line">
            {(["repel", "attract"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ mode: m })}
                className={`py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors duration-150 ${
                  s.mode === m
                    ? "bg-ember text-void"
                    : "text-ink-faint hover:bg-line-soft hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            <Slider label="field radius" value={s.fieldRadius} min={1} max={9} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set({ fieldRadius: v })} />
            <Slider label="field power" value={s.fieldPower} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set({ fieldPower: v })} />
            <Slider label="gravity y" value={s.gravity} min={-4} max={4} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set({ gravity: v })} />
            <Slider label="swirl" value={s.swirl} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set({ swirl: v })} />
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                pointerField.scatterAt = performance.now();
              }}
              className="border border-ember bg-ember/10 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-ember transition-all duration-150 hover:bg-ember hover:text-void active:scale-[0.97]"
            >
              scatter
            </button>
            <button
              onClick={() => set({ paused: !s.paused })}
              className="border border-line py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-dim transition-all duration-150 hover:border-ink-dim hover:text-ink active:scale-[0.97]"
            >
              {s.paused ? "resume" : "pause"}
            </button>
          </div>

          <div className="mt-2.5">
            <AudioConsentGateway />
          </div>
        </div>
        <p data-reveal className="mt-2 text-right font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">
          drag orbit · click pulse · scroll zoom
        </p>
      </div>
    </div>
  );
}
