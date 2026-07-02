// ── 2D Frame Analysis — interactive results workspace ────────────────────
// Renders the solved frame as a large, canvas-centric view with a result-mode
// toolbar (Geometry/Loads/Reactions/Axial/Shear/Moment/Deflection/
// Displacements), click-to-inspect members/nodes, and a collapsible side
// panel — replacing the old table + small deformed-shape-panel layout.
//
// This is a separate state machine from the builder canvas in frame.js: it
// renders the frozen frameSnapshot + solver output (sol), never the live,
// still-editable `frame`. It reuses frame.js's parameterized view-transform
// and hit-testing helpers (worldToScreenIn/findNodeNearIn/etc.), and its
// shared UI helpers (COLORS/fmt/panel/kvTable/badge/isPass).

const RESULT_CANVAS_W = 1000, RESULT_CANVAS_H = 620, RESULT_CANVAS_PAD = 90;
const RESULT_HIT_TOL_NODE = 16, RESULT_HIT_TOL_MEMBER = 40;

const RESULT_MODES = [
  { id: 'geometry',      label: 'Geometry' },
  { id: 'loads',         label: 'Loads' },
  { id: 'reactions',     label: 'Reactions' },
  { id: 'axial',         label: 'Axial Force' },
  { id: 'shear',         label: 'Shear Force' },
  { id: 'moment',        label: 'Bending Moment' },
  { id: 'deflection',    label: 'Deflection' },
  { id: 'displacements', label: 'Node Displacements' },
];

let resultMode = 'geometry';
let resultSelection = { type: null, id: null };
let resultViewState = { scale: 40, minX: 0, minY: 0, canvasW: RESULT_CANVAS_W, canvasH: RESULT_CANVAS_H, pad: RESULT_CANVAS_PAD };
let deformScale = 1.0;
let deformOn = true;
let autoExaggerationK = 1;
let deformAnimHandle = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentSol = null, currentSnapshot = null, derivedStats = null;

