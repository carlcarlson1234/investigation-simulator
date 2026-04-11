"use client";

// Small map that shows a single flight's departure → arrival route.
// Loads /world-map.svg as the background continents and overlays the two
// airport pins plus a curved arc between them using equirectangular projection.

import { useEffect, useState } from "react";

interface FlightRouteMapProps {
  fromLat: number | null;
  fromLon: number | null;
  toLat: number | null;
  toLon: number | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  width?: number;
  height?: number;
}

// Equirectangular: map (lon, lat) → (x, y) within [0..W, 0..H].
function project(lon: number, lat: number, W: number, H: number): [number, number] {
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return [x, y];
}

export function FlightRouteMap({
  fromLat,
  fromLon,
  toLat,
  toLon,
  fromLabel,
  toLabel,
  width = 480,
  height = 240,
}: FlightRouteMapProps) {
  const [worldPath, setWorldPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/world-map.svg")
      .then((r) => r.text())
      .then((txt) => {
        if (cancelled) return;
        const m = txt.match(/<path d="([^"]+)"/);
        setWorldPath(m ? m[1] : null);
      })
      .catch(() => { if (!cancelled) setWorldPath(null); });
    return () => { cancelled = true; };
  }, []);

  if (fromLat == null || fromLon == null || toLat == null || toLon == null) {
    return (
      <div
        className="w-full rounded-lg border border-[#222] bg-[#0a0a0a] flex items-center justify-center text-[11px] text-[#555]"
        style={{ height }}
      >
        No geographic data for this flight
      </div>
    );
  }

  const [fx, fy] = project(fromLon, fromLat, width, height);
  const [tx, ty] = project(toLon, toLat, width, height);

  // Quadratic control point pushed perpendicular from the midpoint so the arc
  // bows "up" (northward). Bow magnitude scales with segment length.
  const mx = (fx + tx) / 2;
  const my = (fy + ty) / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular direction — choose the one that has smaller y (north).
  let px = -dy / len;
  let py = dx / len;
  if (py > 0) {
    px = -px;
    py = -py;
  }
  const bow = Math.min(0.22 * len, 60);
  const cx = mx + px * bow;
  const cy = my + py * bow;

  const arcPath = `M${fx.toFixed(2)},${fy.toFixed(2)} Q${cx.toFixed(2)},${cy.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)}`;

  return (
    <div
      className="relative w-full rounded-lg border border-[#222] bg-[#060606] overflow-hidden"
      style={{ height }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {/* Graticule — light lat/lon grid */}
        <g stroke="#151515" strokeWidth={0.5} fill="none">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line key={`h${i}`} x1={0} y1={(i * height) / 6} x2={width} y2={(i * height) / 6} />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <line key={`v${i}`} x1={(i * width) / 12} y1={0} x2={(i * width) / 12} y2={height} />
          ))}
        </g>

        {/* World land mass */}
        {worldPath && (
          <g transform={`scale(${width / 360}, ${height / 180})`}>
            <path d={worldPath} fill="#1c1c1c" stroke="#2a2a2a" strokeWidth={0.3} />
          </g>
        )}

        {/* Route arc */}
        <path
          d={arcPath}
          stroke="#ef4444"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="4 2"
          opacity={0.9}
        />

        {/* Airports */}
        <g>
          <circle cx={fx} cy={fy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
          <circle cx={tx} cy={ty} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
          {fromLabel && (
            <text
              x={fx + 8}
              y={fy - 6}
              fill="#fff"
              fontSize="11"
              fontWeight="bold"
              style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
            >
              {fromLabel}
            </text>
          )}
          {toLabel && (
            <text
              x={tx + 8}
              y={ty - 6}
              fill="#fff"
              fontSize="11"
              fontWeight="bold"
              style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
            >
              {toLabel}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
