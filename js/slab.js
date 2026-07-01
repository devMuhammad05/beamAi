// ── config ───────────────────────────────────────────────────────────────
const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : 'https://beamai-backend.fastapicloud.dev';

// ── auth helpers ──────────────────────────────────────────────────────────
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

// ── char count ────────────────────────────────────────────────────────────
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

// ── error banner ──────────────────────────────────────────────────────────
function showError(message, duration = 6000) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMessage').textContent = message;
  banner.classList.remove('hidden');
  if (duration > 0) setTimeout(() => banner.classList.add('hidden'), duration);
}
document.getElementById('errorClose').addEventListener('click', () => {
  document.getElementById('errorBanner').classList.add('hidden');
});

// ── design settings ───────────────────────────────────────────────────────
const designSettings = {
  code:  'BS8110',
  fck:   30,
  fyk:   500,
  cover: 40,
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

// ── API call ──────────────────────────────────────────────────────────────
function buildSettings() {
  const isEC2 = designSettings.code === 'EC2';
  const s = {
    design_code: isEC2 ? 'ec2' : 'bs8110',
    cover:       designSettings.cover,
    fy:          designSettings.fyk,
  };
  if (isEC2) s.fck = designSettings.fck;
  else       s.fcu = designSettings.fck;
  if (userSetBars && designSettings.bars.size > 0) {
    s.preferred_bars = [...designSettings.bars]
      .map(v => parseInt(v.replace('T', '')))
      .sort((a, b) => a - b);
  }
  return s;
}

async function callSlabDesignApi(prompt) {
  const res = await fetch(`${API_BASE}/api/slab/design`, {
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

// ── run ───────────────────────────────────────────────────────────────────
let lastSlabDesignId = null;   // id of the last design saved to the DB — used for report download

document.getElementById('runBtn').addEventListener('click', async () => {
  const btn        = document.getElementById('runBtn');
  const promptText = promptInput.value.trim();

  if (!promptText) {
    showError('Describe the slab first — e.g. span, loading (gk/qk), thickness, and support conditions.');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Designing…';
  btn.disabled    = true;

  const loading = document.getElementById('loadingState');
  loading.classList.remove('hidden');
  const existing = document.getElementById('slabResults');
  if (existing) existing.classList.add('hidden');

  try {
    const data = await callSlabDesignApi(promptText);
    console.log('slab design response:', data);
    if (data.design_id) lastSlabDesignId = data.design_id;
    loading.classList.add('hidden');
    renderSlabDesign(data);
  } catch (error) {
    loading.classList.add('hidden');
    console.error('Slab design failed:', error.status ?? 'no status', error.message);
    const msg     = error.message || 'Design failed. Please try again.';
    const display =
      error.status === 400 || error.status === 422 ? msg :
      error.status === 429 ? 'Quota limit reached. Please try again in a few minutes.' :
      'An error occurred. Please try again later.';
    showError(display);
  } finally {
    btn.textContent = original;
    btn.disabled    = false;
  }
});

// ── rendering helpers ─────────────────────────────────────────────────────
function fmt(n, d = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (Math.abs(v) < 1e-3 ? 0 : v).toFixed(d);
}

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

// ── slab cross-section SVG ────────────────────────────────────────────────
function renderSlabSvg(geo, reinf, slabType) {
  const lx    = +(geo.lx_mm  || geo.span_mm || 4000);
  const h     = +(geo.h_mm   || 200);
  const d     = +(geo.d_mm   || 160);
  const cover = +(geo.cover_mm || 40);
  const C     = { ink: '#16243B', steel: '#5E7081', bar: '#3B6EA5', dim: '#5E7081' };

  if (slabType === 'two_way') {
    // Plan view of two-way slab panel
    const ly   = +(geo.ly_mm || lx * 1.3);
    const VW   = 280, VH = 220, pad = 30;
    const scaleX = (VW - 2 * pad) / lx;
    const scaleY = (VH - 2 * pad) / ly;
    const sc   = Math.min(scaleX, scaleY);
    const fw   = lx * sc, fh = ly * sc;
    const fx   = (VW - fw) / 2, fy = (VH - fh) / 2;

    let s = '';
    // slab panel outline
    s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#EEF1F4" stroke="${C.ink}" stroke-width="1.8"/>`;
    // x-direction bars (horizontal lines)
    for (let i = 1; i <= 5; i++) {
      const y = fy + fh * (i / 6);
      s += `<line x1="${fx + 4}" y1="${y}" x2="${fx + fw - 4}" y2="${y}" stroke="${C.bar}" stroke-width="1.2"/>`;
    }
    // y-direction bars (vertical lines, offset/dashed to suggest second layer)
    for (let i = 1; i <= 5; i++) {
      const x = fx + fw * (i / 6);
      s += `<line x1="${x}" y1="${fy + 4}" x2="${x}" y2="${fy + fh - 4}" stroke="#2F8F6F" stroke-width="1.2" stroke-dasharray="5,3"/>`;
    }
    // dimension lines
    s += `<line x1="${fx}" y1="${fy + fh + 18}" x2="${fx + fw}" y2="${fy + fh + 18}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${fx}" y1="${fy + fh + 13}" x2="${fx}" y2="${fy + fh + 23}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${fx + fw}" y1="${fy + fh + 13}" x2="${fx + fw}" y2="${fy + fh + 23}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<text x="${fx + fw / 2}" y="${fy + fh + 30}" text-anchor="middle" font-size="9" fill="${C.steel}">lx = ${Math.round(lx)} mm</text>`;
    s += `<line x1="${fx - 18}" y1="${fy}" x2="${fx - 18}" y2="${fy + fh}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${fx - 23}" y1="${fy}" x2="${fx - 13}" y2="${fy}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${fx - 23}" y1="${fy + fh}" x2="${fx - 13}" y2="${fy + fh}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<text x="${fx - 28}" y="${fy + fh / 2}" text-anchor="middle" font-size="9" fill="${C.steel}" transform="rotate(-90 ${fx - 28} ${fy + fh / 2})">ly = ${Math.round(ly)} mm</text>`;
    // legend
    const ly2 = fy + fh + 40;
    s += `<line x1="${fx}" y1="${ly2}" x2="${fx + 14}" y2="${ly2}" stroke="${C.bar}" stroke-width="1.2"/>`;
    s += `<text x="${fx + 18}" y="${ly2 + 4}" font-size="9" fill="${C.steel}">x-bars (short span)</text>`;
    s += `<line x1="${fx + 110}" y1="${ly2}" x2="${fx + 124}" y2="${ly2}" stroke="#2F8F6F" stroke-width="1.2" stroke-dasharray="5,3"/>`;
    s += `<text x="${fx + 128}" y="${ly2 + 4}" font-size="9" fill="${C.steel}">y-bars (long span)</text>`;

    return `<svg viewBox="0 0 ${VW} ${VH + 20}" class="w-full max-w-[280px] mx-auto" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  } else {
    // Cross-section elevation of one-way slab
    const VW   = 280, VH = 140, pad = 24;
    const sw   = VW - 2 * pad;  // slab width in view
    const sh   = Math.min(h / lx * sw * 6, 60);   // proportional height, capped
    const sx   = pad, sy = (VH - sh) / 2 - 10;

    // effective depth & cover to scale
    const coverPx = (cover / h) * sh;
    const dPx     = (d / h) * sh;

    let s = '';
    // slab body
    s += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#EEF1F4" stroke="${C.ink}" stroke-width="1.8"/>`;
    // bottom bars (circles representing bar cross-sections)
    const nBars = 5, barY = sy + sh - coverPx - 4;
    for (let i = 0; i < nBars; i++) {
      const bx = sx + sw * 0.1 + (sw * 0.8 / (nBars - 1)) * i;
      s += `<circle cx="${bx}" cy="${barY}" r="3.5" fill="${C.bar}"/>`;
    }
    // cover dim
    s += `<line x1="${sx + sw + 8}" y1="${sy + sh}" x2="${sx + sw + 8}" y2="${barY}" stroke="${C.dim}" stroke-width="0.8"/>`;
    s += `<text x="${sx + sw + 14}" y="${sy + sh - (sh - dPx) / 2}" font-size="8" fill="${C.steel}">c=${cover}mm</text>`;
    // effective depth dim
    s += `<line x1="${sx - 8}" y1="${sy}" x2="${sx - 8}" y2="${barY}" stroke="${C.dim}" stroke-width="0.8"/>`;
    s += `<text x="${sx - 12}" y="${sy + dPx / 2}" text-anchor="end" font-size="8" fill="${C.steel}">d</text>`;
    // total depth dim
    s += `<line x1="${sx + sw + 30}" y1="${sy}" x2="${sx + sw + 30}" y2="${sy + sh}" stroke="${C.dim}" stroke-width="0.8"/>`;
    s += `<text x="${sx + sw + 36}" y="${sy + sh / 2}" font-size="8" fill="${C.steel}">h=${h}mm</text>`;
    // span label
    s += `<line x1="${sx}" y1="${sy + sh + 18}" x2="${sx + sw}" y2="${sy + sh + 18}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${sx}" y1="${sy + sh + 13}" x2="${sx}" y2="${sy + sh + 23}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<line x1="${sx + sw}" y1="${sy + sh + 13}" x2="${sx + sw}" y2="${sy + sh + 23}" stroke="${C.dim}" stroke-width="1"/>`;
    s += `<text x="${sx + sw / 2}" y="${sy + sh + 30}" text-anchor="middle" font-size="9" fill="${C.steel}">span = ${Math.round(lx)} mm</text>`;
    // bar legend
    s += `<circle cx="${sx}" cy="${sy + sh + 44}" r="3" fill="${C.bar}"/>`;
    s += `<text x="${sx + 8}" y="${sy + sh + 48}" font-size="9" fill="${C.steel}">bottom reinforcement</text>`;

    return `<svg viewBox="0 0 ${VW} ${VH + 10}" class="w-full max-w-[280px] mx-auto" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }
}

// ── results container ─────────────────────────────────────────────────────
function getResultsContainer() {
  let el = document.getElementById('slabResults');
  if (!el) {
    el = document.createElement('section');
    el.id        = 'slabResults';
    el.className = 'pt-10 space-y-6';
    const loading = document.getElementById('loadingState');
    loading.parentNode.insertBefore(el, loading.nextSibling);
  }
  el.classList.remove('hidden');
  return el;
}

// ── main render ───────────────────────────────────────────────────────────
function renderSlabDesign(data) {
  const geo   = data.geometry      || {};
  const lds   = data.loading       || {};
  const mom   = data.moments       || {};
  const reinfX = data.reinforcement_x || data.reinforcement || {};
  const reinfY = data.reinforcement_y || {};
  const defl  = data.deflection    || {};
  const shr   = data.shear         || {};
  const mat   = data.materials     || {};
  const type  = data.slab_type     || 'one_way';
  const isTwoWay = type === 'two_way';

  const header = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="font-mono text-xs text-steel section-tag">01</span>
        <h2 class="font-display text-sm font-semibold uppercase tracking-[0.18em]">Slab Design</h2>
      </div>
      ${badge(data.overall_status)}
    </div>
    <p class="font-mono text-[11px] text-steel">
      ${String(data.design_code || designSettings.code).toUpperCase()} ·
      ${isTwoWay ? 'Two-way' : 'One-way'} ·
      h = ${fmt(geo.h_mm || 0, 0)} mm ·
      d = ${fmt(geo.d_mm || 0, 0)} mm
    </p>`;

  const geometry = panel('02', 'Geometry &amp; loading', null, kvTable([
    ['Slab type',           isTwoWay ? 'Two-way' : 'One-way'],
    ['Short span l<sub>x</sub>', `${fmt(geo.lx_mm || geo.span_mm, 0)} mm`],
    ...(isTwoWay ? [['Long span l<sub>y</sub>', `${fmt(geo.ly_mm, 0)} mm`]] : []),
    ...(isTwoWay ? [['l<sub>y</sub> / l<sub>x</sub>', fmt(geo.ly_lx_ratio, 2)]] : []),
    ['Overall depth h',     `${fmt(geo.h_mm, 0)} mm`],
    ['Effective depth d',   `${fmt(geo.d_mm, 0)} mm`],
    ['g<sub>k</sub>',       `${fmt(lds.gk_kNm2, 2)} kN/m²`],
    ['q<sub>k</sub>',       `${fmt(lds.qk_kNm2, 2)} kN/m²`],
    ['n<sub>ult</sub>',     `${fmt(lds.n_ult_kNm2, 2)} kN/m²`],
  ]));

  let momentsInner = '';
  if (isTwoWay) {
    momentsInner = kvTable([
      ['α<sub>sx</sub> (short span coeff)', fmt(mom.alpha_sx, 4)],
      ['α<sub>sy</sub> (long span coeff)',  fmt(mom.alpha_sy, 4)],
      ['m<sub>sx</sub> (short span)',       `${fmt(mom.msx_kNm, 2)} kN·m/m`],
      ['m<sub>sy</sub> (long span)',        `${fmt(mom.msy_kNm, 2)} kN·m/m`],
      ['Support conditions',               mom.support_type || '—'],
    ]);
  } else {
    momentsInner = kvTable([
      ['Span moment M<sub>span</sub>',     `${fmt(mom.M_span_kNm, 2)} kN·m/m`],
      ...(mom.M_support_kNm != null ? [['Support moment M<sub>sup</sub>', `${fmt(mom.M_support_kNm, 2)} kN·m/m`]] : []),
      ['Moment coefficient',              mom.coefficient ? fmt(mom.coefficient, 4) : '—'],
      ['Support conditions',              mom.support_type || '—'],
    ]);
  }
  const moments = panel('03', 'Bending moments', null, momentsInner);

  const barsXObj = reinfX.bars || {};
  const barsYObj = reinfY.bars || {};

  let reinInner = '';
  if (isTwoWay) {
    reinInner = `
      <div class="grid sm:grid-cols-2 gap-5 items-start">
        <div class="space-y-4">
          <div>
            <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Short span (x-direction)</p>
            ${kvTable([
              ['M<sub>sx</sub>',           `${fmt(mom.msx_kNm, 2)} kN·m/m`],
              ['A<sub>s,req</sub>',        `${fmt(reinfX.As_req_mm2, 0)} mm²/m`],
              ['Bars provided',            `<span class="text-blue font-semibold">${barsXObj.label || '—'}</span>`],
              ['A<sub>s,prov</sub>',       `${fmt(barsXObj.As_prov_mm2, 0)} mm²/m`],
              ['A<sub>s,min</sub>',        `${fmt(reinfX.As_min_mm2, 0)} mm²/m`],
            ])}
          </div>
          <div>
            <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Long span (y-direction)</p>
            ${kvTable([
              ['M<sub>sy</sub>',           `${fmt(mom.msy_kNm, 2)} kN·m/m`],
              ['A<sub>s,req</sub>',        `${fmt(reinfY.As_req_mm2, 0)} mm²/m`],
              ['Bars provided',            `<span class="text-teal font-semibold">${barsYObj.label || '—'}</span>`],
              ['A<sub>s,prov</sub>',       `${fmt(barsYObj.As_prov_mm2, 0)} mm²/m`],
              ['A<sub>s,min</sub>',        `${fmt(reinfY.As_min_mm2, 0)} mm²/m`],
            ])}
          </div>
        </div>
        <div class="bg-paper/40 rounded-lg p-3">
          ${renderSlabSvg(geo, { x: reinfX, y: reinfY }, type)}
          <p class="font-mono text-[10px] text-steel/70 text-center mt-2">plan view (schematic)</p>
        </div>
      </div>`;
  } else {
    reinInner = `
      <div class="grid sm:grid-cols-2 gap-5 items-start">
        <div class="space-y-4">
          <div>
            <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Main (bottom) reinforcement</p>
            ${kvTable([
              ['M<sub>span</sub>',         `${fmt(mom.M_span_kNm, 2)} kN·m/m`],
              ['A<sub>s,req</sub>',        `${fmt(reinfX.As_req_mm2, 0)} mm²/m`],
              ['Bars provided',            `<span class="text-blue font-semibold">${barsXObj.label || '—'}</span>`],
              ['A<sub>s,prov</sub>',       `${fmt(barsXObj.As_prov_mm2, 0)} mm²/m`],
              ['A<sub>s,min</sub>',        `${fmt(reinfX.As_min_mm2, 0)} mm²/m`],
            ])}
          </div>
          ${reinfY.As_req_mm2 != null ? `<div>
            <p class="font-mono text-[10px] text-steel/60 uppercase tracking-[0.12em] mb-2">Secondary (transverse) reinforcement</p>
            ${kvTable([
              ['A<sub>s,req</sub>',        `${fmt(reinfY.As_req_mm2, 0)} mm²/m`],
              ['Bars provided',            `<span class="text-teal font-semibold">${barsYObj.label || reinfY.bars_label || '—'}</span>`],
              ['A<sub>s,prov</sub>',       `${fmt(barsYObj.As_prov_mm2, 0)} mm²/m`],
            ])}
          </div>` : ''}
        </div>
        <div class="bg-paper/40 rounded-lg p-3">
          ${renderSlabSvg(geo, { x: reinfX }, type)}
          <p class="font-mono text-[10px] text-steel/70 text-center mt-2">cross-section (schematic)</p>
        </div>
      </div>`;
  }
  const reinforcement = panel('04', 'Reinforcement', data.reinf_status || null, reinInner);

  const deflection = panel('05', 'Deflection check', defl.status, kvTable([
    ['Span / depth ratio',       fmt(defl.span_d_ratio, 1)],
    ['Allowable ratio',          fmt(defl.allowable_ratio, 1)],
    ['Modification factor M<sub>ft</sub>', defl.mft != null ? fmt(defl.mft, 2) : '—'],
    ['Modification factor M<sub>fc</sub>', defl.mfc != null ? fmt(defl.mfc, 2) : '—'],
    ['Basis (BS8110 Cl 3.4.6)', defl.basis || '—'],
  ]));

  let shearSection = '';
  if (!isTwoWay && (shr.v_Nmm2 != null || shr.status)) {
    shearSection = panel('06', 'Shear check', shr.status, kvTable([
      ['v at critical section',  `${fmt(shr.v_Nmm2, 3)} N/mm²`],
      ['v<sub>c</sub>',          `${fmt(shr.v_c_Nmm2, 3)} N/mm²`],
      ['Critical section',       shr.critical_section || '1.0d from support'],
    ]));
  }

  const matSection = panel(shearSection ? '07' : '06', 'Section &amp; materials', null, kvTable([
    ['h (overall depth)',        `${fmt(geo.h_mm, 0)} mm`],
    ['d (effective depth)',      `${fmt(geo.d_mm, 0)} mm`],
    ['Cover',                   `${fmt(mat.cover_mm || designSettings.cover, 0)} mm`],
    ['f<sub>cu</sub> / f<sub>ck</sub>', `${fmt(mat.fcu_Nmm2 || mat.fck_Nmm2, 0)} N/mm²`],
    ['f<sub>y</sub> / f<sub>yk</sub>', `${fmt(mat.fy_Nmm2, 0)} N/mm²`],
    ...(data.design_code ? [['Design code', String(data.design_code).toUpperCase()]] : []),
  ]));

  const exportBtn = `
    <div class="flex justify-end">
      <button id="exportSlabCalcBtn" class="flex items-center gap-2 font-display text-sm font-semibold bg-teal text-surface px-5 py-2 rounded-md hover:bg-teal/80 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/50 focus:ring-offset-2 focus:ring-offset-surface">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><polyline points="5 7 8 10 11 7"/><line x1="8" y1="2" x2="8" y2="10"/>
        </svg>
        Download calculation report
      </button>
    </div>`;

  getResultsContainer().innerHTML = `
    ${header}
    <div class="grid md:grid-cols-2 gap-6">
      ${geometry}
      ${moments}
    </div>
    ${reinforcement}
    <div class="grid md:grid-cols-2 gap-6">
      ${deflection}
      ${shearSection || matSection}
    </div>
    ${shearSection ? matSection : ''}
    ${exportBtn}`;

  getResultsContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── report download (event-delegated — button is re-created on each render) ─
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#exportSlabCalcBtn');
  if (!btn) return;

  if (!lastSlabDesignId) {
    showError('Run a design first to generate a calculation report.');
    return;
  }

  const original = btn.innerHTML;
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/slab/${lastSlabDesignId}/report`, {
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
    console.error('Slab report generation failed:', error);
    showError(error.message || 'Failed to generate calculation report.');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
});
