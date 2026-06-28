// ── config ──────────────────────────────────────────────────────────────
const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : 'https://beamai-backend.fastapicloud.dev';
  

// ── auth helpers ─────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('beamAi_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ── auth guard ───────────────────────────────────────────────────────────
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

// ---- Sample Data ----
const DATA = {
  schema: {
    length: 13.5,
    supports: [
      { type: "pin", position: 0 },
      { type: "roller", position: 13.5 }
    ],
    point_loads: [],
    udls: [ { magnitude: -57000, start: 0, end: 13.5 } ],
    material: "",
    reinforcement: ""
  },
  results: [
    { x: 0,      shear: 384749.9943, moment: 0.0385,     deflection: 0 },
    { x: 3.375,  shear: 192375.0057, moment: 973898.4567, deflection: -9.704094 },
    { x: 6.75,   shear: 0.0057,      moment: 1298531.25,  deflection: -13.619781 },
    { x: 10.125, shear: -192375.0057, moment: 973898.4567, deflection: -9.704094 },
    { x: 13.5,   shear: -384749.9943, moment: 0.0385,     deflection: 0 }
  ]
};

const COLORS = { sfd: '#3B6EA5', bmd: '#E8623A', defl: '#2F8F6F' };

// ---- visitor & analysis tracking ----
function initializeTracking(){
  let visitorCount = parseInt(localStorage.getItem('beamAi_visitors')) || 0;
  localStorage.setItem('beamAi_visitors', visitorCount + 1);
}

function incrementAnalysisCount(){
  let analysisCount = parseInt(localStorage.getItem('beamAi_analyses')) || 0;
  localStorage.setItem('beamAi_analyses', analysisCount + 1);
}

initializeTracking();

// ---- character count ----
const CHAR_LIMIT = 500;
const promptInput = document.getElementById('promptInput');
const wordCountEl = document.getElementById('wordCount');

function updateCharCount(){
  const count = promptInput.value.length;
  wordCountEl.textContent = `${count}/${CHAR_LIMIT}`;
  if(count >= CHAR_LIMIT){
    wordCountEl.classList.add('text-orange');
    wordCountEl.classList.remove('text-steel');
  } else {
    wordCountEl.classList.remove('text-orange');
    wordCountEl.classList.add('text-steel');
  }
}

promptInput.addEventListener('input', () => {
  if(promptInput.value.length > CHAR_LIMIT){
    promptInput.value = promptInput.value.slice(0, CHAR_LIMIT);
  }
  updateCharCount();
  const hasText = promptInput.value.length > 0;
  ['uploadBtn', 'cameraBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = hasText;
    btn.classList.toggle('opacity-40', hasText);
    btn.classList.toggle('cursor-not-allowed', hasText);
  });
});

updateCharCount();

// ---- error handling ----
function showError(message, duration = 6000){
  const banner = document.getElementById('errorBanner');
  const messageEl = document.getElementById('errorMessage');
  messageEl.textContent = message;
  banner.classList.remove('hidden');

  if(duration > 0){
    setTimeout(() => {
      banner.classList.add('hidden');
    }, duration);
  }
}

document.getElementById('errorClose').addEventListener('click', () => {
  document.getElementById('errorBanner').classList.add('hidden');
});

function fmt(n, d=2){
  const v = Number(n);
  return (Math.abs(v) < 1e-3 ? 0 : v).toFixed(d);
}

