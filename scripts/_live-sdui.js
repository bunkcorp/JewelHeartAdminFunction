/**
 * Volunteer SDUI renderer for karmadots.org/login (parity with iOS JewelHeartAdmin SDUIRenderer).
 */

const VOLUNTEER_HOME_SCREENS = new Set([
  'jewelheart.home',
  'jewelheart.volunteer.search',
  'jewelheart.volunteer.assign',
  'jewelheart.volunteer.shift',
  'jewelheart.volunteer.checkin',
  'jewelheart.volunteer.messages',
  'jewelheart.volunteer.mine',
  'jewelheart.volunteer.account',
  'jewelheart.volunteer.preferences',
  'jewelheart.volunteer.admin',
]);

export function createVolunteerSduiController(options) {
  const { apiBase, getIdToken, rootEl, titleEl, msgEl, backBtn, onScreenChange } = options;

  let screenId = 'jewelheart.home';
  let retreatId = null;
  let params = {};
  const history = [];
  let browserHistoryBound = false;
  let pendingScrollTop = null;
  let suppressBrowserPop = false;

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

  function padFromStyle(style) {
    const p = style?.padding || {};
    return {
      top: p.top ?? p.all ?? 0,
      right: p.right ?? p.all ?? 0,
      bottom: p.bottom ?? p.all ?? 0,
      left: p.left ?? p.all ?? 0,
    };
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
        delete params.daysAll;
        delete params.selectedDays;
        delete params.jobsAll;
        delete params.selectedJobs;
        delete params.returnTo;
      } else if (payload.daysAll != null && payload.daysAll !== '') params.daysAll = payload.daysAll;
      else if (target === 'jewelheart.volunteer.search' || target === 'jewelheart.volunteer.assign') {
        delete params.daysAll;
      }

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

      if (payload.taskId) params.taskId = payload.taskId;
      else if (target === 'jewelheart.volunteer.checkin') delete params.taskId;

      if (payload.checkinOp) params.checkinOp = payload.checkinOp;
      else if (
        target === 'jewelheart.volunteer.checkin' ||
        target === 'jewelheart.volunteer.shift' ||
        target === 'jewelheart.volunteer.mine'
      ) {
        delete params.checkinOp;
      }

      if (payload.shiftOp) params.shiftOp = payload.shiftOp;
      else if (target !== 'jewelheart.volunteer.shift') delete params.shiftOp;

      if (payload.jobId) params.jobId = payload.jobId;
      else if (target !== 'jewelheart.volunteer.shift') delete params.jobId;

      if (payload.dayIso) params.dayIso = payload.dayIso;
      else if (target !== 'jewelheart.volunteer.shift') delete params.dayIso;

      if (payload.volunteerId) params.volunteerId = payload.volunteerId;
      else if (target !== 'jewelheart.volunteer.shift') delete params.volunteerId;

      if (payload.expandCheckin != null && payload.expandCheckin !== '') params.expandCheckin = payload.expandCheckin;
      else if (target === 'jewelheart.volunteer.shift') delete params.expandCheckin;

      if (payload.expandInstructions != null && payload.expandInstructions !== '') {
        params.expandInstructions = payload.expandInstructions;
      } else if (target === 'jewelheart.volunteer.shift') delete params.expandInstructions;

      if (payload.returnTo) params.returnTo = payload.returnTo;
      else if (target === 'jewelheart.home') delete params.returnTo;

      for (const [k, v] of Object.entries(payload)) {
        if (
          ![
            'retreatId',
            'daysAll',
            'selectedDays',
            'jobsAll',
            'selectedJobs',
            'taskId',
            'checkinOp',
            'shiftOp',
            'jobId',
            'dayIso',
            'volunteerId',
            'expandCheckin',
            'expandInstructions',
            'returnTo',
          ].includes(k) &&
          v != null &&
          v !== ''
        ) {
          params[k] = String(v);
        }
      }
    }

    if (payload.date) params.date = payload.date;
  }

  function snapshotForStack() {
    const historyParams = { ...params };
    delete historyParams.checkinOp;
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
    const payload = action.payload || {};

    if (target === 'jewelheart.home') {
      history.length = 0;
      screenId = target;
      applyVolunteerPayload(target, payload);
      return;
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

  async function fetchScreen() {
    const token = await getIdToken();
    const body = { screenId };
    if (retreatId) body.retreatId = retreatId;
    if (Object.keys(params).length) body.params = { ...params };

    const res = await fetch(`${apiBase}/sdui/screen`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'navBack') {
      goBack();
      return Promise.resolve();
    }
    if (action.type === 'navigate') {
      // Preserve job-list scroll when toggling filters on Find open shifts.
      if (
        action.target === 'jewelheart.volunteer.search' &&
        screenId === 'jewelheart.volunteer.search'
      ) {
        const scrollEl = rootEl.querySelector('.jh-sdui-scroll');
        if (scrollEl) pendingScrollTop = scrollEl.scrollTop;
      }
      applyNavigate(action);
      return load();
    }
    if (action.type === 'download') {
      return handleDownload(action);
    }
    if (action.type === 'openUrl' && action.target) {
      window.open(action.target, '_blank', 'noopener,noreferrer');
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
      const borderColor = component.style?.borderColor;
      if (borderColor) el.style.borderColor = borderColor;
      const maxH = component.style?.maxHeight?.value;
      if (maxH) el.style.maxHeight = `${maxH}px`;
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
      if (bg) {
        el.style.backgroundColor = bg;
        const pad = padFromStyle(component.style);
        el.style.padding = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
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
      if (component.icon === 'nav_back') el.textContent = '←';
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
      if (multiline) {
        el.classList.add('jh-sdui-multiline-pill');
        el.style.whiteSpace = 'pre-line';
      }
    } else if (isBar) {
      el.classList.add('jh-sdui-bar');
      if (style.instructionBarBleed) el.classList.add('jh-sdui-instruction-bar-bleed');
    } else if (style.parentCentered || textStyle.textAlign === 'center') {
      el.classList.add('jh-sdui-label-centered');
    }

    if (style.flexGrow) el.classList.add('jh-sdui-flex-child');

    if (component.action) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        handleAction(component.action);
      });
    }

    if (isButton && style.parentCentered) {
      const wrap = document.createElement('div');
      wrap.className = 'jh-sdui-center-wrap';
      wrap.appendChild(el);
      return wrap;
    }

    return el;
  }

  function renderScreen(envelope) {
    const screen = envelope?.screen || envelope;
    rootEl.innerHTML = '';
    rootEl.dataset.screenId = screen.id || screenId;

    const isHome = screen.id === 'jewelheart.home';
    const stickyFooter = screen.metadata?.stickyFooter === true;
    const stickyHeader = screen.metadata?.stickyHeader === true;
    rootEl.classList.toggle('jh-sdui-home', isHome);
    rootEl.classList.toggle('jh-sdui-sticky-footer', stickyFooter);
    rootEl.classList.toggle('jh-sdui-sticky-header', stickyHeader);

    if (titleEl) titleEl.textContent = screen.title || 'JewelHeart';
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
    wrap.className = stickyFooter || stickyHeader ? 'jh-sdui-scroll' : 'jh-sdui-stack';
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

    if (pendingScrollTop != null && screen.id === 'jewelheart.volunteer.search') {
      const top = pendingScrollTop;
      pendingScrollTop = null;
      requestAnimationFrame(() => {
        const scrollEl = rootEl.querySelector('.jh-sdui-scroll');
        if (scrollEl) scrollEl.scrollTop = top;
      });
    }
  }

  async function load() {
    bindBrowserBack();
    setMsg('Loading…', false);
    try {
      const envelope = await fetchScreen();
      renderScreen(envelope);
      setMsg('', false);
    } catch (e) {
      console.error('SDUI load', e);
      setMsg(e.message || String(e), true);
    } finally {
      // checkinOp is one-shot (assign/unassign/start/finish): the server has
      // already applied it, so drop it to avoid replays on refresh/back.
      if (
        screenId === 'jewelheart.volunteer.checkin' ||
        screenId === 'jewelheart.volunteer.shift' ||
        screenId === 'jewelheart.volunteer.mine'
      ) {
        delete params.checkinOp;
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

  function resetHome() {
    bindBrowserBack();
    history.length = 0;
    screenId = 'jewelheart.home';
    retreatId = null;
    params = {};
    window.history.replaceState({ volunteerSdui: true }, '', window.location.href);
    return load();
  }

  return {
    load,
    goBack,
    resetHome,
    isVolunteerScreen: (id) => VOLUNTEER_HOME_SCREENS.has(id),
  };
}
