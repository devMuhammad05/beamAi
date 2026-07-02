// ── config & auth (mirrors column.js) ───────────────────────────────────
const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : 'https://beamai-backend.fastapicloud.dev';

function authHeaders() {
  const token = localStorage.getItem('beamAi_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function checkAuth() {
  const token = localStorage.getItem('beamAi_token');
  if (!token) { window.location.href = 'index.html'; return; }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error('not_authed');
    const user = await res.json();
    sessionStorage.setItem('beamAi_user', JSON.stringify(user));
    updateUserDisplay(user);
  } catch {
    localStorage.removeItem('beamAi_token');
    sessionStorage.removeItem('beamAi_user');
    window.location.href = 'index.html';
  }
}

function updateUserDisplay(user) {
  const avatar = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  if (user.picture) {
    avatar.innerHTML = `<img src="${user.picture}" class="w-full h-full rounded-full object-cover" alt="">`;
    avatar.className = 'w-5 h-5 rounded-full overflow-hidden';
  } else {
    avatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
  }
  nameEl.textContent = user.name || user.email || 'User';
}

document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    localStorage.removeItem('beamAi_token');
    sessionStorage.removeItem('beamAi_user');
    window.location.href = 'index.html';
  }
});

checkAuth();

// ── shared UI helpers (mirrors column.js) ───────────────────────────────
function showError(message, duration = 6000) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMessage').textContent = message;
  banner.classList.remove('hidden');
  if (duration > 0) setTimeout(() => banner.classList.add('hidden'), duration);
}
document.getElementById('errorClose').addEventListener('click', () => {
  document.getElementById('errorBanner').classList.add('hidden');
});

function fmt(n, d = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (Math.abs(v) < 1e-3 ? 0 : v).toFixed(d);
}

function isPass(status) { return /(ok|pass|stable|✓)/i.test(String(status ?? '')); }
function badge(status) {
  if (status == null) return '';
  const ok = isPass(status);
  const cls = ok ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange';
  return `<span class="font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${cls}">${status}</span>`;
}
function kvTable(pairs) {
  return `<table class="w-full font-mono text-[12.5px]">${pairs.map(([k, v]) => `
    <tr class="border-b border-grid/60 last:border-0">
      <td class="py-1.5 pr-4 text-steel align-top">${k}</td>
      <td class="py-1.5 text-right text-ink whitespace-nowrap">${v}</td>
    </tr>`).join('')}</table>`;
}
function panel(tag, title, status, inner) {
  return `<div class="bg-surface border border-grid rounded-lg shadow-sm overflow-hidden">
    <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-grid bg-paper/40">
      <div class="flex items-center gap-2.5">
        <span class="font-mono text-[11px] text-steel section-tag">${tag}</span>
        <h3 class="font-display text-sm font-semibold uppercase tracking-[0.12em]">${title}</h3>
      </div>
      ${badge(status)}
    </div>
    <div class="p-4">${inner}</div>
  </div>`;
}

const COLORS = { ink: '#16243B', steel: '#5E7081', grid: '#D7E0EA', orange: '#E8623A', teal: '#2F8F6F', blue: '#3B6EA5', amber: '#F5A623', critical: '#C0392B', canvasBg: '#F4F6F9', gridMinor: '#DCE4EC', gridMajor: '#C7D3DF' };

// ── model / state ────────────────────────────────────────────────────────
const DRAFT_KEY = 'beamAi_frameDraft';

let frame = {
  nodes: [],
  members: [],
  nodalLoads: [],
  memberLoads: [],
};
let nextNodeId = 1;
let nextMemberId = 1;
let nextLoadId = 1;

let selection = { type: null, id: null };
let mode = 'select';
let pendingMemberNode = null; // first node clicked while in add-member mode
let dragNodeId = null;

function findNode(id) { return frame.nodes.find(n => n.id === id); }
function findMember(id) { return frame.members.find(m => m.id === id); }

function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ frame, nextNodeId, nextMemberId, nextLoadId })); } catch {}
}
function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || !saved.frame) return false;
    // An empty draft (e.g. Clear frame, then refresh) shouldn't override the
    // starter example — engineers should land on a real frame, not a blank canvas.
    if (!Array.isArray(saved.frame.nodes) || saved.frame.nodes.length === 0) return false;
    frame = saved.frame;
    nextNodeId = saved.nextNodeId || (Math.max(0, ...frame.nodes.map(n => n.id)) + 1);
    nextMemberId = saved.nextMemberId || (Math.max(0, ...frame.members.map(m => m.id)) + 1);
    nextLoadId = saved.nextLoadId || 1;
    return true;
  } catch { return false; }
}

