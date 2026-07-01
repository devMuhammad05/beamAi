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

// ── char count ───────────────────────────────────────────────────────────
const CHAR_LIMIT = 500;
const promptInput = document.getElementById('promptInput');
const wordCountEl = document.getElementById('wordCount');

function updateCharCount() {
  const count = promptInput.value.length;
  wordCountEl.textContent = `${count}/${CHAR_LIMIT}`;
  wordCountEl.classList.toggle('text-orange', count >= CHAR_LIMIT);
  wordCountEl.classList.toggle('text-steel',  count < CHAR_LIMIT);
}

promptInput.addEventListener('input', () => {
  if (promptInput.value.length > CHAR_LIMIT) promptInput.value = promptInput.value.slice(0, CHAR_LIMIT);
  updateCharCount();
});
updateCharCount();

// ── error banner ─────────────────────────────────────────────────────────
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

// ── design settings ──────────────────────────────────────────────────────
const designSettings = {
  code:  'EC2',
  fck:   30,
  fyk:   500,
  cover: 50,
  bars:  new Set(),
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

document.getElementById('dsAdvancedBtn').addEventListener('click', () => {
  const panel   = document.getElementById('dsAdvancedPanel');
  const chevron = document.getElementById('dsAdvChevron');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  chevron.style.transform = opening ? 'rotate(180deg)' : '';
});

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
  });
});

document.querySelectorAll('.ds-multi').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.val;
    if (designSettings.bars.has(val)) designSettings.bars.delete(val);
    else { designSettings.bars.add(val); userSetBars = true; }
    if (designSettings.bars.size === 0) userSetBars = false;
    const active = designSettings.bars.has(val);
    btn.classList.toggle('bg-ink',     active);
    btn.classList.toggle('text-paper', active);
    btn.classList.toggle('bg-surface', !active);
    btn.classList.toggle('text-ink',   !active);
  });
});

document.getElementById('dsFckCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.fck = v; setChipActive('fck', null); }
});
document.getElementById('dsFykCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.fyk = v; setChipActive('fyk', null); }
});
document.getElementById('dsCoverCustom').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  if (v > 0) { designSettings.cover = v; setChipActive('cover', null); }
});

// ── foundation design API ────────────────────────────────────────────────
function buildSettings() {
  const isEC2 = designSettings.code === 'EC2';
  const settings = {
    design_code: isEC2 ? 'ec2' : 'bs8110',
    cover: designSettings.cover,
    fy:    designSettings.fyk,
  };
  if (isEC2) {
    settings.fck = designSettings.fck;
  } else {
    settings.fcu = designSettings.fck;
  }
  if (userSetBars && designSettings.bars.size > 0) {
    settings.preferred_bars = [...designSettings.bars]
      .map(s => parseInt(s.replace('T', '')))
      .sort((a, b) => a - b);
  }
  return settings;
}

async function callFoundationDesignApi(prompt) {
  const res = await fetch(`${API_BASE}/api/foundation/design`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ prompt, settings: buildSettings() }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.detail;
    const msg = (detail && (detail.message || detail.error || detail)) || `HTTP ${res.status}`;
    throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)), { status: res.status });
  }
  return res.json();
}