// Auto-fit exaggeration so the largest nodal displacement reads as ~15% of
// the frame's diagonal — the same heuristic the old renderDeformedShapeSvg
// used, now the *default* for the user-adjustable slider rather than fixed.
function computeAutoExaggeration(sol, frameSnapshot) {
  const dMax = Math.max(1e-9, ...sol.displacements.map(d => Math.hypot(d.ux, d.uy)));
  const xs = frameSnapshot.nodes.map(n => n.x), ys = frameSnapshot.nodes.map(n => n.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  return Math.max(1, Math.min((0.15 * diag) / dMax, 5000));
}

// ── derived stats (pure aggregation of the solver's own output — no new calculations) ──
function computeDerivedStats(sol, frameSnapshot) {
  const perMember = {};
  let maxMoment = null, maxShear = null, maxAxial = null;
  for (const mf of sol.memberForces) {
    let peakN = mf.stations[0], peakV = mf.stations[0], peakM = mf.stations[0];
    for (const st of mf.stations) {
      if (Math.abs(st.N) > Math.abs(peakN.N)) peakN = st;
      if (Math.abs(st.V) > Math.abs(peakV.V)) peakV = st;
      if (Math.abs(st.M) > Math.abs(peakM.M)) peakM = st;
    }
    perMember[mf.member] = { peakN, peakV, peakM };
    if (!maxMoment || Math.abs(peakM.M) > Math.abs(maxMoment.value)) maxMoment = { value: peakM.M, member: mf.member, x: peakM.x };
    if (!maxShear || Math.abs(peakV.V) > Math.abs(maxShear.value)) maxShear = { value: peakV.V, member: mf.member, x: peakV.x };
    if (!maxAxial || Math.abs(peakN.N) > Math.abs(maxAxial.value)) maxAxial = { value: peakN.N, member: mf.member, x: peakN.x };
  }
  let maxDeflection = null;
  for (const d of sol.displacements) {
    const mag = Math.hypot(d.ux, d.uy);
    if (!maxDeflection || mag > maxDeflection.value) maxDeflection = { value: mag, node: d.node };
  }
  // "Critical member" := largest peak |M| anywhere along its length — moment
  // usually governs RC member design, and it's a single unambiguous number.
  const criticalMemberId = maxMoment ? maxMoment.member : null;
  const domainOf = key => Math.max(1e-6, ...sol.memberForces.flatMap(mf => mf.stations.map(st => Math.abs(st[key]))));
  return {
    perMember, maxMoment, maxShear, maxAxial, maxDeflection, criticalMemberId,
    colorDomains: { N: domainOf('N'), V: domainOf('V'), M: domainOf('M') },
  };
}

// ── shell ──────────────────────────────────────────────────────────────
function getResultsContainer() {
  let el = document.getElementById('frameResults');
  if (!el) {
    el = document.createElement('section');
    el.id = 'frameResults';
    el.className = 'pt-10 space-y-5';
    const loading = document.getElementById('loadingState');
    loading.parentNode.insertBefore(el, loading.nextSibling);
  }
  el.classList.remove('hidden');
  return el;
}

function renderResultsShell() {
  return `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="font-mono text-xs text-steel section-tag">02</span>
        <h2 class="font-display text-sm font-semibold uppercase tracking-[0.18em]">Analysis Results</h2>
      </div>
    </div>
    <div id="resultSummaryCards"></div>
    <div id="resultToolbar" class="bg-surface border border-grid rounded-lg p-2 shadow-sm flex flex-wrap gap-1.5">
      ${RESULT_MODES.map(m => `<button data-result-mode="${m.id}" class="result-mode-btn font-mono text-[11px] px-3 py-1.5 rounded border transition-colors ${m.id === 'geometry' ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink border-grid hover:border-ink/40'}">${m.label}</button>`).join('')}
    </div>
    <div id="resultLegend"></div>
    <div id="resultDeformControls"></div>
    <div class="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div class="bg-surface border border-grid rounded-lg shadow-sm overflow-hidden relative">
        <svg id="resultCanvas" viewBox="0 0 ${RESULT_CANVAS_W} ${RESULT_CANVAS_H}" class="w-full h-auto block"></svg>
        <div id="resultTooltip" class="hidden absolute z-10 pointer-events-none font-mono text-[10px] bg-ink text-paper px-2 py-1.5 rounded shadow-sm leading-relaxed max-w-[220px]"></div>
      </div>
      <div class="bg-surface border border-grid rounded-lg shadow-sm lg:sticky lg:top-24 overflow-hidden">
        <button id="resultPanelToggle" type="button" class="w-full flex items-center justify-between px-4 py-3 border-b border-grid bg-paper/40">
          <span class="font-mono text-[10px] text-steel uppercase tracking-[0.15em]">Details</span>
          <svg id="resultPanelChevron" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#5E7081" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform .15s;"><polyline points="4 6 8 10 12 6"/></svg>
        </button>
        <div id="resultSidePanel" class="p-4 space-y-3"></div>
      </div>
    </div>`;
}

// ── summary cards (requirement 8) ─────────────────────────────────────────
function statCard(label, value, unit, accentColor) {
  return `<div class="bg-surface border border-grid rounded-lg px-4 py-3 flex-1 min-w-[140px]">
    <p class="font-mono text-[10px] text-steel uppercase tracking-[0.15em]">${label}</p>
    <p class="font-display text-lg font-semibold mt-0.5" style="color:${accentColor}">${value}<span class="text-xs text-steel font-mono ml-1">${unit}</span></p>
  </div>`;
}
function renderSummaryCards() {
  const stable = !currentSol.unstable;
  const cards = [
    `<div class="bg-surface border border-grid rounded-lg px-4 py-3 flex-1 min-w-[140px] flex flex-col justify-center gap-1">
      <p class="font-mono text-[10px] text-steel uppercase tracking-[0.15em]">Status</p>
      ${badge(stable ? 'stable' : 'unstable')}
    </div>`,
    statCard('Max Moment', derivedStats.maxMoment ? fmt(derivedStats.maxMoment.value, 1) : '—', 'kN·m', COLORS.orange),
    statCard('Max Shear', derivedStats.maxShear ? fmt(derivedStats.maxShear.value, 1) : '—', 'kN', COLORS.blue),
    statCard('Max Deflection', derivedStats.maxDeflection ? fmt(derivedStats.maxDeflection.value * 1000, 1) : '—', 'mm', COLORS.teal),
    statCard('Critical Member', derivedStats.criticalMemberId ? `M${derivedStats.criticalMemberId}` : '—', 'by peak moment', COLORS.critical),
  ];
  document.getElementById('resultSummaryCards').innerHTML = `<div class="flex flex-wrap gap-3">${cards.join('')}</div>`;
}

// ── canvas rendering dispatch ──────────────────────────────────────────────
function svgGridDefsAndBackground(vs) {
  const C = COLORS;
  const step = vs.scale;
  const origin = worldToScreenIn(vs, 0, 0);
  const patX = origin.sx % step, patY = origin.sy % step;
  let s = `<defs>
    <marker id="resultArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="6" orient="auto">
      <path d="M0,0 L7,0 L3.5,7 Z" fill="${C.orange}"/>
    </marker>
    <marker id="resultArrowTeal" markerWidth="7" markerHeight="7" refX="3.5" refY="6" orient="auto">
      <path d="M0,0 L7,0 L3.5,7 Z" fill="${C.teal}"/>
    </marker>
    <pattern id="resultPattern" x="${patX}" y="${patY}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
      <line x1="${step/2}" y1="0" x2="${step/2}" y2="${step}" stroke="${C.gridMinor}" stroke-width="1"/>
      <line x1="0" y1="${step/2}" x2="${step}" y2="${step/2}" stroke="${C.gridMinor}" stroke-width="1"/>
      <path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="${C.gridMajor}" stroke-width="1"/>
    </pattern>
  </defs>`;
  s += `<rect x="0" y="0" width="${vs.canvasW}" height="${vs.canvasH}" fill="${C.canvasBg}"/>`;
  s += `<rect x="0" y="0" width="${vs.canvasW}" height="${vs.canvasH}" fill="url(#resultPattern)"/>`;
  return s;
}

// Always-on base layer: members (with M{id} labels) + support glyphs +
// circular numbered node badges (requirement 10 — a visually distinct
// marker instead of plain "N1" text).
function renderGeometryLayer(vs) {
  const C = COLORS;
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  let s = '';
  for (const m of currentSnapshot.members) {
    const n1 = currentSnapshot.nodes.find(n => n.id === m.n1), n2 = currentSnapshot.nodes.find(n => n.id === m.n2);
    const a = wts(n1.x, n1.y), b = wts(n2.x, n2.y);
    const isSel = resultSelection.type === 'member' && resultSelection.id === m.id;
    s += `<line x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="${isSel ? C.blue : C.ink}" stroke-width="${isSel ? 4 : 3}" stroke-linecap="round"/>`;
    const midx = (a.sx + b.sx) / 2, midy = (a.sy + b.sy) / 2;
    const mlen = Math.hypot(b.sx - a.sx, b.sy - a.sy) || 1;
    let perpX = -(b.sy - a.sy) / mlen, perpY = (b.sx - a.sx) / mlen;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; }
    s += `<text x="${midx + perpX*14}" y="${midy + perpY*14}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="600" fill="${isSel ? C.blue : C.steel}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">M${m.id}</text>`;
  }
  for (const n of currentSnapshot.nodes) {
    const p = wts(n.x, n.y);
    s += drawSupportGlyph(n, wts);
    const isSel = resultSelection.type === 'node' && resultSelection.id === n.id;
    const r = isSel ? 12 : 10;
    s += `<circle cx="${p.sx}" cy="${p.sy}" r="${r}" fill="${isSel ? C.blue : C.ink}" stroke="${C.canvasBg}" stroke-width="2"/>`;
    s += `<text x="${p.sx}" y="${p.sy}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" fill="#FFFFFF">${n.id}</text>`;
  }
  return s;
}