function seedStarterFrame() {
  frame = {
    nodes: [
      { id: 1, x: 0, y: 0, support: { type: 'pin' } },
      { id: 2, x: 0, y: 3.5, support: { type: 'free' } },
      { id: 3, x: 6, y: 3.5, support: { type: 'free' } },
      { id: 4, x: 6, y: 0, support: { type: 'pin' } },
    ],
    members: [
      { id: 1, n1: 1, n2: 2, b_mm: 300, h_mm: 300, fcu: 30 },
      { id: 2, n1: 2, n2: 3, b_mm: 300, h_mm: 500, fcu: 30 },
      { id: 3, n1: 3, n2: 4, b_mm: 300, h_mm: 300, fcu: 30 },
    ],
    nodalLoads: [],
    memberLoads: [ { id: 1, member: 2, type: 'udl', w: 15, start: 0, end: 6 } ],
  };
  nextNodeId = 5; nextMemberId = 4; nextLoadId = 2;
}

function mutate(fn) {
  fn();
  saveDraft();
  renderAll();
}

// ── canvas rendering ─────────────────────────────────────────────────────
const CANVAS_W = 800, CANVAS_H = 520, CANVAS_PAD = 60;
let viewState = { scale: 40, minX: 0, minY: 0, canvasW: CANVAS_W, canvasH: CANVAS_H, pad: CANVAS_PAD };

