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

// ---- character count ----
const CHAR_LIMIT = 500;
const promptInput = document.getElementById('promptInput');
const wordCountEl = document.getElementById('wordCount');

function updateCharCount() {
  const count = promptInput.value.length;
  wordCountEl.textContent = `${count}/${CHAR_LIMIT}`;
  wordCountEl.classList.toggle('text-orange', count >= CHAR_LIMIT);
  wordCountEl.classList.toggle('text-steel', count < CHAR_LIMIT);
}

promptInput.addEventListener('input', () => {
  if (promptInput.value.length > CHAR_LIMIT) {
    promptInput.value = promptInput.value.slice(0, CHAR_LIMIT);
  }
  updateCharCount();
});

updateCharCount();

// ---- error handling ----
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

// ── design settings ─────────────────────────────────────────────────────
// Mirrors the chip controls in column.html; maps to ColumnDesignSettings.
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

// Advanced settings panel toggle.
document.getElementById('dsAdvancedBtn').addEventListener('click', () => {
  const panel   = document.getElementById('dsAdvancedPanel');
  const chevron = document.getElementById('dsAdvChevron');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  chevron.style.transform = opening ? 'rotate(180deg)' : '';
});

// Single-select chips (code, fck, fyk, cover, links).
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

// Multi-select chips (preferred main bar sizes — optional).
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

// Custom value inputs.
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

// Always in design mode — reveal advanced settings panel on load.
document.getElementById('dsAdvancedToggle').classList.remove('hidden');

// ── column design API ────────────────────────────────────────────────────
function buildSettings() {
  const settings = {
    design_code: designSettings.code === 'EC2' ? 'ec2' : 'bs8110',
    fcu:      designSettings.fck,
    fy:       designSettings.fyk,
    cover:    designSettings.cover,
    link_dia: parseInt(designSettings.links.replace('T', '')),
  };
  if (userSetBars && designSettings.bars.size > 0) {
    settings.preferred_bars = [...designSettings.bars]
      .map(s => parseInt(s.replace('T', '')))
      .sort((a, b) => a - b);
  }
  return settings;
}

