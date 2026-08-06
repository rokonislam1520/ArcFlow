'use client';
/**
 * Chart primitives, drawn as plain SVG.
 *
 * No charting library: these are three simple shapes, and pulling in a runtime
 * dependency to draw them would cost more bundle than the dashboard itself.
 *
 * Every component here refuses to invent shape. A series with one point is not
 * drawn as a flat line across the full width — that would imply we observed a
 * steady value over time when we observed a single moment. Callers get `null`
 * and render their own "not enough data" copy.
 */
import { useId, useMemo } from 'react';

/** Palette for categorical slices. Teal-led to match ArcFlow's identity. */
export const SERIES_COLORS = [
  '#14b8a6',
  '#4ade80',
  '#2dd4bf',
  '#22c55e',
  '#5eead4',
  '#0d9488',
  '#86efac',
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export interface Slice {
  label: string;
  value: number;
  color?: string;
}

/**
 * Donut chart.
 *
 * Renders nothing when the total is zero: an empty ring would suggest a
 * breakdown exists when there is no value to break down.
 */
export function Donut({
  slices,
  size = 180,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Build cumulative offsets so each arc starts where the previous ended.
  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const fraction = s.value / total;
        const arc = {
          ...s,
          color: s.color ?? seriesColor(i),
          dash: fraction * circumference,
          offset,
          fraction,
        };
        offset += fraction * circumference;
        return arc;
      });
  }, [slices, total, circumference]);

  if (total <= 0) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Allocation across ${arcs.length} categories`}
    >
      {/* Track behind the arcs keeps the ring visible when one slice is tiny. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={thickness}
      />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={`${a.dash} ${circumference - a.dash}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
          >
            <title>{`${a.label}: ${(a.fraction * 100).toFixed(1)}%`}</title>
          </circle>
        ))}
      </g>
      {(centerValue || centerLabel) && (
        <>
          {centerLabel && (
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 11 }}
            >
              {centerLabel}
            </text>
          )}
          {centerValue && (
            <text
              x="50%"
              y="58%"
              textAnchor="middle"
              className="fill-white"
              style={{ fontSize: 17, fontWeight: 700 }}
            >
              {centerValue}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * Filled area chart for a value series.
 *
 * Returns null below two points: a single observation has no shape, and
 * stretching it into a horizontal line would assert a history we do not have.
 */
export function AreaChart({
  points,
  width = 640,
  height = 160,
  color = '#14b8a6',
}: {
  points: Array<{ at: number; value: number }>;
  width?: number;
  height?: number;
  color?: string;
}) {
  const gradientId = useId();

  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const xs = points.map((p) => p.at);
    const ys = points.map((p) => p.value);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Pad the vertical range so a flat series sits mid-height instead of
    // hugging an edge, and so a tiny wobble is not amplified to full scale.
    const span = maxY - minY;
    const pad = span === 0 ? Math.max(1, Math.abs(maxY) * 0.1) : span * 0.15;
    const lowY = minY - pad;
    const highY = maxY + pad;

    const px = (v: number) =>
      maxX === minX ? width / 2 : ((v - minX) / (maxX - minX)) * width;
    const py = (v: number) => height - ((v - lowY) / (highY - lowY)) * height;

    const line = points.map((p) => `${px(p.at)},${py(p.value)}`).join(' ');
    const area = `M0,${height} L${line.split(' ').join(' L')} L${width},${height} Z`;

    return { line, area, first: ys[0], last: ys[ys.length - 1] };
  }, [points, width, height]);

  if (!geometry) return null;

  // Colour by direction over the window: green when up, muted when down.
  const rising = geometry.last >= geometry.first;
  const stroke = rising ? color : '#f87171';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Portfolio value over the recorded period"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <polyline
        points={geometry.line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Tiny inline trend line, for table rows. Null below two points. */
export function Sparkline({
  values,
  width = 64,
  height = 22,
  color = '#4ade80',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const line = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Horizontal proportion bar, used in allocation lists. */
export function Bar({ pct, color = '#14b8a6' }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