// Applied loads (requirement 2) — reuses the builder's own load-arrow
// drawing so both canvases render loads identically, just against a
// different worldToScreen/node list and a marker id local to this SVG.
function renderLoadsLayer(vs) {
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  let s = '';
  for (const ml of currentSnapshot.memberLoads) {
    const m = currentSnapshot.members.find(x => x.id === ml.member);
    if (m) s += drawLoadArrows(ml, m, wts, currentSnapshot.nodes, 'resultArrow');
  }
  for (const n of currentSnapshot.nodes) {
    const nl = currentSnapshot.nodalLoads.find(x => x.node === n.id);
    s += drawNodalLoadArrows(n, nl, wts, 'resultArrow');
  }
  return s;
}

// ── reaction glyphs (requirement 7) ───────────────────────────────────────
function polarPt(p, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: p.sx + r * Math.cos(rad), y: p.sy - r * Math.sin(rad) }; // screen y flipped, matches worldToScreen's up=-y
}
function reactionArrowVertical(p, Ry) {
  const C = COLORS;
  const up = Ry >= 0; // positive Ry = upward reaction (matches the backend's documented sign convention)
  const tailY = up ? p.sy + 46 : p.sy - 46;
  const headY = up ? p.sy + 16 : p.sy - 16;
  const labelAttrs = `font-size="11" font-weight="600" fill="${C.teal}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  return `<line x1="${p.sx}" y1="${tailY}" x2="${p.sx}" y2="${headY}" stroke="${C.teal}" stroke-width="2.2" marker-end="url(#resultArrowTeal)"/>
    <text x="${p.sx + 10}" y="${tailY + (up ? 4 : -4)}" ${labelAttrs}>${fmt(Math.abs(Ry),1)} kN</text>`;
}
function reactionArrowHorizontal(p, Rx) {
  const C = COLORS;
  const right = Rx >= 0;
  const tailX = right ? p.sx - 46 : p.sx + 46;
  const headX = right ? p.sx - 16 : p.sx + 16;
  const labelAttrs = `font-size="11" font-weight="600" fill="${C.teal}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  return `<line x1="${tailX}" y1="${p.sy}" x2="${headX}" y2="${p.sy}" stroke="${C.teal}" stroke-width="2.2" marker-end="url(#resultArrowTeal)"/>
    <text x="${tailX}" y="${p.sy - 8}" text-anchor="${right ? 'start' : 'end'}" ${labelAttrs}>${fmt(Math.abs(Rx),1)} kN</text>`;
}
// Moment reaction as a circular arrow — built as a discretized polyline (not
// a raw SVG arc command) so the arrowhead direction is just "the vector
// between the last two points," the same technique drawLoadArrows already
// uses for its UDL glyph, rather than reasoning about arc sweep-flags.
function reactionMomentArc(p, M) {
  const C = COLORS;
  const r = 16;
  const ccw = M >= 0;
  const startDeg = -40, endDeg = 220; // ~260° sweep, gap so it doesn't read as a closed circle
  const steps = 24;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = ccw ? startDeg + t * (endDeg - startDeg) : -(startDeg + t * (endDeg - startDeg));
    pts.push(polarPt(p, r, deg));
  }
  const pathPts = pts.map(pt => `${pt.x},${pt.y}`).join(' ');
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
  const headLen = 7, headW = 5;
  const backX = last.x - headLen * Math.cos(ang), backY = last.y - headLen * Math.sin(ang);
  const leftX = backX - headW * Math.sin(ang), leftY = backY + headW * Math.cos(ang);
  const rightX = backX + headW * Math.sin(ang), rightY = backY - headW * Math.cos(ang);
  const labelDeg = ccw ? (startDeg + endDeg) / 2 : -(startDeg + endDeg) / 2;
  const labelP = polarPt(p, r + 16, labelDeg);
  const labelAttrs = `font-size="11" font-weight="600" fill="${C.teal}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  return `<polyline points="${pathPts}" fill="none" stroke="${C.teal}" stroke-width="2"/>
    <polygon points="${last.x},${last.y} ${leftX},${leftY} ${rightX},${rightY}" fill="${C.teal}"/>
    <text x="${labelP.x}" y="${labelP.y}" text-anchor="middle" dominant-baseline="middle" ${labelAttrs}>${fmt(Math.abs(M),1)} kN·m</text>`;
}
function renderReactionsLayer(vs) {
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  const EPS = 1e-3;
  let s = '';
  for (const n of currentSnapshot.nodes) {
    if (!n.support || n.support.type === 'free') continue;
    const r = currentSol.reactions.find(x => x.node === n.id);
    const p = wts(n.x, n.y);
    if (Math.abs(r.Ry) > EPS) s += reactionArrowVertical(p, r.Ry);
    if (Math.abs(r.Rx) > EPS) s += reactionArrowHorizontal(p, r.Rx);
    if (Math.abs(r.M) > EPS) s += reactionMomentArc(p, r.M);
  }
  return s;
}

// ── color gradient (requirement 11): blue → teal → orange → critical(red) ──
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lerpHexColor(c1, c2, t) {
  const p1 = hexToRgb(c1), p2 = hexToRgb(c2);
  return `rgb(${Math.round(p1.r + (p2.r-p1.r)*t)},${Math.round(p1.g + (p2.g-p1.g)*t)},${Math.round(p1.b + (p2.b-p1.b)*t)})`;
}
function colorForMagnitude(absValue, domainMax) {
  const t = domainMax > 0 ? Math.max(0, Math.min(1, absValue / domainMax)) : 0;
  const stops = [COLORS.blue, COLORS.teal, COLORS.orange, COLORS.critical];
  const seg = Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2);
  const localT = t * (stops.length - 1) - seg;
  return lerpHexColor(stops[seg], stops[seg + 1], localT);
}

// Force diagrams drawn along the member (requirements 4, 11) — the
// perpendicular-offset trick already used for member labels, but scaled
// per-station by the normalized force value so the offset itself *is* the
// diagram. Built as per-segment polygons (not one flat shape) so each
// segment can carry its own color. The member's baseline line always stays
// neutral ink/blue-if-selected — a stable reference as the mode changes —
// while the band carries the magnitude gradient.
function renderForceDiagramLayer(vs, mode) {
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  const key = { axial: 'N', shear: 'V', moment: 'M' }[mode];
  const globalMax = derivedStats.colorDomains[key];
  const BAND_PX = 32;
  const bandOpacity = mode === 'shear' ? 0.45 : 0.28; // shear reads "blockier", moment as a smoother envelope
  const labelAttrs = `font-size="10" font-weight="600" fill="${COLORS.ink}" stroke="${COLORS.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  let s = '';
  for (const mf of currentSol.memberForces) {
    const member = currentSnapshot.members.find(m => m.id === mf.member);
    const n1 = currentSnapshot.nodes.find(n => n.id === member.n1), n2 = currentSnapshot.nodes.find(n => n.id === member.n2);
    const a = wts(n1.x, n1.y), b = wts(n2.x, n2.y);
    const mlen = Math.hypot(b.sx - a.sx, b.sy - a.sy) || 1;
    let perpX = -(b.sy - a.sy) / mlen, perpY = (b.sx - a.sx) / mlen;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; }
    const isSel = resultSelection.type === 'member' && resultSelection.id === member.id;

    const basePts = [], offsetPts = [];
    for (const st of mf.stations) {
      const t = mf.L > 0 ? st.x / mf.L : 0;
      const sp = wts(n1.x + t * (n2.x - n1.x), n1.y + t * (n2.y - n1.y));
      const off = globalMax > 0 ? (st[key] / globalMax) * BAND_PX : 0;
      basePts.push(sp);
      offsetPts.push({ sx: sp.sx + perpX * off, sy: sp.sy + perpY * off });
    }
    for (let i = 0; i < basePts.length - 1; i++) {
      const avgVal = (Math.abs(mf.stations[i][key]) + Math.abs(mf.stations[i+1][key])) / 2;
      const c = colorForMagnitude(avgVal, globalMax);
      const quad = `${basePts[i].sx},${basePts[i].sy} ${offsetPts[i].sx},${offsetPts[i].sy} ${offsetPts[i+1].sx},${offsetPts[i+1].sy} ${basePts[i+1].sx},${basePts[i+1].sy}`;
      s += `<polygon points="${quad}" fill="${c}" fill-opacity="${bandOpacity}" stroke="${c}" stroke-width="0.75"/>`;
    }
    s += `<line x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="${isSel ? COLORS.blue : COLORS.ink}" stroke-width="${isSel ? 3 : 1.6}"/>`;

    const peakIdx = mf.stations.reduce((bi, st, i, arr) => Math.abs(st[key]) > Math.abs(arr[bi][key]) ? i : bi, 0);
    const peakVal = mf.stations[peakIdx][key];
    if (Math.abs(peakVal) > 1e-6) {
      const lp = offsetPts[peakIdx];
      const unit = key === 'M' ? 'kN·m' : 'kN';
      s += `<text x="${lp.sx + perpX*10}" y="${lp.sy + perpY*10}" text-anchor="middle" ${labelAttrs}>${fmt(peakVal,1)} ${unit}</text>`;
    }
  }
  return s;
}

