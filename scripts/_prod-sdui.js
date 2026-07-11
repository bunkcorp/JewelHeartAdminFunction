/**
 * Volunteer SDUI renderer for karmadots.org/login (parity with iOS JewelHeartAdmin SDUIRenderer).
 * Web build stamp: America/New_York, minute precision. Overwritten by deploy scripts.
 */
export const JH_LOGIN_WEB_BUILD = 'pending-deploy';

const DEPLOY_STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human-readable deploy stamp (America/New_York). */
export function formatDeployStamp(stamp) {
  const s = String(stamp || '').trim();
  if (!s || s === '…') return s || '…';
  if (s === 'pending-deploy') return s;
  let m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${DEPLOY_STAMP_MONTHS[+mo - 1]} ${+d}, ${y} ${h}:${mi} ET`;
  }
  m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${DEPLOY_STAMP_MONTHS[+mo - 1]} ${+d}, ${y} ${h}:${mi} ET`;
  }
  return s;
}

export function formatBuildStampLine(webStamp, apiStamp) {
  return `web: ${formatDeployStamp(webStamp)} · api: ${formatDeployStamp(apiStamp || '…')}`;
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
  'jewelheart.volunteer.testing',
  'jewelheart.volunteer.userManage',
  'jewelheart.volunteer.admin',
]);

export function createVolunteerSduiController(options) {
  const { apiBase, getIdToken, rootEl, titleEl, msgEl, backBtn, buildStampEl, onAdminWorkspace, onScreenChange, uiChannel } = options;

  let screenId = 'jewelheart.home';
  let retreatId = null;
  let params = {};
  const history = [];
  let browserHistoryBound = false;
  let pendingScrollTop = null;
  let suppressBrowserPop = false;
  let loadAbort = null;
  let rootActionsBound = false;
  const actionStore = new Map();
  let actionSeq = 0;
  let profileVolunteerMeta = null;
  const personPickerState = new Map();

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
    params.jobsAll = '0';
    params.selectedJobs = '';
    params.typeJobPrefs = '';
    if (payload.jobType) params.jobType = String(payload.jobType);
    else delete params.jobType;
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

      if (payload.taskId) params.taskId = payload.taskId;
      else if (
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
              'userManageConfirm',
              'userManageClear',
              'userManageVolunteerId',
              'userManageVolunteerName',
              'userManageStatusNote',
              'userManagePendingOp',
              'userManagePendingClear',
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

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'navBack') {
      goBack();
      return Promise.resolve();
    }
    if (action.type === 'navigate') {
      let navAction = action;
      if (navAction.payload?.userManageConfirm) {
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
      applyNavigate(navAction);
      return load();
    }
    if (action.type === 'adminWorkspace') {
      if (onAdminWorkspace) onAdminWorkspace();
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
      if (component.style?.homeFindShiftRow) el.classList.add('jh-sdui-home-find-row');
      if (component.style?.jobListFrame) {
        el.classList.add('jh-sdui-job-list-scroll');
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

      for (const child of component.children || []) {
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

    if (style.flexGrow) el.classList.add('jh-sdui-flex-child');

    if (component.action) {
      attachAction(el, component.action);
    } else if (isButton) {
      el.disabled = true;
      el.style.cursor = 'default';
      el.style.opacity = '0.92';
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
    const isHome = screen?.id === 'jewelheart.home';
    if (isHome) {
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

  function renderScreen(envelope) {
    const screen = envelope?.screen || envelope;
    if (screen.id) screenId = screen.id;
    clearActionStore();
    personPickerState.clear();
    rootEl.innerHTML = '';
    rootEl.dataset.screenId = screen.id || screenId;

    const isHome = screen.id === 'jewelheart.home';
    const homeSplit = screen.metadata?.homeSplitLayout === true;
    const shiftAssignFlex = screen.metadata?.shiftAssignFlexLayout === true;
    const searchByDayFlex = screen.metadata?.searchByDayFlexLayout === true;
    const searchByTypeFlex = screen.metadata?.searchByTypeFlexLayout === true;
    const findOpenFlex = searchByDayFlex || searchByTypeFlex;
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

    if (shiftAssignFlex) {
      syncInstructionScrollAffordance(rootEl);
    }
  }

  async function load() {
    bindBrowserBack();
    bindRootActions();
    if (loadAbort) loadAbort.abort();
    loadAbort = new AbortController();
    const signal = loadAbort.signal;
    updateBuildStamp(null);
    setMsg('Loading…', false);
    try {
      const envelope = await fetchScreen(signal);
      if (signal.aborted) return;
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
    }
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
