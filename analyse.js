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
  renderDesignResults();
}

// "run" interaction — fetch analysis from API
document.getElementById('runBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runBtn');
  const promptInput = document.getElementById('promptInput').value.trim();

  if (!promptInput && !attachedFile1) {
    showError('Please describe the beam or attach an image first');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Solving…';
  btn.disabled = true;
  incrementAnalysisCount();

  // Show loading state, hide results
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('section01').classList.add('hidden');
  document.getElementById('section02').classList.add('hidden');
  document.getElementById('section03').classList.add('hidden');
  document.getElementById('section04').classList.add('hidden');
  document.getElementById('section05').classList.add('hidden');
  ['sfdPeak','bmdPeak','deflPeak'].forEach(id => document.getElementById(id).classList.add('hidden'));

  try {
    let response;
    if (attachedFile1) {
      const fd = new FormData();
      fd.append('image1', attachedFile1, 'image1.jpg');
      if (promptInput) fd.append('prompt', promptInput);
      response = await fetch(`${API_BASE}/api/analyse-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
    } else {
      response = await fetch(`${API_BASE}/api/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt: promptInput }),
      });
    }

    if (!response.ok) {
      let errorDetails = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.detail && typeof errorData.detail === 'object') {
          const detail = errorData.detail;
          if (detail.error && detail.message) {
            errorDetails = `${detail.error}: ${detail.message}`;
          } else if (detail.message) {
            errorDetails = detail.message;
          } else {
            errorDetails = JSON.stringify(detail);
          }
        } else if (errorData.detail && typeof errorData.detail === 'string') {
          errorDetails = errorData.detail;
        }
      } catch (e) {
        const errorText = await response.text();
        errorDetails = errorText || response.statusText;
      }
      const error = new Error(errorDetails);
      error.statusCode = response.status;
      throw error;
    }

    const data = await response.json();
    console.log('analysis response:', data);

    // Hide loading state, show results
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('section01').classList.remove('hidden');
    document.getElementById('section02').classList.toggle('hidden', analysisMode !== 'design');
    document.getElementById('section03').classList.remove('hidden');
    document.getElementById('section04').classList.toggle('hidden', analysisMode !== 'design');
    document.getElementById('section05').classList.remove('hidden');

    render(data);
    btn.textContent = original;
    btn.disabled = false;
  } catch (error) {
    document.getElementById('loadingState').classList.add('hidden');

    console.error('Analysis failed:', error.statusCode ?? 'no status', error.message, error);

    let displayMessage = 'An error occurred. Please try again later.';

    if (error.statusCode === 400 || error.statusCode === 422) {
      displayMessage = error.message;
    } else if (error.statusCode === 413) {
      displayMessage = 'Image too large. Each file must be under 0.5 MB.';
    } else if (error.statusCode === 429) {
      displayMessage = 'Quota limit reached. Please try again in a few minutes.';
    }

    showError(displayMessage);
    btn.textContent = original;
    btn.disabled = false;
  }
});