async function callColumnDesignApi(prompt) {
  const res = await fetch(`${API_BASE}/api/column/design`, {
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

// ── run interaction ──────────────────────────────────────────────────────
document.getElementById('runBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runBtn');
  const promptText = promptInput.value.trim();

  if (!promptText) {
    showError('Describe the column first — e.g. size, height, and the loads it carries.');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Designing…';
  btn.disabled = true;

  const loading = document.getElementById('loadingState');
  loading.classList.remove('hidden');
  loading.querySelector('p').textContent = 'Designing your column…';
  const existing = document.getElementById('columnResults');
  if (existing) existing.classList.add('hidden');

  try {
    const data = await callColumnDesignApi(promptText);
    console.log('column design response:', data);
    loading.classList.add('hidden');
    renderColumnDesign(data);
  } catch (error) {
    loading.classList.add('hidden');
    console.error('Column design failed:', error.status ?? 'no status', error.message);
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

// ── results rendering ────────────────────────────────────────────────────
function isPass(status) {
  return /(ok|pass|short|adequate|satisf|✓)/i.test(String(status ?? ''));
}

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

// Distribute n bars around the perimeter of a rectangle: corners first, then
// remaining bars spaced along the edges proportional to edge length.
function rebarRingPositions(n, x0, y0, x1, y1) {
  if (n <= 0) return [];
  const corners = [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
  ];
  if (n <= 4) return corners.slice(0, n);

  const pos = [...corners];
  const w = x1 - x0, h = y1 - y0;
  const edges = [
    { len: w, fn: t => ({ x: x0 + t * w, y: y0 }) }, // top
    { len: h, fn: t => ({ x: x1, y: y0 + t * h }) }, // right
    { len: w, fn: t => ({ x: x1 - t * w, y: y1 }) }, // bottom
    { len: h, fn: t => ({ x: x0, y: y1 - t * h }) }, // left
  ];
  const total = 2 * (w + h);
  let remaining = n - 4;
  const counts = edges.map(e => Math.round(remaining * e.len / total));
  let diff = remaining - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i++) {
    counts[i % 4] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  edges.forEach((e, idx) => {
    for (let k = 1; k <= counts[idx]; k++) pos.push(e.fn(k / (counts[idx] + 1)));
  });
  return pos;
}

const COL_COLORS = { ink: '#16243B', steel: '#5E7081', bar: '#3B6EA5', link: '#F5A623' };

function renderColumnSectionSvg(sec, bars) {
  const b = +sec.b_mm, h = +sec.h_mm;
  const cover = +sec.cover_mm || 30;
  const linkD = +sec.link_dia_mm || +bars.bar_dia_mm || 8;
  const barD  = +bars.bar_dia_mm || 16;
  const n     = +bars.n_bars || 0;
  const C = COL_COLORS;

  const VB = 260, pad = 40;
  const scale = (VB - 2 * pad) / Math.max(b, h);
  const rw = b * scale, rh = h * scale;
  const rx = (VB - rw) / 2, ry = (VB - rh) / 2;

  let s = '';
  // concrete outline
  s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#EEF1F4" stroke="${C.ink}" stroke-width="1.8"/>`;
  // links (stirrup) inset by cover
  const ci = cover * scale;
  s += `<rect x="${rx + ci}" y="${ry + ci}" width="${rw - 2 * ci}" height="${rh - 2 * ci}" rx="4" fill="none" stroke="${C.link}" stroke-width="1.5"/>`;
  // main bars on the bar centre-line (cover + link + bar/2)
  const inset = (cover + linkD + barD / 2) * scale;
  const positions = rebarRingPositions(n, rx + inset, ry + inset, rx + rw - inset, ry + rh - inset);
  const r = Math.max(3, (barD / 2) * scale);
  positions.forEach(p => {
    s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${C.bar}"/>`;
  });
  // dimensions
  s += `<text x="${VB / 2}" y="${ry + rh + 24}" text-anchor="middle" font-size="11" fill="${C.steel}">b = ${Math.round(b)} mm</text>`;
  s += `<text x="${rx - 14}" y="${ry + rh / 2}" text-anchor="middle" font-size="11" fill="${C.steel}" transform="rotate(-90 ${rx - 14} ${ry + rh / 2})">h = ${Math.round(h)} mm</text>`;
  // bar label
  if (bars.label) {
    s += `<text x="${VB / 2}" y="${ry - 16}" text-anchor="middle" font-size="12" font-weight="bold" fill="${C.bar}">${bars.label}</text>`;
  }
  return `<svg viewBox="0 0 ${VB} ${VB}" class="w-full max-w-[260px] mx-auto" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

function getResultsContainer() {
  let el = document.getElementById('columnResults');
  if (!el) {
    el = document.createElement('section');
    el.id = 'columnResults';
    el.className = 'pt-10 space-y-6';
    // Insert right after the loading-state section inside <main>.
    const loading = document.getElementById('loadingState');
    loading.parentNode.insertBefore(el, loading.nextSibling);
  }
  el.classList.remove('hidden');
  return el;
}

function renderColumnDesign(data) {
  const sec = data.section || {};
  const f   = data.design_forces || {};
  const sl  = data.slenderness || {};
  const ax  = data.axial || {};
  const reo = data.reinforcement || {};
  const bars  = reo.bars || {};
  const links = reo.links || {};

  const header = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="font-mono text-xs text-steel section-tag">01</span>
        <h2 class="font-display text-sm font-semibold uppercase tracking-[0.18em]">Column Design</h2>
      </div>
      ${badge(data.overall_status)}
    </div>
    <p class="font-mono text-[11px] text-steel">
      ${String(data.design_code || '').toUpperCase()} ·
      ${data.bracing || 'braced'} ·
      effective length ${fmt((data.effective_length_mm || 0) / 1000, 2)} m
    </p>`;

  const forces = panel('02', 'Design forces', null, kvTable([
    ['Axial N<sub>ult</sub>', `${fmt(f.N_ult_kN, 1)} kN`],
    ['Moment M<sub>ult</sub>', `${fmt(f.M_ult_kNm, 1)} kN·m`],
    ['Basis', f.basis || '—'],
  ]));

  const slender = panel('03', 'Slenderness', sl.status, kvTable([
    ['λ (about b)', fmt(sl.lambda_b)],
    ['λ (about h)', fmt(sl.lambda_h)],
    ['Limit', fmt(sl.limit)],
    ['Short column', sl.is_short ? 'Yes' : 'No'],
  ]));

  const axial = panel('04', 'Axial / moment capacity', ax.status, kvTable([
    ['N', `${fmt(ax.N_kN, 1)} kN`],
    ['M<sub>x</sub>', `${fmt(ax.Mx_kNm, 1)} kN·m`],
    ['Eccentricity', `${fmt(ax.eccentricity_mm, 1)} mm`],
    ['Nominal e<sub>min</sub>', `${fmt(ax.nominal_e_mm, 1)} mm`],
    ['Governing eqn', ax.governing_equation || '—'],
    ['A<sub>sc</sub> required', `${fmt(ax.Asc_req_mm2, 0)} mm²`],
    ['Steel ratio ρ', `${fmt(ax.rho_percent, 2)} %`],
    ['A<sub>sc</sub> min / max', `${fmt(ax.Asc_min_mm2, 0)} / ${fmt(ax.Asc_max_mm2, 0)} mm²`],
  ]));

  const reinf = panel('05', 'Reinforcement', reo.status, `
    <div class="grid sm:grid-cols-2 gap-5 items-start">
      <div>
        ${kvTable([
          ['Main bars', `<span class="text-blue font-semibold">${bars.label || '—'}</span>`],
          ['No. of bars', fmt(bars.n_bars, 0)],
          ['Bar dia', `${fmt(bars.bar_dia_mm, 0)} mm`],
          ['A<sub>sc</sub> provided', `${fmt(bars.Asc_prov_mm2, 0)} mm²`],
          ['Bar spacing', bars.spacing_ok === false ? '<span class="text-orange">check</span>' : 'OK'],
          ['Links', `<span class="text-amber font-semibold">${links.label || '—'}</span>`],
          ['Link dia', `${fmt(links.bar_dia_mm, 0)} mm`],
          ['Link spacing', `${fmt(links.spacing_mm, 0)} mm`],
        ])}
      </div>
      <div class="bg-paper/40 rounded-lg p-3">
        ${(bars.n_bars > 0) ? renderColumnSectionSvg(sec, bars) : '<p class="font-mono text-[11px] text-steel text-center py-8">No section to draw</p>'}
        <p class="font-mono text-[10px] text-steel/70 text-center mt-1">cross-section (schematic)</p>
      </div>
    </div>`);

  const section = panel('06', 'Section & materials', null, kvTable([
    ['Dimensions', `${fmt(sec.b_mm, 0)} × ${fmt(sec.h_mm, 0)} mm`],
    ['f<sub>cu</sub>', `${fmt(sec.fcu_Nmm2, 0)} N/mm²`],
    ['f<sub>y</sub>', `${fmt(sec.fy_Nmm2, 0)} N/mm²`],
    ['f<sub>yv</sub>', `${fmt(sec.fyv_Nmm2, 0)} N/mm²`],
    ['Cover', `${fmt(sec.cover_mm, 0)} mm`],
  ]));

  getResultsContainer().innerHTML = `
    ${header}
    <div class="grid md:grid-cols-2 gap-6">
      ${forces}
      ${slender}
      ${axial}
      ${section}
    </div>
    ${reinf}`;

  getResultsContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
}