// Parameterized view-transform helpers so a second canvas (the results view,
// in frame-results.js) can share this exact math against different data
// (frameSnapshot instead of live frame) and a different viewBox size, without
// duplicating it. The builder's own module-global functions below are thin
// wrappers over these so builder behavior is unchanged.
function makeViewState(nodes, canvasW, canvasH, pad) {
  if (nodes.length === 0) return { scale: 40, minX: -1, minY: -1, canvasW, canvasH, pad };
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const availW = canvasW - 2 * pad, availH = canvasH - 2 * pad;
  // Floor the extents so a single point or a perfectly straight line of nodes
  // doesn't divide-by-zero or blow up the zoom; the true (un-floored) extent
  // is still used below to center the actual bounding box.
  const w = Math.max(maxX - minX, 0.5), h = Math.max(maxY - minY, 0.5);
  let scale = Math.min(availW / w, availH / h);
  scale = Math.max(10, Math.min(scale, 200));
  const usedW = (maxX - minX) * scale, usedH = (maxY - minY) * scale;
  const offX = (availW - usedW) / 2, offY = (availH - usedH) / 2;
  return { scale, minX: minX - offX / scale, minY: minY - offY / scale, canvasW, canvasH, pad };
}
function worldToScreenIn(vs, x, y) {
  const sx = vs.pad + (x - vs.minX) * vs.scale;
  const sy = vs.canvasH - vs.pad - (y - vs.minY) * vs.scale;
  return { sx, sy };
}
function screenToWorldIn(vs, sx, sy) {
  const x = (sx - vs.pad) / vs.scale + vs.minX;
  const y = (vs.canvasH - vs.pad - sy) / vs.scale + vs.minY;
  return { x, y };
}
function findNodeNearIn(nodes, vs, sx, sy, tol) {
  let best = null, bestD = tol;
  for (const n of nodes) {
    const p = worldToScreenIn(vs, n.x, n.y);
    const d = Math.hypot(p.sx - sx, p.sy - sy);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}
function findMemberNearIn(nodes, members, vs, sx, sy, tol) {
  let best = null, bestD = tol;
  const nodeById = id => nodes.find(n => n.id === id);
  for (const m of members) {
    const a = worldToScreenIn(vs, nodeById(m.n1).x, nodeById(m.n1).y);
    const b = worldToScreenIn(vs, nodeById(m.n2).x, nodeById(m.n2).y);
    const d = pointToSegmentDist(sx, sy, a.sx, a.sy, b.sx, b.sy);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function computeViewState() { viewState = makeViewState(frame.nodes, CANVAS_W, CANVAS_H, CANVAS_PAD); }
function worldToScreen(x, y) { return worldToScreenIn(viewState, x, y); }
function screenToWorld(sx, sy) { return screenToWorldIn(viewState, sx, sy); }
function getSvgPoint(svg, evt) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return {
    sx: (clientX - rect.left) / rect.width * vb.width,
    sy: (clientY - rect.top) / rect.height * vb.height,
  };
}

const HIT_TOL_NODE = 14, HIT_TOL_MEMBER = 9;

function findNodeNear(sx, sy) { return findNodeNearIn(frame.nodes, viewState, sx, sy, HIT_TOL_NODE); }
function findMemberNear(sx, sy) { return findMemberNearIn(frame.nodes, frame.members, viewState, sx, sy, HIT_TOL_MEMBER); }
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx*dx + dy*dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawSupportGlyph(node, worldToScreenFn = worldToScreen) {
  const { sx, sy } = worldToScreenFn(node.x, node.y);
  const s = node.support || { type: 'free' };
  const C = COLORS;
  let g = '';
  if (s.type === 'pin') {
    g += `<polygon points="${sx-9},${sy+16} ${sx+9},${sy+16} ${sx},${sy}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`;
    g += `<line x1="${sx-12}" y1="${sy+16}" x2="${sx+12}" y2="${sy+16}" stroke="${C.ink}" stroke-width="1.6"/>`;
    for (let i = -10; i <= 10; i += 4) g += `<line x1="${sx+i}" y1="${sy+16}" x2="${sx+i-4}" y2="${sy+22}" stroke="${C.steel}" stroke-width="1"/>`;
  } else if (s.type === 'roller') {
    g += `<polygon points="${sx-9},${sy+12} ${sx+9},${sy+12} ${sx},${sy}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`;
    g += `<circle cx="${sx-5}" cy="${sy+16}" r="3" fill="none" stroke="${C.ink}" stroke-width="1.3"/>`;
    g += `<circle cx="${sx+5}" cy="${sy+16}" r="3" fill="none" stroke="${C.ink}" stroke-width="1.3"/>`;
    g += `<line x1="${sx-12}" y1="${sy+20}" x2="${sx+12}" y2="${sy+20}" stroke="${C.ink}" stroke-width="1.6"/>`;
  } else if (s.type === 'fixed') {
    g += `<line x1="${sx-12}" y1="${sy}" x2="${sx+12}" y2="${sy}" stroke="${C.ink}" stroke-width="2.4"/>`;
    for (let i = -10; i <= 10; i += 4) g += `<line x1="${sx+i}" y1="${sy}" x2="${sx+i-4}" y2="${sy+7}" stroke="${C.steel}" stroke-width="1"/>`;
  }
  return g;
}

function drawLoadArrows(load, member, worldToScreenFn = worldToScreen, nodes = frame.nodes, markerId = 'frameArrow') {
  const n1 = nodes.find(n => n.id === member.n1), n2 = nodes.find(n => n.id === member.n2);
  const C = COLORS;
  let g = '';
  // Larger label text gets a canvas-colored halo so it stays readable over the grid,
  // matching the treatment already used for node/member labels.
  const labelAttrs = `font-size="11" font-weight="600" fill="${C.orange}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  if (load.type === 'point') {
    const t = load.position / Math.hypot(n2.x - n1.x, n2.y - n1.y);
    const x = n1.x + t * (n2.x - n1.x), y = n1.y + t * (n2.y - n1.y);
    const p = worldToScreenFn(x, y);
    g += `<line x1="${p.sx}" y1="${p.sy - 26}" x2="${p.sx}" y2="${p.sy - 4}" stroke="${C.orange}" stroke-width="2" marker-end="url(#${markerId})"/>`;
    g += `<text x="${p.sx}" y="${p.sy - 32}" text-anchor="middle" ${labelAttrs}>${fmt(load.P,0)} kN</text>`;
  } else {
    const L = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    // One arrow per ~0.5m of loaded length (min 4, max 14) so short and long
    // spans both read as a clearly distributed load rather than a fixed count.
    const loadedLen = Math.max(load.end - load.start, 0.01);
    const steps = Math.max(4, Math.min(14, Math.round(loadedLen / 0.5)));
    const tailOffset = 20, headOffset = 4;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (load.start + (i/steps) * (load.end - load.start)) / L;
      const x = n1.x + t * (n2.x - n1.x), y = n1.y + t * (n2.y - n1.y);
      pts.push(worldToScreenFn(x, y));
    }
    // Line across the top connecting the arrow tails — the standard UDL glyph.
    g += `<line x1="${pts[0].sx}" y1="${pts[0].sy - tailOffset}" x2="${pts[pts.length-1].sx}" y2="${pts[pts.length-1].sy - tailOffset}" stroke="${C.orange}" stroke-width="1.4"/>`;
    for (const p of pts) {
      g += `<line x1="${p.sx}" y1="${p.sy - tailOffset}" x2="${p.sx}" y2="${p.sy - headOffset}" stroke="${C.orange}" stroke-width="1.4" marker-end="url(#${markerId})"/>`;
    }
    const midT = ((load.start + load.end) / 2) / L;
    const midP = worldToScreenFn(n1.x + midT*(n2.x-n1.x), n1.y + midT*(n2.y-n1.y));
    g += `<text x="${midP.sx}" y="${midP.sy - tailOffset - 6}" text-anchor="middle" ${labelAttrs}>${fmt(load.w,1)} kN/m</text>`;
  }
  return g;
}

// Extracted so the results view (frame-results.js) can draw applied nodal
// loads the same way in its Loads mode, against a different node/worldToScreen.
function drawNodalLoadArrows(node, load, worldToScreenFn = worldToScreen, markerId = 'frameArrow') {
  if (!load || (!load.Fx && !load.Fy && !load.M)) return '';
  const { sx, sy } = worldToScreenFn(node.x, node.y);
  const C = COLORS;
  let g = '';
  if (load.Fy) g += `<line x1="${sx}" y1="${sy - (load.Fy<0?28:-28)}" x2="${sx}" y2="${sy - (load.Fy<0?6:-6)}" stroke="${C.orange}" stroke-width="2" marker-end="url(#${markerId})"/>`;
  if (load.Fx) g += `<line x1="${sx - (load.Fx<0?-28:28)}" y1="${sy}" x2="${sx - (load.Fx<0?-6:6)}" y2="${sy}" stroke="${C.orange}" stroke-width="2" marker-end="url(#${markerId})"/>`;
  return g;
}

function renderCanvas() {
  computeViewState();
  const svg = document.getElementById('frameCanvas');
  svg.className.baseVal = `mode-${mode}`;
  const C = COLORS;
  // Anchor the grid pattern to the world origin so grid lines pass through
  // whole-metre coordinates and match where nodes actually snap.
  const step = viewState.scale;            // 1 m in screen units
  const origin = worldToScreen(0, 0);
  const patX = origin.sx % step, patY = origin.sy % step;
  let s = `<defs>
    <marker id="frameArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="6" orient="auto">
      <path d="M0,0 L7,0 L3.5,7 Z" fill="${C.orange}"/>
    </marker>
    <pattern id="framePattern" x="${patX}" y="${patY}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
      <line x1="${step/2}" y1="0" x2="${step/2}" y2="${step}" stroke="${C.gridMinor}" stroke-width="1"/>
      <line x1="0" y1="${step/2}" x2="${step}" y2="${step/2}" stroke="${C.gridMinor}" stroke-width="1"/>
      <path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="${C.gridMajor}" stroke-width="1"/>
    </pattern>
  </defs>`;
  s += `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C.canvasBg}"/>`;
  s += `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#framePattern)"/>`;

  // members
  for (const m of frame.members) {
    const a = worldToScreen(findNode(m.n1).x, findNode(m.n1).y);
    const b = worldToScreen(findNode(m.n2).x, findNode(m.n2).y);
    const isSel = selection.type === 'member' && selection.id === m.id;
    s += `<line x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="${isSel ? C.blue : C.ink}" stroke-width="${isSel ? 4 : 3}" stroke-linecap="round"/>`;
    // Label at the member midpoint, offset perpendicular to the member axis so
    // it clears the line for both beams and columns; halo keeps it legible over grid.
    const midx = (a.sx + b.sx) / 2, midy = (a.sy + b.sy) / 2;
    const mlen = Math.hypot(b.sx - a.sx, b.sy - a.sy) || 1;
    let perpX = -(b.sy - a.sy) / mlen, perpY = (b.sx - a.sx) / mlen;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; } // prefer the upper/left side
    s += `<text x="${midx + perpX * 12}" y="${midy + perpY * 12}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="${isSel ? C.blue : C.steel}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">M${m.id}</text>`;
  }
  // member loads
  for (const ml of frame.memberLoads) {
    const m = findMember(ml.member);
    if (m) s += drawLoadArrows(ml, m);
  }
  // pending add-member highlight
  if (mode === 'add-member' && pendingMemberNode != null) {
    const n = findNode(pendingMemberNode);
    if (n) { const p = worldToScreen(n.x, n.y); s += `<circle cx="${p.sx}" cy="${p.sy}" r="12" fill="none" stroke="${C.amber}" stroke-width="2" stroke-dasharray="3 2"/>`; }
  }
  // nodes + supports + nodal loads
  for (const n of frame.nodes) {
    const p = worldToScreen(n.x, n.y);
    s += drawSupportGlyph(n);
    const isSel = selection.type === 'node' && selection.id === n.id;
    s += `<circle cx="${p.sx}" cy="${p.sy}" r="${isSel ? 8 : 6}" fill="${isSel ? C.blue : '#fff'}" stroke="${C.ink}" stroke-width="1.8"/>`;
    s += `<text x="${p.sx + 11}" y="${p.sy - 8}" font-size="9" fill="${C.steel}" stroke="${C.canvasBg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">N${n.id}</text>`;
    const nl = frame.nodalLoads.find(x => x.node === n.id);
    s += drawNodalLoadArrows(n, nl);
  }
  // empty-state hint (after Clear frame)
  if (frame.nodes.length === 0) {
    s += `<text x="${CANVAS_W/2}" y="${CANVAS_H/2 - 8}" text-anchor="middle" font-size="13" fill="${C.steel}">Blank canvas</text>`;
    s += `<text x="${CANVAS_W/2}" y="${CANVAS_H/2 + 12}" text-anchor="middle" font-size="10" fill="${C.steel}" opacity="0.75">Use + Node and + Member to build a frame — or refresh to reload the example portal frame</text>`;
  }
  svg.innerHTML = s;
}