// PDF download functionality
let currentAnalysisData = null;

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  if (!currentAnalysisData) return;

  const btn = document.getElementById('downloadPdfBtn');
  const original = btn.textContent;
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF library not loaded');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M  = 15;
    const CW = PW - 2 * M;
    const FOOTER_Y = PH - 10;

    // palette
    const INK    = [22,  36,  59];
    const STEEL  = [94, 112, 129];
    const BLUE   = [59, 110, 165];
    const ORANGE = [232, 98,  58];
    const TEAL   = [47, 143, 111];
    const AMBER  = [245, 166, 35];
    const PAPER  = [238, 241, 244];
    const GRID   = [215, 224, 234];
    const WHITE  = [255, 255, 255];

    const schema         = currentAnalysisData.schema;
    const classification = currentAnalysisData.classification || {};
    const userPrompt     = promptInput.value.trim();
    const now            = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    // ── helpers ────────────────────────────────────────────────────────
    const setColor  = (rgb) => doc.setTextColor(...rgb);
    const setFill   = (rgb) => doc.setFillColor(...rgb);
    const setStroke = (rgb) => doc.setDrawColor(...rgb);

    function drawFooter(pageNum, total){
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      setColor(STEEL);
      setStroke(GRID);
      doc.line(M, FOOTER_Y - 3, PW - M, FOOTER_Y - 3);
      doc.text('BeamAi  ·  Structural Analysis Report', M, FOOTER_Y);
      const pg = total ? `Page ${pageNum} of ${total}` : `Page ${pageNum}`;
      doc.text(pg, PW - M, FOOTER_Y, { align: 'right' });
    }

    function sectionLabel(text, y){
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      setColor(STEEL);
      doc.text(text.toUpperCase(), M, y);
      setStroke(GRID);
      doc.line(M, y + 1.5, PW - M, y + 1.5);
      return y + 7;
    }

    function ensureSpace(y, needed){
      if (y + needed > PH - 20){
        drawFooter(doc.internal.pages.length - 1);
        doc.addPage();
        setFill(AMBER); doc.rect(0, 0, 4, 5, 'F');
        return 18;
      }
      return y;
    }

    let y = 0;

    // ── 1. Header band ─────────────────────────────────────────────────
    setFill(INK);  doc.rect(0, 0, PW, 32, 'F');
    setFill(AMBER); doc.rect(0, 0, 4, 32, 'F');

    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    setColor(WHITE);
    doc.text('BeamAi', M + 3, 14);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    setColor([180, 200, 220]);
    doc.text('Structural Analysis Report', M + 3, 21);

    doc.setFontSize(8);
    setColor([130, 155, 180]);
    doc.text(`${dateStr}  ·  ${timeStr}`, PW - M, 21, { align: 'right' });

    y = 40;

    // ── 2. User prompt ─────────────────────────────────────────────────
    y = sectionLabel('Beam Description', y);

    const promptLines = doc.splitTextToSize(`"${userPrompt}"`, CW - 12);
    const promptBoxH  = promptLines.length * 5.2 + 9;

    setFill(PAPER);
    doc.roundedRect(M, y, CW, promptBoxH, 2, 2, 'F');
    setFill(BLUE);
    doc.rect(M, y, 3, promptBoxH, 'F');

    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    setColor(INK);
    doc.text(promptLines, M + 9, y + 6.5);

    y += promptBoxH + 9;

    // ── 3. Classification chips ────────────────────────────────────────
    if (classification.beam_type){
      y = ensureSpace(y, 35);
      y = sectionLabel('Beam Classification', y);

      const beamLabel = (classification.beam_type || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      const chipW = (CW - 4) / 2;
      const chipH = 13;

      // chip 1 — beam type
      setFill(PAPER); doc.roundedRect(M, y, chipW, chipH, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); setColor(STEEL);
      doc.text('BEAM TYPE', M + 5, y + 5);
      doc.setFontSize(9.5); doc.setFont(undefined, 'bold'); setColor(INK);
      doc.text(beamLabel, M + 5, y + 10.5);

      // chip 2 — DSI
      setFill(PAPER); doc.roundedRect(M + chipW + 4, y, chipW, chipH, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); setColor(STEEL);
      doc.text('DEGREE OF INDETERMINACY  (DSI)', M + chipW + 9, y + 5);
      doc.setFontSize(9.5); doc.setFont(undefined, 'bold'); setColor(INK);
      doc.text(`${classification.dsi ?? '—'}`, M + chipW + 9, y + 10.5);

      y += chipH + 5;

      if (classification.description){
        doc.setFontSize(9); doc.setFont(undefined, 'normal'); setColor(STEEL);
        const dl = doc.splitTextToSize(classification.description, CW);
        doc.text(dl, M, y);
        y += dl.length * 4.5 + 4;
      }

      y += 4;
    }

    // ── 4. Structural model ────────────────────────────────────────────
    y = ensureSpace(y, 45);
    y = sectionLabel('Structural Model', y);

    // span badge
    setFill(INK); doc.roundedRect(M, y, 44, 10, 2, 2, 'F');
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); setColor(WHITE);
    doc.text(`${schema.length.toFixed(3)} m  span`, M + 4, y + 6.8);
    y += 14;

    // supports
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); setColor(INK);
    doc.text('Supports', M, y); y += 5;

    schema.supports.forEach(s => {
      y = ensureSpace(y, 6);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      setColor(STEEL); doc.text('•', M + 2, y);
      setColor(INK);
      const tl = s.type.charAt(0).toUpperCase() + s.type.slice(1);
      doc.text(`${tl} support`, M + 7, y);
      setColor(STEEL); doc.text(`x = ${s.position.toFixed(3)} m`, M + 50, y);
      y += 5;
    });

    y += 3;

    // loads
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); setColor(INK);
    doc.text('Applied Loads', M, y); y += 5;

    schema.udls.forEach(u => {
      y = ensureSpace(y, 6);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      setColor(ORANGE); doc.text('•', M + 2, y);
      setColor(INK); doc.text(`UDL  ${Math.abs(u.magnitude/1000).toFixed(1)} kN/m`, M + 7, y);
      setColor(STEEL); doc.text(`x ∈ [${u.start.toFixed(2)}, ${u.end.toFixed(2)}] m`, M + 58, y);
      y += 5;
    });

    (schema.point_loads || []).forEach(pl => {
      y = ensureSpace(y, 6);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      setColor(ORANGE); doc.text('•', M + 2, y);
      setColor(INK); doc.text(`Point load  ${Math.abs(pl.magnitude/1000).toFixed(1)} kN`, M + 7, y);
      setColor(STEEL); doc.text(`x = ${pl.position.toFixed(3)} m`, M + 58, y);
      y += 5;
    });

    (schema.varying_loads || []).forEach(vl => {
      y = ensureSpace(y, 6);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      setColor(BLUE); doc.text('•', M + 2, y);
      setColor(INK);
      const s0 = Math.abs(vl.start_magnitude/1000).toFixed(1);
      const s1 = Math.abs(vl.end_magnitude/1000).toFixed(1);
      doc.text(`Varying  ${s0} → ${s1} kN/m`, M + 7, y);
      setColor(STEEL); doc.text(`x ∈ [${vl.start.toFixed(2)}, ${vl.end.toFixed(2)}] m`, M + 58, y);
      y += 5;
    });

    y += 9;

    // ── 5. Peak values ─────────────────────────────────────────────────
    if (currentAnalysisData.max_sf != null) {
      y = ensureSpace(y, 38);
      y = sectionLabel('Peak Values', y);

      const peakRows = [
        { label: 'Max Shear Force',    value: `${(currentAnalysisData.max_sf / 1000).toFixed(3)} kN`,           at: currentAnalysisData.max_sf_x,          color: BLUE },
        { label: 'Max Bending Moment', value: `${(currentAnalysisData.max_bm / 1000).toFixed(3)} kN·m`,         at: currentAnalysisData.max_bm_x,          color: ORANGE },
        { label: 'Max Deflection',     value: `${Math.abs(currentAnalysisData.max_deflection ?? 0).toFixed(4)} mm`, at: currentAnalysisData.max_deflection_x, color: TEAL },
      ];

      peakRows.forEach(pk => {
        y = ensureSpace(y, 8);
        setFill(pk.color); doc.circle(M + 2.5, y - 1.5, 1.5, 'F');
        doc.setFontSize(9); doc.setFont(undefined, 'normal'); setColor(STEEL);
        doc.text(pk.label, M + 7, y);
        doc.setFont(undefined, 'bold'); setColor(INK);
        doc.text(pk.value, M + 65, y);
        doc.setFont(undefined, 'normal'); setColor(STEEL);
        doc.text(`at x = ${pk.at} m`, M + 108, y);
        y += 6;
      });

      y += 5;
    }

    // ── 6. Results table ───────────────────────────────────────────────
    y = ensureSpace(y, 20);
    y = sectionLabel('Analysis Results', y);

    const tableBody = currentAnalysisData.rows.map(r => [
      r.x.toFixed(3),
      (r.axial  / 1000).toFixed(3),
      (r.shear  / 1000).toFixed(3),
      (r.moment / 1000).toFixed(3),
      r.deflection.toFixed(4)
    ]);

    doc.autoTable({
      startY: y,
      head: [['x (m)', 'Axial (kN)', 'Shear (kN)', 'Moment (kN·m)', 'Deflection (mm)']],
      body: tableBody,
      margin: { left: M, right: M, bottom: 18 },
      styles: { fontSize: 9, cellPadding: 2.8, textColor: INK, font: 'helvetica' },
      headStyles: {
        fillColor: INK, textColor: WHITE,
        fontStyle: 'bold', fontSize: 9, cellPadding: 3
      },
      alternateRowStyles: { fillColor: PAPER },
      columnStyles: {
        0: { halign: 'left'  },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
      didDrawPage(data){
        setFill(AMBER); doc.rect(0, 0, 4, 5, 'F');
        drawFooter(data.pageNumber, data.pageCount);
      }
    });

    doc.save(`beam-report-${now.getTime()}.pdf`);

  } catch (error) {
    console.error('PDF generation failed:', error);
    showError('Failed to generate PDF. Please try again.');
  } finally {
    btn.textContent = original;
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
  bars:  new Set(['T12', 'T16', 'T20']),
  links: 'T8',
};