// ---- 01 schematic ----
function renderSchematic(schema){
  const W = 600, H = 170;
  const x0 = 60, x1 = 540;
  const beamY = 70;           // lowered to open space above for label rows
  const loadLineY = 38;       // uniform top edge for all load arrows
  const L = schema.length;
  const toX = pos => x0 + (pos / L) * (x1 - x0);

  let svg = `<line x1="${x0}" y1="${beamY}" x2="${x1}" y2="${beamY}" stroke="#16243B" stroke-width="4" stroke-linecap="round"/>`;

  // ── 1. Collect all label candidates ──────────────────────────────────
  const labelItems = [];

  schema.udls.forEach((udl, idx) => {
    const sx = toX(udl.start), ex = toX(udl.end);
    const mag = Math.abs(udl.magnitude / 1000);
    labelItems.push({ x: (sx + ex) / 2, text: `${+mag.toFixed(3)} kN/m`, color: '#E8623A', idx, type: 'udl' });
  });

  schema.point_loads.forEach((pl, idx) => {
    const mag = Math.abs(pl.magnitude / 1000);
    labelItems.push({ x: toX(pl.position), text: `${+mag.toFixed(3)} kN`, color: '#E8623A', idx, type: 'point' });
  });

  (schema.varying_loads || []).forEach((vl, idx) => {
    const sx = toX(vl.start), ex = toX(vl.end);
    const sM = +Math.abs(vl.start_magnitude / 1000).toFixed(3);
    const eM = +Math.abs(vl.end_magnitude  / 1000).toFixed(3);
    labelItems.push({ x: (sx + ex) / 2, text: `${sM}→${eM} kN/m`, color: '#3B6EA5', idx, type: 'varying' });
  });

  // ── 2. Assign y-rows greedily (sort by x, place in lowest free row) ──
  const ROW_Y = [8, 18, 28];
  const rowSlots = [[], [], []];
  const CHAR_W = 5.5, PAD = 6;

  labelItems.sort((a, b) => a.x - b.x);
  labelItems.forEach(lbl => {
    const hw = (lbl.text.length * CHAR_W) / 2 + PAD;
    let placed = false;
    for (let r = 0; r < ROW_Y.length; r++) {
      const free = rowSlots[r].every(([lo, hi]) => lbl.x - hw > hi || lbl.x + hw < lo);
      if (free) {
        lbl.labelY = ROW_Y[r];
        rowSlots[r].push([lbl.x - hw, lbl.x + hw]);
        placed = true;
        break;
      }
    }
    if (!placed) lbl.labelY = ROW_Y[ROW_Y.length - 1];
  });

  // ── 3. Draw load geometry ─────────────────────────────────────────────
  // UDLs
  schema.udls.forEach(udl => {
    const sx = toX(udl.start), ex = toX(udl.end);
    svg += `<line x1="${sx}" y1="${loadLineY}" x2="${ex}" y2="${loadLineY}" stroke="#E8623A" stroke-width="1.5"/>`;
    const n = Math.max(4, Math.round((ex - sx) / 45));
    for(let i = 0; i <= n; i++){
      const ax = sx + (ex - sx) * i / n;
      svg += `<line x1="${ax}" y1="${loadLineY}" x2="${ax}" y2="${beamY-5}" stroke="#E8623A" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    }
  });

  // Point loads
  schema.point_loads.forEach(pl => {
    const px = toX(pl.position);
    svg += `<line x1="${px}" y1="${loadLineY}" x2="${px}" y2="${beamY-5}" stroke="#E8623A" stroke-width="2" marker-end="url(#arrow)"/>`;
  });

  // Varying loads — proportional trapezoid arrows
  (schema.varying_loads || []).forEach(vl => {
    const sx = toX(vl.start), ex = toX(vl.end);
    const sMag = Math.abs(vl.start_magnitude);
    const eMag = Math.abs(vl.end_magnitude);
    const maxMag = Math.max(sMag, eMag, 1);
    const maxH = beamY - 5 - loadLineY;
    const n = Math.max(4, Math.round((ex - sx) / 45));
    const pts = [];
    for(let i = 0; i <= n; i++){
      const t = i / n;
      const ax = sx + (ex - sx) * t;
      const frac = (sMag + (eMag - sMag) * t) / maxMag;
      const topY = beamY - 5 - maxH * frac;
      pts.push(`${ax.toFixed(1)},${topY.toFixed(1)}`);
      if(frac > 0.05){
        svg += `<line x1="${ax.toFixed(1)}" y1="${topY.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${beamY-5}" stroke="#3B6EA5" stroke-width="1.5" marker-end="url(#arrowBlue)"/>`;
      }
    }
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#3B6EA5" stroke-width="1.5"/>`;
  });

  // ── 4. Render labels ──────────────────────────────────────────────────
  labelItems.forEach(lbl => {
    svg += `<text x="${lbl.x.toFixed(1)}" y="${lbl.labelY}" text-anchor="middle" font-size="10" fill="${lbl.color}" font-weight="600">${lbl.text}</text>`;
  });

  // ── 5. Supports ───────────────────────────────────────────────────────
  schema.supports.forEach(s => {
    const sx = toX(s.position);
    const top = beamY + 4;
    if(s.type === 'fixed'){
      const dir = s.position <= L / 2 ? -1 : 1;
      svg += `<line x1="${sx}" y1="${beamY-14}" x2="${sx}" y2="${beamY+14}" stroke="#16243B" stroke-width="3"/>`;
      for(let i = 0; i < 5; i++){
        svg += `<line x1="${sx}" y1="${beamY-10+i*6}" x2="${sx+dir*8}" y2="${beamY-4+i*6}" stroke="#5E7081" stroke-width="1.5"/>`;
      }
    } else {
      svg += `<polygon points="${sx-10},${top+22} ${sx+10},${top+22} ${sx},${top}" fill="none" stroke="#16243B" stroke-width="2"/>`;
      if(s.type === 'roller'){
        svg += `<circle cx="${sx-5}" cy="${top+27}" r="3" fill="#16243B"/>`;
        svg += `<circle cx="${sx+5}" cy="${top+27}" r="3" fill="#16243B"/>`;
        svg += `<line x1="${sx-14}" y1="${top+32}" x2="${sx+14}" y2="${top+32}" stroke="#16243B" stroke-width="2"/>`;
      } else {
        // pin
        for(let i=-3;i<=3;i++){
          svg += `<line x1="${sx+i*5}" y1="${top+22}" x2="${sx+i*5-5}" y2="${top+28}" stroke="#5E7081" stroke-width="1.5"/>`;
        }
      }
    }
    svg += `<text x="${sx}" y="${top+45}" text-anchor="middle" font-size="10" fill="#5E7081" font-weight="500">${s.type} · x=${s.position.toFixed(2)}m</text>`;
  });

  // ── 6. Dimension chain ────────────────────────────────────────────────
  const segY = 130, dimY = 155;

  // Collect all structurally significant x-positions
  const keyXSet = new Set([0, L]);
  schema.supports.forEach(s => keyXSet.add(s.position));
  schema.point_loads.forEach(pl => keyXSet.add(pl.position));
  schema.udls.forEach(u => { keyXSet.add(u.start); keyXSet.add(u.end); });
  (schema.varying_loads || []).forEach(vl => { keyXSet.add(vl.start); keyXSet.add(vl.end); });
  const keyXs  = [...keyXSet].sort((a, b) => a - b);
  const keyPxs = keyXs.map(toX);
  const hasSegments = keyXs.length > 2;

  if (hasSegments) {
    // Subtle extension lines from each key position down to the segment row
    keyPxs.forEach(px => {
      svg += `<line x1="${px}" y1="${beamY+12}" x2="${px}" y2="${segY-5}" stroke="#C8D4DC" stroke-width="0.75" stroke-dasharray="2,2"/>`;
    });
    // Segment chain
    for (let i = 0; i < keyXs.length - 1; i++) {
      const xa  = keyPxs[i], xb = keyPxs[i + 1];
      const mid = (xa + xb) / 2;
      const d   = +(keyXs[i + 1] - keyXs[i]).toFixed(3);
      svg += `<line x1="${xa}" y1="${segY}" x2="${xb}" y2="${segY}" stroke="#5E7081" stroke-width="1"/>`;
      svg += `<line x1="${xa}" y1="${segY-4}" x2="${xa}" y2="${segY+4}" stroke="#5E7081" stroke-width="1"/>`;
      svg += `<line x1="${xb}" y1="${segY-4}" x2="${xb}" y2="${segY+4}" stroke="#5E7081" stroke-width="1"/>`;
      svg += `<text x="${mid}" y="${segY-6}" text-anchor="middle" font-size="9" fill="#5E7081">${d} m</text>`;
    }
    // Overall span below — muted / dashed
    svg += `<line x1="${x0}" y1="${dimY}" x2="${x1}" y2="${dimY}" stroke="#9BAAB6" stroke-width="1" stroke-dasharray="3,3"/>`;
    svg += `<line x1="${x0}" y1="${dimY-4}" x2="${x0}" y2="${dimY+4}" stroke="#9BAAB6" stroke-width="1"/>`;
    svg += `<line x1="${x1}" y1="${dimY-4}" x2="${x1}" y2="${dimY+4}" stroke="#9BAAB6" stroke-width="1"/>`;
    svg += `<text x="${(x0+x1)/2}" y="${dimY-6}" text-anchor="middle" font-size="10" fill="#9BAAB6">${L.toFixed(3)} m</text>`;
  } else {
    // No intermediate key points — single overall dimension
    svg += `<line x1="${x0}" y1="${dimY}" x2="${x1}" y2="${dimY}" stroke="#5E7081" stroke-width="1"/>`;
    svg += `<line x1="${x0}" y1="${dimY-5}" x2="${x0}" y2="${dimY+5}" stroke="#5E7081" stroke-width="1"/>`;
    svg += `<line x1="${x1}" y1="${dimY-5}" x2="${x1}" y2="${dimY+5}" stroke="#5E7081" stroke-width="1"/>`;
    svg += `<text x="${(x0+x1)/2}" y="${dimY-7}" text-anchor="middle" font-size="11" fill="#5E7081">${L.toFixed(3)} m</text>`;
  }

  const defs = `<defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#E8623A"/></marker>
    <marker id="arrowBlue" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3B6EA5"/></marker>
  </defs>`;

  document.getElementById('schematic').innerHTML = defs + svg;
}

// ---- 02 line/area diagrams ----
function renderDiagram(svgId, points, color, showValueTicks = false){
  const W = 600, H = 220;
  const padL = 52, padR = 16, padT = 18, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const xs = points.map(p=>p.x);
  const vs = points.map(p=>p.v);
  const xMin = 0, xMax = Math.max(...xs);
  let vMin = Math.min(...vs, 0), vMax = Math.max(...vs, 0);
  const range = (vMax - vMin) || 1;
  vMin -= range*0.15; vMax += range*0.15;

  const X = x => padL + (x - xMin) / (xMax - xMin) * plotW;
  const Y = v => padT + (1 - (v - vMin) / (vMax - vMin)) * plotH;
  const zeroY = Y(0);

  let path = points.map((p,i)=> `${i===0?'M':'L'} ${X(p.x)} ${Y(p.v)}`).join(' ');
  let area = `M ${X(points[0].x)} ${zeroY} ` + points.map(p=>`L ${X(p.x)} ${Y(p.v)}`).join(' ') + ` L ${X(points[points.length-1].x)} ${zeroY} Z`;

  let svg = '';
  // grid
  for(let i=0;i<=4;i++){
    const gy = padT + plotH*i/4;
    svg += `<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" stroke="#D7E0EA" stroke-width="1"/>`;
  }
  // zero axis
  svg += `<line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="#5E7081" stroke-width="1"/>`;
  // area + line
  svg += `<path d="${area}" fill="${color}" opacity="0.12"/>`;
  svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
  // points
  points.forEach(p=>{
    svg += `<circle cx="${X(p.x)}" cy="${Y(p.v)}" r="3" fill="${color}"><title>x=${p.x.toFixed(3)} m, v=${p.v.toFixed(3)}</title></circle>`;
  });
  // y labels
  svg += `<text x="${padL-6}" y="${padT+4}" text-anchor="end" font-size="10" fill="#5E7081">${vMax.toFixed(1)}</text>`;
  svg += `<text x="${padL-6}" y="${padT+plotH}" text-anchor="end" font-size="10" fill="#5E7081">${vMin.toFixed(1)}</text>`;
  if(vMin < 0 && vMax > 0){
    svg += `<text x="${padL-6}" y="${zeroY+3}" text-anchor="end" font-size="10" fill="#5E7081">0</text>`;
  }
  // x labels
  svg += `<text x="${padL}" y="${H-8}" text-anchor="start" font-size="10" fill="#5E7081">0</text>`;
  svg += `<text x="${W-padR}" y="${H-8}" text-anchor="end" font-size="10" fill="#5E7081">${xMax.toFixed(1)} m</text>`;

  // intermediate x ticks with value callouts (SFD / BMD only)
  if (showValueTicks && xMax > 0) {
    const roughStep = xMax / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
    const norm = roughStep / mag;
    const step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7.5 ? 5 * mag : 10 * mag;

    for (let t = step; t < xMax - step * 0.1; t = +(t + step).toFixed(10)) {
      // interpolate curve value at this x
      let tv = points[points.length - 1].v;
      for (let i = 0; i < points.length - 1; i++) {
        if (t >= points[i].x && t <= points[i + 1].x) {
          const frac = (t - points[i].x) / (points[i + 1].x - points[i].x);
          tv = points[i].v + frac * (points[i + 1].v - points[i].v);
          break;
        }
      }

      const cx = X(t);
      const cy = Y(tv);

      // dashed reference line from zero-axis to curve
      svg += `<line x1="${cx}" y1="${zeroY}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="0.75" stroke-dasharray="3,2" opacity="0.35"/>`;
      // marker dot on the curve
      svg += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${color}" opacity="0.85"/>`;
      // x axis tick mark
      svg += `<line x1="${cx}" y1="${H - padB}" x2="${cx}" y2="${H - padB + 3}" stroke="#8A9BAB" stroke-width="1"/>`;
      // x position label
      const xLabel = Number.isInteger(+t.toFixed(6)) ? String(Math.round(t)) : t.toFixed(1);
      svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#5E7081">${xLabel}</text>`;
      // value label — above curve for positive, below for negative, clamped to plot area
      const rawLY = tv >= 0 ? cy - 9 : cy + 13;
      const labelY = Math.min(Math.max(rawLY, padT + 8), padT + plotH - 2);
      svg += `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-weight="600" fill="${color}">${tv.toFixed(2)}</text>`;
    }
  }

  document.getElementById(svgId).innerHTML = svg;
}

// ---- 03 table ----
function renderTable(rows){
  const body = document.getElementById('resultsBody');
  body.innerHTML = rows.map(r => `
    <tr class="hover:bg-paper/60">
      <td class="px-4 py-2">${r.x.toFixed(3)}</td>
      <td class="px-4 py-2 text-right">${(r.axial/1000).toFixed(3)}</td>
      <td class="px-4 py-2 text-right">${(r.shear/1000).toFixed(3)}</td>
      <td class="px-4 py-2 text-right">${(r.moment/1000).toFixed(3)}</td>
      <td class="px-4 py-2 text-right">${r.deflection.toFixed(3)}</td>
    </tr>
  `).join('');
}

// ---- peak indicators ----
function renderPeaks(data){
  const sfEl   = document.getElementById('sfdPeak');
  const bmEl   = document.getElementById('bmdPeak');
  const deflEl = document.getElementById('deflPeak');

  if(data.max_sf != null){
    sfEl.textContent = `max ${(data.max_sf/1000).toFixed(3)} kN  ·  x = ${data.max_sf_x} m`;
    sfEl.classList.remove('hidden');
  }
  if(data.max_bm != null){
    bmEl.textContent = `max ${(data.max_bm/1000).toFixed(3)} kN·m  ·  x = ${data.max_bm_x} m`;
    bmEl.classList.remove('hidden');
  }
  if(data.max_deflection != null){
    deflEl.textContent = `max ${Math.abs(data.max_deflection).toFixed(4)} mm  ·  x = ${data.max_deflection_x} m`;
    deflEl.classList.remove('hidden');
  }
}

// ---- chips + legend ----
function renderSummary(schema){
  document.getElementById('chipLength').textContent = `span ${schema.length.toFixed(3)} m`;
  document.getElementById('chipSupports').textContent = `${schema.supports.length} supports`;
  document.getElementById('chipLoads').textContent =
    `${schema.udls.length} UDL${schema.udls.length!==1?'s':''}` +
    (schema.point_loads.length ? ` · ${schema.point_loads.length} point load${schema.point_loads.length!==1?'s':''}` : '');

  const legend = document.getElementById('legend');
  const items = [];
  schema.supports.forEach(s => items.push(`${s.type} support @ x = ${s.position.toFixed(3)} m`));
  schema.udls.forEach(u => items.push(`UDL ${Math.abs(u.magnitude/1000).toFixed(3)} kN/m, x ∈ [${u.start.toFixed(2)}, ${u.end.toFixed(2)}] m`));
  legend.innerHTML = items.map(t=>`<div class="px-2 py-1 border border-grid rounded bg-paper">${t}</div>`).join('');
}

function normalizeData(data){
  const rows = Array.isArray(data.results) ? data.results : (data.rows ?? []);
  return {
    analysis_id:      data.analysis_id,
    schema:           data.schema,
    classification:   data.classification,
    rows,
    max_sf:           data.max_sf,
    max_sf_x:         data.max_sf_x,
    max_bm:           data.max_bm,
    max_bm_x:         data.max_bm_x,
    max_deflection:   data.max_deflection,
    max_deflection_x: data.max_deflection_x,
  };
}

function render(data){
  const nd = normalizeData(data);
  currentAnalysisData = nd;
  renderSummary(nd.schema);
  renderSchematic(nd.schema);
  renderDiagram('sfd',  nd.rows.map(r=>({x:r.x, v:r.shear/1000})),  COLORS.sfd,  true);
  renderDiagram('bmd',  nd.rows.map(r=>({x:r.x, v:r.moment/1000})), COLORS.bmd,  true);
  renderDiagram('defl', nd.rows.map(r=>({x:r.x, v:r.deflection})),  COLORS.defl, true);
  renderTable(nd.rows);
  renderPeaks(nd);
}

// "run" interaction
document.getElementById('runBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runBtn');
  const promptText = document.getElementById('promptInput').value.trim();

  if (!promptText && !attachedFile1) {
    showError('Please describe the beam or attach an image first');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Solving…';
  btn.disabled = true;
  incrementAnalysisCount();

  document.getElementById('loadingState').classList.remove('hidden');
  document.querySelector('#loadingState p').textContent =
    analysisMode === 'design' ? 'Designing your beam…' : 'Analyzing your beam…';
  ['section01','section03','section04','section05'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  ['sfdPeak','bmdPeak','deflPeak'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));

  // ── Design mode: /api/design only ──────────────────────────────────────
  if (analysisMode === 'design') {
    lastRunPrompt = promptText;
    currentDesignApiData = null;
    try {
      const designData = await callDesignApi(promptText);
      console.log('design response:', designData);
      currentDesignApiData = designData;
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('section04').classList.remove('hidden');
      syncSettingsFromDesignResponse(designData);
      renderDesignResultsFromApi(designData);
    } catch (error) {
      document.getElementById('loadingState').classList.add('hidden');
      const msg = error.message || 'Design failed. Please try again.';
      const displayMessage =
        error.status === 400 ? msg :
        error.status === 429 ? 'Quota limit reached. Please try again in a few minutes.' :
        'An error occurred. Please try again later.';
      showError(displayMessage);
    }
    btn.textContent = original;
    btn.disabled = false;
    return;
  }

  // ── Analysis mode: /api/analyse only ───────────────────────────────────
  try {
    let response;
    if (attachedFile1) {
      const fd = new FormData();
      fd.append('image1', attachedFile1, 'image1.jpg');
      if (promptText) fd.append('prompt', promptText);
      response = await fetch(`${API_BASE}/api/analyse-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
    } else {
      response = await fetch(`${API_BASE}/api/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt: promptText }),
      });
    }

    if (!response.ok) {
      let errorDetails = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.detail && typeof errorData.detail === 'object') {
          const detail = errorData.detail;
          if (detail.error && detail.message) errorDetails = `${detail.error}: ${detail.message}`;
          else if (detail.message) errorDetails = detail.message;
          else errorDetails = JSON.stringify(detail);
        } else if (errorData.detail && typeof errorData.detail === 'string') {
          errorDetails = errorData.detail;
        }
      } catch (e) {
        errorDetails = (await response.text()) || response.statusText;
      }
      const error = new Error(errorDetails);
      error.statusCode = response.status;
      throw error;
    }

    const data = await response.json();
    console.log('analysis response:', data);

    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('section01').classList.remove('hidden');
    document.getElementById('section03').classList.remove('hidden');
    document.getElementById('section05').classList.remove('hidden');

    render(data);
    btn.textContent = original;
    btn.disabled = false;
  } catch (error) {
    document.getElementById('loadingState').classList.add('hidden');
    console.error('Analysis failed:', error.statusCode ?? 'no status', error.message, error);

    let displayMessage = 'An error occurred. Please try again later.';
    if (error.statusCode === 400 || error.statusCode === 422) displayMessage = error.message;
    else if (error.statusCode === 413) displayMessage = 'Image too large. Each file must be under 0.5 MB.';
    else if (error.statusCode === 429) displayMessage = 'Quota limit reached. Please try again in a few minutes.';

    showError(displayMessage);
    btn.textContent = original;
    btn.disabled = false;
  }
});

