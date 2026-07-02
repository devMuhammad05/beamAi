// Single source of truth for the header navigation, shared by every page.
// Renders the workspace switcher (which tool you're in) and the user menu
// (avatar → name/email + sign out), so adding/renaming a tool or changing the
// nav means editing one file instead of five.
const WORKSPACE_TOOLS = [
  {
    id: 'beam',
    href: 'workspace.html',
    label: 'Beam Analysis & Design',
    shortLabel: 'Beam',
    description: 'SFD · BMD · deflection · RC design',
    icon: '<line x1="2" y1="7" x2="14" y2="7"/><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="10" x2="14" y2="10"/><polygon points="2,12 2,15 5,15 14,3 11,0" fill="currentColor" stroke="none"/>',
  },
  {
    id: 'column',
    href: 'column.html',
    label: 'Column Design',
    shortLabel: 'Column',
    description: 'RC column design & checks',
    icon: '<rect x="5" y="1" width="6" height="14" rx="1"/><line x1="5" y1="4" x2="11" y2="4"/><line x1="5" y1="12" x2="11" y2="12"/>',
  },
  {
    id: 'foundation',
    href: 'foundation.html',
    label: 'Foundation Design',
    shortLabel: 'Foundation',
    description: 'pad foundation design & checks',
    icon: '<rect x="1" y="10" width="14" height="5" rx="1"/><rect x="5" y="6" width="6" height="4"/><line x1="6" y1="10" x2="6" y2="15"/><line x1="10" y1="10" x2="10" y2="15"/>',
  },
  {
    id: 'slab',
    href: 'slab.html',
    label: 'Slab Design',
    shortLabel: 'Slab',
    description: 'one-way · two-way · RC design',
    icon: '<rect x="1" y="4" width="14" height="8" rx="1"/><line x1="5.5" y1="4" x2="5.5" y2="12"/><line x1="10.5" y1="4" x2="10.5" y2="12"/><line x1="1" y1="8" x2="15" y2="8"/>',
  },
  {
    id: 'frame',
    href: 'frame.html',
    label: '2D Frame Analysis',
    shortLabel: 'Frame',
    description: 'stiffness-method frame builder',
    icon: '<line x1="3" y1="14" x2="3" y2="4"/><line x1="13" y1="14" x2="13" y2="4"/><line x1="3" y1="4" x2="13" y2="4"/>',
  },
];

// Track every open dropdown so opening one (or clicking outside) closes the rest.
const _navMenus = [];
function _registerMenu(btn, menu) {
  const close = () => { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
  _navMenus.push(close);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    _navMenus.forEach(fn => fn());          // collapse any other open menu first
    menu.classList.toggle('hidden', !willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  });
}

function renderWorkspaceSwitcher(activeId) {
  const mount = document.getElementById('workspaceSwitcher');
  if (!mount) return;
  const active = WORKSPACE_TOOLS.find(t => t.id === activeId) || WORKSPACE_TOOLS[0];

  mount.innerHTML = `
    <div class="relative">
      <button id="wsSwitcherBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Switch workspace — current: ${active.label}"
        class="flex items-center gap-2 border border-grid rounded-full pl-2.5 pr-2.5 py-1.5 bg-surface hover:border-ink/30 transition-colors">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3B6EA5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">${active.icon}</svg>
        <span class="font-mono text-[11px] text-ink whitespace-nowrap"><span class="sm:hidden">${active.shortLabel}</span><span class="hidden sm:inline">${active.label}</span></span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#5E7081" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div id="wsSwitcherMenu" class="hidden fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:left-0 sm:top-[calc(100%+8px)] sm:w-72 bg-surface border border-grid rounded-lg shadow-lg overflow-hidden z-30">
        <p class="px-4 pt-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-steel border-b border-grid/60">Switch workspace</p>
        ${WORKSPACE_TOOLS.map(t => `
          <a href="${t.href}" class="flex items-center gap-3 px-4 py-3 hover:bg-paper/60 transition-colors ${t.id === active.id ? 'bg-paper/40' : ''}">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="${t.id === active.id ? '#3B6EA5' : '#5E7081'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">${t.icon}</svg>
            <div>
              <p class="font-display text-xs font-semibold uppercase tracking-[0.12em] ${t.id === active.id ? 'text-blue' : 'text-ink'}">${t.label}</p>
              <p class="font-mono text-[10px] text-steel">${t.id === active.id ? 'current workspace' : t.description}</p>
            </div>
          </a>`).join('')}
      </div>
    </div>`;

  _registerMenu(document.getElementById('wsSwitcherBtn'), document.getElementById('wsSwitcherMenu'));
}

function renderUserMenu() {
  const mount = document.getElementById('userMenu');
  if (!mount) return;

  mount.innerHTML = `
    <div class="relative">
      <button id="userMenuBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"
        class="flex items-center gap-1.5 border border-grid rounded-full pl-1 pr-2 py-1 bg-surface hover:border-ink/30 transition-colors">
        <div id="userAvatar" class="w-6 h-6 rounded-full bg-blue flex items-center justify-center text-white font-display font-bold text-[10px] flex-shrink-0">U</div>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#5E7081" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div id="userMenuPanel" class="hidden absolute right-0 top-[calc(100%+8px)] w-56 max-w-[calc(100vw-2rem)] bg-surface border border-grid rounded-lg shadow-lg overflow-hidden z-30">
        <div class="px-4 py-3 border-b border-grid/60">
          <p id="userName" class="font-display text-sm font-semibold text-ink truncate">User</p>
          <p id="userEmail" class="font-mono text-[10px] text-steel truncate"></p>
        </div>
        <button id="signOutBtn" type="button" class="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-paper/60 transition-colors">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#E8623A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
            <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3"/><polyline points="10 11 13 8 10 5"/><line x1="13" y1="8" x2="6" y2="8"/>
          </svg>
          <span class="font-mono text-[12px] text-orange">Sign out</span>
        </button>
      </div>
    </div>`;

  const btn = document.getElementById('userMenuBtn');
  const panel = document.getElementById('userMenuPanel');
  _registerMenu(btn, panel);

  // Fill name/email from the session cache when the menu opens. checkAuth()
  // (in each page's JS) stores this after auth resolves, so it's available by
  // the time the user taps the avatar even though nav renders first.
  btn.addEventListener('click', () => {
    try {
      const u = JSON.parse(sessionStorage.getItem('beamAi_user') || '{}');
      if (u.email) document.getElementById('userEmail').textContent = u.email;
    } catch { /* ignore malformed cache */ }
  });
}

function renderNav(activeId) {
  renderWorkspaceSwitcher(activeId);
  renderUserMenu();
  document.addEventListener('click', () => _navMenus.forEach(fn => fn()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _navMenus.forEach(fn => fn()); });
}
