(() => {
  'use strict';

  const MESSAGE_SOURCE = 'tfc-timeframe-ring-v1.2';
  const SETTINGS_VERSION = 2;

  function normalizeTimeframe(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/\u00a0/g, ' ').trim();
    if (!s || s.length > 80) return null;

    // MetaTrader / Exness style: M1, M5, M15, H1, H4, D1, W1, MN1.
    let m = s.match(/^MN\s*([1-9]\d*)$/i);
    if (m) return `${Number(m[1])}M`;
    m = s.match(/^M\s*([1-9]\d*)$/i);
    if (m) return `${Number(m[1])}m`;
    m = s.match(/^H\s*([1-9]\d*)$/i);
    if (m) return `${Number(m[1])}h`;
    m = s.match(/^D\s*([1-9]\d*)$/i);
    if (m) return `${Number(m[1])}D`;
    m = s.match(/^W\s*([1-9]\d*)$/i);
    if (m) return `${Number(m[1])}W`;

    // TradingView style: 15m, 4h, 1D, 1W, 1M.
    m = s.match(/^([1-9]\d*)\s*(s|m|h|D|W|M)$/);
    if (m) return `${Number(m[1])}${m[2]}`;

    // Numeric selected interval controls typically mean minutes.
    if (/^[1-9]\d{0,4}$/.test(s)) return `${Number(s)}m`;

    const lower = s.toLowerCase();
    const patterns = [
      [/\b([1-9]\d*)\s*(?:sec|secs|second|seconds)\b/, 's'],
      [/\b([1-9]\d*)\s*(?:min|mins|minute|minutes)\b/, 'm'],
      [/\b([1-9]\d*)\s*(?:hr|hrs|hour|hours)\b/, 'h'],
      [/\b([1-9]\d*)\s*(?:day|days)\b/, 'D'],
      [/\b([1-9]\d*)\s*(?:week|weeks)\b/, 'W'],
      [/\b([1-9]\d*)\s*(?:month|months|mos)\b/, 'M']
    ];
    for (const [re, unit] of patterns) {
      const hit = lower.match(re);
      if (hit) return `${Number(hit[1])}${unit}`;
    }

    // Compact tokens embedded in labels.
    m = s.match(/(?:^|[\s:,(])([1-9]\d*)\s*([smhDWM])(?:$|[\s,)])/);
    if (m) return `${Number(m[1])}${m[2]}`;

    m = s.match(/(?:^|[\s:,(])([1-9]\d*)\s*([Hdw])(?:$|[\s,)])/);
    if (m) {
      const map = { H: 'h', d: 'D', w: 'W' };
      return `${Number(m[1])}${map[m[2]]}`;
    }

    // Exness/MetaTrader token embedded in a longer label, e.g. "Interval M15".
    m = s.match(/(?:^|[\s:,(])(MN|M|H|D|W)\s*([1-9]\d*)(?:$|[\s,)])/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      const map = { MN: 'M', M: 'm', H: 'h', D: 'D', W: 'W' };
      return `${Number(m[2])}${map[prefix]}`;
    }

    return null;
  }

  function candidateStrings(el) {
    if (!el) return [];
    const values = [
      el.getAttribute?.('data-value'),
      el.getAttribute?.('data-interval'),
      el.getAttribute?.('data-timeframe'),
      el.getAttribute?.('data-period'),
      el.getAttribute?.('data-testid'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title'),
      el.getAttribute?.('value'),
      el.value,
      el.innerText,
      el.textContent
    ];
    return [...new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
  }

  function detectFromElement(el) {
    for (const text of candidateStrings(el)) {
      const tf = normalizeTimeframe(text);
      if (tf) return tf;
    }
    return null;
  }

  function isVisibleElement(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }

  function detectExnessFromDocument(doc) {
    if (!doc?.querySelectorAll) return null;

    // Exness Terminal chart uses a radiogroup for its timeframe controls.
    const groups = doc.querySelectorAll('div[role="radiogroup"], [role="radiogroup"]');
    for (const group of groups) {
      const active = group.querySelector(
        'button[aria-checked="true"], [aria-checked="true"], button[aria-pressed="true"], [aria-selected="true"]'
      );
      const tf = detectFromElement(active);
      if (tf) return tf;
    }

    const exact = doc.querySelectorAll([
      'button[aria-checked="true"]',
      '[data-test*="interval" i][aria-checked="true"]',
      '[data-testid*="interval" i][aria-checked="true"]',
      '[data-test*="timeframe" i][aria-checked="true"]',
      '[data-testid*="timeframe" i][aria-checked="true"]'
    ].join(','));
    for (const el of exact) {
      const tf = detectFromElement(el);
      if (tf) return tf;
    }

    // Some releases expose only the active class, so keep this constrained to buttons.
    const activeButtons = doc.querySelectorAll('button[class*="active" i], button[class*="selected" i]');
    for (const el of activeButtons) {
      const tf = detectFromElement(el);
      if (tf) return tf;
    }

    return null;
  }

  function detectGenericFromDocument(doc) {
    if (!doc?.querySelectorAll) return null;

    const tradingViewSelectors = [
      '[data-name="header-intervals-button"]',
      'button[data-name="header-intervals-button"]',
      '[data-name*="interval" i][aria-label]',
      '[data-name*="timeframe" i][aria-label]'
    ];
    for (const selector of tradingViewSelectors) {
      for (const el of doc.querySelectorAll(selector)) {
        const tf = detectFromElement(el);
        if (tf) return tf;
      }
    }

    const selectedSelectors = [
      '[aria-checked="true"]',
      '[aria-selected="true"]',
      '[aria-pressed="true"]',
      '[data-selected="true"]'
    ];
    for (const selector of selectedSelectors) {
      const nodes = doc.querySelectorAll(selector);
      const limit = Math.min(nodes.length, 180);
      for (let i = 0; i < limit; i++) {
        const el = nodes[i];
        if (!isVisibleElement(el)) continue;
        const tf = detectFromElement(el);
        if (tf) return tf;
      }
    }

    const named = doc.querySelectorAll(
      '[aria-label*="interval" i], [aria-label*="timeframe" i], [title*="interval" i], [title*="timeframe" i], [data-testid*="timeframe" i], [data-testid*="interval" i], [data-test*="timeframe" i], [data-test*="interval" i]'
    );
    for (const el of named) {
      const tf = detectFromElement(el);
      if (tf) return tf;
    }

    return null;
  }

  function startFrameProbe() {
    let lastSent = null;
    let dirty = true;

    const probe = () => {
      if (!dirty && lastSent) return;
      dirty = false;
      const tf = detectExnessFromDocument(document) || detectGenericFromDocument(document);
      if (!tf) return;
      if (tf !== lastSent) lastSent = tf;
      try {
        window.top.postMessage({ source: MESSAGE_SOURCE, type: 'FRAME_TIMEFRAME', timeframe: tf }, '*');
      } catch (_) {}
    };

    const observer = new MutationObserver(() => { dirty = true; });
    try {
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-checked', 'aria-selected', 'aria-pressed', 'class', 'data-value', 'data-interval', 'data-timeframe']
      });
    } catch (_) {}

    document.addEventListener('click', () => { dirty = true; setTimeout(probe, 80); }, true);
    setInterval(() => { dirty = true; probe(); }, 1000);
    probe();
  }

  if (window.top !== window) {
    startFrameProbe();
    return;
  }

  if (document.getElementById('tfc-root-host')) return;

  const DEFAULTS = {
    settingsVersion: SETTINGS_VERSION,
    enabled: true,
    detectionMode: 'auto',
    manualTimeframe: '5m',
    layoutMode: 'landscape',
    locked: false,

    textColor: '#f8fafc',
    mutedTextColor: '#a7b4c8',
    ringColor: '#22c55e',
    warningColor: '#facc15',
    readyColor: '#ef4444',
    trackColor: '#334155',
    backgroundColor: '#0f172a',
    backgroundOpacity: 94,
    borderColor: '#52627d',
    borderWidth: 2,

    dynamicPhaseColors: true,
    dynamicTextColor: true,
    dynamicBorderColor: true,
    warningStartPercent: 33,
    readyStartPercent: 67,

    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 34,
    timeframeFontSize: 17,
    descriptionFontSize: 12,
    ringSize: 78,
    ringThickness: 8,
    landscapeWidth: 330,
    landscapeHeight: 104,
    panelPadding: 14,
    borderRadius: 26,
    overallScale: 100,

    shadow: true,
    textShadow: true,
    showTimeframe: true,
    showCountdown: true,
    showPercent: false,
    showDescription: true,
    descriptionText: 'Double-click to edit note',
    showPhaseLabel: false,

    progressMode: 'remaining',
    offsetMinutes: 0
  };

  function migrateSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const merged = { ...DEFAULTS, ...source };
    const version = Number(source.settingsVersion || 0);

    if (version < SETTINGS_VERSION) {
      // v1.2 repairs the landscape layout and intentionally gives it sane,
      // reference-style dimensions even when old v1.1 values are still stored.
      merged.settingsVersion = SETTINGS_VERSION;
      merged.layoutMode = 'landscape';
      merged.landscapeWidth = 330;
      merged.landscapeHeight = 104;
      merged.ringSize = 78;
      merged.ringThickness = 8;
      merged.fontSize = 34;
      merged.timeframeFontSize = 17;
      merged.descriptionFontSize = 12;
      merged.panelPadding = 14;
      merged.borderRadius = 26;
      merged.borderWidth = 2;
      merged.overallScale = 100;
      merged.showTimeframe = true;
      merged.showCountdown = true;
      merged.showDescription = true;
      merged.progressMode = 'remaining';
      merged.showPhaseLabel = false;
      if (!source.descriptionText || String(source.descriptionText).replace(/\s+/g, ' ').trim().toUpperCase() === 'CANDLE CLOSE') {
        merged.descriptionText = 'Double-click to edit note';
      }
    }
    return merged;
  }

  let settings = { ...DEFAULTS };
  let detectedTimeframe = null;
  let detectionSource = 'none';
  let frameDetectedTimeframe = null;
  let frameDetectedAt = 0;
  let lastDetectionAt = 0;
  let detectionDirty = true;
  let dragging = null;
  let hostPosition = null;
  let lastPaint = 0;

  const host = document.createElement('div');
  host.id = 'tfc-root-host';
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:2147483647',
    'display:block',
    'pointer-events:auto',
    'user-select:none',
    '-webkit-user-select:none',
    'touch-action:none'
  ].join(';');

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .wrap {
        --phase:#22c55e;
        position:relative;
        display:block;
        overflow:hidden;
        cursor:grab;
        transform-origin:top left;
        transition:opacity .15s ease, box-shadow .18s ease, border-color .35s linear, background-color .2s ease;
        isolation:isolate;
      }
      .wrap::before {
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        background:linear-gradient(115deg, rgba(255,255,255,.055), transparent 35%, transparent 68%, rgba(255,255,255,.025));
        z-index:0;
      }
      .wrap.dragging { cursor:grabbing; }
      .wrap.locked { cursor:default; }
      .classic, .landscape, .badge { position:relative; width:100%; height:100%; z-index:1; }
      .classic[hidden], .landscape[hidden], .badge[hidden] { display:none !important; }
      .classic { display:grid; place-items:center; }
      .classic svg, .miniRing svg { position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg); overflow:visible; }
      circle { fill:none; vector-effect:non-scaling-stroke; }
      .progressCircle { transition:stroke-dashoffset .16s linear, stroke .45s linear; }
      .center {
        position:relative;
        z-index:2;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        line-height:1.03;
        text-align:center;
        min-width:0;
      }
      .tf {
        font-weight:850;
        letter-spacing:.055em;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .count {
        font-weight:800;
        font-variant-numeric:tabular-nums;
        white-space:nowrap;
        letter-spacing:.01em;
      }
      .pct {
        font-size:9px;
        font-weight:750;
        opacity:.9;
        margin-top:3px;
        font-variant-numeric:tabular-nums;
      }
      .unknown {
        font-size:10px;
        font-weight:700;
        opacity:.92;
        max-width:80%;
        line-height:1.15;
        text-align:center;
      }

      .landscape {
        position:relative;
        width:100%;
        height:100%;
        padding:0;
      }
      .miniRing {
        position:absolute;
        left:var(--panel-pad, 14px);
        top:50%;
        width:var(--ring-diameter, 78px);
        height:var(--ring-diameter, 78px);
        transform:translateY(-50%);
        display:grid;
        place-items:center;
        flex:none;
        filter:none;
      }
      .miniRing svg {
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        transform:rotate(-90deg);
        overflow:visible;
      }
      .landscapeRingCenter {
        position:relative;
        z-index:2;
        width:72%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:2px;
        text-align:center;
        pointer-events:none;
      }
      .landscapeTf {
        font-weight:900;
        line-height:1;
        letter-spacing:.035em;
        white-space:nowrap;
      }
      .miniPct {
        position:relative;
        z-index:2;
        font-size:8px;
        line-height:1;
        font-weight:850;
        font-variant-numeric:tabular-nums;
        opacity:.82;
      }
      .landscapeMain {
        position:absolute;
        left:calc(var(--panel-pad, 14px) + var(--ring-diameter, 78px) + var(--landscape-gap, 18px));
        right:var(--panel-pad, 14px);
        top:50%;
        transform:translateY(-50%);
        min-width:0;
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        justify-content:center;
        gap:8px;
        overflow:visible;
      }
      .landscapeCount {
        display:block;
        max-width:100%;
        font-weight:900;
        line-height:.92;
        font-variant-numeric:tabular-nums;
        white-space:nowrap;
        letter-spacing:.005em;
      }
      .landscapeMeta {
        width:100%;
        min-width:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        min-height:16px;
      }
      .phasePill {
        flex:none;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:2px 7px;
        border:1px solid currentColor;
        border-radius:999px;
        font-size:8px;
        line-height:1.05;
        font-weight:900;
        letter-spacing:.08em;
        opacity:.88;
      }
      .remainingLabel { display:none !important; }
      .description {
        min-width:0;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        font-weight:650;
        line-height:1.15;
        letter-spacing:.015em;
        text-transform:none;
        cursor:text;
        user-select:text;
        -webkit-user-select:text;
      }
      .description:hover { opacity:1 !important; }

      .badge {
        display:grid;
        grid-template-columns:auto minmax(0,1fr) auto;
        align-items:center;
        gap:11px;
        padding:8px 13px 10px;
      }
      .badgeTf {
        font-weight:950;
        line-height:1;
        letter-spacing:.04em;
        white-space:nowrap;
      }
      .badgeCount {
        font-weight:850;
        line-height:1;
        font-variant-numeric:tabular-nums;
        white-space:nowrap;
      }
      .badgeRight {
        display:flex;
        flex-direction:column;
        align-items:flex-end;
        justify-content:center;
        min-width:58px;
      }
      .badgeDesc {
        white-space:pre-line;
        text-align:right;
        font-weight:750;
        line-height:1.1;
        letter-spacing:.04em;
        text-transform:uppercase;
      }
      .badgePhase {
        margin-top:3px;
        font-size:8px;
        font-weight:900;
        letter-spacing:.08em;
      }
      .rail {
        position:absolute;
        left:0;
        right:0;
        bottom:0;
        height:3px;
        background:rgba(255,255,255,.08);
        overflow:hidden;
      }
      .railFill {
        width:100%;
        height:100%;
        transform-origin:left center;
        transform:scaleX(0);
        transition:transform .16s linear, background-color .45s linear;
      }
    </style>

    <div class="wrap" id="wrap" title="Drag to move • Customize from the extension popup">
      <div class="classic" id="classic">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="trackCircle" cx="50" cy="50" r="44"></circle>
          <circle class="progressCircle" cx="50" cy="50" r="44"></circle>
        </svg>
        <div class="center">
          <div class="tf" id="classicTf"></div>
          <div class="count" id="classicCount"></div>
          <div class="pct" id="classicPct"></div>
          <div class="unknown" id="classicUnknown" hidden>Choose timeframe in extension</div>
        </div>
      </div>

      <div class="landscape" id="landscape" hidden>
        <div class="miniRing" id="miniRing">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="trackCircle" cx="50" cy="50" r="44"></circle>
            <circle class="progressCircle" cx="50" cy="50" r="44"></circle>
          </svg>
          <div class="landscapeRingCenter">
            <span class="landscapeTf" id="landscapeTf"></span>
            <span class="miniPct" id="miniPct"></span>
          </div>
        </div>
        <div class="landscapeMain">
          <div class="landscapeCount" id="landscapeCount"></div>
          <div class="landscapeMeta">
            <span class="description" id="description" title="Double-click to edit note"></span>
            <span class="phasePill" id="phasePill"></span>
            <span class="remainingLabel" id="remainingLabel" hidden></span>
          </div>
        </div>
      </div>

      <div class="badge" id="badge" hidden>
        <div class="badgeTf" id="badgeTf"></div>
        <div class="badgeCount" id="badgeCount"></div>
        <div class="badgeRight">
          <div class="badgeDesc" id="badgeDesc"></div>
          <div class="badgePhase" id="badgePhase"></div>
        </div>
        <div class="rail"><div class="railFill" id="railFill"></div></div>
      </div>
    </div>
  `;

  const wrap = shadow.getElementById('wrap');
  const classic = shadow.getElementById('classic');
  const landscape = shadow.getElementById('landscape');
  const badge = shadow.getElementById('badge');
  const classicTf = shadow.getElementById('classicTf');
  const classicCount = shadow.getElementById('classicCount');
  const classicPct = shadow.getElementById('classicPct');
  const classicUnknown = shadow.getElementById('classicUnknown');
  const miniRing = shadow.getElementById('miniRing');
  const miniPct = shadow.getElementById('miniPct');
  const landscapeTf = shadow.getElementById('landscapeTf');
  const landscapeCount = shadow.getElementById('landscapeCount');
  const phasePill = shadow.getElementById('phasePill');
  const remainingLabel = shadow.getElementById('remainingLabel');
  const description = shadow.getElementById('description');
  const badgeTf = shadow.getElementById('badgeTf');
  const badgeCount = shadow.getElementById('badgeCount');
  const badgeDesc = shadow.getElementById('badgeDesc');
  const badgePhase = shadow.getElementById('badgePhase');
  const railFill = shadow.getElementById('railFill');
  const trackCircles = [...shadow.querySelectorAll('.trackCircle')];
  const progressCircles = [...shadow.querySelectorAll('.progressCircle')];

  document.documentElement.appendChild(host);

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function normalizeHex(hex, fallback = '#ffffff') {
    const value = String(hex || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return `#${value.slice(1).split('').map(c => c + c).join('')}`;
    }
    return fallback;
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex).slice(1);
    const n = Number.parseInt(value, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex({ r, g, b }) {
    const to = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  function mixColors(a, b, t) {
    const aa = hexToRgb(a);
    const bb = hexToRgb(b);
    const x = Math.max(0, Math.min(1, t));
    return rgbToHex({
      r: aa.r + (bb.r - aa.r) * x,
      g: aa.g + (bb.g - aa.g) * x,
      b: aa.b + (bb.b - aa.b) * x
    });
  }

  function smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function hexToRgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function phaseInfo(elapsedRatio) {
    const warningStart = clampNumber(settings.warningStartPercent, 0, 95, 33) / 100;
    const readyStartRaw = clampNumber(settings.readyStartPercent, 1, 99, 67) / 100;
    const readyStart = Math.max(warningStart + 0.01, readyStartRaw);
    const ratio = Math.max(0, Math.min(1, elapsedRatio));

    if (!settings.dynamicPhaseColors) {
      return { color: normalizeHex(settings.ringColor, DEFAULTS.ringColor), label: 'ACTIVE' };
    }

    const start = normalizeHex(settings.ringColor, DEFAULTS.ringColor);
    const warn = normalizeHex(settings.warningColor, DEFAULTS.warningColor);
    const ready = normalizeHex(settings.readyColor, DEFAULTS.readyColor);

    if (ratio <= warningStart) return { color: start, label: 'FRESH' };
    if (ratio < readyStart) {
      const t = smoothstep((ratio - warningStart) / Math.max(0.001, readyStart - warningStart));
      return { color: mixColors(start, warn, t), label: 'BUILDING' };
    }
    const t = smoothstep((ratio - readyStart) / Math.max(0.001, 1 - readyStart));
    return { color: mixColors(warn, ready, t), label: 'READY' };
  }

  function effectiveLayout() {
    return ['circle', 'landscape', 'badge'].includes(settings.layoutMode) ? settings.layoutMode : 'landscape';
  }

  function applySettings() {
    host.style.display = settings.enabled ? 'block' : 'none';
    if (!settings.enabled) return;

    const layout = effectiveLayout();
    const pad = clampNumber(settings.panelPadding, 0, 32, 14);
    const ringSize = clampNumber(settings.ringSize, 48, 200, 78);
    const landscapeWidth = clampNumber(settings.landscapeWidth, 220, 620, 330);
    const landscapeHeight = clampNumber(settings.landscapeHeight, 70, 180, 104);
    const scale = clampNumber(settings.overallScale, 50, 300, 100) / 100;
    const borderWidth = clampNumber(settings.borderWidth, 0, 6, 2);
    const borderRadius = clampNumber(settings.borderRadius, 0, 80, 26);
    const thickness = clampNumber(settings.ringThickness, 2, 20, 8);
    const circumference = 2 * Math.PI * 44;

    classic.hidden = layout !== 'circle';
    landscape.hidden = layout !== 'landscape';
    badge.hidden = layout !== 'badge';

    if (layout === 'circle') {
      const box = ringSize + pad * 2;
      wrap.style.width = `${box}px`;
      wrap.style.height = `${box}px`;
      classic.style.padding = `${pad}px`;
    } else {
      wrap.style.width = `${landscapeWidth}px`;
      wrap.style.height = `${landscapeHeight}px`;
    }

    const landscapeRingSize = Math.max(48, Math.min(ringSize, landscapeHeight - 22));
    const landscapeGap = Math.max(12, Math.min(28, landscapeHeight * 0.18));
    wrap.style.setProperty('--panel-pad', `${pad}px`);
    wrap.style.setProperty('--ring-diameter', `${landscapeRingSize}px`);
    wrap.style.setProperty('--landscape-gap', `${landscapeGap}px`);

    wrap.style.borderRadius = `${borderRadius}px`;
    wrap.style.background = hexToRgba(settings.backgroundColor, clampNumber(settings.backgroundOpacity, 0, 100, 94) / 100);
    wrap.style.fontFamily = settings.fontFamily || DEFAULTS.fontFamily;
    wrap.style.color = normalizeHex(settings.textColor, DEFAULTS.textColor);
    wrap.style.transform = `scale(${scale})`;
    wrap.style.border = `${borderWidth}px solid ${normalizeHex(settings.borderColor, DEFAULTS.borderColor)}`;
    wrap.style.boxShadow = settings.shadow
      ? '0 12px 34px rgba(0,0,0,.38), 0 3px 10px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.045)'
      : 'inset 0 1px 0 rgba(255,255,255,.035)';
    wrap.classList.toggle('locked', Boolean(settings.locked));

    const textShadow = settings.textShadow ? '0 1px 2px rgba(0,0,0,.85), 0 0 8px rgba(0,0,0,.35)' : 'none';
    const muted = normalizeHex(settings.mutedTextColor, DEFAULTS.mutedTextColor);
    const text = normalizeHex(settings.textColor, DEFAULTS.textColor);

    classicTf.style.color = muted;
    classicTf.style.fontSize = `${Math.max(8, clampNumber(settings.timeframeFontSize, 8, 34, 17) * 0.78)}px`;
    classicTf.style.textShadow = textShadow;
    classicCount.style.color = text;
    classicCount.style.fontSize = `${clampNumber(settings.fontSize, 10, 64, 34)}px`;
    classicCount.style.textShadow = textShadow;
    classicPct.style.color = muted;

    landscapeTf.style.color = text;
    landscapeTf.style.fontSize = `${Math.max(11, Math.min(28, clampNumber(settings.timeframeFontSize, 8, 34, 17)))}px`;
    landscapeTf.style.textShadow = textShadow;
    landscapeCount.style.color = text;
    const landscapeCountSize = Math.max(18, Math.min(clampNumber(settings.fontSize, 10, 64, 34), landscapeHeight * 0.43));
    landscapeCount.style.fontSize = `${landscapeCountSize}px`;
    landscapeCount.style.textShadow = textShadow;
    remainingLabel.style.color = muted;
    description.style.color = muted;
    description.style.fontSize = `${Math.max(8, Math.min(clampNumber(settings.descriptionFontSize, 7, 24, 12), landscapeHeight * 0.14))}px`;
    description.style.display = settings.showDescription ? '' : 'none';
    description.textContent = String(settings.descriptionText || DEFAULTS.descriptionText).replace(/\s+/g, ' ').trim().slice(0, 80);

    badgeTf.style.color = text;
    badgeTf.style.fontSize = `${Math.max(15, clampNumber(settings.timeframeFontSize, 8, 34, 17) * 1.45)}px`;
    badgeTf.style.textShadow = textShadow;
    badgeCount.style.color = text;
    badgeCount.style.fontSize = `${clampNumber(settings.fontSize, 10, 64, 34)}px`;
    badgeCount.style.textShadow = textShadow;
    badgeDesc.style.color = muted;
    badgeDesc.style.fontSize = `${clampNumber(settings.descriptionFontSize, 7, 24, 12)}px`;
    badgeDesc.style.display = settings.showDescription ? '' : 'none';
    badgeDesc.textContent = String(settings.descriptionText || DEFAULTS.descriptionText).slice(0, 80);

    miniRing.style.width = `${landscapeRingSize}px`;
    miniRing.style.height = `${landscapeRingSize}px`;

    for (const c of trackCircles) {
      c.style.stroke = normalizeHex(settings.trackColor, DEFAULTS.trackColor);
      c.style.strokeWidth = thickness;
    }
    for (const c of progressCircles) {
      c.style.stroke = normalizeHex(settings.ringColor, DEFAULTS.ringColor);
      c.style.strokeWidth = thickness;
      c.style.strokeLinecap = 'round';
      c.style.strokeDasharray = `${circumference}`;
    }

    classicTf.style.display = settings.showTimeframe ? '' : 'none';
    classicCount.style.display = settings.showCountdown ? '' : 'none';
    classicPct.style.display = settings.showPercent ? '' : 'none';
    landscapeTf.style.display = settings.showTimeframe ? '' : 'none';
    landscapeCount.style.display = settings.showCountdown ? '' : 'none';
    miniPct.style.display = settings.showPercent ? '' : 'none';
    phasePill.style.display = settings.showPhaseLabel ? '' : 'none';
    badgeTf.style.display = settings.showTimeframe ? '' : 'none';
    badgeCount.style.display = settings.showCountdown ? '' : 'none';
    badgePhase.style.display = settings.showPhaseLabel ? '' : 'none';

    clampPosition();
  }

  function hostSiteType() {
    const h = location.hostname.toLowerCase();
    if (h.includes('tradingview.com')) return 'tradingview';
    if (h.includes('exness') || h.includes('exwebterm') || h.includes('extrade')) return 'exness';
    return 'other';
  }

  function detectFromUrl() {
    try {
      const url = new URL(location.href);
      for (const key of ['interval', 'timeframe', 'tf', 'period']) {
        const tf = normalizeTimeframe(url.searchParams.get(key));
        if (tf) return tf;
      }
    } catch (_) {}
    return null;
  }

  function detectExnessIframe() {
    const frames = [
      ...document.querySelectorAll('#tv_chart_container iframe'),
      ...document.querySelectorAll('iframe[src*="chart" i], iframe[src*="trading" i], iframe[src*="terminal" i]')
    ];
    const unique = [...new Set(frames)];
    for (const frame of unique) {
      try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement) continue;
        const tf = detectExnessFromDocument(doc) || detectGenericFromDocument(doc);
        if (tf) return tf;
      } catch (_) {
        // Cross-origin chart iframe: the all_frames probe can report it via postMessage.
      }
    }
    return null;
  }

  function detectTimeframe() {
    if (settings.detectionMode === 'manual') {
      detectionSource = 'manual';
      return normalizeTimeframe(settings.manualTimeframe) || '5m';
    }

    const fromUrl = detectFromUrl();
    if (fromUrl) {
      detectionSource = 'url';
      return fromUrl;
    }

    const site = hostSiteType();
    if (site === 'exness') {
      const iframeTf = detectExnessIframe();
      if (iframeTf) {
        detectionSource = 'exness chart';
        return iframeTf;
      }

      const localTf = detectExnessFromDocument(document);
      if (localTf) {
        detectionSource = 'exness page';
        return localTf;
      }

      if (frameDetectedTimeframe && Date.now() - frameDetectedAt < 5000) {
        detectionSource = 'chart frame';
        return frameDetectedTimeframe;
      }
    }

    const generic = detectGenericFromDocument(document);
    if (generic) {
      detectionSource = site === 'tradingview' ? 'TradingView control' : 'active control';
      return generic;
    }

    if (frameDetectedTimeframe && Date.now() - frameDetectedAt < 5000) {
      detectionSource = 'chart frame';
      return frameDetectedTimeframe;
    }

    detectionSource = 'none';
    return null;
  }

  function parseTimeframe(tf) {
    const m = String(tf || '').match(/^([1-9]\d*)([smhDWM])$/);
    if (!m) return null;
    return { n: Number(m[1]), unit: m[2] };
  }

  function getWindow(nowMs, tf) {
    const parsed = parseTimeframe(tf);
    if (!parsed) return null;
    const { n, unit } = parsed;
    const offsetMs = clampNumber(settings.offsetMinutes, -1440, 1440, 0) * 60_000;
    const shifted = nowMs - offsetMs;

    if (unit === 'M') {
      const d = new Date(shifted);
      const monthIndex = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const startIndex = Math.floor(monthIndex / n) * n;
      const endIndex = startIndex + n;
      const start = Date.UTC(Math.floor(startIndex / 12), startIndex % 12, 1) + offsetMs;
      const end = Date.UTC(Math.floor(endIndex / 12), endIndex % 12, 1) + offsetMs;
      return { start, end };
    }

    if (unit === 'W') {
      const weekMs = 7 * 86_400_000;
      const period = n * weekMs;
      const anchor = Date.UTC(1970, 0, 5) + offsetMs; // Monday.
      const index = Math.floor((nowMs - anchor) / period);
      const start = anchor + index * period;
      return { start, end: start + period };
    }

    const baseSeconds = { s: 1, m: 60, h: 3600, D: 86400 }[unit];
    if (!baseSeconds) return null;
    const period = n * baseSeconds * 1000;
    const start = Math.floor(shifted / period) * period + offsetMs;
    return { start, end: start + period };
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const p2 = v => String(v).padStart(2, '0');

    if (days > 0) return `${days}d ${p2(hours)}:${p2(minutes)}:${p2(seconds)}`;
    if (hours > 0) return `${p2(hours)}:${p2(minutes)}:${p2(seconds)}`;
    return `${p2(minutes)}:${p2(seconds)}`;
  }

  function displayTf(tf) {
    const p = parseTimeframe(tf);
    if (!p) return '--';
    return `${p.n}${p.unit}`;
  }

  function updateProgressVisuals(ratio, elapsedRatio, phase) {
    const circumference = 2 * Math.PI * 44;
    for (const c of progressCircles) {
      c.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
      c.style.stroke = phase.color;
    }
    railFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
    railFill.style.backgroundColor = phase.color;
    wrap.style.setProperty('--phase', phase.color);

    if (settings.dynamicBorderColor) {
      wrap.style.borderColor = phase.color;
    } else {
      wrap.style.borderColor = normalizeHex(settings.borderColor, DEFAULTS.borderColor);
    }

    for (const c of progressCircles) {
      c.style.filter = settings.shadow ? `drop-shadow(0 0 4px ${hexToRgba(phase.color, .46)})` : 'none';
    }
    if (settings.shadow) {
      const glowColor = settings.dynamicBorderColor ? phase.color : normalizeHex(settings.borderColor, DEFAULTS.borderColor);
      wrap.style.boxShadow = `0 12px 34px rgba(0,0,0,.38), 0 3px 10px rgba(0,0,0,.28), 0 0 12px ${hexToRgba(glowColor, .16)}, inset 0 1px 0 rgba(255,255,255,.045)`;
    } else {
      wrap.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.035)';
    }

    if (settings.dynamicTextColor) {
      classicCount.style.color = phase.color;
      landscapeCount.style.color = phase.color;
      badgeCount.style.color = phase.color;
      miniPct.style.color = phase.color;
      phasePill.style.color = phase.color;
      badgePhase.style.color = phase.color;
    } else {
      const text = normalizeHex(settings.textColor, DEFAULTS.textColor);
      classicCount.style.color = text;
      landscapeCount.style.color = text;
      badgeCount.style.color = text;
      miniPct.style.color = normalizeHex(settings.mutedTextColor, DEFAULTS.mutedTextColor);
      phasePill.style.color = phase.color;
      badgePhase.style.color = phase.color;
    }

    const percentText = `${Math.round(elapsedRatio * 100)}%`;
    classicPct.textContent = percentText;
    miniPct.textContent = percentText;
    phasePill.textContent = phase.label;
    badgePhase.textContent = phase.label;
  }

  function paint(now = Date.now()) {
    if (!settings.enabled) return;

    if ((detectionDirty && now - lastDetectionAt > 250) || now - lastDetectionAt > 1000) {
      const next = detectTimeframe();
      if (next) detectedTimeframe = next;
      lastDetectionAt = now;
      detectionDirty = false;
    }

    const tf = settings.detectionMode === 'manual'
      ? (normalizeTimeframe(settings.manualTimeframe) || '5m')
      : detectedTimeframe;

    const windowInfo = getWindow(now, tf);
    if (!tf || !windowInfo) {
      classicTf.textContent = 'AUTO';
      classicCount.textContent = '--:--';
      classicPct.textContent = '';
      classicUnknown.hidden = false;
      landscapeTf.textContent = 'AUTO';
      landscapeCount.textContent = '--:--';
      miniPct.textContent = '--';
      phasePill.textContent = 'WAIT';
      badgeTf.textContent = 'AUTO';
      badgeCount.textContent = '--:--';
      badgePhase.textContent = 'WAIT';
      updateProgressVisuals(0, 0, { color: normalizeHex(settings.ringColor, DEFAULTS.ringColor), label: 'WAIT' });
      return;
    }

    classicUnknown.hidden = true;
    const duration = Math.max(1, windowInfo.end - windowInfo.start);
    const elapsed = Math.max(0, Math.min(duration, now - windowInfo.start));
    const remaining = Math.max(0, windowInfo.end - now);
    const elapsedRatio = elapsed / duration;
    const ratio = settings.progressMode === 'remaining' ? 1 - elapsedRatio : elapsedRatio;
    const phase = phaseInfo(elapsedRatio);
    const tfText = displayTf(tf);
    const countText = formatRemaining(remaining);

    classicTf.textContent = tfText;
    classicCount.textContent = countText;
    landscapeTf.textContent = tfText;
    landscapeCount.textContent = countText;
    badgeTf.textContent = tfText;
    badgeCount.textContent = countText;

    updateProgressVisuals(ratio, elapsedRatio, phase);
  }

  function animationLoop(ts) {
    if (ts - lastPaint > 100) {
      lastPaint = ts;
      paint(Date.now());
    }
    requestAnimationFrame(animationLoop);
  }

  function positionKey() {
    const site = hostSiteType();
    return site === 'other' ? location.hostname.toLowerCase() : site;
  }

  function defaultPosition() {
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(70, rect.width || 330);
    // Matches the user's preferred TradingView placement: upper-right of chart,
    // leaving space for the right-side watchlist/order panel.
    const rightClearance = Math.min(300, Math.max(20, window.innerWidth * 0.17));
    const x = Math.max(12, window.innerWidth - width - rightClearance);
    const y = 24;
    return { x, y };
  }

  async function loadPosition() {
    try {
      const result = await chrome.storage.local.get('tfc_positions');
      const positions = result.tfc_positions || {};
      hostPosition = positions[positionKey()] || null;
      if (hostPosition && Number.isFinite(hostPosition.x) && Number.isFinite(hostPosition.y)) {
        host.style.left = `${hostPosition.x}px`;
        host.style.top = `${hostPosition.y}px`;
      } else {
        const p = defaultPosition();
        host.style.left = `${p.x}px`;
        host.style.top = `${p.y}px`;
      }
      clampPosition();
    } catch (_) {
      const p = defaultPosition();
      host.style.left = `${p.x}px`;
      host.style.top = `${p.y}px`;
      clampPosition();
    }
  }

  async function savePosition() {
    const x = Number.parseFloat(host.style.left) || 0;
    const y = Number.parseFloat(host.style.top) || 0;
    hostPosition = { x, y };
    try {
      const result = await chrome.storage.local.get('tfc_positions');
      const positions = result.tfc_positions || {};
      positions[positionKey()] = hostPosition;
      await chrome.storage.local.set({ tfc_positions: positions });
    } catch (_) {}
  }

  function clampPosition() {
    if (!settings.enabled) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(48, rect.width || 100);
    const height = Math.max(40, rect.height || 70);
    let x = Number.parseFloat(host.style.left);
    let y = Number.parseFloat(host.style.top);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const p = defaultPosition();
      x = p.x;
      y = p.y;
    }
    x = Math.max(0, Math.min(Math.max(0, window.innerWidth - width), x));
    y = Math.max(0, Math.min(Math.max(0, window.innerHeight - height), y));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
  }

  function resetPosition() {
    const p = defaultPosition();
    host.style.left = `${p.x}px`;
    host.style.top = `${p.y}px`;
    clampPosition();
    savePosition();
  }

  wrap.addEventListener('pointerdown', event => {
    if (settings.locked || event.button !== 0) return;
    if (event.target?.closest?.('.description')) return;
    event.preventDefault();
    const rect = wrap.getBoundingClientRect();
    dragging = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top
    };
    wrap.classList.add('dragging');
    wrap.setPointerCapture?.(event.pointerId);
  });

  wrap.addEventListener('pointermove', event => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const rect = wrap.getBoundingClientRect();
    let x = event.clientX - dragging.dx;
    let y = event.clientY - dragging.dy;
    x = Math.max(0, Math.min(window.innerWidth - rect.width, x));
    y = Math.max(0, Math.min(window.innerHeight - rect.height, y));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
  });

  const endDrag = event => {
    if (!dragging) return;
    if (event && dragging.pointerId !== event.pointerId) return;
    dragging = null;
    wrap.classList.remove('dragging');
    savePosition();
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);

  description.addEventListener('dblclick', async event => {
    event.preventDefault();
    event.stopPropagation();
    const current = String(settings.descriptionText || '').replace(/\s+/g, ' ').trim();
    const next = window.prompt('Edit countdown note', current || 'Double-click to edit note');
    if (next == null) return;
    settings.descriptionText = next.trim().slice(0, 80) || 'Double-click to edit note';
    description.textContent = settings.descriptionText;
    badgeDesc.textContent = settings.descriptionText;
    try {
      await chrome.storage.sync.set({ tfc_settings: { ...settings, settingsVersion: SETTINGS_VERSION } });
    } catch (_) {}
  });

  window.addEventListener('resize', clampPosition, { passive: true });

  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'FRAME_TIMEFRAME') return;
    const tf = normalizeTimeframe(data.timeframe);
    if (!tf) return;
    frameDetectedTimeframe = tf;
    frameDetectedAt = Date.now();
    detectionDirty = true;
  });

  const observer = new MutationObserver(() => { detectionDirty = true; });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-checked', 'aria-selected', 'aria-pressed', 'class', 'data-value', 'data-interval', 'data-timeframe']
  });

  document.addEventListener('click', () => { detectionDirty = true; }, true);
  document.addEventListener('keydown', () => { detectionDirty = true; }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.tfc_settings) return;
    settings = migrateSettings(changes.tfc_settings.newValue || {});
    detectionDirty = true;
    applySettings();
    paint(Date.now());
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'TFC_GET_STATUS') {
      sendResponse({
        ok: true,
        site: hostSiteType() === 'exness' ? 'Exness' : (hostSiteType() === 'tradingview' ? 'TradingView' : location.hostname),
        detectedTimeframe,
        effectiveTimeframe: settings.detectionMode === 'manual' ? settings.manualTimeframe : detectedTimeframe,
        mode: settings.detectionMode,
        detectionSource,
        layoutMode: effectiveLayout()
      });
      return;
    }
    if (message.type === 'TFC_RESET_POSITION') {
      resetPosition();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'TFC_REDETECT') {
      detectionDirty = true;
      detectedTimeframe = detectTimeframe();
      paint(Date.now());
      sendResponse({ ok: true, detectedTimeframe, detectionSource });
    }
  });

  async function init() {
    try {
      const result = await chrome.storage.sync.get('tfc_settings');
      const raw = result.tfc_settings || {};
      settings = migrateSettings(raw);
      if (Number(raw.settingsVersion || 0) < SETTINGS_VERSION) {
        await chrome.storage.sync.set({ tfc_settings: settings });
      }
    } catch (_) {
      settings = { ...DEFAULTS };
    }
    applySettings();
    await loadPosition();
    detectedTimeframe = detectTimeframe();
    paint(Date.now());
    requestAnimationFrame(animationLoop);
  }

  init();
})();