function updateDsSummary() {
  const yLabel = designSettings.code === 'BS8110' ? 'fy' : 'fyk';
  const bars   = [...designSettings.bars].sort((a, b) => {
    const n = s => parseInt(s.replace('T', ''));
    return n(a) - n(b);
  }).join(' ');
  document.getElementById('dsSummary').textContent =
    `C${designSettings.fck} · ${yLabel} ${designSettings.fyk} · Cover ${designSettings.cover}mm · ${designSettings.code} · ${bars}`;
  updateChipLabels();
  renderDesignResults();
}

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

// Toggle collapse / expand
document.getElementById('designSettingsToggle').addEventListener('click', () => {
  const panel   = document.getElementById('designSettingsPanel');
  const chevron = document.getElementById('dsChevron');
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

    setChipActive(group, val);
    updateDsSummary();
  });
});

// Multi-select chips (preferred bar sizes)
document.querySelectorAll('.ds-multi').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.val;
    if (designSettings.bars.has(val)) {
      if (designSettings.bars.size > 1) designSettings.bars.delete(val);
    } else {
      designSettings.bars.add(val);
    }
    const active = designSettings.bars.has(val);
    btn.classList.toggle('bg-ink',    active);
    btn.classList.toggle('text-paper', active);
    btn.classList.toggle('bg-paper',  !active);
    btn.classList.toggle('text-ink',  !active);
    updateDsSummary();
  });
});