// ── run ──────────────────────────────────────────────────────────────────
document.getElementById('runBtn').addEventListener('click', async () => {
  const btn        = document.getElementById('runBtn');
  const promptText = promptInput.value.trim();

  if (!promptText) {
    showError('Describe the foundation first — e.g. column size, load, pad dimensions, and allowable bearing pressure.');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Designing…';
  btn.disabled = true;

  const loading = document.getElementById('loadingState');
  loading.classList.remove('hidden');
  const existing = document.getElementById('foundationResults');
  if (existing) existing.classList.add('hidden');

  try {
    const data = await callFoundationDesignApi(promptText);
    console.log('foundation design response:', data);
    loading.classList.add('hidden');
    renderFoundationDesign(data);
  } catch (error) {
    loading.classList.add('hidden');
    console.error('Foundation design failed:', error.status ?? 'no status', error.message);
    const msg = error.message || 'Design failed. Please try again.';
    const display =
      error.status === 400 || error.status === 422 ? msg :
      error.status === 429 ? 'Quota limit reached. Please try again in a few minutes.' :
      'An error occurred. Please try again later.';
    showError(display);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ── rendering helpers ────────────────────────────────────────────────────
function isPass(status) {
  return /(ok|pass|adequate|satisf|✓)/i.test(String(status ?? ''));
}

function badge(status) {
  if (status == null) return '';
  const ok  = isPass(status);
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

// ── foundation plan SVG ──────────────────────────────────────────────────
// Draws a plan view: pad rectangle, column footprint (centred), and the
// 1.5d punching-shear perimeter as a dashed rectangle.
const FDN_COLORS = { ink: '#16243B', steel: '#5E7081', bar: '#3B6EA5', punch: '#E8623A', col: '#16243B' };

function renderFoundationPlanSvg(fdn, col) {
  const L = +fdn.L_mm || 2000;
  const B = +fdn.B_mm || 2000;
  const d = +fdn.d_mm || 440;
  const cL = +col.b_mm || 300;
  const cB = +col.h_mm || 300;
  const C = FDN_COLORS;

  const VB = 280, pad = 30;
  const scale = (VB - 2 * pad) / Math.max(L, B);
  const fw = L * scale, fh = B * scale;
  const fx = (VB - fw) / 2, fy = (VB - fh) / 2;

  // column footprint centred
  const cw = cL * scale, ch = cB * scale;
  const cx = VB / 2 - cw / 2, cy = VB / 2 - ch / 2;

  // 1.5d punching perimeter
  const perimInset = -1.5 * d * scale;
  const px = cx + perimInset, py = cy + perimInset;
  const pw = cw - 2 * perimInset, ph = ch - 2 * perimInset;

  let s = '';
  // pad outline
  s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#EEF1F4" stroke="${C.ink}" stroke-width="1.8"/>`;
  // rebar grid hints (horizontal lines)
  for (let i = 1; i <= 4; i++) {
    const y = fy + fh * (i / 5);
    s += `<line x1="${fx + 4}" y1="${y}" x2="${fx + fw - 4}" y2="${y}" stroke="${C.bar}" stroke-width="0.8" stroke-dasharray="3,3"/>`;
  }
  for (let i = 1; i <= 4; i++) {
    const x = fx + fw * (i / 5);
    s += `<line x1="${x}" y1="${fy + 4}" x2="${x}" y2="${fy + fh - 4}" stroke="${C.bar}" stroke-width="0.8" stroke-dasharray="3,3"/>`;
  }
  // 1.5d punching perimeter
  s += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="3" fill="none" stroke="${C.punch}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
  // column footprint
  s += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${C.col}" rx="1"/>`;
  // dimension labels
  s += `<text x="${VB / 2}" y="${fy + fh + 20}" text-anchor="middle" font-size="10" fill="${C.steel}">L = ${Math.round(L)} mm</text>`;
  s += `<text x="${fx - 12}" y="${fy + fh / 2}" text-anchor="middle" font-size="10" fill="${C.steel}" transform="rotate(-90 ${fx - 12} ${fy + fh / 2})">B = ${Math.round(B)} mm</text>`;
  // legend
  s += `<rect x="${fx}" y="${fy + fh + 28}" width="10" height="6" fill="${C.col}"/>`;
  s += `<text x="${fx + 14}" y="${fy + fh + 35}" font-size="9" fill="${C.steel}">column</text>`;
  s += `<line x1="${fx + 55}" y1="${fy + fh + 31}" x2="${fx + 65}" y2="${fy + fh + 31}" stroke="${C.punch}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
  s += `<text x="${fx + 68}" y="${fy + fh + 35}" font-size="9" fill="${C.steel}">1.5d perimeter</text>`;
  s += `<line x1="${fx + 145}" y1="${fy + fh + 31}" x2="${fx + 155}" y2="${fy + fh + 31}" stroke="${C.bar}" stroke-width="0.8" stroke-dasharray="3,3"/>`;
  s += `<text x="${fx + 158}" y="${fy + fh + 35}" font-size="9" fill="${C.steel}">rebar</text>`;

  return `<svg viewBox="0 0 ${VB} ${VB + 16}" class="w-full max-w-[280px] mx-auto" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

// ── results container ────────────────────────────────────────────────────
function getResultsContainer() {
  let el = document.getElementById('foundationResults');
  if (!el) {
    el = document.createElement('section');
    el.id = 'foundationResults';
    el.className = 'pt-10 space-y-6';
    const loading = document.getElementById('loadingState');
    loading.parentNode.insertBefore(el, loading.nextSibling);
  }
  el.classList.remove('hidden');
  return el;
}

// ── main render ──────────────────────────────────────────────────────────
function renderFoundationDesign(data) {
  const fdn  = data.foundation   || {};
  const col  = data.column       || {};
  const lds  = data.loads        || {};
  const brg  = data.bearing      || {};
  const pun  = data.punching_shear || {};
  const flx  = data.flexure      || {};
  const flxX = data.flexure_x    || flx;
  const flxY = data.flexure_y    || flx;
  const shr  = data.shear        || {};
  const mat  = data.materials    || {};

  const header = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="font-mono text-xs text-steel section-tag">01</span>
        <h2 class="font-display text-sm font-semibold uppercase tracking-[0.18em]">Foundation Design</h2>
      </div>
      ${badge(data.overall_status)}
    </div>
    <p class="font-mono text-[11px] text-steel">
      ${String(data.design_code || 'BS8110').toUpperCase()} ·
      pad ${fmt(fdn.L_mm || 0, 0)} × ${fmt(fdn.B_mm || 0, 0)} mm ·
      depth ${fmt(fdn.D_mm || 0, 0)} mm
    </p>`;

  const loads = panel('02', 'Applied loads', null, kvTable([
    ['N<sub>ult</sub>',   `${fmt(lds.N_ult_kN,  1)} kN`],
    ['M<sub>ult</sub>',   `${fmt(lds.M_ult_kNm, 1)} kN·m`],
    ['V<sub>ult</sub>',   `${fmt(lds.V_ult_kN,  1)} kN`],
    ['N<sub>ser</sub>',   lds.N_ser_kN != null ? `${fmt(lds.N_ser_kN, 1)} kN` : '—'],
  ]));

  const bearing = panel('03', 'Bearing pressure', brg.status, kvTable([
    ['Gross pressure',     `${fmt(brg.q_gross_kPa, 1)} kPa`],
    ['Net pressure',       `${fmt(brg.q_net_kPa,   1)} kPa`],
    ['Allowable',          `${fmt(brg.q_allow_kPa, 1)} kPa`],
    ['Utilisation',        brg.utilisation != null ? `${fmt(brg.utilisation * 100, 1)} %` : '—'],
  ]));

  const punching = panel('04', 'Punching shear', pun.status, kvTable([
    ['v at column face',   `${fmt(pun.v_face_Nmm2,  3)} N/mm²`],
    ['v at 1.5d perimeter',`${fmt(pun.v_perim_Nmm2, 3)} N/mm²`],
    ['v<sub>c</sub>',      `${fmt(pun.v_c_Nmm2,     3)} N/mm²`],
    ['Perimeter length',   `${fmt(pun.perim_mm, 0)} mm`],
  ]));

  const shear = panel('05', 'Direct shear', shr.status, kvTable([
    ['v at 1.0d from face', `${fmt(shr.v_Nmm2,   3)} N/mm²`],
    ['v<sub>c</sub>',       `${fmt(shr.v_c_Nmm2, 3)} N/mm²`],
    ['Critical section',    shr.critical_section || '—'],
  ]));

  const barsX  = flxX.bars || {};
  const barsY  = flxY.bars || {};
  const flexure = panel('06', 'Flexural design', data.flexure_status || null, `
    <div class="grid sm:grid-cols-2 gap-5 items-start">
      <div class="space-y-4">
        <div>
          <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Along L (x-direction)</p>
          ${kvTable([
            ['M<sub>ult</sub>',        `${fmt(flxX.M_ult_kNm, 1)} kN·m`],
            ['A<sub>s,req</sub>',      `${fmt(flxX.As_req_mm2, 0)} mm²`],
            ['Bars provided',          `<span class="text-blue font-semibold">${barsX.label || '—'}</span>`],
            ['A<sub>s,prov</sub>',     `${fmt(barsX.As_prov_mm2, 0)} mm²`],
          ])}
        </div>
        <div>
          <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Along B (y-direction)</p>
          ${kvTable([
            ['M<sub>ult</sub>',        `${fmt(flxY.M_ult_kNm, 1)} kN·m`],
            ['A<sub>s,req</sub>',      `${fmt(flxY.As_req_mm2, 0)} mm²`],
            ['Bars provided',          `<span class="text-blue font-semibold">${barsY.label || '—'}</span>`],
            ['A<sub>s,prov</sub>',     `${fmt(barsY.As_prov_mm2, 0)} mm²`],
          ])}
        </div>
      </div>
      <div class="bg-paper/40 rounded-lg p-3">
        ${renderFoundationPlanSvg(fdn, col)}
        <p class="font-mono text-[10px] text-steel/70 text-center mt-2">plan view (schematic)</p>
      </div>
    </div>`);

  const section = panel('07', 'Section &amp; materials', null, kvTable([
    ['Pad L × B',          `${fmt(fdn.L_mm, 0)} × ${fmt(fdn.B_mm, 0)} mm`],
    ['Total depth D',      `${fmt(fdn.D_mm, 0)} mm`],
    ['Effective depth d',  `${fmt(fdn.d_mm, 0)} mm`],
    ['Column b × h',       `${fmt(col.b_mm, 0)} × ${fmt(col.h_mm, 0)} mm`],
    ['f<sub>cu</sub>',     `${fmt(mat.fcu_Nmm2, 0)} N/mm²`],
    ['f<sub>y</sub>',      `${fmt(mat.fy_Nmm2,  0)} N/mm²`],
    ['Cover',              `${fmt(mat.cover_mm,  0)} mm`],
  ]));

  getResultsContainer().innerHTML = `
    ${header}
    <div class="grid md:grid-cols-2 gap-6">
      ${loads}
      ${bearing}
      ${punching}
      ${shear}
    </div>
    ${flexure}
    ${section}`;

  getResultsContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
}
