/* ────────────────────────────────────────────────────────────────────────
   Boot wireframe — the Suspense fallback shown while the WebGL/rapier
   bundle streams in. It mirrors the final HUD skeleton 1:1, so the swap
   costs ~zero CLS and the Lighthouse layout-stability score stays clean.
   Pure static HTML + CSS: no JS, no assets.
   ──────────────────────────────────────────────────────────────────────── */
export default function LoadingHUD() {
  return (
    <div className="stage-h relative w-full overflow-hidden bg-void text-ink">
      {/* blueprint grid + roaming scanline */}
      <div className="blueprint absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-glacier/10 to-transparent animate-scan" aria-hidden="true" />

      {/* corner frame */}
      <div className="pointer-events-none absolute inset-4 border border-line-soft" aria-hidden="true">
        <span className="absolute -left-px -top-px h-3 w-3 border-l border-t border-ember" />
        <span className="absolute -right-px -top-px h-3 w-3 border-r border-t border-ember" />
        <span className="absolute -bottom-px -left-px h-3 w-3 border-b border-l border-ember" />
        <span className="absolute -bottom-px -right-px h-3 w-3 border-b border-r border-ember" />
      </div>

      {/* top-left wordmark */}
      <header className="absolute left-8 top-7 flex items-baseline gap-3">
        <span className="font-display text-sm font-bold tracking-[0.28em] text-ink">
          GRAVITON<span className="text-ember">/01</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          r3f · rapier · wasm
        </span>
      </header>

      {/* top-right boot status */}
      <div className="absolute right-8 top-7 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        <p className="flex items-center justify-end gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember status-dot" />
          hydrating client bundle
        </p>
      </div>

      {/* center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.5em] text-glacier">
          initializing field
        </p>
        <h1 className="font-display text-center text-3xl font-black leading-tight tracking-tight text-ink sm:text-5xl">
          GRAVITY IS
          <br />
          <span className="text-ink-faint">NEGOTIABLE</span>
        </h1>
        <div className="h-px w-56 overflow-hidden bg-line">
          <div className="shimmer-bar h-full w-full" />
        </div>
        <ul className="font-mono text-[10px] uppercase leading-5 tracking-[0.2em] text-ink-faint">
          <li>→ compiling rapier physics wasm</li>
          <li>→ seeding 48 rigid bodies</li>
          <li>→ calibrating positional audio graph</li>
        </ul>
      </div>

      {/* bottom rule */}
      <footer className="absolute inset-x-8 bottom-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        <span>server-rendered shell · LCP safe</span>
        <span className="animate-blink">█</span>
      </footer>
    </div>
  );
}