// Custom value inputs
document.getElementById('dsFckCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) {
    designSettings.fck = v;
    setChipActive('fck', null);
    updateDsSummary();
  }
});
document.getElementById('dsFykCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) {
    designSettings.fyk = v;
    setChipActive('fyk', null);
    updateDsSummary();
  }
});
document.getElementById('dsCoverCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) {
    designSettings.cover = v;
    setChipActive('cover', null);
    updateDsSummary();
  }
});

// initialise summary + status line on load
updateDsSummary();

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

// Recompute when beam section dimensions or fyv change
['drBeamB', 'drBeamH', 'drFyv'].forEach(id =>
  document.getElementById(id)?.addEventListener('input', renderDesignResults)
);

// Export calculation sheet PDF
document.getElementById('exportCalcBtn').addEventListener('click', () => {
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
});

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

  // Show / hide design chips row
  document.getElementById('dsChipsRow').classList.toggle('hidden', !isDesign);

  // If a result is already shown, immediately update visible sections
  if (currentAnalysisData) {
    document.getElementById('section02').classList.toggle('hidden', !isDesign);
    document.getElementById('section04').classList.toggle('hidden', !isDesign);
    if (isDesign) renderDesignResults();
  }
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

// ── prompt-area design-setting chips (Section 00) ─────────────────────────
function updateChipLabels() {
  const fLabel = designSettings.code === 'BS8110' ? 'fcu' : 'fck';
  const yLabel = designSettings.code === 'BS8110' ? 'fy'  : 'fyk';
  const bars   = [...designSettings.bars]
    .sort((a, b) => parseInt(a.replace('T','')) - parseInt(b.replace('T','')))
    .join(' ');

  const setLabel = (id, text) => {
    const el = document.getElementById(`dsChipBtn-${id}`);
    if (el) el.innerHTML = `${text} <span class="text-steel/40 text-[8px]">▾</span>`;
  };
  setLabel('code',  designSettings.code);
  setLabel('fck',   `${fLabel} ${designSettings.fck}`);
  setLabel('fyk',   `${yLabel} ${designSettings.fyk}`);
  setLabel('cover', `Cover ${designSettings.cover}mm`);
  setLabel('bars',  `Bars: ${bars}`);
  setLabel('links', `Links: ${designSettings.links}`);

  // Active state in grid dropdowns (fck, fyk, cover)
  ['fck', 'fyk', 'cover'].forEach(group => {
    const val = String(designSettings[group]);
    document.querySelectorAll(`#dsDropdown-${group} .chip-dd-opt`).forEach(b => {
      const active = b.dataset.val === val;
      b.classList.toggle('bg-ink',    active);
      b.classList.toggle('text-paper', active);
      b.classList.toggle('bg-paper',  !active);
      b.classList.toggle('text-ink',  !active);
    });
  });
  // Active state in list dropdowns (code, links)
  ['code', 'links'].forEach(group => {
    const val = designSettings[group];
    document.querySelectorAll(`#dsDropdown-${group} .chip-dd-opt`).forEach(b => {
      b.classList.toggle('font-semibold', b.dataset.val === val);
      b.classList.toggle('text-blue',     b.dataset.val === val);
    });
  });
  // Active state in bars multi-select dropdown
  document.querySelectorAll('#dsDropdown-bars .chip-dd-multi').forEach(b => {
    const active = designSettings.bars.has(b.dataset.val);
    b.classList.toggle('bg-ink',    active);
    b.classList.toggle('text-paper', active);
    b.classList.toggle('bg-paper',  !active);
    b.classList.toggle('text-ink',  !active);
  });
}

