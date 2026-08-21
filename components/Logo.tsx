/**
 * The ArcFlow brand mark.
 *
 * A single source of truth for the logo. It was previously drawn inline in three
 * places — the landing footer, the marketing navbar, and the app sidebar — as a
 * lightning bolt borrowed from Heroicons, which meant the product's identity was
 * a stock icon repeated by copy-paste. Changing it meant finding every copy.
 *
 * WHY INLINE SVG RATHER THAN AN IMAGE FILE
 *
 * The mark is monochrome, so drawing it with `currentColor` lets it inherit ink
 * from whatever it sits on: near-black on the chartreuse accent badge, light on
 * a dark sidebar, no second asset and no `dark:` variant. A flat PNG of black
 * pixels cannot do that — it would disappear against the dark theme, and would
 * need a separate light-on-dark export plus the CSS to switch between them. It
 * also stays sharp at every size, which matters because this renders at 20px in
 * the nav and much larger elsewhere.
 *
 * PROVENANCE — PLEASE READ BEFORE TRUSTING THIS AT LARGE SIZES
 *
 * These paths are my reconstruction of the supplied logo, not the original
 * vector. I was given a raster image and traced its geometry: the chevron A, the
 * orbital ellipse, and the three nodes. The proportions are close and it reads
 * correctly at UI sizes, but the curves are not bezier-identical to the source —
 * the original's crossbar swoosh in particular tapers in a way a plain elliptical
 * arc only approximates.
 *
 * If you have the real vector, replace the two <g> children below with its
 * contents and set the viewBox to match. Nothing else needs to change, because
 * every consumer goes through this component.
 */

/** Geometry is authored in a 100×100 box so the numbers below read as percentages. */
export function Logo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      /* Not focusable and not announced: every call site pairs this with the
         word "ArcFlow" in text, so a label here would make screen readers say
         the name twice. */
      aria-hidden="true"
    >
      {/* The orbit, drawn first so the letter sits on top of it. Rotated rather
          than hand-plotted as a path, so the ellipse stays a true ellipse. */}
      <g
        stroke="currentColor"
        strokeWidth={5.5}
        strokeLinecap="round"
        transform="rotate(-21 50 55)"
      >
        {/* Left as an arc with a gap rather than a closed ring: the source mark
            breaks the orbit where it would pass behind the letter, which is what
            gives it depth instead of reading as a flat circle struck through. */}
        <path d="M 88 43 A 42 19 0 1 1 20 70 A 42 19 0 0 1 88 43" />
      </g>

      {/* The nodes. Sized unequally on purpose — the near one is larger, which
          is the cue that sells the orbit as a path in space. */}
      <g fill="currentColor">
        <circle cx="25" cy="72" r="8.5" />
        <circle cx="80" cy="26" r="4.6" />
        <circle cx="78" cy="46" r="4.6" />
      </g>

      {/* The A: a chevron with a flat apex, thick legs, and the counter left open
          at the bottom so the orbit reads through it. */}
      <path
        fill="currentColor"
        d="M 45 9 L 60 9 L 96 81 L 73 81 L 52 42 L 32 81 L 9 81 Z"
      />
    </svg>
  );
}