// ── interaction ──────────────────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    pendingMemberNode = null;
    selection = { type: null, id: null };
    document.querySelectorAll('.mode-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('bg-ink', active);
      b.classList.toggle('text-paper', active);
      b.classList.toggle('bg-surface', !active);
      b.classList.toggle('text-ink', !active);
    });
    renderAll();
  });
});
document.querySelector('.mode-btn[data-mode="select"]').click();

document.getElementById('clearBtn').addEventListener('click', () => {
  mutate(() => {
    frame = { nodes: [], members: [], nodalLoads: [], memberLoads: [] };
    nextNodeId = 1; nextMemberId = 1; nextLoadId = 1;
    selection = { type: null, id: null };
  });
});

const svgEl = document.getElementById('frameCanvas');
let isDragging = false;

// ── node coordinate tooltip ──────────────────────────────────────────────
const nodeTooltipEl = document.getElementById('nodeTooltip');
// One decimal normally ("3.5"), two when the coordinate needs it ("3.25").
function coordFmt(v) { return Math.round(v * 10) === v * 10 ? v.toFixed(1) : v.toFixed(2); }
function showNodeTooltip(node, evt) {
  if (!nodeTooltipEl) return;
  const wrapRect = svgEl.parentElement.getBoundingClientRect();
  nodeTooltipEl.textContent = `N${node.id} (${coordFmt(node.x)}, ${coordFmt(node.y)})`;
  nodeTooltipEl.style.left = `${evt.clientX - wrapRect.left + 14}px`;
  nodeTooltipEl.style.top = `${evt.clientY - wrapRect.top - 26}px`;
  nodeTooltipEl.classList.remove('hidden');
}
function hideNodeTooltip() { if (nodeTooltipEl) nodeTooltipEl.classList.add('hidden'); }