function updateResultLegend() {
  const el = document.getElementById('resultLegend');
  if (!el) return;
  const isForceMode = resultMode === 'axial' || resultMode === 'shear' || resultMode === 'moment';
  if (!isForceMode) { el.innerHTML = ''; return; }
  const key = { axial: 'N', shear: 'V', moment: 'M' }[resultMode];
  const unit = key === 'M' ? 'kN·m' : 'kN';
  const max = derivedStats.colorDomains[key];
  const stops = [COLORS.blue, COLORS.teal, COLORS.orange, COLORS.critical];
  el.innerHTML = `<div class="bg-surface border border-grid rounded-lg px-4 py-2.5 shadow-sm flex items-center gap-3">
    <span class="font-mono text-[10px] text-steel uppercase tracking-[0.15em] whitespace-nowrap">Magnitude</span>
    <div class="h-2 flex-1 rounded-full" style="background:linear-gradient(to right, ${stops.join(',')})"></div>
    <span class="font-mono text-[10px] text-steel whitespace-nowrap">0 → ${fmt(max,1)} ${unit}</span>
  </div>`;
}

// ── deflection mode (requirement 9) ───────────────────────────────────────
// Draws the deformed shape by adding the member's real chord-relative
// bending curve (station.w, zero at both ends by construction) on top of a
// straight line between the two solved nodal displacements — so the curve
// always lands exactly on the correct deformed node position, without
// needing anaStruct's element rotation angle. `multiplier` is 0..deformScale
// (the animated toggle value); it's combined with the auto-fit
// autoExaggerationK to get the actual exaggeration factor.
function renderDeflectionLayer(vs, multiplier) {
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  const C = COLORS;
  let s = '';
  for (const m of currentSnapshot.members) {
    const n1 = currentSnapshot.nodes.find(n => n.id === m.n1), n2 = currentSnapshot.nodes.find(n => n.id === m.n2);
    const a = wts(n1.x, n1.y), b = wts(n2.x, n2.y);
    s += `<line x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="${C.steel}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.55"/>`;
  }
  if (multiplier <= 0) return s;

  const k = autoExaggerationK * multiplier;
  for (const mf of currentSol.memberForces) {
    const member = currentSnapshot.members.find(m => m.id === mf.member);
    const n1 = currentSnapshot.nodes.find(n => n.id === member.n1), n2 = currentSnapshot.nodes.find(n => n.id === member.n2);
    const d1 = currentSol.displacements.find(d => d.node === member.n1), d2 = currentSol.displacements.find(d => d.node === member.n2);
    const dx = n2.x - n1.x, dy = n2.y - n1.y;
    const len = Math.hypot(dx, dy) || 1;
    // World-space perpendicular, rotated so positive station.w reads as
    // physically-downward sag under a downward load (verified against a
    // known UDL test case — see Phase 4 notes).
    const perpX = dy / len, perpY = -dx / len;
    const x1d = n1.x + d1.ux * k, y1d = n1.y + d1.uy * k;
    const x2d = n2.x + d2.ux * k, y2d = n2.y + d2.uy * k;

    const pts = mf.stations.map(st => {
      const t = mf.L > 0 ? st.x / mf.L : 0;
      const chordX = x1d + t * (x2d - x1d), chordY = y1d + t * (y2d - y1d);
      const bend = (st.w || 0) * k;
      return wts(chordX + perpX * bend, chordY + perpY * bend);
    });
    const isSel = resultSelection.type === 'member' && resultSelection.id === member.id;
    const polyPts = pts.map(p => `${p.sx},${p.sy}`).join(' ');
    s += `<polyline points="${polyPts}" fill="none" stroke="${C.blue}" stroke-width="${isSel ? 3.2 : 2.2}"/>`;
  }
  return s;
}