// PDF download functionality
let currentAnalysisData = null;
let currentDesignApiData = null;
let lastRunPrompt = '';
let designRerunTimer = null;

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  if (!currentAnalysisData || !currentAnalysisData.analysis_id) return;

  const btn = document.getElementById('downloadPdfBtn');
  const original = btn.innerHTML;
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/analyse/${currentAnalysisData.analysis_id}/report`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail?.message || `Report request failed (${res.status})`);
    }
    const { report_url } = await res.json();
    if (!report_url) throw new Error('No report URL returned');
    window.open(report_url, '_blank');
  } catch (error) {
    console.error('Report generation failed:', error);
    showError(error.message || 'Failed to generate report. Please try again.');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
});


// ── image upload & camera capture ─────────────────────────────────────────
let attachedImageBase64 = null;
let attachedFile1 = null;
let cameraStream = null;
let analysisMode = 'analysis';

const uploadBtn        = document.getElementById('uploadBtn');
const cameraBtn        = document.getElementById('cameraBtn');
const imageUpload      = document.getElementById('imageUpload');
const imagePreviewWrap = document.getElementById('imagePreviewWrap');
const previewImg       = document.getElementById('previewImg');
const removeImageBtn   = document.getElementById('removeImageBtn');
const cameraModal      = document.getElementById('cameraModal');
const closeCameraBtn   = document.getElementById('closeCameraBtn');
const cameraFeed       = document.getElementById('cameraFeed');
const cameraCanvas     = document.getElementById('cameraCanvas');
const captureBtn       = document.getElementById('captureBtn');

function setAttachedImage(dataUrl, file) {
  attachedImageBase64 = dataUrl;
  attachedFile1 = file || null;
  previewImg.src = dataUrl;
  imagePreviewWrap.classList.remove('hidden');
  promptInput.disabled = true;
  promptInput.classList.add('opacity-40', 'cursor-not-allowed');
}

function clearAttachedImage() {
  attachedImageBase64 = null;
  attachedFile1 = null;
  previewImg.src = '';
  imagePreviewWrap.classList.add('hidden');
  imageUpload.value = '';
  promptInput.disabled = false;
  promptInput.classList.remove('opacity-40', 'cursor-not-allowed');
}

uploadBtn.addEventListener('click', () => imageUpload.click());

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => setAttachedImage(ev.target.result, file);
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', clearAttachedImage);

async function openCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    cameraFeed.srcObject = cameraStream;
    cameraModal.classList.remove('hidden');
  } catch {
    showError('Camera access denied or not available on this device.');
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  cameraFeed.srcObject = null;
  cameraModal.classList.add('hidden');
}

cameraBtn.addEventListener('click', openCamera);
closeCameraBtn.addEventListener('click', closeCamera);
cameraModal.addEventListener('click', (e) => { if (e.target === cameraModal) closeCamera(); });

captureBtn.addEventListener('click', () => {
  const w = cameraFeed.videoWidth  || 640;
  const h = cameraFeed.videoHeight || 480;
  cameraCanvas.width  = w;
  cameraCanvas.height = h;
  cameraCanvas.getContext('2d').drawImage(cameraFeed, 0, 0, w, h);
  const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85);
  cameraCanvas.toBlob(blob => setAttachedImage(dataUrl, blob), 'image/jpeg', 0.85);
  closeCamera();
});

// ── design settings ───────────────────────────────────────────────────────
const designSettings = {
  code:  'BS8110',
  fck:   30,
  fyk:   500,
  cover: 40,
  bars:  new Set(),
  links: 'T8',
};
let userSetBars = false;


function setChipActive(group, activeVal) {
  document.querySelectorAll(`[data-ds="${group}"]`).forEach(b => {
    const active   = b.dataset.val === activeVal;
    const isToggle = b.classList.contains('ds-toggle');
    b.classList.toggle('bg-ink',     active);
    b.classList.toggle('text-paper', active);
    b.classList.toggle('bg-surface', !active && isToggle);
    b.classList.toggle('bg-paper',   !active && !isToggle);
    b.classList.toggle('text-ink',   !active && !isToggle);
    b.classList.toggle('text-steel', !active && isToggle);
  });
}

// Advanced settings toggle
document.getElementById('dsAdvancedBtn').addEventListener('click', () => {
  const panel   = document.getElementById('dsAdvancedPanel');
  const chevron = document.getElementById('dsAdvChevron');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  chevron.style.transform = opening ? 'rotate(180deg)' : '';
});

// Single-select chips (code, fck, fyk, cover, links)
document.querySelectorAll('.ds-chip, .ds-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.ds;
    const val   = btn.dataset.val;

    if (group === 'fck') {
      designSettings.fck = Number(val);
      document.getElementById('dsFckCustom').value = '';
    } else if (group === 'fyk') {
      designSettings.fyk = Number(val);
      document.getElementById('dsFykCustom').value = '';
    } else if (group === 'cover') {
      designSettings.cover = Number(val);
      document.getElementById('dsCoverCustom').value = '';
    } else {
      designSettings[group] = val;
    }

    currentDesignApiData = null;
    setChipActive(group, val);
    renderDesignResults();
  });
});

// Multi-select chips (bar sizes — optional, no default selection)
document.querySelectorAll('.ds-multi').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.val;
    if (designSettings.bars.has(val)) {
      designSettings.bars.delete(val);
    } else {
      designSettings.bars.add(val);
      userSetBars = true;
    }
    if (designSettings.bars.size === 0) userSetBars = false;
    const active = designSettings.bars.has(val);
    btn.classList.toggle('bg-ink',     active);
    btn.classList.toggle('text-paper', active);
    btn.classList.toggle('bg-surface', !active);
    btn.classList.toggle('text-ink',   !active);
    currentDesignApiData = null;
    renderDesignResults();
  });
});

// Custom value inputs
document.getElementById('dsFckCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.fck = v; currentDesignApiData = null; setChipActive('fck', null); renderDesignResults(); }
});
document.getElementById('dsFykCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.fyk = v; currentDesignApiData = null; setChipActive('fyk', null); renderDesignResults(); }
});
document.getElementById('dsCoverCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.cover = v; currentDesignApiData = null; setChipActive('cover', null); renderDesignResults(); }
});

// ── design API helpers ────────────────────────────────────────────────────

function showDesignLoading(loading) {
  const placeholder = '<div class="font-mono text-[11px] text-steel/60 py-1 animate-pulse">Computing…</div>';
  ['drFlexural', 'drShear', 'drDeflection'].forEach(id => {
    if (loading) document.getElementById(id).innerHTML = placeholder;
  });
}

async function callDesignApi(prompt) {
  const b   = parseInt(document.getElementById('drBeamB').value) || 300;
  const h   = parseInt(document.getElementById('drBeamH').value) || 500;
  const fyv = Math.max(200, parseInt(document.getElementById('drFyv').value) || 250);

  const augPrompt = `${prompt}, section ${b}mm wide × ${h}mm deep`;
  const settings = {
    design_code: 'bs8110',
    fcu:         designSettings.fck,
    fy:          designSettings.fyk,
    fyv,
    cover:       designSettings.cover,
    link_dia:    parseInt(designSettings.links.replace('T', '')),
    ...(userSetBars && designSettings.bars.size > 0 && {
      preferred_bars: [...designSettings.bars].map(s => parseInt(s.replace('T', ''))).sort((a, b) => a - b),
    }),
  };

  const res = await fetch(`${API_BASE}/api/design`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ prompt: augPrompt, settings }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.detail?.message || err?.detail || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }

  return res.json();
}

function syncSettingsFromDesignResponse(data) {
  const s  = data.applied_settings || {};
  const pi = data.parsed_input     || {};
  const sc = data.section          || {};

  // ── Design code ─────────────────────────────────────────────────────────
  if (s.design_code) {
    const code = 'BS8110'; // EC2 not yet supported
    designSettings.code = code;
    setChipActive('code', code);
  }

  // ── Concrete grade (fcu/fck) ─────────────────────────────────────────────
  const fcu = s.fcu ?? sc.fcu_Nmm2 ?? null;
  if (fcu != null) {
    designSettings.fck = fcu;
    setChipActive('fck', String(fcu));
    const chip = document.querySelector(`.ds-chip[data-ds="fck"][data-val="${fcu}"]`);
    const inp  = document.getElementById('dsFckCustom');
    if (!chip && inp) inp.value = fcu;
    else if (inp)     inp.value = '';
  }

  // ── Steel yield (fy/fyk) ─────────────────────────────────────────────────
  const fy = s.fy ?? sc.fy_Nmm2 ?? null;
  if (fy != null) {
    designSettings.fyk = fy;
    setChipActive('fyk', String(fy));
    const chip = document.querySelector(`.ds-chip[data-ds="fyk"][data-val="${fy}"]`);
    const inp  = document.getElementById('dsFykCustom');
    if (!chip && inp) inp.value = fy;
    else if (inp)     inp.value = '';
  }

  // ── Cover ─────────────────────────────────────────────────────────────────
  if (s.cover != null) {
    designSettings.cover = s.cover;
    setChipActive('cover', String(s.cover));
    const chip = document.querySelector(`.ds-chip[data-ds="cover"][data-val="${s.cover}"]`);
    const inp  = document.getElementById('dsCoverCustom');
    if (!chip && inp) inp.value = s.cover;
    else if (inp)     inp.value = '';
  }

  // ── Links diameter ────────────────────────────────────────────────────────
  if (s.link_dia != null) {
    const linkVal = `T${s.link_dia}`;
    designSettings.links = linkVal;
    setChipActive('links', linkVal);
  }

  // ── fyv input in section §04 ─────────────────────────────────────────────
  const fyv = s.fyv ?? sc.fyv_Nmm2 ?? null;
  if (fyv != null) {
    const fyvEl = document.getElementById('drFyv');
    if (fyvEl) fyvEl.value = fyv;
  }

  // ── Section dimensions in §04 ────────────────────────────────────────────
  const b = sc.b_mm ?? pi.section?.b ?? null;
  const h = sc.h_mm ?? pi.section?.h ?? null;
  if (b != null) { const el = document.getElementById('drBeamB'); if (el) el.value = b; }
  if (h != null) { const el = document.getElementById('drBeamH'); if (el) el.value = h; }

  // ── Support condition in §04 ─────────────────────────────────────────────
  const cond = pi.support_condition || '';
  if (cond) {
    const mapped = cond.includes('cant') ? 'cant' : cond.includes('cont') ? 'cont' : 'ss';
    setDrSupport(mapped);
  }

  // ── Open advanced panel so the user sees what was used ───────────────────
  if (Object.keys(s).length > 0) {
    const panel   = document.getElementById('dsAdvancedPanel');
    const chevron = document.getElementById('dsAdvChevron');
    if (panel?.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  }
}

function renderDesignResultsFromApi(data) {
  const fl = data.flexure;
  const sh = data.shear;
  const de = data.deflection;
  const sc = data.section;
  const rf = data.reinforcement;
  const df = data.design_forces;

  document.getElementById('drUlsMoment').textContent = `ULS Moment: ${df.M_ult_kNm.toFixed(1)} kN·m`;
  document.getElementById('drUlsShear').textContent  = `ULS Shear: ${df.V_ult_kN.toFixed(1)} kN`;

  // Flexural
  const flexLines = [];
  flexLines.push(drLine('Section d', `${sc.d_mm} mm`));
  flexLines.push(drLine(`K  (K′ = ${fl.K_prime.toFixed(3)})`, fl.K.toFixed(4)));
  if (fl.doubly_reinforced) {
    flexLines.push(drLine('K > K′', 'Compression steel required', false));
    flexLines.push(drLine('As₂ req', `${Math.ceil(fl.As2_req_mm2)} mm²`));
  }
  flexLines.push(drLine('Lever arm z', `${fl.z_mm.toFixed(1)} mm`));
  flexLines.push(drLine('As req', `${Math.ceil(fl.As_req_mm2)} mm²`));
  flexLines.push(drLine('As min / max', `${Math.ceil(fl.As_min_mm2)} / ${Math.floor(fl.As_max_mm2)} mm²`));
  if (rf.tension) {
    const t = rf.tension;
    const provOk = t.As_prov_mm2 >= fl.As_req_mm2 && t.As_prov_mm2 <= fl.As_max_mm2;
    flexLines.push(drLine('Provided', `${t.label}  →  Aₛ = ${t.As_prov_mm2.toFixed(0)} mm²`, provOk));
    if (t.clear_spacing_mm != null) {
      flexLines.push(drLine('Clear spacing', `${t.clear_spacing_mm.toFixed(1)} mm`, t.spacing_ok));
    }
  }
  if (rf.compression) {
    const c = rf.compression;
    flexLines.push(drLine('Compression steel', `${c.label}  →  As₂ = ${c.As_prov_mm2.toFixed(0)} mm²`));
  }

  // Shear
  const shearLines = [];
  shearLines.push(drLine(`v  (v_max = ${sh.v_max_Nmm2.toFixed(2)})`, `${sh.v_Nmm2.toFixed(3)} N/mm²`, sh.v_Nmm2 <= sh.v_max_Nmm2));
  shearLines.push(drLine('vc', `${sh.vc_Nmm2.toFixed(3)} N/mm²`));
  shearLines.push(drLine(`Asv/sv req (${sh.link_type})`, `${sh.Asv_sv_req_mm2mm.toFixed(3)} mm²/mm`));
  if (rf.links) {
    const lnk = rf.links;
    const linkOk = lnk.Asv_sv_prov_mm2mm >= sh.Asv_sv_req_mm2mm;
    shearLines.push(drLine('Links', `${lnk.label}  →  ${lnk.Asv_sv_prov_mm2mm.toFixed(3)} mm²/mm`, linkOk));
  }

  // Deflection
  const deflOk = de.span_d_actual <= de.span_d_allowable;
  const deflLines = [];
  deflLines.push(drLine('MF tension', de.MF_tension.toFixed(3)));
  deflLines.push(drLine('Allowable span/d', de.span_d_allowable.toFixed(2)));
  deflLines.push(drLine('Actual span/d', de.span_d_actual.toFixed(2), deflOk));
  if (!deflOk && currentAnalysisData) {
    const d_needed = Math.ceil(currentAnalysisData.schema.length * 1000 / de.span_d_allowable);
    deflLines.push(drLine('Note', `Increase d to ≥ ${d_needed} mm`, false));
  }

  document.getElementById('drFlexural').innerHTML   = flexLines.join('');
  document.getElementById('drShear').innerHTML      = shearLines.join('');
  document.getElementById('drDeflection').innerHTML = deflLines.join('');
}

// ── design results ─────────────────────────────────────────────────────────
const BAR_AREAS = { T8:50.3, T10:78.5, T12:113.1, T16:201.1, T20:314.2, T25:490.9, T32:804.2 };

function drLine(label, value, pass) {
  const icon = pass === true  ? ' <span class="text-teal font-semibold">✓</span>'  :
               pass === false ? ' <span class="text-orange font-semibold">✗</span>' : '';
  return `<div class="flex items-start gap-2 py-0.5">
    <span class="text-steel flex-shrink-0" style="min-width:11rem">${label}</span>
    <span class="text-steel/40">→</span>
    <span class="text-ink">${value}${icon}</span>
  </div>`;
}

let drSupportCond = 'ss'; // 'ss' | 'cont' | 'cant'

function renderDesignResults() {
  if (!currentAnalysisData) return;
  if (currentDesignApiData) { renderDesignResultsFromApi(currentDesignApiData); return; }

  const b     = Math.max(100, parseInt(document.getElementById('drBeamB').value)  || 300);
  const h     = Math.max(150, parseInt(document.getElementById('drBeamH').value)  || 500);
  const fyvEl = document.getElementById('drFyv');
  const cover = designSettings.cover;
  const linkD = parseInt(designSettings.links.replace('T', ''));
  const code  = designSettings.code;
  const fck   = designSettings.fck;
  const fyk   = designSettings.fyk;
  const fyv   = Math.max(200, parseInt(fyvEl?.value) || 250);

  const sortedBars = [...designSettings.bars]
    .sort((a, z) => parseInt(z.replace('T','')) - parseInt(a.replace('T','')));
  const mainBarD = parseInt(sortedBars[0]?.replace('T','') || '16');
  const d = h - cover - linkD - mainBarD / 2;

  const M_kNm = Math.abs(currentAnalysisData.max_bm) / 1000;
  const V_kN  = Math.abs(currentAnalysisData.max_sf)  / 1000;
  const M_Nmm = M_kNm * 1e6;
  const V_N   = V_kN  * 1e3;

  document.getElementById('drUlsMoment').textContent = `ULS Moment: ${M_kNm.toFixed(1)} kN·m`;
  document.getElementById('drUlsShear').textContent  = `ULS Shear: ${V_kN.toFixed(1)} kN`;

  // ── Flexural design (BS8110 / EC2) ───────────────────────────────────────
  const K      = M_Nmm / (fck * b * d * d);
  const Kprime = code === 'BS8110' ? 0.156 : 0.167;
  const flexLines = [];
  let z, As_req;

  flexLines.push(drLine('Section d', `${d.toFixed(0)} mm`));
  flexLines.push(drLine('K  (K′ = ' + Kprime + ')', K.toFixed(4)));

  if (K > Kprime) {
    z      = 0.775 * d;
    As_req = M_Nmm / (0.95 * fyk * z);
    flexLines.push(drLine('K > K′', 'Compression steel required', false));
  } else {
    z = code === 'BS8110'
      ? Math.min(d * (0.5 + Math.sqrt(0.25 - K / 0.9)), 0.95 * d)
      : Math.min(d * 0.5 * (1 + Math.sqrt(1 - 3.53 * K)), 0.95 * d);
    As_req = M_Nmm / ((code === 'BS8110' ? 0.95 : 0.87) * fyk * z);
    const zR = z / d;
    flexLines.push(drLine('Lever arm z', `${z.toFixed(1)} mm  (${Math.abs(zR - 0.95) < 0.001 ? '0.95d' : (zR.toFixed(3) + 'd')})`));
  }

  // As limits (BS8110 Table 3.25 / EC2 9.2.1)
  const As_min_pct = code === 'BS8110' ? (fyk <= 250 ? 0.0024 : 0.0013) : Math.max(0.26 * (0.3 * Math.pow(fck, 2/3)) / fyk, 0.0013);
  const As_min = As_min_pct * b * h;
  const As_max = 0.04 * b * h;

  flexLines.push(drLine('As req', `${Math.ceil(As_req)} mm²`));
  flexLines.push(drLine('As min / max', `${Math.ceil(As_min)} / ${Math.floor(As_max)} mm²`));

  let provided = null;
  outer: for (const bar of sortedBars) {
    const area = BAR_AREAS[bar];
    if (!area) continue;
    for (let n = 2; n <= 10; n++) {
      if (n * area >= As_req) { provided = { n, bar, As: n * area }; break outer; }
    }
  }
  if (!provided && sortedBars.length) {
    const bar = sortedBars[sortedBars.length - 1];
    const n   = Math.ceil(As_req / BAR_AREAS[bar]);
    provided = { n, bar, As: n * BAR_AREAS[bar] };
  }
  if (provided) {
    const barD    = parseInt(provided.bar.replace('T',''));
    const clrSpc  = (b - 2*(cover + linkD) - provided.n * barD) / (provided.n - 1);
    const clrOk   = clrSpc >= Math.max(barD, 25);
    const provOk  = provided.As >= As_req && provided.As <= As_max;
    flexLines.push(drLine('Provided', `${provided.n}${provided.bar}  →  Aₛ = ${provided.As.toFixed(0)} mm²`, provOk));
    if (provided.n > 1) {
      flexLines.push(drLine('Clear spacing', `${clrSpc.toFixed(1)} mm`, clrOk));
    }
  }

  // ── Shear design ─────────────────────────────────────────────────────────
  const As_prov  = provided ? provided.As : As_req;
  const v        = V_N / (b * d);
  const vmax     = code === 'BS8110' ? Math.min(0.8 * Math.sqrt(fck), 5) : Math.min(0.2 * fck, 5);
  const rho100   = Math.min(100 * As_prov / (b * d), 3);
  const Asvleg   = Math.PI * (linkD / 2) ** 2;
  const Asv2     = 2 * Asvleg;
  const shearLines = [];
  let vc;

  if (code === 'BS8110') {
    const fcu_factor = fck > 25 ? Math.pow(fck / 25, 1/3) : 1;
    vc = 0.79 * Math.pow(rho100, 1/3) * Math.pow(Math.max(400 / d, 1), 1/4) * fcu_factor / 1.25;
  } else {
    const k = Math.min(1 + Math.sqrt(200 / d), 2);
    vc = 0.12 * k * Math.pow(rho100 * fck, 1/3);
  }

  shearLines.push(drLine('v  (v_max = ' + vmax.toFixed(2) + ')', `${v.toFixed(3)} N/mm²`, v <= vmax));
  shearLines.push(drLine(code === 'BS8110' ? 'vc' : 'vRd,c', `${vc.toFixed(3)} N/mm²`));

  if (v > vmax) {
    shearLines.push(drLine('Links', 'Section inadequate — v > v_max', false));
  } else if (v <= (code === 'BS8110' ? vc + 0.4 : vc)) {
    // Minimum links
    const AsvSv_min = code === 'BS8110'
      ? (0.4 * b) / (0.95 * fyv)
      : (0.08 * Math.sqrt(fck) / fyv) * b;
    const sv_max  = Math.min(Math.floor(0.75 * d / 25) * 25, 300);
    const sv_prov = Math.min(Math.floor(Asv2 / AsvSv_min / 25) * 25, sv_max);
    const AsvSv_prov = Asv2 / sv_prov;
    shearLines.push(drLine('Asv/sv  req (min)', `${AsvSv_min.toFixed(3)} mm²/mm`));
    shearLines.push(drLine('Links', `${designSettings.links} @ ${sv_prov}mm  →  ${AsvSv_prov.toFixed(3)} mm²/mm`, true));
  } else {
    // Designed links
    const AsvSv_req = b * (v - vc) / (0.95 * fyv);
    let sv = Math.floor(Asv2 / AsvSv_req / 25) * 25;
    sv = Math.max(75, Math.min(sv, Math.floor(0.75 * d / 25) * 25, 300));
    const AsvSv_prov = Asv2 / sv;
    shearLines.push(drLine('Asv/sv  req', `${AsvSv_req.toFixed(3)} mm²/mm`));
    shearLines.push(drLine('Links', `${designSettings.links} @ ${sv}mm  →  ${AsvSv_prov.toFixed(3)} mm²/mm`, AsvSv_prov >= AsvSv_req));
  }

  // ── Deflection check (BS8110 cl 3.4.6 / EC2 7.4) ────────────────────────
  const basicRatio = { ss: 20, cont: 26, cant: 7 }[drSupportCond] ?? 20;
  const span_mm      = currentAnalysisData.schema.length * 1000;
  const actual_ratio = span_mm / d;
  const fs           = provided ? (2 * fyk * As_req) / (3 * provided.As) : fyk;
  const Mbd2         = M_Nmm / (b * d * d);
  const MFt          = Math.min(Math.max(0.55 + (477 - fs) / (120 * (0.9 + Mbd2)), 0.5), 2.0);
  const allowable    = basicRatio * MFt;
  const deflOk       = actual_ratio <= allowable;
  const deflLines    = [
    drLine('Basic ratio', `${basicRatio}  (MFt = ${MFt.toFixed(3)})`),
    drLine('Allowable span/d', `${allowable.toFixed(2)}`),
    drLine('Actual span/d', `${actual_ratio.toFixed(2)}`, deflOk),
  ];
  if (!deflOk) {
    deflLines.push(drLine(
      'Note',
      `Increase d to ≥ ${Math.ceil(span_mm / allowable)} mm`,
      false
    ));
  }

  document.getElementById('drFlexural').innerHTML   = flexLines.join('');
  document.getElementById('drShear').innerHTML      = shearLines.join('');
  document.getElementById('drDeflection').innerHTML = deflLines.join('');
}

// Support condition toggle
function setDrSupport(cond) {
  drSupportCond = cond;
  currentDesignApiData = null;
  const map = { ss: 'drSuppSS', cont: 'drSuppCont', cant: 'drSuppCant' };
  Object.entries(map).forEach(([k, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('bg-ink',    k === cond);
    btn.classList.toggle('text-paper',k === cond);
    btn.classList.toggle('bg-surface',k !== cond);
    btn.classList.toggle('text-steel',k !== cond);
  });
  renderDesignResults();
}
document.getElementById('drSuppSS')  ?.addEventListener('click', () => setDrSupport('ss'));
document.getElementById('drSuppCont')?.addEventListener('click', () => setDrSupport('cont'));
document.getElementById('drSuppCant')?.addEventListener('click', () => setDrSupport('cant'));

// Invalidate cached server result when section dimensions or fyv change.
// User must click "Design beam" again to recompute on the server — no auto-rerun.
['drBeamB', 'drBeamH', 'drFyv'].forEach(id =>
  document.getElementById(id)?.addEventListener('input', () => {
    currentDesignApiData = null;
    renderDesignResults();
  })
);

// Export calculation sheet PDF — backend-generated, on-demand
document.getElementById('exportCalcBtn').addEventListener('click', async () => {
  const designId = currentDesignApiData?.design_id;
  if (!designId) {
    showError(lastRunPrompt
      ? 'Settings changed since last run — click Design beam to recompute, then download.'
      : 'Run a design first to generate a calculation report.');
    return;
  }
  const btn = document.getElementById('exportCalcBtn');
  const original = btn.innerHTML;
  btn.textContent = 'Generating…';
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/design/${designId}/report`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail?.message || `Report request failed (${res.status})`);
    }
    const { report_url } = await res.json();
    if (!report_url) throw new Error('No report URL returned');
    window.open(report_url, '_blank');
  } catch (error) {
    console.error('Design report generation failed:', error);
    showError(error.message || 'Failed to generate calculation report.');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
});