svgEl.addEventListener('mousedown', evt => {
  const { sx, sy } = getSvgPoint(svgEl, evt);
  if (mode === 'select') {
    const n = findNodeNear(sx, sy);
    if (n) { dragNodeId = n.id; isDragging = true; selection = { type: 'node', id: n.id }; renderAll(); return; }
    const m = findMemberNear(sx, sy);
    if (m) { selection = { type: 'member', id: m.id }; renderAll(); return; }
    selection = { type: null, id: null }; renderAll();
  }
});
svgEl.addEventListener('mousemove', evt => {
  const { sx, sy } = getSvgPoint(svgEl, evt);
  if (isDragging && dragNodeId != null) {
    const { x, y } = screenToWorld(sx, sy);
    const node = findNode(dragNodeId);
    if (node) {
      node.x = Math.round(x * 100) / 100; node.y = Math.round(y * 100) / 100;
      renderCanvas(); renderInspector();
      showNodeTooltip(node, evt); // live coordinates while dragging
    }
    return;
  }
  // hover: show coordinates of the node under the cursor
  const hovered = findNodeNear(sx, sy);
  if (hovered) showNodeTooltip(hovered, evt);
  else hideNodeTooltip();
});
svgEl.addEventListener('mouseleave', hideNodeTooltip);
window.addEventListener('mouseup', () => {
  if (isDragging) { isDragging = false; dragNodeId = null; saveDraft(); }
});

svgEl.addEventListener('click', evt => {
  if (isDragging) return;
  const { sx, sy } = getSvgPoint(svgEl, evt);

  if (mode === 'add-node') {
    const snap = parseFloat(document.getElementById('gridSnap').value) || 0.5;
    const existing = findNodeNear(sx, sy);
    if (existing) return; // avoid stacking a duplicate node
    const { x, y } = screenToWorld(sx, sy);
    const sx2 = Math.round(x / snap) * snap, sy2 = Math.round(y / snap) * snap;
    mutate(() => {
      const id = nextNodeId++;
      frame.nodes.push({ id, x: sx2, y: sy2, support: { type: 'free' } });
      selection = { type: 'node', id };
    });
  } else if (mode === 'add-member') {
    const n = findNodeNear(sx, sy);
    if (!n) return;
    if (pendingMemberNode == null) { pendingMemberNode = n.id; renderCanvas(); return; }
    if (pendingMemberNode === n.id) { pendingMemberNode = null; renderCanvas(); return; } // zero-length guard
    const dupe = frame.members.some(m => (m.n1 === pendingMemberNode && m.n2 === n.id) || (m.n1 === n.id && m.n2 === pendingMemberNode));
    if (dupe) { pendingMemberNode = null; renderCanvas(); return; }
    const startNode = pendingMemberNode;
    mutate(() => {
      const id = nextMemberId++;
      frame.members.push({ id, n1: startNode, n2: n.id, b_mm: 300, h_mm: 300, fcu: 30 });
      selection = { type: 'member', id };
      pendingMemberNode = null;
    });
  } else if (mode === 'delete') {
    const n = findNodeNear(sx, sy);
    if (n) {
      mutate(() => {
        frame.members = frame.members.filter(m => m.n1 !== n.id && m.n2 !== n.id);
        frame.memberLoads = frame.memberLoads.filter(ml => frame.members.some(m => m.id === ml.member));
        frame.nodalLoads = frame.nodalLoads.filter(nl => nl.node !== n.id);
        frame.nodes = frame.nodes.filter(x => x.id !== n.id);
        if (selection.type === 'node' && selection.id === n.id) selection = { type: null, id: null };
      });
      return;
    }
    const m = findMemberNear(sx, sy);
    if (m) {
      mutate(() => {
        frame.members = frame.members.filter(x => x.id !== m.id);
        frame.memberLoads = frame.memberLoads.filter(ml => ml.member !== m.id);
        if (selection.type === 'member' && selection.id === m.id) selection = { type: null, id: null };
      });
    }
  }
});