function renderDeformControlsVisibility() {
  const el = document.getElementById('resultDeformControls');
  if (!el) return;
  if (resultMode !== 'deflection') { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="bg-surface border border-grid rounded-lg px-4 py-3 shadow-sm flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 font-mono text-[11px] text-steel cursor-pointer select-none">
        <input id="deformToggle" type="checkbox" ${deformOn ? 'checked' : ''} class="accent-blue">
        Show deformation
      </label>
      <label class="flex items-center gap-2 font-mono text-[11px] text-steel flex-1 min-w-[220px]">
        <span class="whitespace-nowrap">Exaggeration ×<span id="deformScaleLabel">${deformScale.toFixed(2)}</span></span>
        <input id="deformSlider" type="range" min="0" max="3" step="0.05" value="${deformScale}" class="flex-1" ${deformOn ? '' : 'disabled'}>
      </label>
    </div>`;
  document.getElementById('deformSlider').addEventListener('input', e => {
    deformScale = parseFloat(e.target.value);
    document.getElementById('deformScaleLabel').textContent = deformScale.toFixed(2);
    if (deformOn) renderResultCanvas(); // live/instant per design — only the on/off toggle animates
  });
  document.getElementById('deformToggle').addEventListener('change', e => animateDeformToggle(e.target.checked));
}

// Only the on/off toggle animates (confirmed scope) — the slider stays
// instant while dragging. Patches just the #deflectionLayer subgroup per
// frame so grid/geometry aren't redrawn 60x/sec.
function animateDeformToggle(turningOn) {
  if (deformAnimHandle) cancelAnimationFrame(deformAnimHandle);
  if (prefersReducedMotion) { deformOn = turningOn; renderResultCanvas(); renderDeformControlsVisibility(); return; }
  const DURATION = 500;
  const startVal = turningOn ? 0 : deformScale, endVal = turningOn ? deformScale : 0;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / DURATION);
    const eased = t * (2 - t); // ease-out quad
    const layer = document.getElementById('deflectionLayer');
    if (layer) layer.innerHTML = renderDeflectionLayer(resultViewState, startVal + (endVal - startVal) * eased);
    if (t < 1) {
      deformAnimHandle = requestAnimationFrame(step);
    } else {
      deformAnimHandle = null;
      deformOn = turningOn;
      renderResultCanvas();
      renderDeformControlsVisibility(); // re-render so the slider's disabled state matches
    }
  }
  deformAnimHandle = requestAnimationFrame(step);
}

// ── node displacements mode (requirement 3) ───────────────────────────────
// Numeric Ux/Uy/rotation readout near each node, matching the existing
// load-magnitude-label visual convention already used elsewhere on canvas
// (halo-backed small mono text) rather than a separate vector-arrow glyph.
function renderDisplacementLabelsLayer(vs) {
  const wts = (x, y) => worldToScreenIn(vs, x, y);
  const C = COLORS;
  const labelAttrs = `font-size="10" font-weight="600" fill="${C.blue}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  let s = '';
  for (const n of currentSnapshot.nodes) {
    const d = currentSol.displacements.find(x => x.node === n.id);
    const p = wts(n.x, n.y);
    s += `<text x="${p.sx + 14}" y="${p.sy - 18}" ${labelAttrs}>Ux ${fmt(d.ux*1000,1)} · Uy ${fmt(d.uy*1000,1)} mm</text>`;
    s += `<text x="${p.sx + 14}" y="${p.sy - 6}" ${labelAttrs}>θ ${fmt(d.theta*1000,2)} mrad</text>`;
  }
  return s;
}

function renderResultCanvas() {
  const svg = document.getElementById('resultCanvas');
  const vs = resultViewState;
  let s = svgGridDefsAndBackground(vs);
  s += renderGeometryLayer(vs);
  if (resultMode === 'loads') s += renderLoadsLayer(vs);
  if (resultMode === 'reactions') s += renderReactionsLayer(vs);
  if (resultMode === 'axial' || resultMode === 'shear' || resultMode === 'moment') s += renderForceDiagramLayer(vs, resultMode);
  if (resultMode === 'deflection') s += `<g id="deflectionLayer">${renderDeflectionLayer(vs, deformOn ? deformScale : 0)}</g>`;
  if (resultMode === 'displacements') s += renderDisplacementLabelsLayer(vs);
  svg.innerHTML = s;
}

// ── side panel (requirement 12) ───────────────────────────────────────────
function renderModelSummaryPanel() {
  const nodeCount = currentSnapshot.nodes.length, memberCount = currentSnapshot.members.length;
  const supportCount = currentSnapshot.nodes.filter(n => n.support && n.support.type !== 'free').length;
  return `
    <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Model Summary</p>
    ${kvTable([
      ['Nodes', nodeCount],
      ['Members', memberCount],
      ['Supports', supportCount],
      ['Stability', currentSol.unstable ? 'Unstable' : 'Stable'],
    ])}
    <p class="font-mono text-[11px] text-steel">Click a member or node on the model to inspect its results.</p>`;
}

function renderMemberDetailPanel(memberId) {
  const member = currentSnapshot.members.find(m => m.id === memberId);
  if (!member) { resultSelection = { type: null, id: null }; return renderModelSummaryPanel(); }
  const n1 = currentSnapshot.nodes.find(n => n.id === member.n1), n2 = currentSnapshot.nodes.find(n => n.id === member.n2);
  const length = Math.hypot(n2.x - n1.x, n2.y - n1.y);
  const stats = derivedStats.perMember[memberId];
  const mf = currentSol.memberForces.find(f => f.member === memberId);
  const stations = mf ? mf.stations : [];
  const endStart = stations[0] || { N: 0, V: 0, M: 0 }, endEnd = stations[stations.length - 1] || { N: 0, V: 0, M: 0 };
  // No per-station deflection from the solver yet (see Phase 4) — approximate
  // with the larger of the member's two end-node displacement magnitudes.
  const d1 = currentSol.displacements.find(d => d.node === member.n1), d2 = currentSol.displacements.find(d => d.node === member.n2);
  const maxDeflApprox = Math.max(Math.hypot(d1.ux, d1.uy), Math.hypot(d2.ux, d2.uy));
  return `
    <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Member M${member.id} (N${member.n1}→N${member.n2})</p>
    ${kvTable([
      ['Length', `${fmt(length,2)} m`],
      ['Section', `${fmt(member.b_mm,0)} × ${fmt(member.h_mm,0)} mm`],
      ['Material', `f<sub>cu</sub> ${fmt(member.fcu,0)} N/mm²`],
      ['Axial force (peak)', `${fmt(stats.peakN.N,1)} kN`],
      ['Max shear', `${fmt(stats.peakV.V,1)} kN @ ${fmt(stats.peakV.x,2)} m`],
      ['Max moment', `${fmt(stats.peakM.M,1)} kN·m @ ${fmt(stats.peakM.x,2)} m`],
      ['Max deflection (end nodes)', `${fmt(maxDeflApprox*1000,1)} mm`],
    ])}
    <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em] mt-2">End forces</p>
    ${kvTable([
      [`N${member.n1} end`, `N ${fmt(endStart.N,1)} · V ${fmt(endStart.V,1)} · M ${fmt(endStart.M,1)}`],
      [`N${member.n2} end`, `N ${fmt(endEnd.N,1)} · V ${fmt(endEnd.V,1)} · M ${fmt(endEnd.M,1)}`],
    ])}`;
}

function renderNodeDetailPanel(nodeId) {
  const node = currentSnapshot.nodes.find(n => n.id === nodeId);
  if (!node) { resultSelection = { type: null, id: null }; return renderModelSummaryPanel(); }
  const d = currentSol.displacements.find(x => x.node === nodeId);
  const rows = [
    ['Position', `(${fmt(node.x,2)}, ${fmt(node.y,2)}) m`],
    ['Ux', `${fmt(d.ux*1000,2)} mm`],
    ['Uy', `${fmt(d.uy*1000,2)} mm`],
    ['Rotation θ', `${fmt(d.theta*1000,2)} mrad`],
  ];
  if (node.support && node.support.type !== 'free') {
    const r = currentSol.reactions.find(x => x.node === nodeId);
    rows.push(['Support', node.support.type]);
    rows.push(['Rx', `${fmt(r.Rx,1)} kN`]);
    rows.push(['Ry', `${fmt(r.Ry,1)} kN`]);
    rows.push(['M', `${fmt(r.M,1)} kN·m`]);
  }
  return `<p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Node N${node.id}</p>${kvTable(rows)}`;
}

function renderSidePanel() {
  const el = document.getElementById('resultSidePanel');
  if (resultSelection.type === 'member') el.innerHTML = renderMemberDetailPanel(resultSelection.id);
  else if (resultSelection.type === 'node') el.innerHTML = renderNodeDetailPanel(resultSelection.id);
  else el.innerHTML = renderModelSummaryPanel();
}

// ── hover tooltips (requirement 6) ────────────────────────────────────────
function showResultTooltip(html, evt, wrapEl) {
  const el = document.getElementById('resultTooltip');
  if (!el) return;
  const wrapRect = wrapEl.getBoundingClientRect();
  el.innerHTML = html;
  el.style.left = `${evt.clientX - wrapRect.left + 14}px`;
  el.style.top = `${evt.clientY - wrapRect.top - 10}px`;
  el.classList.remove('hidden');
}
function hideResultTooltip() { const el = document.getElementById('resultTooltip'); if (el) el.classList.add('hidden'); }

function nodeTooltipHtml(node) {
  const d = currentSol.displacements.find(x => x.node === node.id);
  return `<div class="font-semibold mb-0.5">Node N${node.id}</div>Ux ${fmt(d.ux*1000,2)} mm · Uy ${fmt(d.uy*1000,2)} mm · θ ${fmt(d.theta*1000,2)} mrad`;
}
function memberTooltipHtml(member) {
  const stats = derivedStats.perMember[member.id];
  const n1 = currentSnapshot.nodes.find(n => n.id === member.n1), n2 = currentSnapshot.nodes.find(n => n.id === member.n2);
  const length = Math.hypot(n2.x - n1.x, n2.y - n1.y);
  return `<div class="font-semibold mb-0.5">Member M${member.id}</div>Length ${fmt(length,2)} m · N ${fmt(stats.peakN.N,1)} kN · V<sub>max</sub> ${fmt(stats.peakV.V,1)} kN · M<sub>max</sub> ${fmt(stats.peakM.M,1)} kN·m`;
}

// ── interaction ────────────────────────────────────────────────────────────
function wireResultToolbar() {
  document.querySelectorAll('.result-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      resultMode = btn.dataset.resultMode;
      document.querySelectorAll('.result-mode-btn').forEach(b => {
        const active = b === btn;
        b.classList.toggle('bg-ink', active);
        b.classList.toggle('text-paper', active);
        b.classList.toggle('border-ink', active);
        b.classList.toggle('bg-surface', !active);
        b.classList.toggle('text-ink', !active);
        b.classList.toggle('border-grid', !active);
      });
      // Deliberately do NOT clear resultSelection here — flipping between
      // Axial/Shear/Moment while a member stays selected is the point.
      renderResultCanvas();
      updateResultLegend();
      renderDeformControlsVisibility();
    });
  });
}