// Open / close chip dropdowns
document.querySelectorAll('[id^="dsChipBtn-"]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const id = btn.id.replace('dsChipBtn-', '');
    const dd = document.getElementById(`dsDropdown-${id}`);
    const wasOpen = !dd.classList.contains('hidden');
    document.querySelectorAll('[id^="dsDropdown-"]').forEach(d => d.classList.add('hidden'));
    if (!wasOpen) dd.classList.remove('hidden');
  });
});

// Clicks inside a dropdown don't close it
document.querySelectorAll('[id^="dsDropdown-"]').forEach(dd => {
  dd.addEventListener('click', e => e.stopPropagation());
});

// Outside click closes all dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('[id^="dsDropdown-"]').forEach(d => d.classList.add('hidden'));
});

// Single-select options (code, fck, fyk, cover, links)
document.querySelectorAll('.chip-dd-opt').forEach(opt => {
  opt.addEventListener('click', e => {
    e.stopPropagation();
    const group = opt.dataset.group;
    const val   = opt.dataset.val;

    if (group === 'fck')   { designSettings.fck   = Number(val); document.getElementById('dsFckCustom').value   = ''; document.querySelector('[data-group-input="fck"]').value   = ''; }
    else if (group === 'fyk')   { designSettings.fyk   = Number(val); document.getElementById('dsFykCustom').value   = ''; document.querySelector('[data-group-input="fyk"]').value   = ''; }
    else if (group === 'cover') { designSettings.cover = Number(val); document.getElementById('dsCoverCustom').value = ''; document.querySelector('[data-group-input="cover"]').value = ''; }
    else                        { designSettings[group] = val; }

    setChipActive(group, val);                                          // sync Section 02 panel
    document.getElementById(`dsDropdown-${group}`).classList.add('hidden');
    updateDsSummary();
  });
});

// Multi-select options (bars)
document.querySelectorAll('.chip-dd-multi').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const val = btn.dataset.val;
    if (designSettings.bars.has(val)) {
      if (designSettings.bars.size > 1) designSettings.bars.delete(val);
    } else {
      designSettings.bars.add(val);
    }
    // Sync Section 02 ds-multi buttons
    const s02 = document.querySelector(`.ds-multi[data-val="${val}"]`);
    if (s02) {
      const a = designSettings.bars.has(val);
      s02.classList.toggle('bg-ink', a); s02.classList.toggle('text-paper', a);
      s02.classList.toggle('bg-paper', !a); s02.classList.toggle('text-ink', !a);
    }
    updateDsSummary();
  });
});

// Custom-value inputs (Enter to confirm)
document.querySelectorAll('[data-group-input]').forEach(inp => {
  inp.addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const group = inp.dataset.groupInput;
    const v = parseFloat(inp.value);
    if (v > 0) {
      designSettings[group] = v;
      setChipActive(group, null);
      const s02 = document.getElementById(`ds${group[0].toUpperCase() + group.slice(1)}Custom`);
      if (s02) s02.value = inp.value;
      document.getElementById(`dsDropdown-${group}`).classList.add('hidden');
      updateDsSummary();
    }
  });
});