// ── inspector panel ──────────────────────────────────────────────────────
function ensureNodalLoad(nodeId) {
  let nl = frame.nodalLoads.find(x => x.node === nodeId);
  if (!nl) { nl = { node: nodeId, Fx: 0, Fy: 0, M: 0 }; frame.nodalLoads.push(nl); }
  return nl;
}

function renderInspector() {
  const el = document.getElementById('inspector');
  if (selection.type === 'node') {
    const node = findNode(selection.id);
    if (!node) { selection = { type: null, id: null }; return renderInspector(); }
    const nl = ensureNodalLoad(node.id);
    const supportTypes = ['free', 'pin', 'roller', 'fixed'];
    el.innerHTML = `
      <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Node N${node.id}</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-[11px] font-mono text-steel">X (m)<input id="insNodeX" type="number" step="0.1" value="${node.x}" class="w-full mt-0.5 font-mono text-[12px] border border-grid rounded px-2 py-1 focus:outline-none focus:border-blue/60"></label>
        <label class="text-[11px] font-mono text-steel">Y (m)<input id="insNodeY" type="number" step="0.1" value="${node.y}" class="w-full mt-0.5 font-mono text-[12px] border border-grid rounded px-2 py-1 focus:outline-none focus:border-blue/60"></label>
      </div>
      <div>
        <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em] mb-1.5">Support</p>
        <div class="flex flex-wrap gap-1">
          ${supportTypes.map(t => `<button data-support="${t}" class="ins-support font-mono text-[11px] px-2 py-0.5 rounded border border-grid transition-colors ${node.support?.type===t ? 'bg-ink text-paper' : 'bg-surface text-ink hover:border-ink/40'}">${t}</button>`).join('')}
        </div>
        ${node.support?.type === 'roller' ? `
        <div class="flex gap-1 mt-1.5">
          <button data-rollerdir="x" class="ins-rollerdir font-mono text-[10px] px-2 py-0.5 rounded border border-grid ${node.support.dir==='x'?'bg-blue text-paper':'bg-surface text-steel'}">resists X</button>
          <button data-rollerdir="y" class="ins-rollerdir font-mono text-[10px] px-2 py-0.5 rounded border border-grid ${node.support.dir!=='x'?'bg-blue text-paper':'bg-surface text-steel'}">resists Y</button>
        </div>` : ''}
      </div>
      <div>
        <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em] mb-1.5">Nodal load</p>
        <div class="grid grid-cols-3 gap-1.5">
          <label class="text-[10px] font-mono text-steel">Fx (kN)<input id="insFx" type="number" step="1" value="${nl.Fx}" class="w-full mt-0.5 font-mono text-[11px] border border-grid rounded px-1.5 py-1 focus:outline-none focus:border-blue/60"></label>
          <label class="text-[10px] font-mono text-steel">Fy (kN)<input id="insFy" type="number" step="1" value="${nl.Fy}" class="w-full mt-0.5 font-mono text-[11px] border border-grid rounded px-1.5 py-1 focus:outline-none focus:border-blue/60"></label>
          <label class="text-[10px] font-mono text-steel">M (kNm)<input id="insM" type="number" step="1" value="${nl.M}" class="w-full mt-0.5 font-mono text-[11px] border border-grid rounded px-1.5 py-1 focus:outline-none focus:border-blue/60"></label>
        </div>
        <p class="font-mono text-[9px] text-steel/50 mt-1">Fy negative = downward, Fx positive = rightward.</p>
      </div>`;

    document.getElementById('insNodeX').addEventListener('change', e => mutate(() => { node.x = parseFloat(e.target.value) || 0; }));
    document.getElementById('insNodeY').addEventListener('change', e => mutate(() => { node.y = parseFloat(e.target.value) || 0; }));
    document.querySelectorAll('.ins-support').forEach(b => b.addEventListener('click', () => mutate(() => {
      node.support = { type: b.dataset.support, dir: b.dataset.support === 'roller' ? 'y' : undefined };
    })));
    document.querySelectorAll('.ins-rollerdir').forEach(b => b.addEventListener('click', () => mutate(() => { node.support.dir = b.dataset.rollerdir; })));
    document.getElementById('insFx').addEventListener('change', e => mutate(() => { nl.Fx = parseFloat(e.target.value) || 0; }));
    document.getElementById('insFy').addEventListener('change', e => mutate(() => { nl.Fy = parseFloat(e.target.value) || 0; }));
    document.getElementById('insM').addEventListener('change', e => mutate(() => { nl.M = parseFloat(e.target.value) || 0; }));

  } else if (selection.type === 'member') {
    const member = findMember(selection.id);
    if (!member) { selection = { type: null, id: null }; return renderInspector(); }
    const loads = frame.memberLoads.filter(l => l.member === member.id);
    const fcuOptions = [20, 25, 30, 35, 40];
    el.innerHTML = `
      <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Member M${member.id} (N${member.n1}→N${member.n2})</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-[11px] font-mono text-steel">b (mm)<input id="insB" type="number" step="10" value="${member.b_mm}" class="w-full mt-0.5 font-mono text-[12px] border border-grid rounded px-2 py-1 focus:outline-none focus:border-blue/60"></label>
        <label class="text-[11px] font-mono text-steel">h (mm)<input id="insH" type="number" step="10" value="${member.h_mm}" class="w-full mt-0.5 font-mono text-[12px] border border-grid rounded px-2 py-1 focus:outline-none focus:border-blue/60"></label>
      </div>
      <div>
        <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em] mb-1.5">f<sub>cu</sub> (N/mm²)</p>
        <div class="flex flex-wrap gap-1">
          ${fcuOptions.map(v => `<button data-fcu="${v}" class="ins-fcu font-mono text-[11px] px-2 py-0.5 rounded border border-grid transition-colors ${member.fcu===v?'bg-ink text-paper':'bg-surface text-ink hover:border-ink/40'}">${v}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Member loads</p>
          <div class="flex gap-1">
            <button id="addUdlBtn" class="font-mono text-[10px] px-2 py-0.5 rounded border border-grid hover:border-ink/40">+ UDL</button>
            <button id="addPointBtn" class="font-mono text-[10px] px-2 py-0.5 rounded border border-grid hover:border-ink/40">+ Point</button>
          </div>
        </div>
        <div class="space-y-2">
          ${loads.map(l => l.type === 'udl' ? `
            <div class="bg-paper/50 rounded p-1.5 space-y-1" data-load="${l.id}">
              <div class="flex items-center justify-between">
                <span class="font-mono text-[9px] font-semibold text-steel uppercase tracking-wide">UDL</span>
                <button data-del="${l.id}" class="ld-del font-mono text-[11px] text-steel hover:text-orange leading-none">×</button>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <label class="block text-[8px] font-mono text-steel/70 leading-tight">Magnitude (kN/m)
                  <input data-field="w" type="number" step="1" value="${l.w}" class="ld-input w-full mt-0.5 font-mono text-[10px] border border-grid rounded px-1 py-0.5"></label>
                <label class="block text-[8px] font-mono text-steel/70 leading-tight">Start (m)
                  <input data-field="start" type="number" step="0.1" value="${l.start}" class="ld-input w-full mt-0.5 font-mono text-[10px] border border-grid rounded px-1 py-0.5"></label>
                <label class="block text-[8px] font-mono text-steel/70 leading-tight">End (m)
                  <input data-field="end" type="number" step="0.1" value="${l.end}" class="ld-input w-full mt-0.5 font-mono text-[10px] border border-grid rounded px-1 py-0.5"></label>
              </div>
            </div>` : `
            <div class="bg-paper/50 rounded p-1.5 space-y-1" data-load="${l.id}">
              <div class="flex items-center justify-between">
                <span class="font-mono text-[9px] font-semibold text-steel uppercase tracking-wide">Point</span>
                <button data-del="${l.id}" class="ld-del font-mono text-[11px] text-steel hover:text-orange leading-none">×</button>
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <label class="block text-[8px] font-mono text-steel/70 leading-tight">Magnitude (kN)
                  <input data-field="P" type="number" step="1" value="${l.P}" class="ld-input w-full mt-0.5 font-mono text-[10px] border border-grid rounded px-1 py-0.5"></label>
                <label class="block text-[8px] font-mono text-steel/70 leading-tight">Position (m from start)
                  <input data-field="position" type="number" step="0.1" value="${l.position}" class="ld-input w-full mt-0.5 font-mono text-[10px] border border-grid rounded px-1 py-0.5"></label>
              </div>
            </div>`).join('') || '<p class="font-mono text-[10px] text-steel/50">No loads on this member.</p>'}
        </div>
        <p class="font-mono text-[9px] text-steel/50 mt-1.5">Loads act vertically (gravity), magnitude in kN / kN·m.</p>
      </div>`;

    document.getElementById('insB').addEventListener('change', e => mutate(() => { member.b_mm = parseFloat(e.target.value) || member.b_mm; }));
    document.getElementById('insH').addEventListener('change', e => mutate(() => { member.h_mm = parseFloat(e.target.value) || member.h_mm; }));
    document.querySelectorAll('.ins-fcu').forEach(b => b.addEventListener('click', () => mutate(() => { member.fcu = Number(b.dataset.fcu); })));
    document.getElementById('addUdlBtn').addEventListener('click', () => mutate(() => {
      frame.memberLoads.push({ id: nextLoadId++, member: member.id, type: 'udl', w: 10, start: 0, end: memberLength(member) });
    }));
    document.getElementById('addPointBtn').addEventListener('click', () => mutate(() => {
      frame.memberLoads.push({ id: nextLoadId++, member: member.id, type: 'point', P: 10, position: memberLength(member) / 2 });
    }));
    document.querySelectorAll('.ld-input').forEach(inp => inp.addEventListener('change', e => mutate(() => {
      const row = e.target.closest('[data-load]');
      const load = frame.memberLoads.find(l => l.id === Number(row.dataset.load));
      if (load) load[e.target.dataset.field] = parseFloat(e.target.value) || 0;
    })));
    document.querySelectorAll('.ld-del').forEach(b => b.addEventListener('click', () => mutate(() => {
      frame.memberLoads = frame.memberLoads.filter(l => l.id !== Number(b.dataset.del));
    })));

  } else {
    el.innerHTML = `
      <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.15em]">Inspector</p>
      <p class="font-mono text-[12px] text-steel">Select a node or member to edit its properties, or use <span class="text-ink">+ Node</span> / <span class="text-ink">+ Member</span> to build the frame.</p>`;
  }
}

function memberLength(member) {
  const n1 = findNode(member.n1), n2 = findNode(member.n2);
  return Math.hypot(n2.x - n1.x, n2.y - n1.y);
}

function renderAll() { renderCanvas(); renderInspector(); }

// ── results rendering ────────────────────────────────────────────────────
// The interactive results workspace (canvas-centric, mode toolbar, side
// panel) lives in js/frame-results.js — see renderResults() there, called
// below exactly like the old inline version was.

// ── frame analysis API ──────────────────────────────────────────────────
async function callFrameAnalysisApi(frameSnapshot) {
  const res = await fetch(`${API_BASE}/api/frame/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      nodes: frameSnapshot.nodes,
      members: frameSnapshot.members,
      nodal_loads: frameSnapshot.nodalLoads,
      member_loads: frameSnapshot.memberLoads,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.detail;
    const msg = (detail && (detail.message || detail.error || detail)) || `HTTP ${res.status}`;
    throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)), { status: res.status });
  }
  return res.json();
}

