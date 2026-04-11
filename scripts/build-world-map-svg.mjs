// Convert world-atlas land-110m topojson → single compact SVG path at
// public/world-map.svg using equirectangular projection (lon→x, lat→y).
//
// Run once after fetching /tmp/land-110m.json. The resulting SVG is a
// 360x180 viewBox with a single <path d="..."> representing all land.

import fs from "node:fs";

const SRC = "scripts/land-110m.json";
const OUT = "public/world-map.svg";

const topo = JSON.parse(fs.readFileSync(SRC, "utf8"));
const land = topo.objects.land;
const [tx, ty] = topo.transform.translate;
const [sx, sy] = topo.transform.scale;

// Decode arc: topojson arcs are delta-encoded. Decode to absolute coords.
function decodeArc(arc) {
  let x = 0, y = 0;
  const out = [];
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    const lon = x * sx + tx;
    const lat = y * sy + ty;
    out.push([lon, lat]);
  }
  return out;
}

const arcs = topo.arcs.map(decodeArc);

// Equirectangular projection into viewBox (0..360, 0..180)
function project(lon, lat) {
  const X = lon + 180;
  const Y = 90 - lat;
  return [X, Y];
}

// Collect ring indices, handling negative (reversed) arc references
function ringToSvgPath(arcIdxs) {
  const pts = [];
  for (let idx of arcIdxs) {
    let rev = false;
    if (idx < 0) {
      idx = ~idx;
      rev = true;
    }
    const arc = arcs[idx];
    const seq = rev ? [...arc].reverse() : arc;
    for (let i = 0; i < seq.length; i++) {
      // Skip the first point of every arc after the first to avoid duplicates
      if (pts.length > 0 && i === 0) continue;
      pts.push(seq[i]);
    }
  }
  if (pts.length === 0) return "";
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const [lon, lat] = pts[i];
    const [x, y] = project(lon, lat);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  d += "Z";
  return d;
}

let pathD = "";
function walkGeom(g) {
  if (g.type === "Polygon") {
    for (const ring of g.arcs) pathD += ringToSvgPath(ring);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.arcs) {
      for (const ring of poly) pathD += ringToSvgPath(ring);
    }
  } else if (g.type === "GeometryCollection") {
    for (const sub of g.geometries) walkGeom(sub);
  }
}
walkGeom(land);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" preserveAspectRatio="none">
  <path d="${pathD}" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="0.3" />
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${(svg.length / 1024).toFixed(1)} KB)`);
