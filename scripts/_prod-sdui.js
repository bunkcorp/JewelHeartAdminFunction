/**
 * Volunteer SDUI renderer for karmadots.org/login (parity with iOS JewelHeartAdmin SDUIRenderer).
 * Web build stamp: America/New_York, minute precision. Overwritten by deploy scripts.
 */
export const JH_LOGIN_WEB_BUILD = 'pending-deploy';

const DEPLOY_STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human-readable deploy stamp (America/New_York). Time always shown when present. */
export function formatDeployStamp(stamp) {
  const s = String(stamp || '').trim();
  if (!s || s === '…') return s || '…';
  if (s === 'pending-deploy') return s;
  let m = /^(\d{4})-(\d{2})-(\d{2})-(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const hh = String(h).padStart(2, '0');
    return `${hh}:${mi} ET · ${DEPLOY_STAMP_MONTHS[+mo - 1]} ${+d}, ${y}`;
  }
  m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${h}:${mi} ET · ${DEPLOY_STAMP_MONTHS[+mo - 1]} ${+d}, ${y}`;
  }
  return s;
}

function normalizeDeployStamp(stamp) {
  const s = String(stamp || '').trim();
  if (!s || s === '…' || s === 'pending-deploy') return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})-(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${y}-${mo}-${d}-${String(h).padStart(2, '0')}:${mi}`;
  }
  m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${y}-${mo}-${d}-${h}:${mi}`;
  }
  return s;
}

/** Negative if client < server, 0 if equal/unknown, positive if client > server. */
export function compareDeployStamps(clientStamp, serverStamp) {
  const a = normalizeDeployStamp(clientStamp);
  const b = normalizeDeployStamp(serverStamp);
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function formatBuildStampLine(webStamp, apiStamp) {
  const web = formatDeployStamp(webStamp);
  const api = formatDeployStamp(apiStamp || '…');
  return `web  ${web}\napi  ${api}`;
}

/** Dev-only: ?debug=layout on volunteer app URL. */
function volunteerLayoutDebugEnabled() {
  try {
    const raw = new URLSearchParams(window.location.search).get('debug') || '';
    return raw.split(',').map((s) => s.trim()).includes('layout');
  } catch {
    return false;
  }
}

let volunteerLayoutDebugPanel = null;
const volunteerLayoutDebugSnapshot = {
  screenId: '',
  apiStamp: '',
  at: '',
};

function volunteerLayoutDebugRefresh() {
  ensureVolunteerIosHtmlClasses();
  if (!volunteerLayoutDebugPanel) return;
  const pre = volunteerLayoutDebugPanel.querySelector('.jh-vol-layout-debug-body');
  if (!pre) return;
  pre.textContent = volunteerLayoutDebugFormat();
}

function volunteerLayoutDebugFormat() {
  const snap = volunteerLayoutDebugSnapshot;
  const html = document.documentElement;
  const shell = document.querySelector('.jh-volunteer-shell');
  const root = document.querySelector('#volunteer-sdui-section .jh-sdui-sticky-footer');
  const middle = root?.querySelector(
    ':scope > .jh-sdui-home-middle, :scope > .jh-sdui-shift-assign-scroll, :scope > .jh-sdui-search-by-day-scroll, :scope > .jh-sdui-scroll',
  );
  const scrollPane = (() => {
    const header = root?.querySelector(':scope > .jh-sdui-header');
    const paneSelector =
      '.jh-sdui-today-shift-scroll, .jh-sdui-day-shift-list, .jh-sdui-job-list-scroll, .jh-sdui-manage-checkins-scroll';
    return middle?.querySelector(paneSelector) || header?.querySelector(paneSelector) || null;
  })();
  const scrollTarget = scrollPane || middle;
  const footer = root?.querySelector(':scope > .jh-sdui-footer');
  const vv = window.visualViewport;
  const shellRect = shell?.getBoundingClientRect();
  const lines = [
    `screen: ${snap.screenId || '—'}`,
    `api: ${snap.apiStamp || '—'} · web: ${JH_LOGIN_WEB_BUILD}`,
    `sync: ${snap.at || '—'}`,
    '',
    `html: ${Array.from(html.classList).filter((c) => c.startsWith('jh-html')).join(' ') || html.className || '—'}`,
    `iosSafari: ${detectVolunteerIosSafari() ? 'yes' : 'no'} · touchPts: ${navigator.maxTouchPoints ?? '—'} · pad: ${document.documentElement.classList.contains('jh-html-ios-safari-pad') ? 'yes' : 'no'}`,
    `root: ${root ? [...root.classList].filter((c) => c.includes('layout') || c.includes('sticky') || c.includes('search')).join(' ') : '—'}`,
    `scroll: ${scrollTarget?.className || '—'}`,
    `capped: ${scrollTarget?.classList.contains('jh-sdui-vol-scroll-capped') ? 'yes' : 'no'}`,
    `max-h inline: ${scrollTarget?.style?.maxHeight || '—'}`,
    '',
    `paneBudget: ${snap.paneBudget ?? '—'}`,
    `list scrollH: ${snap.listScrollH ?? scrollTarget?.scrollHeight ?? '—'}`,
    `list contentH: ${snap.listContentH ?? '—'} (offset:${scrollTarget?.offsetHeight ?? '—'} client:${scrollTarget?.clientHeight ?? '—'})`,
    `stackedH: ${snap.stackedH ?? '—'} · rootBudget: ${snap.rootBudget ?? '—'}`,
    `needsCap: ${snap.needsCap ?? '—'} (list:${snap.listOverflows ?? '—'} root:${snap.overflowsRoot ?? '—'} geom:${snap.footerOverShell ?? '—'})`,
    `capPx: ${snap.capPx ?? '—'}`,
    '',
    `vv offTop: ${vv ? Math.round(vv.offsetTop) : '—'} h: ${vv ? Math.round(vv.height) : '—'}`,
    `shell top: ${shell?.style?.top || '—'} h: ${shell?.style?.height || '—'}`,
    `shell rect: ${shellRect ? `${Math.round(shellRect.top)}→${Math.round(shellRect.bottom)} (${Math.round(shellRect.height)})` : '—'}`,
    `shell scrollTop: ${shell?.scrollTop ?? '—'}`,
    `doc scroll: ${window.scrollY ?? 0}`,
    `scroll pane top: ${scrollPane ? Math.round(scrollPane.getBoundingClientRect().top) : '—'}`,
    `footer top: ${footer ? Math.round(footer.getBoundingClientRect().top) : '—'}`,
    `footer bottom: ${footer ? Math.round(footer.getBoundingClientRect().bottom) : '—'} / shell ${shellRect ? Math.round(shellRect.bottom) : '—'}`,
  ];
  return lines.join('\n');
}

function initVolunteerLayoutDebug() {
  if (!volunteerLayoutDebugEnabled() || volunteerLayoutDebugPanel) return;
  ensureVolunteerIosHtmlClasses();
  document.body.classList.add('jh-vol-layout-debug-on');
  const panel = document.createElement('div');
  panel.className = 'jh-vol-layout-debug';
  panel.innerHTML =
    '<button type="button" class="jh-vol-layout-debug-toggle" aria-expanded="true">Layout debug ▾</button>'
    + '<pre class="jh-vol-layout-debug-body" aria-live="polite"></pre>';
  document.body.appendChild(panel);
  volunteerLayoutDebugPanel = panel;
  const toggle = panel.querySelector('.jh-vol-layout-debug-toggle');
  toggle?.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('jh-vol-layout-debug-collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.textContent = collapsed ? 'Layout debug ▸' : 'Layout debug ▾';
  });
  window.__jhVolunteerLayoutDebugRefresh = volunteerLayoutDebugRefresh;
  volunteerLayoutDebugRefresh();
  setInterval(volunteerLayoutDebugRefresh, 2000);
  window.addEventListener('resize', volunteerLayoutDebugRefresh, { passive: true });
  window.visualViewport?.addEventListener('resize', volunteerLayoutDebugRefresh, { passive: true });
  window.visualViewport?.addEventListener('scroll', volunteerLayoutDebugRefresh, { passive: true });
}

function volunteerLayoutDebugReport(extra) {
  if (!volunteerLayoutDebugEnabled()) return;
  Object.assign(volunteerLayoutDebugSnapshot, extra, {
    at: new Date().toLocaleTimeString('en-US', { hour12: false }),
  });
  volunteerLayoutDebugRefresh();
}

/** Touch iPad/iPhone Safari — also catches iPad desktop UA (MacIntel + touch). */
function detectVolunteerIosSafari() {
  const ua = navigator.userAgent || '';
  const touchMac = navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '');
  const ios = /iPad|iPhone|iPod/.test(ua) || touchMac;
  const iosChrome = /CriOS/.test(ua);
  return ios && !iosChrome && !/FxiOS|EdgiOS/.test(ua);
}

function ensureVolunteerIosHtmlClasses() {
  if (!detectVolunteerIosSafari()) return;
  const ua = navigator.userAgent || '';
  const touchMac = navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || '');
  const isPad = /iPad/.test(ua) || touchMac
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.documentElement.classList.add('jh-html-ios-safari');
  document.documentElement.classList.toggle('jh-html-ios-safari-pad', isPad);
  document.documentElement.classList.toggle('jh-html-ios-safari-phone', !isPad);
  document.documentElement.classList.toggle(
    'jh-html-ios-safari-landscape',
    window.innerWidth > window.innerHeight,
  );
  if (typeof window.jhSyncSafariVvTopDebounced === 'function') {
    window.jhSyncSafariVvTopDebounced();
  } else if (typeof window.jhSyncSafariVvTop === 'function') {
    window.jhSyncSafariVvTop();
  }
}

const PERSON_PICKER_MAX = 12;

function filterPersonRoster(roster, query, maxVisible = PERSON_PICKER_MAX) {
  const list = Array.isArray(roster) ? roster : [];
  const q = String(query || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!q) return { items: [], total: 0, capped: false };
  const tokens = q.split(' ').filter(Boolean);
  const scored = [];
  for (const row of list) {
    const displayName = row.displayName || row.display_name || '';
    const name = String(displayName).toLowerCase();
    const email = String(row.email || '').toLowerCase();
    const words = name.split(/[\s\-']+/).filter(Boolean);
    let ok = true;
    let score = 0;
    if (tokens.length > 1) {
      let wi = 0;
      for (const token of tokens) {
        let matched = false;
        for (let i = wi; i < words.length; i++) {
          if (words[i].startsWith(token)) {
            matched = true;
            wi = i + 1;
            break;
          }
        }
        if (!matched) {
          ok = false;
          break;
        }
      }
      if (ok) {
        if (words[0]?.startsWith(tokens[0])) score += 15;
        if (tokens.length > 1 && words.length > 1 && words[words.length - 1]?.startsWith(tokens[1])) score += 15;
      }
    } else {
      const token = tokens[0];
      const emailLocal = email.split('@')[0] || '';
      const emailPrefix = token.length >= 2 && emailLocal.startsWith(token);
      const wordStart = words.some((w) => w.startsWith(token));
      const fullPrefix = name.startsWith(token);
      if (!wordStart && !emailPrefix) ok = false;
      else {
        if (fullPrefix) score += 80;
        else if (wordStart) score += 50;
        else if (emailPrefix) score += 10;
        if (words[0]?.startsWith(token)) score += 15;
      }
    }
    if (!ok) continue;
    score += tokens.length * 30;
    score -= name.length * 0.02;
    scored.push({ row: { ...row, displayName: displayName || row.displayName }, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || String(a.row.displayName).localeCompare(String(b.row.displayName)),
  );
  const total = scored.length;
  return {
    items: scored.slice(0, maxVisible).map((x) => x.row),
    total,
    capped: total > maxVisible,
  };
}

function filterJobList(jobs, query, maxVisible = PERSON_PICKER_MAX) {
  const list = Array.isArray(jobs) ? jobs : [];
  const q = String(query || '').toLowerCase().trim();
  if (!q) return { items: [], total: 0, capped: false };
  const matches = list.filter((j) => String(j.title || '').toLowerCase().includes(q));
  matches.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const total = matches.length;
  return {
    items: matches.slice(0, maxVisible),
    total,
    capped: total > maxVisible,
  };
}

const SEARCH_FILTER_KEYS = [
  'daysAll',
  'selectedDays',
  'daysPrev',
  'jobsAll',
  'selectedJobs',
  'jobsPrev',
  'filterReset',
  'returnTo',
];
const SEARCH_BY_TYPE_FILTER_KEYS = [
  'daysAll',
  'selectedDays',
  'jobsAll',
  'selectedJobs',
  'jobType',
  'typeJobPrefs',
  'allJobsTap',
  'filterReset',
  'returnTo',
];

const VOLUNTEER_HOME_SCREENS = new Set([
  'jewelheart.home',
  'jewelheart.volunteer.search',
  'jewelheart.volunteer.searchByType',
  'jewelheart.volunteer.searchByDay',
  'jewelheart.volunteer.assign',
  'jewelheart.volunteer.shift',
  'jewelheart.volunteer.shiftDetail',
  'jewelheart.volunteer.shiftEdit',
  'jewelheart.volunteer.shiftInfo',
  'jewelheart.volunteer.checkin',
  'jewelheart.volunteer.messages',
  'jewelheart.volunteer.mine',
  'jewelheart.volunteer.account',
  'jewelheart.volunteer.preferences',
  'jewelheart.volunteer.manage',
  'jewelheart.volunteer.manageCheckins',
  'jewelheart.volunteer.testing',
  'jewelheart.volunteer.userManage',
  'jewelheart.volunteer.admin',
  'jewelheart.volunteer.adminPrivileges',
]);

export function createVolunteerSduiController(options) {
  const { apiBase, getIdToken, rootEl, titleEl, msgEl, backBtn, buildStampEl, onAdminWorkspace, onScreenChange, uiChannel } = options;

  initVolunteerLayoutDebug();
  ensureVolunteerIosHtmlClasses();
  let screenId = 'jewelheart.home';
  let retreatId = null;
  let params = {};
  const history = [];
  let browserHistoryBound = false;
  let pendingScrollTop = null;
  let suppressBrowserPop = false;
  let loadAbort = null;
  let checkinOpChain = Promise.resolve();
  let rootActionsBound = false;
  const actionStore = new Map();
  let actionSeq = 0;
  let profileVolunteerMeta = null;
  const personPickerState = new Map();
  const jobPickerState = new Map();
  let checkinManualState = null;
  let checkinManualTaskId = null;

  const OBO_ID_KEY = 'jh_obo_volunteer_id';
  const OBO_NAME_KEY = 'jh_obo_volunteer_name';

  function readOboSession() {
    try {
      const oboVolunteerId = sessionStorage.getItem(OBO_ID_KEY) || '';
      if (!oboVolunteerId) return null;
      return {
        oboVolunteerId,
        oboVolunteerName: sessionStorage.getItem(OBO_NAME_KEY) || '',
      };
    } catch {
      return null;
    }
  }

  function writeOboSession(oboVolunteerId, oboVolunteerName = '') {
    try {
      sessionStorage.setItem(OBO_ID_KEY, String(oboVolunteerId));
      sessionStorage.setItem(OBO_NAME_KEY, String(oboVolunteerName || ''));
    } catch {
      /* ignore */
    }
  }

  function clearOboSession() {
    try {
      sessionStorage.removeItem(OBO_ID_KEY);
      sessionStorage.removeItem(OBO_NAME_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Hard reset clears OBO unless this navigation explicitly starts OBO for someone. */
  function hardResetOboUnlessPayload(payload = {}) {
    if (payload.oboVolunteerId) return;
    clearOboSession();
    delete params.oboVolunteerId;
    delete params.oboVolunteerName;
    delete params.oboClear;
  }

  function syncOboRequestParams(requestParams) {
    if (String(requestParams.oboClear || '') === '1') return;
    const obo = readOboSession();
    if (obo) {
      requestParams.oboVolunteerId = obo.oboVolunteerId;
      if (obo.oboVolunteerName) requestParams.oboVolunteerName = obo.oboVolunteerName;
    }
  }

  function applyOboHomePayload(payload = {}) {
    if (payload.oboClear === '1') {
      clearOboSession();
      return;
    }
    if (payload.oboVolunteerId) {
      writeOboSession(payload.oboVolunteerId, payload.oboVolunteerName || '');
    }
    const obo = readOboSession();
    if (obo) params.oboVolunteerId = obo.oboVolunteerId;
  }

  function parseCheckinClockLabel(raw) {
    const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    const pm = m[3].toUpperCase() === 'PM';
    const hour12 = h;
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    const suffix = pm ? 'PM' : 'AM';
    const text = `${hour12}:${String(min).padStart(2, '0')} ${suffix}`;
    return { text, minutes: h * 60 + min };
  }

  function validateCheckinClockPair(startLabel, finishLabel) {
    const start = parseCheckinClockLabel(startLabel);
    const end = parseCheckinClockLabel(finishLabel);
    if (!start || !end) {
      return { ok: false, error: 'Enter times as h:mm AM or PM.' };
    }
    if (end.minutes <= start.minutes) {
      return { ok: false, error: 'End time must be after start time.' };
    }
    if (end.minutes - start.minutes > 60) {
      return { ok: false, error: 'Start and end must be within one hour.' };
    }
    return { ok: true };
  }

  function findCheckinControlButton(label) {
    const buttons = rootEl.querySelectorAll('.jh-sdui-btn');
    for (const btn of buttons) {
      if ((btn.textContent || '').trim() === label) return btn;
    }
    return null;
  }

  function disableCheckinControlButton(btn) {
    if (!btn) return;
    const id = btn.dataset.sduiActionId;
    if (id) actionStore.delete(id);
    delete btn.dataset.sduiActionId;
    btn.disabled = true;
    btn.style.cursor = 'default';
    btn.style.opacity = '0.92';
  }

  function wireCheckinManualTimes() {
    if (screenId !== 'jewelheart.volunteer.checkin') {
      checkinManualState = null;
      checkinManualTaskId = null;
      return;
    }
    const startBox = rootEl.querySelector('[data-checkin-time-box="start"]');
    const endBox = rootEl.querySelector('[data-checkin-time-box="end"]');
    if (!startBox || !endBox) return;

    const taskId = params.taskId ? String(params.taskId) : '';
    if (taskId !== checkinManualTaskId) {
      checkinManualState = null;
      checkinManualTaskId = taskId;
    }

    const startBtn = findCheckinControlButton('Start');
    const endBtn = findCheckinControlButton('End');
    const doneBtn = findCheckinControlButton('Done');
    const savedDoneAction = doneBtn?.dataset.sduiActionId
      ? actionStore.get(doneBtn.dataset.sduiActionId)
      : null;

    const sessionActive = startBtn?.disabled === true;
    const manualLocked =
      checkinManualState?.startManualLock === true ||
      checkinManualState?.endManualLock === true;
    const startText = manualLocked
      ? (checkinManualState?.startText || '').trim()
      : sessionActive
        ? (startBox.textContent || '').trim()
        : '';
    const endText = manualLocked
      ? (checkinManualState?.endText || '').trim()
      : sessionActive
        ? (endBox.textContent || '').trim()
        : '';
    checkinManualState = {
      phase: !startText ? 'start' : !endText ? 'end' : 'both',
      startManualLock: manualLocked && checkinManualState?.startManualLock === true,
      endManualLock: manualLocked && checkinManualState?.endManualLock === true,
      startText,
      endText,
    };
    if (checkinManualState.startManualLock) disableCheckinControlButton(startBtn);
    if (checkinManualState.endManualLock) disableCheckinControlButton(endBtn);

    let warningEl = rootEl.querySelector('.jh-sdui-checkin-time-warn');
    if (!warningEl) {
      warningEl = document.createElement('div');
      warningEl.className = 'jh-sdui-text jh-sdui-checkin-time-warn';
      const row = startBox.closest('.jh-sdui-row-nowrap');
      if (row?.parentElement) {
        row.parentElement.insertBefore(warningEl, row.nextSibling);
      }
    }

    function refreshCheckinManualUi() {
      startBox.textContent = checkinManualState.startText || '';
      endBox.textContent = checkinManualState.endText || '';
      const manual = checkinManualState.startManualLock || checkinManualState.endManualLock;
      let warn = '';
      let blockDone = false;
      if (manual) {
        if (!checkinManualState.startText || !checkinManualState.endText) {
          warn = 'Enter start and end times.';
          blockDone = true;
        } else {
          const v = validateCheckinClockPair(checkinManualState.startText, checkinManualState.endText);
          if (!v.ok) {
            warn = v.error;
            blockDone = true;
          }
        }
      }
      warningEl.textContent = warn;
      warningEl.hidden = !warn;
      if (doneBtn) {
        doneBtn.disabled = blockDone;
        doneBtn.classList.toggle('jh-sdui-checkin-done-blocked', blockDone);
        if (blockDone) {
          const id = doneBtn.dataset.sduiActionId;
          if (id) actionStore.delete(id);
          delete doneBtn.dataset.sduiActionId;
        } else if (!doneBtn.dataset.sduiActionId && savedDoneAction) {
          attachAction(doneBtn, savedDoneAction);
        }
      }
      startBox.classList.toggle('jh-sdui-checkin-time-active', checkinManualState.phase === 'start' || checkinManualState.phase === 'both');
      endBox.classList.toggle('jh-sdui-checkin-time-active', checkinManualState.phase === 'end' || checkinManualState.phase === 'both');
    }

    function openCheckinTimeEditor(box, slot) {
      if (box.querySelector('.jh-sdui-checkin-time-input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'jh-sdui-checkin-time-input';
      input.placeholder = '9:30 AM';
      input.value = slot === 'start' ? checkinManualState.startText : checkinManualState.endText;
      input.setAttribute('inputmode', 'text');
      input.autocomplete = 'off';
      box.textContent = '';
      box.appendChild(input);
      input.focus();
      input.select();
      const commit = () => {
        const parsed = parseCheckinClockLabel(input.value);
        if (!parsed) {
          box.textContent = slot === 'start' ? checkinManualState.startText : checkinManualState.endText;
          refreshCheckinManualUi();
          return;
        }
        if (slot === 'start') {
          checkinManualState.startText = parsed.text;
          checkinManualState.startManualLock = true;
          disableCheckinControlButton(startBtn);
          checkinManualState.phase = checkinManualState.endText ? 'both' : 'end';
        } else {
          checkinManualState.endText = parsed.text;
          checkinManualState.endManualLock = true;
          disableCheckinControlButton(endBtn);
          checkinManualState.phase = 'both';
        }
        box.textContent = parsed.text;
        refreshCheckinManualUi();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    }

    startBox.addEventListener('click', () => {
      if (checkinManualState.phase !== 'start' && checkinManualState.phase !== 'both') return;
      openCheckinTimeEditor(startBox, 'start');
    });
    endBox.addEventListener('click', () => {
      if (checkinManualState.phase !== 'end' && checkinManualState.phase !== 'both') return;
      openCheckinTimeEditor(endBox, 'end');
    });

    refreshCheckinManualUi();
  }

  function clearActionStore() {
    actionStore.clear();
    actionSeq = 0;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;
    const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
    return m ? decodeURIComponent(m[1].replace(/"/g, '')) : fallback;
  }

  async function handleDownload(action) {
    const raw = action?.target || '';
    if (!raw) return;
    const path = raw.replace(/^\/+/, '').replace(/^jewelheart\//, '');
    const url = raw.startsWith('http') ? raw : `${apiBase}/${path}`;
    setMsg('Downloading…', false);
    try {
      const token = await getIdToken();
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = t;
        try {
          const j = JSON.parse(t);
          msg = j.error || j.message || t;
        } catch {
          /* ignore */
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const fallback = path.includes('poster-master') ? 'poster.xlsx' : 'download';
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
      downloadBlob(blob, filename);
      setMsg('', false);
    } catch (e) {
      console.error('SDUI download', e);
      setMsg(e.message || String(e), true);
    }
  }

  function bindBrowserBack() {
    if (browserHistoryBound) return;
    browserHistoryBound = true;
    window.addEventListener('popstate', () => {
      if (suppressBrowserPop) {
        suppressBrowserPop = false;
        return;
      }
      if (!VOLUNTEER_HOME_SCREENS.has(screenId) && history.length === 0) return;
      const prev = history.pop();
      if (!prev) return;
      screenId = prev.screenId;
      retreatId = prev.retreatId;
      params = { ...prev.params };
      load().catch((e) => console.error('sdui popstate', e));
    });
  }

  function pushBrowserHistoryEntry() {
    window.history.pushState({ volunteerSdui: true }, '', window.location.href);
  }

  function setMsg(text, isErr) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (isErr ? ' err' : text ? ' ok' : '');
  }

  function syncShiftEditStateFromMetadata(screen) {
    const st = screen?.metadata?.shiftEditState;
    if (!st || typeof st !== 'object') return;
    if (st.outcome) params.editOutcome = String(st.outcome);
    if (st.reassignedName) params.reassignedName = String(st.reassignedName);
  }

  function syncFilterStateFromMetadata(envelope) {
    const screen = envelope?.screen || envelope;
    if (screenId !== 'jewelheart.volunteer.search') return;
    const fs = screen?.metadata?.filterState;
    if (!fs || typeof fs !== 'object') return;
    if (fs.daysAll != null) params.daysAll = String(fs.daysAll);
    if (fs.jobsAll != null) params.jobsAll = String(fs.jobsAll);
    for (const k of ['selectedDays', 'daysPrev', 'selectedJobs', 'jobsPrev']) {
      if (fs[k] != null && String(fs[k]).trim() !== '') params[k] = String(fs[k]);
      else delete params[k];
    }
  }

  function attachAction(el, action) {
    if (!action) return;
    const id = String(++actionSeq);
    actionStore.set(id, action);
    el.dataset.sduiActionId = id;
    el.style.cursor = 'pointer';
    if (el.tagName === 'BUTTON') el.type = 'button';
  }

  function bindRootActions() {
    if (rootActionsBound) return;
    rootActionsBound = true;
    rootEl.addEventListener(
      'click',
      (e) => {
        const el = e.target.closest('[data-sdui-action-id]');
        if (!el || !rootEl.contains(el)) return;
        const id = el.dataset.sduiActionId;
        const action = id ? actionStore.get(id) : null;
        if (!action) return;
        e.preventDefault();
        e.stopPropagation();
        Promise.resolve(handleAction(action)).catch((err) => console.error('SDUI action', err));
      },
      true,
    );
  }

  function padFromStyle(style) {
    const p = style?.padding || {};
    return {
      top: p.top ?? p.all ?? 0,
      right: p.right ?? p.all ?? 0,
      bottom: p.bottom ?? p.all ?? 0,
      left: p.left ?? p.all ?? 0,
    };
  }

  function resetVolunteerFindFilters(payload = {}) {
    delete params.daysAll;
    delete params.selectedDays;
    delete params.daysPrev;
    delete params.jobsAll;
    delete params.selectedJobs;
    delete params.jobsPrev;
    delete params.jobType;
    delete params.typeJobPrefs;
    delete params.allJobsTap;
    delete params.filterReset;
    delete params.returnTo;

    params.daysAll = '1';
    params.selectedDays = '';
    params.daysPrev = '';
    params.jobsAll = '1';
    params.selectedJobs = '';
    params.jobsPrev = '';
    params.jobType = '';
    params.typeJobPrefs = '';
    if (payload.returnTo) params.returnTo = payload.returnTo;
  }

  function resetVolunteerSearchFilters(payload = {}) {
    resetVolunteerFindFilters(payload);
    if ('daysAll' in payload && payload.daysAll != null && payload.daysAll !== '') {
      params.daysAll = String(payload.daysAll);
    }
    if ('selectedDays' in payload && payload.selectedDays != null && payload.selectedDays !== '') {
      params.selectedDays = String(payload.selectedDays);
    } else {
      params.selectedDays = '';
    }
  }

  function applyFindFilterSnapshot(payload = {}) {
    if ('daysAll' in payload && payload.daysAll != null && String(payload.daysAll) !== '') {
      params.daysAll = String(payload.daysAll);
    }
    if ('jobsAll' in payload && payload.jobsAll != null && String(payload.jobsAll) !== '') {
      params.jobsAll = String(payload.jobsAll);
    }
    for (const k of ['selectedDays', 'daysPrev', 'selectedJobs', 'jobsPrev']) {
      if (!(k in payload)) continue;
      const v = payload[k];
      if (v == null || String(v) === '') delete params[k];
      else params[k] = String(v);
    }
    if (payload.returnTo) params.returnTo = String(payload.returnTo);
    else if ('returnTo' in payload) delete params.returnTo;
  }

  function applySearchFilterPayload(payload = {}) {
    if (payload.retreatId) retreatId = payload.retreatId;
    if (payload.filterReset === '1') {
      resetVolunteerFindFilters(payload);
      return;
    }
    if (
      'daysAll' in payload ||
      'jobsAll' in payload ||
      'selectedDays' in payload ||
      'selectedJobs' in payload ||
      'daysPrev' in payload ||
      'jobsPrev' in payload
    ) {
      applyFindFilterSnapshot(payload);
    }
  }

  function syncVolunteerSearchFilterParams() {
    if (screenId === 'jewelheart.volunteer.search') return;
    if (params.jobType === 'all') {
      params.jobsAll = '1';
      return;
    }
    if (params.jobType) {
      params.jobsAll = '0';
      return;
    }
    if (params.jobsAll === '1') {
      delete params.jobType;
      delete params.selectedJobs;
      delete params.typeJobPrefs;
      return;
    }
    if (params.jobsAll === '0' && !String(params.selectedJobs || '').trim()) {
      params.jobsAll = '1';
    }
    if (params.daysAll === '1') {
      delete params.selectedDays;
    }
  }

  function applySearchByTypeFilterPayload(payload = {}) {
    if (payload.retreatId) retreatId = payload.retreatId;
    if (payload.filterReset === '1' || payload.allJobsTap === '1') {
      resetVolunteerSearchFilters(payload);
      return;
    }
    params.daysAll = '1';
    params.selectedDays = '';
    delete params.selectedDay;
    params.selectedJobs = '';
    params.typeJobPrefs = '';
    if (
      payload.jobType === 'all'
      || payload.jobsAll === '1'
      || payload.jobsAll === 1
    ) {
      params.jobsAll = '1';
      params.jobType = 'all';
    } else {
      params.jobsAll = '0';
      if (payload.jobType) params.jobType = String(payload.jobType);
      else delete params.jobType;
    }
    if (payload.scrollTop === '1') params.scrollTop = '1';
    else delete params.scrollTop;
  }

  function applySearchByDayFilterPayload(payload = {}) {
    if (payload.retreatId) retreatId = payload.retreatId;
    params.daysAll = '0';
    params.jobsAll = '1';
    delete params.selectedJobs;
    delete params.jobType;
    delete params.typeJobPrefs;
    if (payload.selectedDay) {
      params.selectedDay = String(payload.selectedDay);
      params.selectedDays = params.selectedDay;
    } else if (payload.selectedDays != null && payload.selectedDays !== '') {
      params.selectedDays = String(payload.selectedDays);
      params.selectedDay = params.selectedDays.split(',')[0];
    }
    if (payload.scrollTop === '1') params.scrollTop = '1';
    else delete params.scrollTop;
  }

  function applyVolunteerPayload(target, payload = {}) {
    if (payload.retreatId) {
      retreatId = payload.retreatId;
    } else if (target === 'retreat.list' || target === 'jewelheart.home') {
      retreatId = null;
    }

    if (
      target.startsWith('jewelheart.volunteer.') ||
      target === 'jewelheart.home'
    ) {
      if (payload.retreatId) retreatId = payload.retreatId;

      if (target === 'jewelheart.home') {
        const keepRetreat = retreatId || params.retreatId;
        params = keepRetreat ? { retreatId: keepRetreat } : {};
        if (payload.retreatId) {
          retreatId = payload.retreatId;
          params.retreatId = payload.retreatId;
        }
        hardResetOboUnlessPayload(payload);
        applyOboHomePayload(payload);
      } else if (target === 'jewelheart.volunteer.search') {
        applySearchFilterPayload(payload);
      } else if (
        target === 'jewelheart.volunteer.assign' &&
        (payload.filterReset === '1' || payload.daysAll != null || payload.jobsAll != null)
      ) {
        applySearchFilterPayload(payload);
      } else if (target === 'jewelheart.volunteer.searchByType') {
        applySearchByTypeFilterPayload(payload);
      } else if (target === 'jewelheart.volunteer.searchByDay') {
        applySearchByDayFilterPayload(payload);
      } else if (payload.filterReset === '1') {
        resetVolunteerFindFilters(payload);
      } else if (payload.daysAll != null && payload.daysAll !== '') {
        params.daysAll = payload.daysAll;
      } else if (target === 'jewelheart.volunteer.search' || target === 'jewelheart.volunteer.assign') {
        delete params.daysAll;
      }

      if (target !== 'jewelheart.volunteer.searchByType' && target !== 'jewelheart.volunteer.search'
        && target !== 'jewelheart.volunteer.searchByDay') {
        if (payload.selectedDays != null) params.selectedDays = payload.selectedDays;
        else if (target === 'jewelheart.volunteer.search' || target === 'jewelheart.volunteer.assign') {
          delete params.selectedDays;
        }

        if (payload.jobsAll != null && payload.jobsAll !== '') params.jobsAll = payload.jobsAll;
        else if (target === 'jewelheart.volunteer.search' || target === 'jewelheart.volunteer.assign') {
          delete params.jobsAll;
        }

        if (payload.selectedJobs != null) params.selectedJobs = payload.selectedJobs;
        else if (target === 'jewelheart.volunteer.search' || target === 'jewelheart.volunteer.assign') {
          delete params.selectedJobs;
        }
      }

      if (payload.taskId) {
        const nextTaskId = String(payload.taskId);
        if (!params.taskId || String(params.taskId) !== nextTaskId) {
          checkinManualState = null;
          checkinManualTaskId = null;
          delete params.checkinBaselineIds;
        }
        params.taskId = nextTaskId;
      } else if (
        target === 'jewelheart.volunteer.checkin' ||
        target === 'jewelheart.volunteer.shiftDetail'
      ) {
        delete params.taskId;
      }

      if (payload.shiftEditOp) params.shiftEditOp = payload.shiftEditOp;
      else if (target === 'jewelheart.volunteer.shiftEdit') {
        delete params.shiftEditOp;
      }

      if (payload.pickVolunteerId) params.pickVolunteerId = payload.pickVolunteerId;
      else if (target === 'jewelheart.volunteer.shiftEdit') delete params.pickVolunteerId;

      if (payload.editOutcome) params.editOutcome = payload.editOutcome;
      else if (target !== 'jewelheart.volunteer.shiftEdit') delete params.editOutcome;

      if (payload.reassignedName) params.reassignedName = payload.reassignedName;
      else if (target !== 'jewelheart.volunteer.shiftEdit') delete params.reassignedName;

      if (payload.shiftMode) params.shiftMode = payload.shiftMode;
      else if (
        target !== 'jewelheart.volunteer.shiftDetail' &&
        target !== 'jewelheart.volunteer.shiftEdit' &&
        target !== 'jewelheart.volunteer.shiftInfo'
      ) {
        delete params.shiftMode;
      }

      if (payload.checkinOp) params.checkinOp = payload.checkinOp;
      else if (
        target === 'jewelheart.volunteer.checkin' ||
        target === 'jewelheart.volunteer.shiftDetail' ||
        target === 'jewelheart.volunteer.shift' ||
        target === 'jewelheart.volunteer.mine'
      ) {
        delete params.checkinOp;
      }

      if (payload.checkinBaselineIds != null) {
        const rawBaseline = String(payload.checkinBaselineIds);
        if (rawBaseline) params.checkinBaselineIds = rawBaseline;
        else delete params.checkinBaselineIds;
      } else if (
        target !== 'jewelheart.volunteer.checkin' &&
        target !== 'jewelheart.volunteer.shiftDetail' &&
        target !== 'jewelheart.volunteer.shift'
      ) {
        delete params.checkinBaselineIds;
      }

      if (payload.shiftOp) params.shiftOp = payload.shiftOp;
      else if (target !== 'jewelheart.volunteer.shift') delete params.shiftOp;

      if (payload.jobId) params.jobId = payload.jobId;
      else if (
        target !== 'jewelheart.volunteer.shift' &&
        target !== 'jewelheart.volunteer.shiftDetail' &&
        target !== 'jewelheart.volunteer.shiftEdit' &&
        target !== 'jewelheart.volunteer.shiftInfo' &&
        target !== 'jewelheart.volunteer.checkin'
      ) {
        delete params.jobId;
      }

      if (payload.dayIso) params.dayIso = payload.dayIso;
      else if (
        target !== 'jewelheart.volunteer.shift' &&
        target !== 'jewelheart.volunteer.shiftDetail' &&
        target !== 'jewelheart.volunteer.shiftEdit' &&
        target !== 'jewelheart.volunteer.shiftInfo' &&
        target !== 'jewelheart.volunteer.checkin'
      ) {
        delete params.dayIso;
      }

      if (payload.volunteerId) params.volunteerId = payload.volunteerId;
      else if (target !== 'jewelheart.volunteer.shift') delete params.volunteerId;

      if (payload.expandCheckin != null && payload.expandCheckin !== '') params.expandCheckin = payload.expandCheckin;
      else if (target === 'jewelheart.volunteer.shift') delete params.expandCheckin;

      if (payload.expandInstructions != null && payload.expandInstructions !== '') {
        params.expandInstructions = payload.expandInstructions;
      } else if (target === 'jewelheart.volunteer.shift') delete params.expandInstructions;

      if (payload.returnTo) params.returnTo = payload.returnTo;
      else if (target === 'jewelheart.home') delete params.returnTo;

      if (payload.checkinsShow != null && payload.checkinsShow !== '') {
        params.checkinsShow = String(payload.checkinsShow);
      } else if (target !== 'jewelheart.volunteer.manageCheckins') {
        delete params.checkinsShow;
      }

      if (payload.userManageClear === '1') {
        delete params.userManageVolunteerId;
        delete params.userManageVolunteerName;
        delete params.userManageStatusNote;
        delete params.userManagePendingOp;
      } else {
        if (payload.userManageVolunteerId) params.userManageVolunteerId = String(payload.userManageVolunteerId);
        if (payload.userManageVolunteerName) params.userManageVolunteerName = String(payload.userManageVolunteerName);
        if (payload.userManageStatusNote != null && payload.userManageStatusNote !== '') {
          params.userManageStatusNote = String(payload.userManageStatusNote);
        }
        if (payload.userManagePendingClear === '1') {
          delete params.userManagePendingOp;
        } else if (payload.userManagePendingOp) {
          params.userManagePendingOp = String(payload.userManagePendingOp);
        }
      }

      if (target !== 'jewelheart.volunteer.userManage') {
        delete params.userManageVolunteerId;
        delete params.userManageVolunteerName;
        delete params.userManageStatusNote;
        delete params.userManageClear;
        delete params.userManagePendingOp;
      }

      if (payload.oboClear === '1') {
        clearOboSession();
        delete params.oboVolunteerId;
        delete params.oboVolunteerName;
      } else if (payload.oboVolunteerId) {
        writeOboSession(payload.oboVolunteerId, payload.oboVolunteerName || '');
        params.oboVolunteerId = String(payload.oboVolunteerId);
        if (payload.oboVolunteerName) params.oboVolunteerName = String(payload.oboVolunteerName);
      }

      const OBO_PERSIST_SCREENS = new Set([
        'jewelheart.home',
        'jewelheart.volunteer.mine',
        'jewelheart.volunteer.search',
        'jewelheart.volunteer.searchByDay',
        'jewelheart.volunteer.searchByType',
        'jewelheart.volunteer.assign',
        'jewelheart.volunteer.shift',
        'jewelheart.volunteer.checkin',
        'jewelheart.volunteer.shiftEdit',
      ]);
      if (!OBO_PERSIST_SCREENS.has(target)) {
        delete params.oboVolunteerId;
        delete params.oboVolunteerName;
        delete params.oboClear;
      }

      if (payload.jobFinderClear === '1') {
        delete params.jobFinderJobId;
        delete params.jobFinderJobTitle;
        delete params.jobFinderDayIso;
      } else {
        if (payload.jobFinderJobId) params.jobFinderJobId = String(payload.jobFinderJobId);
        if (payload.jobFinderJobTitle) params.jobFinderJobTitle = String(payload.jobFinderJobTitle);
        if (payload.jobFinderDayIso) params.jobFinderDayIso = String(payload.jobFinderDayIso);
      }

      if (target === 'jewelheart.volunteer.jobFinder') {
        if (payload.jobFinderOp) {
          params.jobFinderOp = String(payload.jobFinderOp);
          if (payload.jobFinderTaskId) params.jobFinderTaskId = String(payload.jobFinderTaskId);
          if (payload.jobFinderVolunteerId) {
            params.jobFinderVolunteerId = String(payload.jobFinderVolunteerId);
          }
          if (payload.jobFinderPickVolunteerId) {
            params.jobFinderPickVolunteerId = String(payload.jobFinderPickVolunteerId);
          }
        } else if (!payload.jobFinderAssignConfirm && !payload.jobFinderConfirm) {
          delete params.jobFinderOp;
          delete params.jobFinderTaskId;
          delete params.jobFinderVolunteerId;
          delete params.jobFinderPickVolunteerId;
        }
      }

      if (target !== 'jewelheart.volunteer.jobFinder') {
        delete params.jobFinderJobId;
        delete params.jobFinderJobTitle;
        delete params.jobFinderDayIso;
        delete params.jobFinderClear;
        delete params.jobFinderOp;
        delete params.jobFinderTaskId;
        delete params.jobFinderVolunteerId;
        delete params.jobFinderPickVolunteerId;
      }

      if (payload.adminPrivClear === '1') {
        delete params.adminPrivVolunteerId;
        delete params.adminPrivVolunteerName;
        delete params.adminPrivStatusNote;
      } else {
        if (payload.adminPrivVolunteerId) params.adminPrivVolunteerId = String(payload.adminPrivVolunteerId);
        if (payload.adminPrivVolunteerName) params.adminPrivVolunteerName = String(payload.adminPrivVolunteerName);
        if (payload.adminPrivStatusNote != null && payload.adminPrivStatusNote !== '') {
          params.adminPrivStatusNote = String(payload.adminPrivStatusNote);
        }
      }

      if (target !== 'jewelheart.volunteer.adminPrivileges') {
        delete params.adminPrivVolunteerId;
        delete params.adminPrivVolunteerName;
        delete params.adminPrivStatusNote;
        delete params.adminPrivClear;
      }

      if (target === 'jewelheart.volunteer.admin') {
        if (payload.adminClearStep != null && payload.adminClearStep !== '') {
          params.adminClearStep = String(payload.adminClearStep);
        } else if (Object.prototype.hasOwnProperty.call(payload, 'adminClearStep')) {
          delete params.adminClearStep;
        }
      } else {
        delete params.adminClearStep;
      }

      if (target !== 'jewelheart.volunteer.searchByType' && target !== 'jewelheart.volunteer.search'
        && target !== 'jewelheart.volunteer.searchByDay') {
        for (const [k, v] of Object.entries(payload)) {
          if (
            ![
              'retreatId',
              'daysAll',
              'selectedDays',
              'daysPrev',
              'jobsAll',
              'selectedJobs',
              'jobsPrev',
              'jobType',
              'typeJobPrefs',
              'taskId',
              'checkinOp',
              'checkinBaselineIds',
              'shiftOp',
              'shiftEditOp',
              'pickVolunteerId',
              'editOutcome',
              'reassignedName',
              'jobId',
              'dayIso',
              'volunteerId',
              'expandCheckin',
              'expandInstructions',
              'allJobsTap',
              'filterReset',
              'returnTo',
              'checkinsShow',
              'userManageConfirm',
              'userManageClear',
              'userManageVolunteerId',
              'userManageVolunteerName',
              'userManageStatusNote',
              'userManagePendingOp',
              'userManagePendingClear',
              'adminPrivConfirm',
              'adminPrivClear',
              'adminPrivVolunteerId',
              'adminPrivVolunteerName',
              'adminPrivStatusNote',
              'adminClearStep',
              'oboConfirm',
              'oboClear',
              'oboVolunteerId',
              'oboVolunteerName',
              'jobFinderConfirm',
              'jobFinderClear',
              'jobFinderJobId',
              'jobFinderJobTitle',
              'jobFinderDayIso',
              'pickJobFrom',
              'jobFinderOp',
              'jobFinderTaskId',
              'jobFinderVolunteerId',
              'jobFinderPickVolunteerId',
              'jobFinderAssignConfirm',
            ].includes(k) &&
            v != null &&
            v !== ''
          ) {
            params[k] = String(v);
          }
        }
      }
    }

    if (payload.date) params.date = payload.date;
  }

  function snapshotForStack() {
    const historyParams = { ...params };
    delete historyParams.checkinOp;
    delete historyParams.checkinBaselineIds;
    delete historyParams.shiftEditOp;
    delete historyParams.pickVolunteerId;
    delete historyParams.scrollTop;
    return { screenId, retreatId, params: historyParams };
  }

  function restoreStackEntry(entry) {
    screenId = entry.screenId;
    retreatId = entry.retreatId;
    params = { ...entry.params };
  }

  /** Pushdown stack: push only on screen entry; pop when returning to parent. */
  function applyNavigate(action) {
    if (!action || action.type !== 'navigate' || !action.target) return;
    const target = action.target;
    let payload = action.payload || {};

    if (target === 'jewelheart.home') {
      history.length = 0;
      screenId = target;
      applyVolunteerPayload(target, payload);
      return;
    }

    if (screenId === 'jewelheart.home') {
      hardResetOboUnlessPayload(payload);
    }

    // Entering Find from Home resets to All days + All jobs.
    if (
      target === 'jewelheart.volunteer.search' &&
      target !== screenId &&
      screenId === 'jewelheart.home'
    ) {
      payload = { ...payload, filterReset: '1' };
    }

    // Same screen (e.g. filter toggles on Find open shifts) — update params only.
    if (target === screenId) {
      applyVolunteerPayload(target, payload);
      return;
    }

    const stackTop = history.length > 0 ? history[history.length - 1] : null;
    if (stackTop && stackTop.screenId === target) {
      const prev = history.pop();
      restoreStackEntry(prev);
      screenId = target;
      applyVolunteerPayload(target, payload);
      if (window.history.state?.volunteerSdui) {
        suppressBrowserPop = true;
        window.history.back();
      }
      return;
    }

    history.push(snapshotForStack());
    pushBrowserHistoryEntry();
    screenId = target;
    applyVolunteerPayload(target, payload);
  }

  async function fetchScreen(signal) {
    const token = await getIdToken();
    const body = { screenId };
    if (retreatId) body.retreatId = retreatId;
    const requestParams = { ...params };
    if (uiChannel) requestParams.uiChannel = uiChannel;
    delete requestParams.filterReset;
    delete requestParams.allJobsTap;
    delete requestParams.scrollTop;
    delete requestParams.oboConfirm;
    delete requestParams.pickVolunteerFrom;
    delete requestParams.jobFinderConfirm;
    delete requestParams.pickJobFrom;
    delete requestParams.jobFinderAssignConfirm;
    delete requestParams.shiftEditConfirm;
    syncOboRequestParams(requestParams);
    delete params.filterReset;
    delete params.allJobsTap;
    delete params.scrollTop;
    if (Object.keys(requestParams).length > 0) body.params = requestParams;

    const res = await fetch(`${apiBase}/sdui/screen`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`SDUI response not JSON (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  async function patchVolunteerProfile(mode, actionPayload = {}) {
    const body = {};
    if (mode === 'profile') {
      const meta = profileVolunteerMeta;
      if (meta?.canEditEmail) {
        const el = rootEl.querySelector('[data-profile-field="email"]');
        const v = el?.value?.trim();
        if (v) body.email = v;
      }
      if (meta?.canEditPhone) {
        const el = rootEl.querySelector('[data-profile-field="phone"]');
        const v = el?.value?.trim();
        if (v) body.phone = v;
      }
      if (!body.email && !body.phone) {
        setMsg('Enter an email address or phone number to save.', true);
        return;
      }
    } else if (mode === 'prefs') {
      const key = actionPayload.fieldKey;
      if (key === 'notifyEmail' || key === 'notifySms') {
        body[key] = actionPayload.checked === true;
      }
    }
    setMsg('Saving…', false);
    try {
      const token = await getIdToken();
      const res = await fetch(`${apiBase}/volunteer/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setMsg(mode === 'prefs' ? '' : 'Saved.', false);
      if (mode === 'profile' || mode === 'prefs') await load();
    } catch (e) {
      console.error('patchVolunteer', e);
      setMsg(e.message || String(e), true);
      if (mode === 'prefs') await load();
    }
  }

  async function readTestingFormFields() {
    const panel = rootEl.querySelector('.jh-sdui-testing-panel');
    const scope = panel || rootEl;
    const enabled = scope.querySelector('[data-testing-field="enabled"]')?.checked === true;
    const pinnedToday = String(scope.querySelector('[data-testing-field="pinnedToday"]')?.value || '').trim();
    const overrideStartDate = String(
      scope.querySelector('[data-testing-field="overrideStartDate"]')?.value || '',
    ).trim();
    const overrideEndDate = String(
      scope.querySelector('[data-testing-field="overrideEndDate"]')?.value || '',
    ).trim();
    return { enabled, pinnedToday, overrideStartDate, overrideEndDate };
  }

  async function handleVolunteerTesting(action) {
    const op = action.payload?.op;
    let body;
    if (op === 'saveFromForm' || op === 'saveLive') {
      body = await readTestingFormFields();
      if (op === 'saveLive') body.enabled = false;
    } else if (op === 'save') {
      body = {
        enabled: action.payload?.enabled === true,
        pinnedToday: action.payload?.pinnedToday
          ? String(action.payload.pinnedToday).trim()
          : null,
        overrideStartDate: action.payload?.overrideStartDate
          ? String(action.payload.overrideStartDate).trim()
          : null,
        overrideEndDate: action.payload?.overrideEndDate
          ? String(action.payload.overrideEndDate).trim()
          : null,
      };
    } else {
      setMsg('Unknown action.', true);
      return;
    }
    setMsg('Saving…', false);
    try {
      const token = await getIdToken();
      const res = await fetch(`${apiBase}/volunteer/testing-settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.timeContext?.retreatBannerLine && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('jh-volunteer-time-context', { detail: j.timeContext }),
        );
      }
      setMsg(
        body.enabled
          ? `Testing on — today ${j.timeContext?.todayIso || body.pinnedToday || '?'}.`
          : 'Testing off — using live calendar.',
        false,
      );
      return load();
    } catch (e) {
      console.error('volunteerTesting', e);
      setMsg(e.message || String(e), true);
    }
  }

  async function handleVolunteerUserManage(action) {
    const op = action.payload?.op;
    const volunteerId = String(action.payload?.volunteerId || params.userManageVolunteerId || '').trim();
    const rid = retreatId || params.retreatId;
    if (!volunteerId || !rid) {
      setMsg('No volunteer selected.', true);
      return;
    }
    const token = await getIdToken();
    const base = `${apiBase}/retreats/${encodeURIComponent(rid)}/volunteers/${encodeURIComponent(volunteerId)}`;

    try {
      if (op === 'status') {
        setMsg('Loading status…', false);
        const res = await fetch(`${base}/user-access`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        params.userManageStatusNote = (j.lines || []).join('\n');
        return load();
      }
      if (op === 'unlink') {
        if (!action.payload?.confirmed) {
          params.userManagePendingOp = 'unlink';
          setMsg('', false);
          return load();
        }
        setMsg('Unlinking…', false);
        const res = await fetch(`${base}/unlink-auth`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        delete params.userManageStatusNote;
        delete params.userManagePendingOp;
        setMsg(j.message || 'Unlinked.', false);
        return load();
      }
      if (op === 'resetOnboarding') {
        if (!action.payload?.confirmed) {
          params.userManagePendingOp = 'resetOnboarding';
          setMsg('', false);
          return load();
        }
        setMsg('Resetting onboarding…', false);
        const res = await fetch(`${base}/reset-onboarding`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        delete params.userManageStatusNote;
        delete params.userManagePendingOp;
        setMsg(j.message || 'Onboarding reset.', false);
        return load();
      }
      setMsg('Unknown action.', true);
    } catch (e) {
      console.error('volunteerUserManage', e);
      setMsg(e.message || String(e), true);
    }
  }

  async function handleVolunteerAdminTools(action) {
    const op = action.payload?.op;
    const volunteerId = String(action.payload?.volunteerId || params.adminPrivVolunteerId || '').trim();
    const rid = retreatId || params.retreatId;
    if (!rid) {
      setMsg('No retreat selected.', true);
      return;
    }
    const token = await getIdToken();

    try {
      if (op === 'loadPrivileges') {
        if (!volunteerId) {
          setMsg('No volunteer selected.', true);
          return;
        }
        setMsg('Loading…', false);
        const res = await fetch(
          `${apiBase}/retreats/${encodeURIComponent(rid)}/volunteers/${encodeURIComponent(volunteerId)}/privileges`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        params.adminPrivVolunteerId = volunteerId;
        params.adminPrivStatusNote = (j.lines || []).join('\n');
        setMsg('', false);
        return load();
      }
      if (op === 'setPrivileges') {
        if (!volunteerId) {
          setMsg('No volunteer selected.', true);
          return;
        }
        const body = {};
        if (Object.prototype.hasOwnProperty.call(action.payload || {}, 'admin')) {
          body.admin = action.payload.admin === true;
        }
        if (Object.prototype.hasOwnProperty.call(action.payload || {}, 'manage')) {
          body.manage = action.payload.manage === true;
        }
        setMsg('Saving…', false);
        const res = await fetch(
          `${apiBase}/retreats/${encodeURIComponent(rid)}/volunteers/${encodeURIComponent(volunteerId)}/privileges`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        params.adminPrivVolunteerId = volunteerId;
        params.adminPrivStatusNote = (j.lines || []).join('\n');
        setMsg(j.message || 'Saved.', false);
        return load();
      }
      if (op === 'clearAssignments') {
        if (!action.payload?.confirmed) {
          setMsg('Confirm on the Admin screen first.', true);
          return;
        }
        setMsg('Clearing assignments…', false);
        const res = await fetch(
          `${apiBase}/retreats/${encodeURIComponent(rid)}/admin/clear-assignments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ confirm: 'CLEAR' }),
          },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        delete params.adminClearStep;
        setMsg(j.message || 'Assignments cleared.', false);
        return load();
      }
      if (op === 'reloadPosterData') {
        setMsg('Reloading jobs & instructions…', false);
        const res = await fetch(
          `${apiBase}/retreats/${encodeURIComponent(rid)}/admin/reload-poster-data`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
          },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setMsg(j.message || 'Poster data reloaded.', false);
        return load();
      }
      setMsg('Unknown action.', true);
    } catch (e) {
      console.error('volunteerAdminTools', e);
      setMsg(e.message || String(e), true);
    }
  }

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'navBack') {
      goBack();
      return Promise.resolve();
    }
    if (action.type === 'oboExit') {
      clearOboSession();
      applyNavigate({
        type: 'navigate',
        target: 'jewelheart.home',
        payload: { oboClear: '1', ...(retreatId ? { retreatId } : {}) },
      });
      return load();
    }
    if (action.type === 'navigate') {
      let navAction = action;
      if (navAction.payload?.oboConfirm) {
        const pickerId = navAction.payload.pickVolunteerFrom || 'oboPicker';
        const st = personPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        writeOboSession(st.selectedId, st.selectedName || '');
        const payload = { ...navAction.payload };
        payload.oboVolunteerId = st.selectedId;
        payload.oboVolunteerName = st.selectedName || '';
        delete payload.oboConfirm;
        delete payload.pickVolunteerFrom;
        navAction = { ...navAction, target: 'jewelheart.home', payload };
      } else if (navAction.payload?.jobFinderConfirm) {
        const pickerId = navAction.payload.pickJobFrom || 'jobFinderPicker';
        const st = jobPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a job from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload };
        payload.jobFinderJobId = st.selectedId;
        payload.jobFinderJobTitle = st.selectedName || '';
        delete payload.jobFinderConfirm;
        delete payload.pickJobFrom;
        delete payload.jobFinderDayIso;
        navAction = { ...navAction, payload };
      } else if (navAction.payload?.jobFinderAssignConfirm) {
        const pickerId = navAction.payload.pickVolunteerFrom || 'jobFinderAssignPicker';
        const st = personPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload };
        payload.jobFinderOp = 'assign';
        payload.jobFinderPickVolunteerId = st.selectedId;
        delete payload.jobFinderAssignConfirm;
        delete payload.pickVolunteerFrom;
        navAction = { ...navAction, payload };
      } else if (navAction.payload?.shiftEditConfirm) {
        const pickerId = navAction.payload.pickVolunteerFrom || 'shiftEditReassignPicker';
        const st = personPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload };
        payload.shiftEditOp = 'reassign';
        payload.pickVolunteerId = st.selectedId;
        payload.reassignedName = st.selectedName || '';
        delete payload.shiftEditConfirm;
        delete payload.pickVolunteerFrom;
        navAction = { ...navAction, payload };
      } else if (navAction.payload?.userManageConfirm) {
        const pickerId = navAction.payload.pickVolunteerFrom || 'userManagePicker';
        const st = personPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload };
        payload.userManageVolunteerId = st.selectedId;
        payload.userManageVolunteerName = st.selectedName || '';
        delete payload.userManageConfirm;
        delete payload.pickVolunteerFrom;
        delete payload.userManageStatusNote;
        navAction = { ...navAction, payload };
      } else if (navAction.payload?.adminPrivConfirm) {
        const pickerId = navAction.payload.pickVolunteerFrom || 'adminPrivPicker';
        const st = personPickerState.get(pickerId);
        if (!st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload };
        payload.adminPrivVolunteerId = st.selectedId;
        payload.adminPrivVolunteerName = st.selectedName || '';
        delete payload.adminPrivConfirm;
        delete payload.pickVolunteerFrom;
        delete payload.adminPrivStatusNote;
        navAction = { ...navAction, payload };
      } else if (navAction.payload?.pickVolunteerFrom) {
        const pickerId = navAction.payload.pickVolunteerFrom;
        const st = personPickerState.get(pickerId);
        if (navAction.payload.shiftEditOp === 'reassign' && !st?.selectedId) {
          setMsg('Select a person from the list first.', true);
          return Promise.resolve();
        }
        const payload = { ...navAction.payload, pickVolunteerId: st?.selectedId || '' };
        delete payload.pickVolunteerFrom;
        navAction = { ...navAction, payload };
      }
      // Preserve job-list scroll when toggling filters on Find open shifts.
      if (
        (navAction.target === 'jewelheart.volunteer.search' && screenId === 'jewelheart.volunteer.search') ||
        (navAction.target === 'jewelheart.volunteer.searchByType' && screenId === 'jewelheart.volunteer.searchByType') ||
        (navAction.target === 'jewelheart.volunteer.searchByDay' && screenId === 'jewelheart.volunteer.searchByDay')
      ) {
        if (navAction.payload?.scrollTop === '1') {
          pendingScrollTop = 0;
        } else {
          const scrollEl =
            rootEl.querySelector('.jh-sdui-day-shift-list') ||
            rootEl.querySelector('.jh-sdui-job-list-scroll') ||
            rootEl.querySelector('.jh-sdui-scroll');
          if (scrollEl) pendingScrollTop = scrollEl.scrollTop;
        }
      }
      const checkinWriteOp = navAction.payload?.checkinOp
        ? String(navAction.payload.checkinOp)
        : '';
      const isCheckinWrite =
        navAction.target === 'jewelheart.volunteer.checkin' &&
        ['start', 'finish', 'undo', 'done'].includes(checkinWriteOp);
      if (isCheckinWrite && rootEl.classList.contains('jh-sdui-checkin-busy')) {
        return Promise.resolve();
      }
      if (isCheckinWrite && ['start', 'finish', 'undo'].includes(checkinWriteOp)) {
        checkinManualState = null;
      }
      if (isCheckinWrite && checkinWriteOp === 'done') {
        const manual = checkinManualState?.startManualLock || checkinManualState?.endManualLock;
        if (manual) {
          if (!checkinManualState.startText || !checkinManualState.endText) {
            setMsg('Enter start and end times.', true);
            return Promise.resolve();
          }
          const v = validateCheckinClockPair(checkinManualState.startText, checkinManualState.endText);
          if (!v.ok) {
            setMsg(v.error, true);
            return Promise.resolve();
          }
          navAction = {
            ...navAction,
            payload: {
              ...navAction.payload,
              checkinManualStart: checkinManualState.startManualLock ? '1' : '',
              checkinManualEnd: checkinManualState.endManualLock ? '1' : '',
              checkinStartTime: checkinManualState.startText,
              checkinFinishTime: checkinManualState.endText,
            },
          };
        }
      }
      applyNavigate(navAction);
      return load();
    }
    if (action.type === 'adminWorkspace') {
      if (onAdminWorkspace) {
        onAdminWorkspace();
      } else {
        applyNavigate({
          type: 'navigate',
          target: 'jewelheart.volunteer.admin',
          payload: retreatId ? { retreatId } : {},
        });
        return load();
      }
      return Promise.resolve();
    }
    if (action.type === 'download') {
      return handleDownload(action);
    }
    if (action.type === 'openUrl' && action.target) {
      window.open(action.target, '_blank', 'noopener,noreferrer');
      return Promise.resolve();
    }
    if (action.type === 'patchVolunteer') {
      const mode = action.payload?.mode === 'prefs' ? 'prefs' : 'profile';
      return patchVolunteerProfile(mode, action.payload || {});
    }
    if (action.type === 'volunteerTesting') {
      return handleVolunteerTesting(action);
    }
    if (action.type === 'volunteerUserManage') {
      return handleVolunteerUserManage(action);
    }
    if (action.type === 'volunteerAdminTools') {
      return handleVolunteerAdminTools(action);
    }
  }

  function renderComponent(component) {
    const type = component.type || 'text';
    if (type === 'spacer') {
      const el = document.createElement('div');
      el.className = 'jh-sdui-spacer';
      el.style.height = `${component.style?.height?.value ?? 12}px`;
      return el;
    }

    if (type === 'instructionScroll') {
      const el = document.createElement('div');
      el.className = 'jh-sdui-instruction-scroll';
      if (component.style?.instructionScrollFlex) {
        el.classList.add('jh-sdui-instruction-flex');
      }
      const borderColor = component.style?.borderColor;
      if (borderColor) el.style.borderColor = borderColor;
      const maxH = component.style?.maxHeight?.value;
      if (maxH) el.style.maxHeight = `${maxH}px`;
      const minH = component.style?.minHeight?.value;
      if (minH) el.style.minHeight = `${minH}px`;
      if (component.style?.flexGrow) el.classList.add('jh-sdui-flex-grow');
      for (const child of component.children || []) {
        el.appendChild(renderComponent(child));
      }
      return el;
    }

    if (type === 'profileField') {
      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-profile-field';
      const lab = document.createElement('label');
      lab.className = 'jh-sdui-profile-label';
      lab.textContent = component.label || '';
      wrap.appendChild(lab);
      if (component.editable) {
        const input = document.createElement('input');
        input.type = component.fieldKey === 'email' ? 'email' : 'tel';
        input.className = 'jh-sdui-profile-input';
        input.placeholder = component.placeholder || '';
        input.dataset.profileField = component.fieldKey || '';
        input.value = component.value || '';
        wrap.appendChild(input);
      } else {
        const val = document.createElement('div');
        val.className = 'jh-sdui-profile-value';
        val.textContent = component.value || '—';
        wrap.appendChild(val);
      }
      return wrap;
    }

    if (type === 'profilePanel') {
      const panel = document.createElement('div');
      panel.className = 'jh-sdui-profile-panel';
      for (const child of component.children || []) {
        panel.appendChild(renderComponent(child));
      }
      return panel;
    }

    if (type === 'profileIntro') {
      const el = document.createElement('p');
      el.className = 'jh-sdui-profile-intro';
      el.textContent = component.content || '';
      return el;
    }

    if (type === 'testingPanel') {
      const panel = document.createElement('div');
      panel.className = 'jh-sdui-testing-panel';
      for (const child of component.children || []) {
        panel.appendChild(renderComponent(child));
      }
      return panel;
    }

    if (type === 'testingCheckbox') {
      const wrap = document.createElement('label');
      wrap.className = 'jh-sdui-testing-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = component.checked === true;
      input.dataset.testingField = component.fieldKey || '';
      const span = document.createElement('span');
      span.textContent = component.label || '';
      wrap.appendChild(input);
      wrap.appendChild(span);
      return wrap;
    }

    if (type === 'testingDateField') {
      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-testing-date-field';
      const lab = document.createElement('label');
      lab.className = 'jh-sdui-testing-date-label';
      lab.textContent = component.label || '';
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'jh-sdui-testing-date-input';
      input.value = component.value || '';
      input.dataset.testingField = component.fieldKey || '';
      lab.appendChild(input);
      wrap.appendChild(lab);
      return wrap;
    }

    if (type === 'prefCheckbox') {
      const wrap = document.createElement('label');
      wrap.className = 'jh-sdui-pref-checkbox';
      if (component.disabled) wrap.classList.add('jh-sdui-pref-checkbox-disabled');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = component.checked === true;
      input.disabled = component.disabled === true;
      input.dataset.prefField = component.fieldKey || '';
      if (!component.disabled) {
        input.addEventListener('change', () => {
          handleAction({
            type: 'patchVolunteer',
            payload: {
              mode: 'prefs',
              fieldKey: component.fieldKey,
              checked: input.checked,
            },
          });
        });
      }
      const span = document.createElement('span');
      span.textContent = component.label || '';
      wrap.appendChild(input);
      wrap.appendChild(span);
      return wrap;
    }

    if (type === 'personPicker') {
      const pickerId = component.id || 'personPicker';
      const disabled = component.disabled === true;
      const maxVisible = component.maxVisible ?? PERSON_PICKER_MAX;
      const excludeId = component.excludeVolunteerId ? String(component.excludeVolunteerId) : '';
      const localRoster = (component.roster || []).filter((r) => r && String(r.id) !== excludeId);

      if (!personPickerState.has(pickerId)) {
        personPickerState.set(pickerId, {
          selectedId: component.selectedId || '',
          selectedName: component.selectedName || '',
          query: component.selectedName || '',
          localRoster,
          apiResults: [],
          searchTimer: null,
          searchGen: 0,
        });
      }
      const st = personPickerState.get(pickerId);
      st.localRoster = localRoster;

      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-person-picker';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'jh-sdui-person-picker-input';
      input.placeholder = component.placeholder || 'Start typing a name here...';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.disabled = disabled;
      input.value = disabled ? st.selectedName || st.query : st.query;

      const status = document.createElement('p');
      status.className = 'jh-sdui-person-picker-status';

      const list = document.createElement('div');
      list.className = 'jh-sdui-person-picker-results';
      list.hidden = true;

      function normalizeVolunteerRows(items) {
        return (items || [])
          .map((row) => {
            const v = row.volunteer || row;
            const id = String(row.volunteerId || v.id || '');
            return {
              id,
              displayName: v.displayName || v.display_name || '',
              email: v.email || '',
            };
          })
          .filter((r) => r.id && r.displayName && r.id !== excludeId);
      }

      function paintResults(items, total, capped) {
        list.innerHTML = '';
        const selectedHint =
          component.selectedHint ||
          (pickerId === 'userManagePicker'
            ? 'Selected — tap Confirm'
            : 'Selected — tap Reassign to confirm');
        if (!items.length) {
          list.hidden = true;
          status.textContent = 'No matches — try another spelling.';
          return;
        }
        list.hidden = false;
        status.textContent = capped
          ? `Showing ${items.length} of ${total} — keep typing to narrow`
          : `${total} match(es) — tap one to select`;
        for (const row of items) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'jh-sdui-person-picker-item';
          btn.textContent = row.displayName;
          btn.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            st.selectedId = row.id;
            st.selectedName = row.displayName;
            input.value = st.selectedName;
            list.hidden = true;
            status.textContent = selectedHint;
          });
          list.appendChild(btn);
        }
      }

      async function runPersonSearch(q) {
        const gen = ++st.searchGen;
        try {
          const token = await getIdToken();
          const searchScope = component.searchScope || 'retreat+global';
          const pickerRetreatId = component.retreatId || retreatId || '';
          const body = {
            screenId: 'jewelheart.personSearch',
            params: {
              q,
              limit: 80,
              scope: searchScope,
              excludeVolunteerId: excludeId,
            },
          };
          if (pickerRetreatId) {
            body.retreatId = pickerRetreatId;
            body.params.retreatId = pickerRetreatId;
          }
          const res = await fetch(`${apiBase}/sdui/screen`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (gen !== st.searchGen) return;
          const meta = data?.screen?.metadata || {};
          st.apiResults = normalizeVolunteerRows(meta.personSearchResults || []);
          const merged = mergePersonRoster(st.localRoster, st.apiResults);
          const { items, total, capped } = filterPersonRoster(merged, q, maxVisible);
          paintResults(items, total, capped);
        } catch {
          if (gen !== st.searchGen) return;
          const { items, total, capped } = filterPersonRoster(st.localRoster, q, maxVisible);
          paintResults(items, total, capped);
        }
      }

      function mergePersonRoster(a, b) {
        const byId = new Map();
        for (const row of [...(a || []), ...(b || [])]) {
          if (row?.id) byId.set(String(row.id), row);
        }
        return [...byId.values()];
      }

      function renderMatches() {
        if (disabled) {
          list.hidden = true;
          status.textContent = '';
          return;
        }
        const q = input.value.trim();
        st.query = input.value;
        clearTimeout(st.searchTimer);
        if (!q) {
          st.selectedId = '';
          st.selectedName = '';
          st.apiResults = [];
          list.hidden = true;
          list.innerHTML = '';
          status.textContent = '';
          return;
        }
        const local = filterPersonRoster(st.localRoster, q, maxVisible);
        if (local.items.length) {
          paintResults(local.items, local.total, local.capped);
        } else {
          list.hidden = true;
          status.textContent = 'Searching…';
        }
        st.searchTimer = setTimeout(() => {
          runPersonSearch(q);
        }, 180);
      }

      input.addEventListener('input', () => {
        st.selectedId = '';
        st.selectedName = '';
        renderMatches();
      });
      input.addEventListener('focus', renderMatches);

      wrap.appendChild(input);
      wrap.appendChild(status);
      wrap.appendChild(list);
      return wrap;
    }

    if (type === 'jobPicker') {
      const pickerId = component.id || 'jobPicker';
      const disabled = component.disabled === true;
      const maxVisible = component.maxVisible ?? PERSON_PICKER_MAX;
      const localJobs = (component.jobs || []).map((j) => ({
        id: String(j.id),
        title: j.title || '',
      }));

      if (!jobPickerState.has(pickerId)) {
        jobPickerState.set(pickerId, {
          selectedId: component.selectedId || '',
          selectedName: component.selectedName || '',
          query: component.selectedName || '',
          localJobs,
        });
      }
      const st = jobPickerState.get(pickerId);
      st.localJobs = localJobs;

      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-person-picker jh-sdui-job-picker';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'jh-sdui-person-picker-input';
      input.placeholder = component.placeholder || 'Start typing a job name...';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.disabled = disabled;
      input.value = disabled ? st.selectedName || st.query : st.query;

      const status = document.createElement('p');
      status.className = 'jh-sdui-person-picker-status';

      const list = document.createElement('div');
      list.className = 'jh-sdui-person-picker-results';
      list.hidden = true;

      function paintJobResults(items, total, capped) {
        list.innerHTML = '';
        const selectedHint = component.selectedHint || 'Selected — tap Confirm';
        if (!items.length) {
          list.hidden = true;
          status.textContent = 'No matches — try another spelling.';
          return;
        }
        list.hidden = false;
        status.textContent = capped
          ? `Showing ${items.length} of ${total} — keep typing to narrow`
          : `${total} match(es) — tap one to select`;
        for (const row of items) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'jh-sdui-person-picker-item';
          btn.textContent = row.title;
          btn.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            st.selectedId = row.id;
            st.selectedName = row.title;
            input.value = st.selectedName;
            list.hidden = true;
            status.textContent = selectedHint;
          });
          list.appendChild(btn);
        }
      }

      function renderJobMatches() {
        if (disabled) {
          list.hidden = true;
          status.textContent = '';
          return;
        }
        const q = input.value.trim();
        st.query = input.value;
        if (!q) {
          st.selectedId = '';
          st.selectedName = '';
          list.hidden = true;
          list.innerHTML = '';
          status.textContent = '';
          return;
        }
        const { items, total, capped } = filterJobList(st.localJobs, q, maxVisible);
        paintJobResults(items, total, capped);
      }

      input.addEventListener('input', () => {
        st.selectedId = '';
        st.selectedName = '';
        renderJobMatches();
      });
      input.addEventListener('focus', renderJobMatches);

      wrap.appendChild(input);
      wrap.appendChild(status);
      wrap.appendChild(list);
      return wrap;
    }

    if (type === 'jobListScroll') {
      const el = document.createElement('div');
      el.className = 'jh-sdui-job-list-scroll';
      const borderColor = component.style?.borderColor;
      if (borderColor) el.style.borderColor = borderColor;
      if (component.style?.flexGrow) el.classList.add('jh-sdui-flex-grow');
      for (const child of component.children || []) {
        el.appendChild(renderComponent(child));
      }
      return el;
    }

    if (type === 'todayShiftScroll') {
      const el = document.createElement('div');
      el.className = 'jh-sdui-today-shift-scroll';
      if (component.style?.flexGrow) el.classList.add('jh-sdui-flex-grow');
      const borderColor = component.style?.borderColor;
      if (borderColor) el.style.borderColor = borderColor;
      const minH = component.style?.minHeight?.value;
      if (minH) el.style.minHeight = `${minH}px`;
      for (const child of component.children || []) {
        el.appendChild(renderComponent(child));
      }
      return el;
    }

    if (type === 'container') {
      const layout = component.layout || 'column';
      const el = document.createElement('div');
      const isFlowRow = layout === 'flowRow' || component.style?.wrapChildren === true;
      el.className =
        isFlowRow
          ? 'jh-sdui-container jh-sdui-flow-row'
          : layout === 'row'
            ? 'jh-sdui-container jh-sdui-row'
            : 'jh-sdui-container jh-sdui-column';
      if (component.style?.typeFilterRow) el.classList.add('jh-sdui-type-filter-row');
      if (component.style?.typeFilterRowSpread) el.classList.add('jh-sdui-type-filter-row-spread');
      if (component.style?.homeFindShiftRow) el.classList.add('jh-sdui-home-find-row');
      if (component.style?.jobListFrame) {
        el.classList.add('jh-sdui-job-list-scroll');
        const borderColor = component.style?.borderColor;
        if (borderColor) el.style.borderColor = borderColor;
      }
      if (component.style?.manageCheckinsScroll) {
        el.classList.add('jh-sdui-manage-checkins-scroll');
        const borderColor = component.style?.borderColor;
        if (borderColor) el.style.borderColor = borderColor;
      }
      if (component.style?.dayShiftListFrame) {
        el.classList.add('jh-sdui-day-shift-list');
      }
      if (component.style?.instructionFlexWrap) {
        el.classList.add('jh-sdui-instruction-flex-wrap');
      }
      if (component.style?.shiftAssignBody) {
        el.classList.add('jh-sdui-shift-assign-body');
      }
      if (component.style?.searchByDayBody) {
        el.classList.add('jh-sdui-search-by-day-body');
      }
      if (component.style?.todayShiftPanelInHeader) {
        el.classList.add('jh-sdui-today-shift-panel-header');
      }
      if (component.style?.noWrap) el.classList.add('jh-sdui-row-nowrap');
      if (component.style?.flexGrow) el.classList.add('jh-sdui-flex-grow');
      const spacing = component.spacing ?? 16;
      el.style.gap = `${spacing}px`;

      const align = (component.textStyle?.textAlign || '').toLowerCase();
      if (layout === 'row' || isFlowRow) {
        const rowLeft = align === 'left' || align === 'start';
        if (!isFlowRow) {
          el.style.justifyContent = rowLeft ? 'flex-start' : 'center';
        }
        if (component.style?.equalWidthChildren) {
          el.classList.add('jh-sdui-equal-row');
        } else if (!rowLeft && !isFlowRow) {
          el.classList.add('jh-sdui-row-centered');
        }
      } else {
        el.style.alignItems =
          align === 'center' ? 'center' : align === 'right' || align === 'trailing' ? 'flex-end' : 'stretch';
        if (align === 'center') el.classList.add('jh-sdui-column-centered');
      }

      const bg = component.style?.backgroundColor;
      if (bg || component.style?.jobListFrame || component.style?.dayShiftListFrame) {
        const pad = padFromStyle(component.style);
        el.style.padding = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
      }
      if (bg) {
        el.style.backgroundColor = bg;
      }
      if (component.style?.flexGrow) {
        el.classList.add('jh-sdui-flex-grow');
      }

      let navChildren = component.children || [];
      for (const child of navChildren) {
        const childEl = renderComponent(child);
        if (component.style?.equalWidthChildren || child.style?.flexGrow) {
          childEl.classList.add('jh-sdui-flex-child');
        }
        el.appendChild(childEl);
      }
      return el;
    }

    if (type === 'card') {
      const el = document.createElement('div');
      el.className = 'jh-sdui-card';
      for (const child of component.children || []) {
        el.appendChild(renderComponent(child));
      }
      return el;
    }

    const label = component.label ?? component.content ?? '';
    const textStyle = component.textStyle || {};
    const style = component.style || {};
    const multiline = style.multiline === true || String(label).includes('\n');
    const isButton = type === 'button';
    const isNavIcon = style.navIcon === true || component.icon === 'nav_back' || component.icon === 'nav_home';
    const isTappableBar =
      type === 'text' && !!component.action && !!style.backgroundColor && style.borderRadius == null;
    const isBar =
      !isButton &&
      (style.fullBleed || (!!style.backgroundColor && !!style.height?.value) || isTappableBar);
    const el = document.createElement(isButton ? 'button' : 'div');
    el.className = isButton ? 'jh-sdui-btn' : 'jh-sdui-text';
    if (isButton && isNavIcon) {
      el.classList.add('jh-sdui-nav-icon');
      if (style.navBackText) el.classList.add('jh-sdui-nav-back-text');
      if (component.icon === 'nav_back' && (style.navBackText || (label && label !== '←'))) {
        el.textContent = label;
      } else if (component.icon === 'nav_back') el.textContent = '←';
      else if (component.icon === 'nav_home') el.textContent = '⌂';
      else el.textContent = label;
    } else {
      el.textContent = label;
    }

    if (isButton) el.type = 'button';

    const fg = textStyle.color || (isButton ? '#FFFFFF' : 'inherit');
    el.style.color = fg;
    el.style.fontSize = `${textStyle.fontSize ?? 16}px`;
    el.style.fontWeight = textStyle.fontWeight === 'bold' ? '700' : textStyle.fontWeight === 'semibold' ? '600' : '400';
    el.style.textAlign = textStyle.textAlign || (style.parentCentered ? 'center' : 'left');

    const bg = style.backgroundColor;
    if (bg) {
      el.style.backgroundColor = bg;
      const pad = padFromStyle(style);
      if (style.homeActionPill) {
        const isGold = /^#ffca10$/i.test(String(bg));
        const minSide = isGold ? 14 : 12;
        pad.left = Math.max(pad.left, minSide);
        pad.right = Math.max(pad.right, minSide);
      }
      el.style.padding = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
    }

    if (style.borderRadius != null) {
      el.style.borderRadius = `${style.borderRadius}px`;
    } else if (isButton) {
      el.style.borderRadius = '16px';
    }

    const h = style.height?.value;
    if (h) {
      el.style.minHeight = `${h}px`;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = el.style.textAlign === 'center' ? 'center' : 'flex-start';
    }

    const w = style.width?.value;
    if (w) el.style.width = `${w}px`;

    if (isButton) {
      el.classList.add('jh-sdui-pill');
      if (style.buttonVariant === 'raised' || bg) {
        el.classList.add('jh-sdui-raised');
      }
      if (style.homeActionPill) {
        el.classList.add('jh-sdui-home-action-pill');
        el.style.display = 'inline-flex';
        el.style.width = 'auto';
        el.style.maxWidth = 'calc(100% - 12px)';
        el.style.alignSelf = 'center';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        if (style.homeActionPillFullWidth) {
          el.classList.add('jh-sdui-gold-full-width');
          el.style.width = '100%';
          el.style.maxWidth = '100%';
        }
      }
      if (style.homeFindAllAtOnce) el.classList.add('jh-sdui-find-all-at-once');
      if (multiline && !style.homeActionPill) {
        el.classList.add('jh-sdui-multiline-pill');
        el.style.whiteSpace = 'pre-line';
      }
    } else if (isBar) {
      el.classList.add('jh-sdui-bar');
      if (style.homeActionPill) {
        el.classList.add('jh-sdui-home-action-pill');
        el.classList.add('jh-sdui-raised');
        el.style.width = 'auto';
        el.style.maxWidth = 'calc(100% - 12px)';
        el.style.alignSelf = 'center';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        if (style.homeActionPillFullWidth) {
          el.classList.add('jh-sdui-gold-full-width');
          el.style.width = '100%';
          el.style.maxWidth = '100%';
        }
      }
      if (style.instructionBarBleed) el.classList.add('jh-sdui-instruction-bar-bleed');
      if (style.barWrap) {
        el.classList.add('jh-sdui-bar-wrap');
        el.style.whiteSpace = 'normal';
        el.style.overflowWrap = 'break-word';
        el.style.wordBreak = 'normal';
        el.style.textAlign = textStyle.textAlign || 'center';
      }
    } else if (style.parentCentered || textStyle.textAlign === 'center') {
      el.classList.add('jh-sdui-label-centered');
    }

    if (style.homeBuildStamp) el.classList.add('jh-sdui-home-build-stamp');
    if (style.openShiftJobGroupGap) el.classList.add('jh-sdui-open-shift-job-group-gap');

    if (style.flexGrow) el.classList.add('jh-sdui-flex-child');

    if (style.checkinTimeBox) {
      el.classList.add('jh-sdui-checkin-time-box');
      el.dataset.checkinTimeBox = String(style.checkinTimeBox);
    }

    if (component.action) {
      attachAction(el, component.action);
    } else if (isButton) {
      el.disabled = true;
      el.style.cursor = 'default';
      el.style.opacity = '0.92';
    }

    if (style.earlyAlertPreviewPill) {
      el.classList.add('jh-sdui-early-alert-preview-pill');
      el.style.opacity = '1';
      el.style.cursor = 'not-allowed';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        el.classList.remove('jh-sdui-shake-once');
        void el.offsetWidth;
        el.classList.add('jh-sdui-shake-once');
      });
    }

    if (isButton && style.parentCentered) {
      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-center-wrap';
      if (style.homeActionPillFullWidth) wrap.classList.add('jh-sdui-center-wrap-full');
      wrap.appendChild(el);
      return wrap;
    }

    return el;
  }

  function formatLayoutWarnings(warnings) {
    if (!warnings?.length) return '';
    const n = warnings.length;
    const codes = warnings.map((w) => String(w).split(':')[0]).join(', ');
    return `${n} line${n === 1 ? '' : 's'} shortened (${codes})`;
  }

  function updateBuildStamp(apiStamp, screen) {
    if (!buildStampEl) return;
    const isJewelheart = String(screen?.id || '').startsWith('jewelheart.');
    if (isJewelheart) {
      buildStampEl.hidden = false;
      buildStampEl.textContent = formatBuildStampLine(JH_LOGIN_WEB_BUILD, apiStamp);
      return;
    }
    const showWarnings = screen?.metadata?.layoutWarningsBelowBuildStamp === true;
    const warn = showWarnings ? formatLayoutWarnings(screen.metadata?.layoutWarnings) : '';
    if (!warn) {
      buildStampEl.textContent = '';
      buildStampEl.hidden = true;
      return;
    }
    buildStampEl.hidden = false;
    buildStampEl.textContent = warn;
  }

  function syncInstructionScrollAffordance(scopeEl) {
    const wrap = scopeEl.querySelector('.jh-sdui-instruction-flex-wrap');
    const scrollEl = wrap?.querySelector('.jh-sdui-instruction-scroll');
    if (!wrap || !scrollEl) return;
    const update = () => {
      const overflows = scrollEl.scrollHeight > scrollEl.clientHeight + 2;
      scrollEl.classList.toggle('jh-sdui-instruction-overflow', overflows);
      scrollEl.classList.toggle('jh-sdui-instruction-fits', !overflows);
      wrap.classList.toggle('jh-sdui-instruction-wrap-overflow', overflows);
      wrap.classList.toggle('jh-sdui-instruction-wrap-fits', !overflows);
    };
    update();
    requestAnimationFrame(update);
    if (scrollEl.dataset.affordanceBound === '1') return;
    scrollEl.dataset.affordanceBound = '1';
    scrollEl.addEventListener('scroll', update, { passive: true });
    if (!scopeEl.dataset.instructionResizeBound) {
      scopeEl.dataset.instructionResizeBound = '1';
      window.addEventListener('resize', () => syncInstructionScrollAffordance(scopeEl), { passive: true });
    }
  }

  function volunteerElementVisibleHeight(el) {
    if (!el) return 0;
    const h = el.getBoundingClientRect?.().height;
    if (h && h > 0) return Math.ceil(h);
    return el.offsetHeight || el.clientHeight || 0;
  }

  /** Natural stacked height for compact-vs-fill decision (not flex-expanded). */
  function volunteerStickyNaturalHeight(header, middle, footer) {
    return (header?.offsetHeight || 0) + (middle?.scrollHeight || 0) + (footer?.offsetHeight || 0);
  }

  /** Max scroll-pane height: pane top → shell bottom minus footer + stamp. */
  function volunteerStickyMiddleBudget(header, middle, scrollPane, footer, main) {
    if (!middle) return 0;
    const shell = main?.closest('.jh-volunteer-shell');
    const shellRect = shell?.getBoundingClientRect();
    if (!shellRect) return 0;
    const stampEl = main?.querySelector('.jh-vol-screen-footer');
    const stampH = stampEl?.offsetHeight || 0;
    const footerH = footer?.offsetHeight || 0;
    const pad = 4;
    const ceilingTop = shellRect.bottom - stampH - footerH - pad;
    let floorTop;
    if (scrollPane && header?.contains(scrollPane)) {
      floorTop = scrollPane.getBoundingClientRect().top;
    } else if (scrollPane) {
      const middleTop = middle.getBoundingClientRect().top;
      floorTop = middleTop + scrollPane.offsetTop;
    } else if (header) {
      floorTop = header.getBoundingClientRect().bottom;
    } else {
      floorTop = middle.getBoundingClientRect().top;
    }
    return Math.max(0, Math.floor(ceilingTop - floorTop));
  }

  /** Safari flex often reports scrollHeight 0 on overflow:visible panes — measure content. */
  function volunteerScrollContentHeight(el) {
    if (!el) return 0;
    const rawScroll = el.scrollHeight || 0;
    if (rawScroll > 1) return rawScroll;
    let childSum = 0;
    for (const child of el.children) {
      const h = child.offsetHeight || Math.ceil(child.getBoundingClientRect().height) || 0;
      childSum += h;
    }
    if (childSum > 0) {
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
        + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      return Math.ceil(childSum + pad);
    }
    return Math.max(
      Math.ceil(el.getBoundingClientRect().height) || 0,
      el.offsetHeight || 0,
      rawScroll,
    );
  }

  /** Stacked T + chrome + list + B using scroll metrics (Safari-safe vs middle.scrollHeight). */
  function volunteerStickyStackHeight(header, middle, scrollPane, footer) {
    const headerH = header?.offsetHeight || 0;
    const footerH = footer?.offsetHeight || 0;
    if (scrollPane && header?.contains(scrollPane)) {
      return headerH + footerH;
    }
    if (scrollPane && middle?.contains(scrollPane)) {
      const listH = volunteerScrollContentHeight(scrollPane);
      const fromMiddle = Math.max(0, (middle.scrollHeight || 0) - scrollPane.offsetTop);
      return headerH + scrollPane.offsetTop + Math.max(listH, fromMiddle) + footerH;
    }
    return headerH + volunteerScrollContentHeight(middle) + footerH;
  }

  /** Vertical budget: shell bottom − root top (fallback when footer not laid out yet). */
  function volunteerRootBudget(rootEl, main) {
    if (!rootEl) return 0;
    const shell = rootEl.closest('.jh-volunteer-shell');
    if (!shell) return 0;
    const stampH = main?.querySelector('.jh-vol-screen-footer')?.offsetHeight || 0;
    const msgEl = main?.querySelector('#sdui-msg');
    const msgH = msgEl && !msgEl.hidden && msgEl.textContent?.trim() ? msgEl.offsetHeight : 0;
    const pad = 4;
    const shellRect = shell.getBoundingClientRect();
    const rootTop = rootEl.getBoundingClientRect().top;
    return Math.max(0, Math.floor(shellRect.bottom - rootTop - stampH - msgH - pad));
  }

  function volunteerSectionBudget(section, main) {
    const root = section?.querySelector('.jh-sdui-root');
    if (root) return volunteerRootBudget(root, main);
    if (!section) return 0;
    const shellFooter = main?.querySelector('.jh-vol-screen-footer');
    const stampH = shellFooter?.offsetHeight || 0;
    const msgEl = section.querySelector('#sdui-msg');
    const msgH = msgEl && !msgEl.hidden && msgEl.textContent?.trim() ? msgEl.offsetHeight : 0;
    const pad = 4;
    if (main?.clientHeight > 0) {
      const mainRect = main.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      return Math.max(0, Math.floor(mainRect.bottom - sectionRect.top - stampH - msgH - pad));
    }
    const vv = window.visualViewport;
    const top = section.getBoundingClientRect().top;
    const vh = vv?.height || window.innerHeight;
    return Math.max(0, Math.floor(vh - top - stampH - msgH - pad));
  }

  function isIosSafariBrowser() {
    return detectVolunteerIosSafari();
  }

  /** Clear inline viewport sizing; sync Safari tab-bar inset (no layout re-entry). */
  function syncVolunteerShellViewport() {
    const shell = document.querySelector('.jh-volunteer-shell');
    if (!shell || !document.body.classList.contains('jh-volunteer-clean')) return;
    ensureVolunteerIosHtmlClasses();
    shell.style.maxHeight = '';
    shell.style.height = '';
    shell.style.minHeight = '';
    document.body.style.height = '';
    document.body.style.maxHeight = '';
    document.body.style.minHeight = '';
    if (isIosSafariBrowser() && typeof window.jhSyncSafariVvTop === 'function') {
      window.jhSyncSafariVvTop();
    }
  }

  function volunteerScrollPaneFixedHeight(middle, scrollPane) {
    if (!middle || !scrollPane) return 0;
    const paneLayoutH = scrollPane.clientHeight || volunteerElementVisibleHeight(scrollPane);
    return Math.max(0, middle.scrollHeight - paneLayoutH);
  }

  function volunteerStickyScrollPane(rootEl, middle) {
    const header = rootEl?.querySelector(':scope > .jh-sdui-header');
    const paneSelector =
      '.jh-sdui-today-shift-scroll, .jh-sdui-day-shift-list, .jh-sdui-job-list-scroll, .jh-sdui-manage-checkins-scroll, .jh-sdui-instruction-scroll.jh-sdui-instruction-flex, .jh-sdui-instruction-scroll';
    return (
      middle?.querySelector(paneSelector) ||
      header?.querySelector(paneSelector) ||
      null
    );
  }

  function syncVolunteerInstructionAffordance(rootEl) {
    for (const scrollEl of rootEl.querySelectorAll('.jh-sdui-instruction-scroll')) {
      scrollEl.classList.remove('jh-sdui-instruction-capped');
      scrollEl.style.maxHeight = '';
      scrollEl.style.overflowY = '';
    }
    if (
      rootEl.classList.contains('jh-sdui-shift-assign') ||
      rootEl.querySelector('.jh-sdui-instruction-flex-wrap') ||
      rootEl.querySelector('.jh-sdui-instruction-scroll')
    ) {
      syncInstructionScrollAffordance(rootEl);
    }
  }

  function capInstructionScrolls(rootEl, maxPx) {
    if (!maxPx || maxPx < MIN_SCROLL_PANE_PX) return;
    for (const scrollEl of rootEl.querySelectorAll('.jh-sdui-instruction-scroll')) {
      if (scrollEl.scrollHeight <= maxPx + 1) continue;
      scrollEl.style.maxHeight = `${maxPx}px`;
      scrollEl.style.overflowY = 'auto';
      scrollEl.style.webkitOverflowScrolling = 'touch';
      scrollEl.classList.add('jh-sdui-instruction-capped');
    }
  }

  function clearVolunteerStickyInline(rootEl, middle, scrollPane) {
    if (rootEl) {
      rootEl.style.maxHeight = '';
      rootEl.style.overflow = '';
    }
    if (middle) {
      middle.style.maxHeight = '';
      middle.style.height = '';
      middle.style.overflowY = '';
    }
    if (scrollPane) {
      scrollPane.style.removeProperty('max-height');
      scrollPane.style.removeProperty('overflow-y');
      scrollPane.style.height = '';
      scrollPane.classList.remove('jh-sdui-vol-scroll-capped');
    }
    for (const pane of rootEl.querySelectorAll(
      '.jh-sdui-today-shift-scroll, .jh-sdui-day-shift-list, .jh-sdui-job-list-scroll, .jh-sdui-manage-checkins-scroll, .jh-sdui-instruction-scroll',
    )) {
      pane.style.removeProperty('max-height');
      pane.style.removeProperty('overflow-y');
      pane.style.height = '';
      pane.classList.remove('jh-sdui-vol-scroll-capped');
    }
    if (middle) {
      middle.classList.remove('jh-sdui-vol-scroll-capped');
    }
    for (const wrap of rootEl.querySelectorAll('.jh-sdui-instruction-flex-wrap')) {
      wrap.style.maxHeight = '';
      wrap.style.height = '';
    }
  }

  const MIN_SCROLL_PANE_PX = 56;
  let volunteerStickyLayoutBound = false;

  /** Content-sized card; footer snuggles below. Inner scroll only when a pane overflows. */
  function syncVolunteerStickyLayout(rootEl) {
    if (!rootEl?.classList.contains('jh-sdui-sticky-footer')) return;

    const section = rootEl.closest('#volunteer-sdui-section');
    const main = rootEl.closest('main');
    const header = rootEl.querySelector(':scope > .jh-sdui-header');
    const middle = rootEl.querySelector(
      ':scope > .jh-sdui-home-middle, :scope > .jh-sdui-shift-assign-scroll, :scope > .jh-sdui-search-by-day-scroll, :scope > .jh-sdui-scroll',
    );
    const footer = rootEl.querySelector(':scope > .jh-sdui-footer');
    if (!section || !footer || !middle) return;

    const scrollPane = volunteerStickyScrollPane(rootEl, middle);

    const apply = () => {
      ensureVolunteerIosHtmlClasses();
      const scrollTarget = scrollPane || middle;
      const rootBudget = volunteerRootBudget(rootEl, main);
      const stackedH = volunteerStickyStackHeight(header, middle, scrollPane, footer);
      const listContentH = volunteerScrollContentHeight(scrollTarget);
      const shell = main?.closest('.jh-volunteer-shell');
      const shellRect = shell?.getBoundingClientRect();
      const stampH = main?.querySelector('.jh-vol-screen-footer')?.offsetHeight || 0;
      const footerRect = footer.getBoundingClientRect();
      const footerOverShell = !!(shellRect && footerRect.bottom > shellRect.bottom - stampH - 2);
      const overflowsRoot = stackedH > rootBudget + 2 || footerOverShell;

      let paneBudget = volunteerStickyMiddleBudget(header, middle, scrollPane, footer, main);
      if (paneBudget < MIN_SCROLL_PANE_PX && overflowsRoot) {
        const headerH = header?.offsetHeight || 0;
        const aboveList = scrollPane && header?.contains(scrollPane)
          ? scrollPane.getBoundingClientRect().top - (header?.getBoundingClientRect().top || 0)
          : scrollPane ? scrollPane.offsetTop : 0;
        paneBudget = Math.max(
          MIN_SCROLL_PANE_PX,
          rootBudget - (footer.offsetHeight || 0) - headerH - aboveList - 4,
        );
      }

      const listOverflows = paneBudget >= MIN_SCROLL_PANE_PX
        && listContentH > paneBudget + 1;
      const needsCap = listOverflows || overflowsRoot;

      if (needsCap) {
        rootEl.classList.remove('jh-sdui-layout-compact');
        rootEl.classList.add('jh-sdui-layout-fill');
        rootEl.style.maxHeight = '';
        rootEl.style.overflow = 'hidden';

        const capPx = Math.max(MIN_SCROLL_PANE_PX, paneBudget);
        scrollTarget.style.setProperty('max-height', `${capPx}px`, 'important');
        scrollTarget.style.setProperty('overflow-y', 'auto', 'important');
        scrollTarget.style.webkitOverflowScrolling = 'touch';
        scrollTarget.classList.add('jh-sdui-vol-scroll-capped');
        if (!scrollPane) {
          capInstructionScrolls(rootEl, capPx);
        }
      } else {
        clearVolunteerStickyInline(rootEl, middle, scrollPane);
        if (middle) middle.scrollTop = 0;
        rootEl.classList.remove('jh-sdui-layout-fill');
        rootEl.classList.add('jh-sdui-layout-compact');
        rootEl.style.maxHeight = '';
        rootEl.style.overflow = '';
      }

      syncVolunteerInstructionAffordance(rootEl);

      volunteerLayoutDebugReport({
        paneBudget,
        listScrollH: scrollTarget.scrollHeight,
        listContentH,
        stackedH,
        rootBudget,
        needsCap,
        listOverflows,
        overflowsRoot,
        footerOverShell,
        capPx: needsCap ? Math.max(MIN_SCROLL_PANE_PX, paneBudget) : null,
      });
    };

    apply();
    requestAnimationFrame(apply);
    requestAnimationFrame(() => requestAnimationFrame(apply));

    if (!rootEl._jhStickyLayoutRo) {
      rootEl._jhStickyLayoutRo = new ResizeObserver(() => {
        if (rootEl._jhStickyLayoutRaf) return;
        rootEl._jhStickyLayoutRaf = requestAnimationFrame(() => {
          rootEl._jhStickyLayoutRaf = 0;
          apply();
        });
      });
    }
    const ro = rootEl._jhStickyLayoutRo;
    for (const el of rootEl._jhStickyLayoutObserved || []) {
      try { ro.unobserve(el); } catch (_) { /* ignore */ }
    }
    const observed = [section, middle, footer];
    if (scrollPane) observed.push(scrollPane);
    if (header) observed.push(header);
    for (const el of observed) ro.observe(el);
    rootEl._jhStickyLayoutObserved = observed;

    if (!volunteerStickyLayoutBound) {
      volunteerStickyLayoutBound = true;
      window.__jhVolunteerSyncStickyLayout = syncVolunteerStickyLayout;
      window.addEventListener('resize', () => {
        if (typeof window.jhSyncSafariVvTopDebounced === 'function') {
          window.jhSyncSafariVvTopDebounced();
        } else {
          syncVolunteerShellViewport();
        }
        const active = document.querySelector('#volunteer-sdui-section .jh-sdui-sticky-footer');
        if (active) syncVolunteerStickyLayout(active);
      }, { passive: true });
      window.visualViewport?.addEventListener('resize', () => {
        if (typeof window.jhSyncSafariVvTopDebounced === 'function') {
          window.jhSyncSafariVvTopDebounced();
        } else {
          syncVolunteerShellViewport();
        }
        const active = document.querySelector('#volunteer-sdui-section .jh-sdui-sticky-footer');
        if (active) syncVolunteerStickyLayout(active);
      }, { passive: true });
    }
  }

  function syncPlatformClasses() {
    const ua = navigator.userAgent || '';
    const touchMac = navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '');
    const ios = /iPad|iPhone|iPod/.test(ua) || touchMac;
    const iosChrome = /CriOS/.test(ua);
    const iosSafari = ios && !iosChrome && !/FxiOS|EdgiOS/.test(ua);
    ensureVolunteerIosHtmlClasses();
    document.documentElement.classList.toggle('jh-html-ios-safari', iosSafari);
    document.body.classList.toggle('jh-vol-ios-safari', iosSafari);
    document.body.classList.toggle('jh-vol-ios-chrome', iosChrome);
    rootEl.classList.toggle('jh-sdui-ios-safari', iosSafari);
    rootEl.classList.toggle('jh-sdui-ios-chrome', iosChrome);
    syncVolunteerShellViewport();
  }

  function renderScreen(envelope) {
    const screen = envelope?.screen || envelope;
    if (screen.id) screenId = screen.id;
    volunteerLayoutDebugReport({
      screenId: screen.id || screenId,
      apiStamp: screen.metadata?.buildStamp || '',
    });
    clearActionStore();
    personPickerState.clear();
    jobPickerState.clear();
    rootEl.innerHTML = '';
    rootEl.dataset.screenId = screen.id || screenId;

    const isHome = screen.id === 'jewelheart.home';
    const homeSplit = screen.metadata?.homeSplitLayout === true;
    const shiftAssignFlex = screen.metadata?.shiftAssignFlexLayout === true;
    const searchByDayFlex = screen.metadata?.searchByDayFlexLayout === true;
    const searchByTypeFlex = screen.metadata?.searchByTypeFlexLayout === true;
    const manageCheckinsFlex = screen.metadata?.manageCheckinsFlexLayout === true;
    const findOpenFlex = searchByDayFlex || searchByTypeFlex || manageCheckinsFlex;
    const stickyFooter = screen.metadata?.stickyFooter === true;
    const stickyHeader = screen.metadata?.stickyHeader === true;
    rootEl.classList.toggle('jh-sdui-home', isHome);
    rootEl.classList.toggle('jh-sdui-home-split', homeSplit);
    rootEl.classList.toggle('jh-sdui-sticky-footer', stickyFooter);
    rootEl.classList.toggle('jh-sdui-shift-assign', shiftAssignFlex);
    rootEl.classList.toggle('jh-sdui-search-by-day', findOpenFlex);
    const layoutFlat = screen.metadata?.layoutFlat === true;
    rootEl.classList.toggle('jh-sdui-home-flat', homeSplit && layoutFlat);
    rootEl.classList.toggle('jh-sdui-sticky-header', (stickyHeader || homeSplit) && !layoutFlat);
    syncPlatformClasses();

    if (titleEl) titleEl.textContent = screen.title || 'JewelHeart';
    profileVolunteerMeta = screen.metadata?.volunteerProfile || null;
    updateBuildStamp(screen.metadata?.buildStamp, screen);
    syncShiftEditStateFromMetadata(screen);
    if (onScreenChange) onScreenChange(screen);

    if (backBtn) {
      backBtn.hidden = screenId === 'jewelheart.home' || history.length === 0;
    }

    if (stickyHeader) {
      const header = document.createElement('div');
      header.className = 'jh-sdui-header';
      for (const c of screen.metadata?.stickyHeaderComponents || []) {
        header.appendChild(renderComponent(c));
      }
      rootEl.appendChild(header);
    }

    const wrap = document.createElement('div');
    if (homeSplit) {
      wrap.className = layoutFlat ? 'jh-sdui-home-middle jh-sdui-home-flat-scroll' : 'jh-sdui-home-middle';
    } else if (shiftAssignFlex && layoutFlat) {
      wrap.className = 'jh-sdui-scroll jh-sdui-shift-assign-scroll';
    } else if (findOpenFlex && layoutFlat) {
      wrap.className = 'jh-sdui-scroll jh-sdui-search-by-day-scroll';
    } else {
      wrap.className = stickyFooter || stickyHeader ? 'jh-sdui-scroll' : 'jh-sdui-stack';
    }
    for (const c of screen.components || []) {
      wrap.appendChild(renderComponent(c));
    }
    rootEl.appendChild(wrap);

    if (stickyFooter) {
      const footer = document.createElement('div');
      footer.className = 'jh-sdui-footer';
      for (const c of screen.metadata?.stickyFooterComponents || []) {
        footer.appendChild(renderComponent(c));
      }
      rootEl.appendChild(footer);
    }

    if (pendingScrollTop != null && (
      screen.id === 'jewelheart.volunteer.search' ||
      screen.id === 'jewelheart.volunteer.searchByType' ||
      screen.id === 'jewelheart.volunteer.searchByDay'
    )) {
      const top = pendingScrollTop;
      pendingScrollTop = null;
      requestAnimationFrame(() => {
        const scrollEl =
          rootEl.querySelector('.jh-sdui-day-shift-list') ||
          rootEl.querySelector('.jh-sdui-job-list-scroll') ||
          rootEl.querySelector('.jh-sdui-scroll');
        if (scrollEl) scrollEl.scrollTop = top;
      });
    }

    if (stickyFooter) {
      syncVolunteerStickyLayout(rootEl);
    }

    wireCheckinManualTimes();

    if (isIosSafariBrowser() && typeof window.jhSyncSafariVvTop === 'function') {
      window.jhSyncSafariVvTop();
      requestAnimationFrame(() => {
        window.jhSyncSafariVvTop();
        if (stickyFooter) {
          syncVolunteerStickyLayout(rootEl);
          requestAnimationFrame(() => syncVolunteerStickyLayout(rootEl));
        }
      });
    }
  }

  async function maybeReloadStaleClientForHome(signal) {
    const local = JH_LOGIN_WEB_BUILD;
    if (!local || local === 'pending-deploy') return false;

    let minWebBuild = '';
    try {
      const res = await fetch(`${apiBase}/volunteer/time-context`, { signal });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        minWebBuild = String(data.minWebBuild || data.apiBuildStamp || '').trim();
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      return false;
    }

    if (!minWebBuild || minWebBuild === 'pending-deploy') return false;

    if (compareDeployStamps(local, minWebBuild) >= 0) {
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('jh_client_reload_for:')) sessionStorage.removeItem(key);
        }
      } catch {
        /* ignore */
      }
      return false;
    }

    const guardKey = `jh_client_reload_for:${minWebBuild}`;
    try {
      if (sessionStorage.getItem(guardKey) === '1') {
        console.warn('[jewelheart] stale web build; reload already attempted', local, minWebBuild);
        return false;
      }
      sessionStorage.setItem(guardKey, '1');
    } catch {
      /* ignore */
    }

    window.location.reload();
    return true;
  }

  async function performLoad({ allowAbort = true } = {}) {
    bindBrowserBack();
    bindRootActions();
    ensureVolunteerIosHtmlClasses();
    document.documentElement.classList.toggle('jh-html-ios-safari', isIosSafariBrowser());
    document.body.classList.toggle('jh-vol-ios-safari', isIosSafariBrowser());
    syncVolunteerShellViewport();
    if (allowAbort && loadAbort) loadAbort.abort();
    loadAbort = new AbortController();
    const signal = loadAbort.signal;
    updateBuildStamp(null);
    setMsg('Loading…', false);
    try {
      if (screenId === 'jewelheart.home') {
        if (await maybeReloadStaleClientForHome(signal)) return;
      }
      const envelope = await fetchScreen(signal);
      if (signal.aborted) return;
      const destId = envelope?.screen?.id || screenId;
      if (destId === 'jewelheart.home' && screenId !== 'jewelheart.home') {
        if (await maybeReloadStaleClientForHome(signal)) return;
      }
      renderScreen(envelope);
      syncFilterStateFromMetadata(envelope);
      setMsg('', false);
    } catch (e) {
      if (signal.aborted) return;
      if (e?.name === 'AbortError') return;
      console.error('SDUI load', e);
      setMsg(e.message || String(e), true);
    } finally {
      if (signal.aborted) return;
      // checkinOp is one-shot (assign/unassign/start/finish): the server has
      // already applied it, so drop it to avoid replays on refresh/back.
      if (
        screenId === 'jewelheart.volunteer.checkin' ||
        screenId === 'jewelheart.volunteer.shiftDetail' ||
        screenId === 'jewelheart.volunteer.shiftEdit' ||
        screenId === 'jewelheart.volunteer.shift' ||
        screenId === 'jewelheart.volunteer.mine'
      ) {
        delete params.checkinOp;
        delete params.shiftEditOp;
        delete params.pickVolunteerId;
      }
      if (screenId !== 'jewelheart.volunteer.checkin') {
        delete params.checkinBaselineIds;
      }
    }
  }

  async function load() {
    const checkinWriteOp = params.checkinOp ? String(params.checkinOp) : '';
    const isCheckinWrite =
      screenId === 'jewelheart.volunteer.checkin' &&
      ['start', 'finish', 'undo', 'done'].includes(checkinWriteOp);
    if (isCheckinWrite) {
      rootEl.classList.add('jh-sdui-checkin-busy');
      const run = () => performLoad({ allowAbort: false });
      checkinOpChain = checkinOpChain.then(run, run);
      return checkinOpChain.finally(() => {
        rootEl.classList.remove('jh-sdui-checkin-busy');
      });
    }
    return performLoad({ allowAbort: true });
  }

  function goBack() {
    if (history.length === 0) return load();
    const prev = history.pop();
    restoreStackEntry(prev);
    if (window.history.state?.volunteerSdui) {
      suppressBrowserPop = true;
      window.history.back();
    }
    return load();
  }

  function setRetreat(id) {
    retreatId = id ? String(id) : null;
    if (retreatId) params.retreatId = retreatId;
    else delete params.retreatId;
  }

  function resetHome() {
    bindBrowserBack();
    history.length = 0;
    screenId = 'jewelheart.home';
    const keepRetreat = retreatId;
    retreatId = keepRetreat;
    clearOboSession();
    params = keepRetreat ? { retreatId: keepRetreat } : {};
    window.history.replaceState({ volunteerSdui: true }, '', window.location.href);
    return load();
  }

  return {
    load,
    goBack,
    resetHome,
    setRetreat,
    isVolunteerScreen: (id) => VOLUNTEER_HOME_SCREENS.has(id),
  };
}