// ── legacy client-side calc-sheet generator (kept dead, replaced above) ─────
function _unusedLegacyCalcSheet() {
  if (!currentAnalysisData || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const M = 20, CW = PW - 2 * M;
  let y = M;

  const mono = 'courier', sans = 'helvetica';
  const row = (label, value, indent = 0) => {
    doc.setFont(mono, 'normal').setFontSize(9).setTextColor(94, 112, 129);
    doc.text(label, M + indent, y);
    doc.setTextColor(22, 36, 59);
    doc.text(value, M + indent + 55, y);
    y += 5.5;
  };
  const heading = (txt) => {
    y += 3;
    doc.setFont(sans, 'bold').setFontSize(8).setTextColor(94, 112, 129);
    doc.text(txt.toUpperCase(), M, y);
    y += 1;
    doc.setDrawColor(215, 224, 234).setLineWidth(0.3).line(M, y, M + CW, y);
    y += 5;
  };

  // Header
  doc.setFont(sans, 'bold').setFontSize(16).setTextColor(22, 36, 59);
  doc.text('BeamAi', M, y);
  doc.setFont(sans, 'normal').setFontSize(9).setTextColor(94, 112, 129);
  doc.text('Beam Design Calculation Sheet', M + 28, y - 1);
  doc.text(new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), PW - M, y, { align:'right' });
  y += 10;
  doc.setDrawColor(22, 36, 59).setLineWidth(0.5).line(M, y, M + CW, y);
  y += 8;

  const b = parseInt(document.getElementById('drBeamB').value) || 300;
  const h = parseInt(document.getElementById('drBeamH').value) || 500;

  heading('Design Settings');
  row('Code',            designSettings.code);
  row('fck / fcu',       `${designSettings.fck} N/mm²`);
  row('fyk / fy',        `${designSettings.fyk} N/mm²`);
  row('Nominal cover',   `${designSettings.cover} mm`);
  row('Preferred bars',  [...designSettings.bars].join(', '));
  row('Links',           designSettings.links);

  heading('Beam Geometry');
  row('Width b',   `${b} mm`);
  row('Depth h',   `${h} mm`);
  row('Span',      `${currentAnalysisData.schema.length.toFixed(3)} m`);

  heading('ULS Forces');
  row('Design moment M',  `${(Math.abs(currentAnalysisData.max_bm)/1000).toFixed(3)} kN·m`);
  row('Design shear V',   `${(Math.abs(currentAnalysisData.max_sf)/1000).toFixed(3)} kN`);

  heading('Flexural Design');
  document.querySelectorAll('#drFlexural > div').forEach(el => {
    const spans = el.querySelectorAll('span');
    if (spans.length >= 2) row(spans[0].textContent, spans[1].textContent);
  });

  heading('Shear Design');
  document.querySelectorAll('#drShear > div').forEach(el => {
    const spans = el.querySelectorAll('span');
    if (spans.length >= 2) row(spans[0].textContent, spans[1].textContent);
  });

  heading('Deflection Check');
  document.querySelectorAll('#drDeflection > div').forEach(el => {
    const spans = el.querySelectorAll('span');
    if (spans.length >= 2) row(spans[0].textContent, spans[1].textContent);
  });

  y += 6;
  doc.setFont(mono, 'italic').setFontSize(7).setTextColor(150, 160, 170);
  doc.text('Generated by BeamAi — simplified design to ' + designSettings.code + '. Verify all outputs independently before use.', M, y, { maxWidth: CW });

  doc.save('BeamAi_Calculation.pdf');
}