function wireResultPanelToggle() {
  document.getElementById('resultPanelToggle').addEventListener('click', () => {
    const panelBody = document.getElementById('resultSidePanel');
    const chevron = document.getElementById('resultPanelChevron');
    const opening = panelBody.classList.contains('hidden');
    panelBody.classList.toggle('hidden', !opening);
    chevron.style.transform = opening ? 'rotate(180deg)' : '';
  });
}

function wireResultCanvasInteraction() {
  const svg = document.getElementById('resultCanvas');
  const wrap = svg.parentElement;
  svg.addEventListener('click', evt => {
    const { sx, sy } = getSvgPoint(svg, evt);
    const n = findNodeNearIn(currentSnapshot.nodes, resultViewState, sx, sy, RESULT_HIT_TOL_NODE);
    if (n) { resultSelection = { type: 'node', id: n.id }; renderResultCanvas(); renderSidePanel(); return; }
    const m = findMemberNearIn(currentSnapshot.nodes, currentSnapshot.members, resultViewState, sx, sy, RESULT_HIT_TOL_MEMBER);
    if (m) { resultSelection = { type: 'member', id: m.id }; renderResultCanvas(); renderSidePanel(); return; }
    resultSelection = { type: null, id: null }; renderResultCanvas(); renderSidePanel();
  });
  svg.addEventListener('mousemove', evt => {
    const { sx, sy } = getSvgPoint(svg, evt);
    const n = findNodeNearIn(currentSnapshot.nodes, resultViewState, sx, sy, RESULT_HIT_TOL_NODE);
    if (n) { showResultTooltip(nodeTooltipHtml(n), evt, wrap); return; }
    const m = findMemberNearIn(currentSnapshot.nodes, currentSnapshot.members, resultViewState, sx, sy, RESULT_HIT_TOL_MEMBER);
    if (m) { showResultTooltip(memberTooltipHtml(m), evt, wrap); return; }
    hideResultTooltip();
  });
  svg.addEventListener('mouseleave', hideResultTooltip);
}

// ── entry point (called from frame.js's runBtn handler, same signature the
// old inline renderResults(sol, frameSnapshot) had) ────────────────────────
function renderResults(sol, frameSnapshot) {
  currentSol = sol;
  currentSnapshot = frameSnapshot;
  derivedStats = computeDerivedStats(sol, frameSnapshot);
  autoExaggerationK = computeAutoExaggeration(sol, frameSnapshot);
  resultMode = 'geometry';
  resultSelection = { type: null, id: null };
  deformScale = 1.0;
  deformOn = true;

  getResultsContainer().innerHTML = renderResultsShell();
  resultViewState = makeViewState(currentSnapshot.nodes, RESULT_CANVAS_W, RESULT_CANVAS_H, RESULT_CANVAS_PAD);

  wireResultToolbar();
  wireResultPanelToggle();
  wireResultCanvasInteraction();

  renderResultCanvas();
  renderSidePanel();
  renderSummaryCards();
  updateResultLegend();
  renderDeformControlsVisibility();

  getResultsContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
}