// ── run / validate orchestration ─────────────────────────────────────────
document.getElementById('runBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runBtn');
  const loading = document.getElementById('loadingState');
  const existing = document.getElementById('frameResults');
  if (existing) existing.classList.add('hidden');

  if (frame.nodes.length === 0) { showError('Add nodes and members to build a frame first.'); return; }

  const original = btn.textContent;
  btn.textContent = 'Solving…'; btn.disabled = true;
  loading.classList.remove('hidden');

  // Snapshot the model so a mid-solve drag can't alter geometry underneath the solve.
  const frameSnapshot = JSON.parse(JSON.stringify(frame));

  try {
    const sol = await callFrameAnalysisApi(frameSnapshot);
    loading.classList.add('hidden');
    renderResults(sol, frameSnapshot);
  } catch (error) {
    loading.classList.add('hidden');
    console.error('Frame analysis failed:', error.status ?? 'no status', error.message);
    const msg = error.message || 'Could not analyze this frame — check the geometry and try again.';
    const display =
      error.status === 400 || error.status === 422 ? msg :
      error.status === 429 ? 'Quota limit reached. Please try again in a few minutes.' :
      'An error occurred. Please try again later.';
    showError(display);
  } finally {
    btn.textContent = original; btn.disabled = false;
  }
});

// ── bootstrap ────────────────────────────────────────────────────────────
if (!loadDraft()) seedStarterFrame();
renderAll();