// ── analysis / design mode toggle ─────────────────────────────────────────
function setMode(mode) {
  analysisMode = mode;
  const isDesign = mode === 'design';

  // Segmented control styling
  const btnA = document.getElementById('modeAnalysis');
  const btnD = document.getElementById('modeDesign');
  btnA.classList.toggle('bg-ink',    !isDesign);
  btnA.classList.toggle('text-paper',!isDesign);
  btnA.classList.toggle('bg-surface', isDesign);
  btnA.classList.toggle('text-steel', isDesign);
  btnD.classList.toggle('bg-ink',     isDesign);
  btnD.classList.toggle('text-paper', isDesign);
  btnD.classList.toggle('bg-surface',!isDesign);
  btnD.classList.toggle('text-steel',!isDesign);

  // Show / hide advanced settings toggle
  document.getElementById('dsAdvancedToggle').classList.toggle('hidden', !isDesign);
  document.getElementById('runBtn').textContent = isDesign ? 'Design beam' : 'Run analysis';

  // Swap placeholder to match mode
  const analysisPlaceholder = 'e.g. "A simply supported beam of 6m span carrying 30kN/m UDL"';
  const designPlaceholder   = 'e.g. "A 300×500mm simply supported RC beam, 6m span — 20kN/m dead UDL, 15kN/m live UDL, and a 50kN point load at midspan."';
  document.getElementById('promptInput').placeholder = isDesign ? designPlaceholder : analysisPlaceholder;

  // Clear results — each mode fetches from a different endpoint
  ['section01','section03','section04','section05'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  ['sfdPeak','bmdPeak','deflPeak'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
}

document.getElementById('modeAnalysis').addEventListener('click', () => setMode('analysis'));
document.getElementById('modeDesign').addEventListener('click',   () => setMode('design'));

// ── how it works toggle ────────────────────────────────────────────────────
document.getElementById('howItWorksToggle').addEventListener('click', () => {
  const panel   = document.getElementById('howItWorksPanel');
  const chevron = document.getElementById('howChevron');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  chevron.style.transform = opening ? 'rotate(180deg)' : '';
});


