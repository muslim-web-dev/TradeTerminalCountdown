(() => {
  'use strict';

  const MESSAGE_SOURCE = 'tfc-timeframe-ring-v1.13';
  const SETTINGS_VERSION = 9;

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

  function parseNumericToken(raw) {
    if (raw == null) return null;
    const n = Number(String(raw).replace(/,/g, '').replace(/−/g, '-'));
    return Number.isFinite(n) ? n : null;
  }

  function isValidOhlc(ohlc) {
    if (!ohlc || typeof ohlc !== 'object') return false;
    const open = Number(ohlc.open), high = Number(ohlc.high), low = Number(ohlc.low), close = Number(ohlc.close);
    if (![open, high, low, close].every(Number.isFinite)) return false;
    if (![open, high, low, close].every(n => n > 0)) return false;
    return high >= low && high >= open && high >= close && low <= open && low <= close;
  }

  function parseFrameOhlcText(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/\u00a0/g, ' ').replace(/\u2212/g, '-').replace(/\s+/g, ' ').trim();
    const num = '(-?[0-9][0-9,]*(?:\\.[0-9]+)?)';
    const get = label => {
      const m = text.match(new RegExp(`(?:^|\\s)(?:${label})\\s*[:=]?\\s*${num}`, 'i'));
      return m ? parseNumericToken(m[1]) : null;
    };
    const ohlc = {open:get('O|Open'), high:get('H|High'), low:get('L|Low'), close:get('C|Close')};
    return isValidOhlc(ohlc) ? ohlc : null;
  }

  function parseFramePrice(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/^\s*\(\d+\)\s*/, '').replace(/−/g, '-');
    const explicit = text.match(/\b(?:bid|ask|last|price)\b[^0-9]{0,20}([0-9][0-9,]*(?:\.[0-9]+)?)/i);
    if (explicit) {
      const n = parseNumericToken(explicit[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const matches = [...text.matchAll(/(^|[^A-Za-z0-9])([0-9][0-9,]*(?:\.[0-9]+)?)(?![A-Za-z0-9])/g)];
    for (const match of matches) {
      const token = match[2];
      const end = (match.index || 0) + match[0].length;
      if (/^\s*%/.test(text.slice(end, end + 2))) continue;
      const n = parseNumericToken(token);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (token.includes('.') || token.includes(',') || n >= 100) return n;
    }
    return null;
  }

  function detectFrameMarketSnapshot(doc, timeframe) {
    let ohlc = null;
    let price = parseFramePrice(doc.title);
    let symbol = null;
    const selectors = [
      '[data-name="legend-source-item"]',
      '[data-name*="legend" i]',
      '[data-testid*="ohlc" i]',
      '[data-test*="ohlc" i]',
      '[aria-label*="open" i][aria-label*="close" i]',
      '[data-testid*="symbol" i]',
      '[data-test*="symbol" i]'
    ];
    let scanned = 0;
    for (const selector of selectors) {
      for (const el of doc.querySelectorAll(selector)) {
        if (scanned++ > 80) break;
        const raw = `${el.textContent || ''} ${el.getAttribute?.('aria-label') || ''}`.trim();
        if (!ohlc) ohlc = parseFrameOhlcText(raw);
        if (!price) price = parseFramePrice(raw);
        if (!symbol) {
          const sm = raw.toUpperCase().match(/\b([A-Z][A-Z0-9._!-]{1,17}(?:\/[A-Z0-9._!-]{1,12})?)\b/);
          const candidate = cleanInstrumentName(sm?.[1]);
          if (candidate && !/^(OPEN|HIGH|LOW|CLOSE|BID|ASK|VOLUME|PRICE)$/i.test(candidate)) symbol = candidate;
        }
        if (ohlc && price && symbol) break;
      }
      if (scanned > 80 || (ohlc && price && symbol)) break;
    }
    if (!symbol) {
      const tm = String(doc.title || '').toUpperCase().match(/\b([A-Z][A-Z0-9._!-]{1,17}(?:\/[A-Z0-9._!-]{1,12})?)\b/);
      if (tm) symbol = cleanInstrumentName(tm[1]);
    }
    if (!price && ohlc?.close) price = ohlc.close;
    return { timeframe, ohlc, price, symbol, at: Date.now() };
  }

  async function switchChartTimeframe(tf) {
    if (!['3m','5m','15m','30m','45m','1h','4h'].includes(tf)) return false;
    const matches = selector => [...document.querySelectorAll(selector)].find(el => isVisibleElement(el) && !el.disabled && detectFromElement(el) === tf);
    const controls = '[data-name="header-intervals"] [data-value], [data-name="header-intervals"] button, [data-name="header-intervals"] [role="button"], [role="radiogroup"] button, button[data-value], button[data-interval], button[data-timeframe]';
    let target = matches(controls);
    if (target) { target.click(); return true; }
    const opener = [...document.querySelectorAll('[data-name="header-intervals-button"], button[aria-label*="timeframe" i], button[aria-label*="interval" i]')].find(isVisibleElement);
    if (!opener) return false;
    opener.click();
    // Wait for the native menu to render; never change only the overlay timer.
    for (let attempt=0; attempt<12; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 80));
      target = matches('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"], [role="listbox"] [role="option"], [data-name="menu-inner"] [data-value], [data-name="menu-inner"] [role="row"], [data-name="interval-dialog"] [data-value], [data-role="menuitem"][data-value]');
      if (target) { target.click(); return true; }
    }
    return false;
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type !== 'TFC_SWITCH_CHART') return;
    switchChartTimeframe(message.timeframe).then(ok => reply({ok}));
    return true;
  });

  function startFrameProbe() {
    let lastSent = null;
    let dirty = true;
    let scheduled = null;

    const probe = () => {
      scheduled = null;
      if (!dirty && lastSent) return;
      dirty = false;
      const tf = detectExnessFromDocument(document) || detectGenericFromDocument(document);
      if (!tf) return;
      chrome.runtime.sendMessage({type:'TFC_REGISTER_FRAME'}).catch(() => {});
      if (tf !== lastSent) lastSent = tf;
      const market = detectFrameMarketSnapshot(document, tf);
      try {
        window.top.postMessage({ source: MESSAGE_SOURCE, type: 'FRAME_MARKET', timeframe: tf, market }, '*');
      } catch (_) {}
    };

    const scheduleProbe = (delay = 90) => {
      dirty = true;
      if (scheduled != null) return;
      scheduled = setTimeout(probe, delay);
    };

    const observer = new MutationObserver(() => scheduleProbe());
    try {
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-checked', 'aria-selected', 'aria-pressed', 'class', 'data-value', 'data-interval', 'data-timeframe', 'data-symbol']
      });
    } catch (_) {}

    document.addEventListener('click', () => scheduleProbe(60), true);
    const refreshProbe = () => { dirty = true; probe(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshProbe(); }, { passive: true });
    window.addEventListener('focus', refreshProbe, { passive: true });
    window.addEventListener('pageshow', refreshProbe, { passive: true });
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
    borderColor: '#22d3ee',
    borderWidth: 2,

    dynamicPhaseColors: true,
    dynamicTextColor: true,
    dynamicBorderColor: true,
    warningStartPercent: 33,
    readyStartPercent: 67,

    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 34,
    timeframeFontSize: 18,
    descriptionFontSize: 13,
    ringSize: 70,
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

    // Compact market context shown under the main countdown.
    showRoundNumbers: true,
    autoRoundBySymbol: true,
    roundNumberStep: 5, // fallback for symbols outside BTC / GOLD / USOIL
    roundUpColor: '#22c55e',
    roundDownColor: '#ef4444',
    // v1.6 market dashboard: live local clock + six closing badges.
    showLiveClock: true,
    clockColor: '#38bdf8',
    clockFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    clockFontSize: 34,
    clockFormat: '12h',
    countdownUnitMode: 'compact',
    candleBgOpacity: 36,
    showInstrument: true,
    instrumentColor: '#f8fafc',
    priceColor: '#22e3a2',
    timeframeCardWidth: 96,
    timeframeCardHeight: 68,
        showClose3: true,
    selectedTimeframeColor: '#a78bfa',
    cardPaddingX: 9,
    candleInset: 5,
    cardGap: 8,
    cardTextSize: 14,
    rowGap: 10,
    topColumnGap: 16,
    instrumentFontSize: 20,
    showClose5: true,
    showClose15: true,
    showClose30: true,
    showClose45: true,
    showClose1H: true,
    showClose4H: true,
    badgeBullColor: '#22c55e',
    badgeBearColor: '#ef4444',
    badgeNeutralColor: '#94a3b8',

    // Legacy v1.5 options are retained only for safe settings migration.
    showClockRound: false,
    clockRoundMinutes: 15,
    closingBadgeColor: '#dbeafe',

    // Legacy v1.4 flags are kept so existing synced settings remain harmless.
    showHourRemaining: false,
    showFourHourRemaining: false,

    progressMode: 'remaining',
    offsetMinutes: 0
  };

  function migrateSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const merged = { ...DEFAULTS, ...source };
    const version = Number(source.settingsVersion || 0);

    if (version < 2) {
      // Apply the v1.2 layout repair only to pre-v1.2 installs.
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
    // v1.5 replaces the confusing legacy HTF line with clear close badges,
    // adds automatic symbol-aware round levels, and keeps every old position /
    // appearance choice intact.
    if (version < 5) {
      merged.autoRoundBySymbol = true;
      merged.showClose15 = true;
      merged.showClose30 = true;
      merged.showClose1H = true;
      merged.showClose4H = true;
      merged.showHourRemaining = false;
      merged.showFourHourRemaining = false;
    }
    if (version < 6) {
      merged.showLiveClock = true;
      merged.showClose5 = true;
      merged.showClose15 = true;
      merged.showClose30 = true;
      merged.showClose45 = true;
      merged.showClose1H = true;
      merged.showClose4H = true;
      merged.badgeBullColor = merged.roundUpColor || DEFAULTS.badgeBullColor;
      merged.badgeBearColor = merged.roundDownColor || DEFAULTS.badgeBearColor;
      merged.badgeNeutralColor = '#94a3b8';
      merged.showClockRound = false;
    }
    if (version < 7) {
      merged.clockFontFamily = DEFAULTS.clockFontFamily;
      merged.clockFontSize = DEFAULTS.clockFontSize;
      merged.clockFormat = DEFAULTS.clockFormat;
      merged.countdownUnitMode = DEFAULTS.countdownUnitMode;
      merged.candleBgOpacity = DEFAULTS.candleBgOpacity;
    }
    if (version < 8) {
      merged.clockFormat = '12h';
      merged.clockFontSize = 34;
      merged.countdownUnitMode = 'compact';
      merged.showInstrument = true;
      merged.instrumentColor = DEFAULTS.instrumentColor;
      merged.priceColor = DEFAULTS.priceColor;
      merged.timeframeCardWidth = DEFAULTS.timeframeCardWidth;
      merged.timeframeCardHeight = DEFAULTS.timeframeCardHeight;
      merged.candleBgOpacity = 26;
    }
    if (version < 9) {
      // Readability refresh: preserve custom values, but migrate the old v1.8 defaults.
      if (Number(source.ringSize) === 78 || source.ringSize == null) merged.ringSize = 70;
      if (Number(source.timeframeFontSize) === 17 || source.timeframeFontSize == null) merged.timeframeFontSize = 18;
      if (Number(source.descriptionFontSize) === 12 || source.descriptionFontSize == null) merged.descriptionFontSize = 13;
      if (Number(source.timeframeCardWidth) === 92 || source.timeframeCardWidth == null) merged.timeframeCardWidth = 96;
      if (Number(source.timeframeCardHeight) === 64 || source.timeframeCardHeight == null) merged.timeframeCardHeight = 68;
      if (Number(source.candleBgOpacity) === 26 || source.candleBgOpacity == null) merged.candleBgOpacity = 36;
    }
    merged.settingsVersion = SETTINGS_VERSION;
    return merged;
  }

  let settings = { ...DEFAULTS };
  let detectedTimeframe = null;
  let detectionSource = 'none';
  let frameDetectedTimeframe = null;
  let frameDetectedAt = 0;
  let frameMarketData = null;
  let frameMarketAt = 0;
  let lastScannerRequestAt = 0;
  let scannerRequestPending = false;
  let scannerOhlc = new Map();
  let scannerSymbolRef = null;
  let activeAssetKey = null;
  let assetGeneration = 0;
  let lastInstrument = null;
  let lastInstrumentAt = 0;
  let lastStatePersistAt = 0;
  let lastDetectionAt = 0;
  let detectionDirty = true;
  let dragging = null;
  let hostPosition = null;
  let lastPaint = 0;
  let lastEligibilityCheck = 0;
  let lastEligibilityHref = '';
  let chartPageActive = false;
  let lastPriceProbeAt = 0;
  let lastKnownPrice = null;
  let lastKnownPriceAt = 0;
  const candleDirectionState = new Map();
  const verifiedBoundaryAnchors = new Map();
  const providerOhlcHistory = new Map();
  const BOUNDARY_ANCHOR_MAX_AGE_MS = 18 * 60 * 60 * 1000;
  let lastOhlcProbeAt = 0;
  let lastSelectedDirection = null;
  let lastSelectedOhlcTf = null;

  const host = document.createElement('div');
  host.id = 'tfc-root-host';
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:2147483647',
    'display:none',
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
      circle { fill:none; }
      .progressCircle { transition:stroke .20s linear; }
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
        display:grid;
        grid-template-columns:auto auto;
        align-items:center;
        gap:var(--landscape-gap, 18px);
        width:max-content;
        height:auto;
        max-width:calc(100vw - 16px);
        padding:var(--panel-pad, 14px);
      }
      .miniRing {
        position:relative;
        width:var(--ring-diameter, 76px);
        height:var(--ring-diameter, 76px);
        display:grid;
        place-items:center;
        flex:none;
        filter:drop-shadow(0 0 8px color-mix(in srgb, var(--phase) 25%, transparent));
      }
      .miniRing svg {
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        transform:rotate(-90deg);
        overflow:visible;
      }
      .miniRing::after {
        content:"";
        position:absolute;
        right:calc(var(--landscape-gap, 18px) / -2);
        top:5px;
        bottom:5px;
        width:1px;
        background:linear-gradient(180deg, transparent, rgba(235,248,255,.42) 22%, rgba(235,248,255,.42) 78%, transparent);
        opacity:.38;
      }
      .landscapeRingCenter {
        position:relative;
        z-index:2;
        width:74%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:2px;
        text-align:center;
        pointer-events:none;
      }
      .landscapeTf {
        font-weight:950;
        line-height:1;
        letter-spacing:.02em;
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
        position:relative;
        min-width:0;
        width:max-content;
        display:flex;
        flex-direction:column;
        align-items:stretch;
        justify-content:center;
        gap:7px;
      }
      .landscapeTop {
        width:100%;
        min-width:0;
        display:grid;
        grid-template-columns:minmax(max-content, 1fr) 1px minmax(max-content, .88fr);
        align-items:center;
        gap:16px;
      }
      .landscapeCount {
        display:block;
        font-weight:950;
        line-height:.94;
        font-variant-numeric:tabular-nums;
        white-space:nowrap;
        letter-spacing:-.025em;
      }
      .topDivider {
        width:1px;
        height:70%;
        min-height:30px;
        background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--context-main, #fff) 48%, transparent), transparent);
      }
      .liveClock {
        display:flex;
        align-items:center;
        justify-content:flex-end;
        color:var(--clock-color, #d9f4ff);
        font-weight:950;
        line-height:.95;
        font-variant-numeric:tabular-nums;
        white-space:nowrap;
        background:transparent;
        border:none;
        box-shadow:none;
        letter-spacing:.01em;
        text-shadow:0 0 10px color-mix(in srgb, var(--clock-color, #d9f4ff) 22%, transparent), 0 1px 2px rgba(0,0,0,.85);
      }
      .liveClock .clockValue { font-family:var(--clock-font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace); }
      .phasePill {
        display:none !important;
      }
      .marketContext {
        width:100%;
        min-width:0;
        display:flex;
        flex-direction:column;
        gap:7px;
        font-variant-numeric:tabular-nums;
      }
      .contextRow {
        min-width:0;
        display:grid;
        grid-template-columns:minmax(170px, .95fr) minmax(250px, 1.15fr);
        align-items:stretch;
        gap:0;
        white-space:nowrap;
        border:1px solid rgba(255,255,255,.12);
        border-radius:10px;
        background:rgba(255,255,255,.028);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.035);
        overflow:hidden;
      }
      .infoSubpanel {
        min-height:36px;
        display:flex;
        font-size:1.32em;
        align-items:center;
        gap:10px;
        padding:5px 10px;
        border:0;
        border-radius:0;
        background:transparent;
        box-shadow:none;
      }
      .instrumentPanel { justify-content:flex-start; }
      .instrumentSymbol {
        color:var(--instrument-color, #f8fafc);
        font-weight:950;
        letter-spacing:.035em;
      }
      .instrumentPrice {
        color:var(--price-color, #22e3a2);
        font-weight:950;
        letter-spacing:.01em;
      }
      .rangePanel {
        justify-content:flex-start;
        gap:16px;
        border-left:1px solid rgba(255,255,255,.10);
        text-align:left;
      }
      .contextRow.only-range { grid-template-columns:minmax(260px, 1fr); }
      .contextRow.only-range .rangePanel { border-left:0; }
      .contextRow.only-instrument { grid-template-columns:minmax(190px, 1fr); }
      .contextItem {
        display:inline-flex;
        align-items:baseline;
        gap:5px;
        min-width:0;
        font-weight:900;
        letter-spacing:.008em;
      }
      .contextItem .k { font-size:.95em; font-weight:1000; }
      .contextItem .v { font-weight:1000; }
      .contextItem .distance {
        font-size:.82em;
        font-weight:850;
        opacity:.78;
        letter-spacing:0;
      }
      .roundUp, .roundUp .v { color:var(--round-up, #22e3a2); }
      .roundDown, .roundDown .v { color:var(--round-down, #ff4f5e); }
      .roundUp.major .v, .roundDown.major .v {
        font-weight:1000;
        letter-spacing:.018em;
        text-shadow:0 0 8px currentColor;
      }
      .contextDashboard {
        display:block;
        width:100%;
        max-width:none;
      }
      .closeBadges {
        display:grid;
        grid-auto-flow:column;
        grid-auto-columns:var(--card-width, 96px);
        gap:8px;
        align-items:stretch;
        justify-content:start;
      }
      .closeBadge {
        --badge-tone:var(--badge-neutral, #94a3b8);
        --wick-start:5%;
        --wick-end:95%;
        --body-start:43%;
        --body-end:57%;
        position:relative;
        display:grid;
        grid-template-rows:minmax(34px, 1fr) auto;
        align-items:stretch;
        justify-items:stretch;
        width:var(--card-width, 96px);
        height:var(--card-height, 68px);
        min-width:0;
        padding:5px 6px 4px;
        border:1px solid color-mix(in srgb, var(--badge-tone) 82%, transparent);
        border-radius:11px;
        color:var(--badge-tone);
        background:linear-gradient(180deg, color-mix(in srgb, var(--badge-tone) 10%, rgba(7,15,28,.76)), rgba(7,15,28,.84));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.055), 0 0 10px color-mix(in srgb, var(--badge-tone) 13%, transparent);
        overflow:hidden;
        isolation:isolate;
        transition:color .16s linear, border-color .16s linear, background .16s linear, opacity .16s linear;
      }
      .closeBadge.bull { --badge-tone:var(--badge-bull, #22e3a2); }
      .closeBadge.bear { --badge-tone:var(--badge-bear, #ff4f5e); }
      .closeBadge.flat, .closeBadge.unknown { --badge-tone:var(--badge-neutral, #94a3b8); }
      .closeBadge.estimated { opacity:.90; }
      .candlePreview {
        position:relative;
        width:100%;
        height:100%;
        min-height:34px;
        align-self:center;
        overflow:hidden;
      }
      .candlePreview::before {
        content:"";
        position:absolute;
        left:var(--wick-start);
        width:calc(var(--wick-end) - var(--wick-start));
        top:50%;
        height:3px;
        transform:translateY(-50%);
        border-radius:999px;
        background:color-mix(in srgb, var(--badge-tone) 94%, transparent);
        box-shadow:0 0 7px color-mix(in srgb, var(--badge-tone) 26%, transparent);
        opacity:var(--candle-opacity, .86);
      }
      .candlePreview::after {
        content:"";
        position:absolute;
        left:var(--body-start);
        width:max(2px, calc(var(--body-end) - var(--body-start)));
        top:24%;
        bottom:24%;
        border-radius:3px;
        background:color-mix(in srgb, var(--badge-tone) 96%, transparent);
        border:1px solid color-mix(in srgb, var(--badge-tone) 100%, transparent);
        box-shadow:0 0 9px color-mix(in srgb, var(--badge-tone) 30%, transparent), inset 0 1px 0 rgba(255,255,255,.11);
        opacity:var(--candle-opacity, .86);
      }
      .candleMarkerOpen,
      .candleMarkerClose { display:none; }
      .cardMeta {
        position:relative;
        z-index:2;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        min-height:22px;
        padding:3px 2px 1px;
        border:0;
        border-radius:0;
        background:transparent;
        box-shadow:none;
        font-size:1.14em;
        line-height:1;
        white-space:nowrap;
        text-shadow:0 1px 2px rgba(0,0,0,.9);
      }
      .closeBadge .bTf { color:#f8fafc; opacity:1; font-weight:1000; letter-spacing:.015em; }
      .closeBadge .bVal { color:currentColor; font-weight:1000; font-variant-numeric:tabular-nums; }
      .closeBadge[data-quality="exact"] .candlePreview { opacity:1; }
      .closeBadge[data-quality="tracking"] .candlePreview { opacity:.88; }
      .closeBadge[data-quality="unknown"] .candlePreview { opacity:.52; }

      /* v1.10: intrinsic card sizing prevents long countdown clipping. */
      .landscape { grid-template-columns:auto minmax(max-content, 1fr); align-items:start; row-gap:10px; }
      .miniRing { grid-column:1; grid-row:1; align-self:center; }
      .landscapeMain { grid-column:2; grid-row:1; min-width:0; }
      .landscapeTop { grid-template-columns:auto auto minmax(max-content, 1fr); gap:16px; }
      .topDivider { display:none !important; }
      .instrumentPanel { padding:0; min-height:0; gap:8px; font-size:var(--instrument-size, 20px); white-space:nowrap; color:var(--instrument-color, #f8fafc); }
      .instrumentPrice { color:var(--price-color, #22e3a2); }
      .contextRow, .contextRow.only-range, .contextRow.only-instrument { display:flex; border:0; background:transparent; box-shadow:none; overflow:visible; }
      .rangePanel { border:0; padding:6px 0 0; min-height:26px; }
      .contextDashboard { grid-column:1 / -1; grid-row:2; }
      .closeBadges { grid-auto-columns:minmax(var(--card-width, 96px), 1fr); justify-content:stretch; }
      .closeBadge, .closeBadge.unknown { width:auto; min-width:max-content; max-width:none; font-size:inherit; text-align:center; line-height:normal; box-sizing:border-box; height:max(var(--card-height, 68px), 78px); grid-template-rows:minmax(34px, 1fr) auto; padding:6px 9px; }
      .cardMeta { gap:6px; padding:5px 2px 1px; min-height:24px; }
      .candlePreview { min-height:34px; min-width:0; }
      .candlePreview::after { box-sizing:border-box; max-width:calc(100% - var(--body-start)); }

      .landscapeMain { width:100%; }
      .landscapeTop { grid-template-columns:repeat(3, minmax(max-content, 1fr)); gap:var(--top-gap); }
      .landscapeCount { justify-self:start; }
      .instrumentPanel { justify-self:center; }
      .liveClock { justify-self:end; }
      .landscape { row-gap:var(--row-gap); }
      .closeBadges { gap:var(--card-gap); }
      .closeBadge, .closeBadge.unknown { padding-left:var(--card-padding-x); padding-right:var(--card-padding-x); cursor:pointer; }
      .cardMeta { font-size:var(--card-text-size); }
      .closeBadge.selected { border-color:var(--selected-tf); outline:2px solid var(--selected-tf); outline-offset:-2px; background:linear-gradient(180deg, color-mix(in srgb, var(--selected-tf) 22%, #101827), #091322); }
      .closeBadge.selected .bTf { color:var(--selected-tf); }
      .closeBadge:focus-visible { outline:2px solid #fff; outline-offset:2px; }
      .remainingLabel { display:none !important; }

      .badge {
        display:grid;
        grid-template-columns:auto auto;
        grid-template-areas:
          "tf count"
          "ctx ctx";
        align-items:center;
        column-gap:9px;
        row-gap:5px;
        width:max-content;
        max-width:calc(100vw - 16px);
        height:auto;
        padding:8px 12px 10px;
      }
      .badgeTf { grid-area:tf; font-weight:950; line-height:1; letter-spacing:.025em; white-space:nowrap; }
      .badgeCount { grid-area:count; font-weight:900; line-height:1; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .badgeRight {
        grid-area:ctx;
        display:flex;
        flex-direction:row;
        align-items:center;
        justify-content:flex-start;
        min-width:0;
        max-width:none;
        gap:6px;
      }
      .badgeContext {
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        gap:3px;
        white-space:nowrap;
        font-variant-numeric:tabular-nums;
        font-weight:800;
        line-height:1.05;
      }
      .badgeContextLine { max-width:100%; }
      .badgePhase { font-size:8px; font-weight:900; letter-spacing:.08em; }

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
        transition:background-color .32s linear;
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
          <div class="landscapeTop">
            <div class="landscapeCount" id="landscapeCount"></div>
            <div class="topDivider" aria-hidden="true"></div>
            <div class="liveClock" id="liveClock" title="Current local clock time"><span class="clockValue" id="liveClockValue">--:-- --</span></div>
            <span class="phasePill" id="phasePill"></span>
          </div>
          <div class="marketContext" id="marketContext">
            <div class="contextRow" id="roundRow">
              <div class="infoSubpanel instrumentPanel" id="instrumentPanel">
                <span class="instrumentSymbol" id="instrumentSymbol">--</span>
                <span class="instrumentPrice" id="instrumentPrice">--</span>
              </div>
              <div class="infoSubpanel rangePanel" id="rangePanel">
                <span class="contextItem roundUp" id="roundUp" title="Nearest round price above current price"><span class="k">▲</span><span class="v" id="roundUpValue">--</span><span class="distance" id="roundUpDistance">(--)</span></span>
                <span class="contextItem roundDown" id="roundDown" title="Nearest round price below current price"><span class="k">▼</span><span class="v" id="roundDownValue">--</span><span class="distance" id="roundDownDistance">(--)</span></span>
              </div>
            </div>
            <div class="contextDashboard" id="contextDashboard">
              <div class="closeBadges" id="closeBadges" title="Live current-candle OHLC preview for each timeframe">
                <div class="closeBadge unknown" id="close3" data-tf="3m"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">3M</span><span class="bVal" id="close3Value">--</span></div></div>
                <div class="closeBadge unknown" id="close5" data-tf="5m"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">5M</span><span class="bVal" id="close5Value">--</span></div></div>
                <div class="closeBadge unknown" id="close15" data-tf="15m"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">15M</span><span class="bVal" id="close15Value">--</span></div></div>
                <div class="closeBadge unknown" id="close30" data-tf="30m"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">30M</span><span class="bVal" id="close30Value">--</span></div></div>
                <div class="closeBadge unknown" id="close45" data-tf="45m"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">45M</span><span class="bVal" id="close45Value">--</span></div></div>
                <div class="closeBadge unknown" id="close1H" data-tf="1h"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">1H</span><span class="bVal" id="close1HValue">--</span></div></div>
                <div class="closeBadge unknown" id="close4H" data-tf="4h"><div class="candlePreview"><span class="candleMarkerOpen"></span><span class="candleMarkerClose"></span></div><div class="cardMeta"><span class="bTf">4H</span><span class="bVal" id="close4HValue">--</span></div></div>
              </div>
            </div>
          </div>
          <span class="remainingLabel" id="remainingLabel" hidden></span>
        </div>
      </div>

      <div class="badge" id="badge" hidden>
        <div class="badgeTf" id="badgeTf"></div>
        <div class="badgeCount" id="badgeCount"></div>
        <div class="badgeRight">
          <div class="badgeContext" id="badgeContext">
            <div class="badgeContextLine" id="badgeContextLine1">▲ --  ▼ --</div>
            <div class="badgeContextLine" id="badgeContextLine2">15M --  •  30M --  •  1H --  •  4H --</div>
          </div>
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
  // Two main rows: ring + two information lines, then full-width candles.
  const topLine = shadow.querySelector('.landscapeTop');
  topLine.insertBefore(shadow.getElementById('instrumentPanel'), shadow.getElementById('liveClock'));
  shadow.getElementById('landscape').appendChild(shadow.getElementById('contextDashboard'));
  const miniRing = shadow.getElementById('miniRing');
  const miniPct = shadow.getElementById('miniPct');
  const landscapeTf = shadow.getElementById('landscapeTf');
  const landscapeCount = shadow.getElementById('landscapeCount');
  const topDivider = shadow.querySelector('.topDivider');
  const phasePill = shadow.getElementById('phasePill');
  const remainingLabel = shadow.getElementById('remainingLabel');
  const marketContext = shadow.getElementById('marketContext');
  const roundUp = shadow.getElementById('roundUp');
  const roundUpValue = shadow.getElementById('roundUpValue');
  const roundUpDistance = shadow.getElementById('roundUpDistance');
  const roundDown = shadow.getElementById('roundDown');
  const roundDownValue = shadow.getElementById('roundDownValue');
  const roundDownDistance = shadow.getElementById('roundDownDistance');
  const roundRow = shadow.getElementById('roundRow');
  const instrumentPanel = shadow.getElementById('instrumentPanel');
  const instrumentSymbol = shadow.getElementById('instrumentSymbol');
  const instrumentPrice = shadow.getElementById('instrumentPrice');
  const rangePanel = shadow.getElementById('rangePanel');
  const contextDashboard = shadow.getElementById('contextDashboard');
  const liveClock = shadow.getElementById('liveClock');
  const liveClockValue = shadow.getElementById('liveClockValue');
  const closeBadges = shadow.getElementById('closeBadges');
  const close3 = shadow.getElementById('close3');
  const close3Value = shadow.getElementById('close3Value');
  const close5 = shadow.getElementById('close5');
  const close5Value = shadow.getElementById('close5Value');
  const close15 = shadow.getElementById('close15');
  const close15Value = shadow.getElementById('close15Value');
  const close30 = shadow.getElementById('close30');
  const close30Value = shadow.getElementById('close30Value');
  const close45 = shadow.getElementById('close45');
  const close45Value = shadow.getElementById('close45Value');
  const close1H = shadow.getElementById('close1H');
  const close1HValue = shadow.getElementById('close1HValue');
  const close4H = shadow.getElementById('close4H');
  const close4HValue = shadow.getElementById('close4HValue');
  let chartFrameId = 0;
  const closeBadgeElements = [close3, close5, close15, close30, close45, close1H, close4H];
  const badgeTf = shadow.getElementById('badgeTf');
  const badgeCount = shadow.getElementById('badgeCount');
  const badgeContext = shadow.getElementById('badgeContext');
  const badgeContextLine1 = shadow.getElementById('badgeContextLine1');
  const badgeContextLine2 = shadow.getElementById('badgeContextLine2');
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
    host.style.display = settings.enabled && isEligibleChartPage() ? 'block' : 'none';
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
      wrap.style.maxWidth = '';
      classic.style.padding = `${pad}px`;
    } else {
      // v1.5 auto-sizes the panel from its actual font/ring/content dimensions.
      // Larger popup font settings therefore grow the box instead of clipping it.
      wrap.style.width = 'max-content';
      wrap.style.height = 'auto';
      wrap.style.maxWidth = 'calc(100vw - 16px)';
    }

    const landscapeRingSize = Math.max(48, ringSize);
    const contextSizeBase = clampNumber(settings.descriptionFontSize, 7, 24, 12);
    const landscapeGap = Math.max(10, Math.min(26, contextSizeBase * 1.25));
    wrap.style.setProperty('--panel-pad', `${pad}px`);
    wrap.style.setProperty('--ring-diameter', `${landscapeRingSize}px`);
    wrap.style.setProperty('--landscape-gap', `${landscapeGap}px`);
    wrap.style.setProperty('--card-width', `${clampNumber(settings.timeframeCardWidth, 72, 150, 96)}px`);
    for (const [name, value, min, max, fallback] of [
      ['--card-padding-x', settings.cardPaddingX, 0, 30, 9],
      ['--card-gap', settings.cardGap, 0, 24, 8],
      ['--card-text-size', settings.cardTextSize, 9, 28, 14],
      ['--row-gap', settings.rowGap, 0, 30, 10],
      ['--top-gap', settings.topColumnGap, 0, 40, 16]
    ]) wrap.style.setProperty(name, `${clampNumber(value, min, max, fallback)}px`);
    wrap.style.setProperty('--selected-tf', normalizeHex(settings.selectedTimeframeColor, DEFAULTS.selectedTimeframeColor));
    wrap.style.setProperty('--card-height', `${clampNumber(settings.timeframeCardHeight, 54, 100, 68)}px`);
    wrap.style.setProperty('--candle-opacity', String(clampNumber(settings.candleBgOpacity, 0, 100, 36) / 100));

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
    const landscapeCountSize = Math.max(18, clampNumber(settings.fontSize, 10, 64, 34));
    landscapeCount.style.fontSize = `${landscapeCountSize}px`;
    landscapeCount.style.textShadow = textShadow;
    remainingLabel.style.color = muted;
    const contextSize = Math.max(8, clampNumber(settings.descriptionFontSize, 7, 24, 12));
    marketContext.style.color = muted;
    marketContext.style.fontSize = `${contextSize}px`;
    marketContext.style.setProperty('--context-main', text);
    marketContext.style.setProperty('--muted-row', muted);
    marketContext.style.setProperty('--round-up', normalizeHex(settings.roundUpColor, DEFAULTS.roundUpColor));
    marketContext.style.setProperty('--round-down', normalizeHex(settings.roundDownColor, DEFAULTS.roundDownColor));
    wrap.style.setProperty('--instrument-size', `${clampNumber(settings.instrumentFontSize, 10, 40, 20)}px`);
    wrap.style.setProperty('--instrument-color', normalizeHex(settings.instrumentColor, DEFAULTS.instrumentColor));
    wrap.style.setProperty('--price-color', normalizeHex(settings.priceColor, DEFAULTS.priceColor));
    marketContext.style.setProperty('--instrument-color', normalizeHex(settings.instrumentColor, DEFAULTS.instrumentColor));
    marketContext.style.setProperty('--price-color', normalizeHex(settings.priceColor, DEFAULTS.priceColor));
    marketContext.style.setProperty('--clock-color', normalizeHex(settings.clockColor, DEFAULTS.clockColor));
    marketContext.style.setProperty('--clock-font', settings.clockFontFamily || DEFAULTS.clockFontFamily);
    marketContext.style.setProperty('--badge-bull', normalizeHex(settings.badgeBullColor, DEFAULTS.badgeBullColor));
    marketContext.style.setProperty('--badge-bear', normalizeHex(settings.badgeBearColor, DEFAULTS.badgeBearColor));
    marketContext.style.setProperty('--badge-neutral', normalizeHex(settings.badgeNeutralColor, DEFAULTS.badgeNeutralColor));

    // Dashboard now lives outside marketContext; retain popup typography/colors.
    contextDashboard.style.fontSize = `${contextSize}px`;
    for (const [name, value] of [['--badge-bull', settings.badgeBullColor], ['--badge-bear', settings.badgeBearColor], ['--badge-neutral', settings.badgeNeutralColor]]) {
      contextDashboard.style.setProperty(name, normalizeHex(value, name === '--badge-bull' ? DEFAULTS.badgeBullColor : name === '--badge-bear' ? DEFAULTS.badgeBearColor : DEFAULTS.badgeNeutralColor));
    }
    liveClock.style.fontFamily = settings.clockFontFamily || DEFAULTS.clockFontFamily;
    liveClock.style.fontSize = `${Math.max(16, clampNumber(settings.clockFontSize, 12, 54, 34))}px`;
    liveClock.style.color = normalizeHex(settings.clockColor, DEFAULTS.clockColor);

    badgeTf.style.color = text;
    badgeTf.style.fontSize = `${Math.max(15, clampNumber(settings.timeframeFontSize, 8, 34, 17) * 1.45)}px`;
    badgeTf.style.textShadow = textShadow;
    badgeCount.style.color = text;
    badgeCount.style.fontSize = `${clampNumber(settings.fontSize, 10, 64, 34)}px`;
    badgeCount.style.textShadow = textShadow;
    badgeContext.style.color = muted;
    badgeContext.style.fontSize = `${Math.max(8, clampNumber(settings.descriptionFontSize, 7, 24, 12) * 0.9)}px`;

    miniRing.style.width = `${landscapeRingSize}px`;
    miniRing.style.height = `${landscapeRingSize}px`;

    for (const c of trackCircles) {
      c.style.stroke = normalizeHex(settings.trackColor, DEFAULTS.trackColor);
      c.style.strokeWidth = thickness;
    }
    for (const c of progressCircles) {
      c.style.stroke = normalizeHex(settings.ringColor, DEFAULTS.ringColor);
      c.style.strokeWidth = thickness;
      // Butt caps keep the drain gap open instead of covering it with rounded ends.
      c.style.strokeLinecap = 'butt';
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
    const anyCloseBadges = Boolean(settings.showClose3 || settings.showClose5 || settings.showClose15 || settings.showClose30 || settings.showClose45 || settings.showClose1H || settings.showClose4H);
    const anyMarketContext = Boolean(settings.showInstrument || settings.showRoundNumbers || anyCloseBadges);
    marketContext.style.display = anyMarketContext ? '' : 'none';
    roundRow.style.display = (settings.showInstrument || settings.showRoundNumbers) ? '' : 'none';
    roundRow.classList.toggle('only-range', !settings.showInstrument && settings.showRoundNumbers);
    roundRow.classList.toggle('only-instrument', settings.showInstrument && !settings.showRoundNumbers);
    instrumentPanel.style.display = settings.showInstrument ? '' : 'none';
    rangePanel.style.display = settings.showRoundNumbers ? '' : 'none';
    roundUp.style.display = settings.showRoundNumbers ? '' : 'none';
    roundDown.style.display = settings.showRoundNumbers ? '' : 'none';
    contextDashboard.style.display = anyCloseBadges ? '' : 'none';
    liveClock.style.display = settings.showLiveClock ? '' : 'none';
    if (topDivider) topDivider.style.display = settings.showLiveClock ? '' : 'none';
    closeBadges.style.display = anyCloseBadges ? '' : 'none';
    close3.style.display = settings.showClose3 ? '' : 'none';
    close5.style.display = settings.showClose5 ? '' : 'none';
    close15.style.display = settings.showClose15 ? '' : 'none';
    close30.style.display = settings.showClose30 ? '' : 'none';
    close45.style.display = settings.showClose45 ? '' : 'none';
    close1H.style.display = settings.showClose1H ? '' : 'none';
    close4H.style.display = settings.showClose4H ? '' : 'none';
    badgeContext.style.display = anyMarketContext ? '' : 'none';

    clampPosition();
  }

  function hostSiteType() {
    const h = location.hostname.toLowerCase();
    if (h.includes('tradingview.com')) return 'tradingview';
    if (h.includes('exness') || h.includes('exwebterm') || h.includes('extrade')) return 'exness';
    return 'other';
  }

  function hasChartEvidence() {
    try {
      return Boolean(document.querySelector([
        '#tv_chart_container',
        '[data-name="header-intervals-button"]',
        '[data-testid*="chart" i]',
        '[data-test*="chart" i]',
        'iframe[src*="chart" i]',
        'iframe[src*="terminal" i]',
        'iframe[src*="trading" i]',
        '[class*="chart-container" i]',
        '[class*="chartContainer" i]'
      ].join(',')));
    } catch (_) {
      return false;
    }
  }

  function computeChartEligibility() {
    const site = hostSiteType();
    const path = location.pathname.toLowerCase();
    const hostName = location.hostname.toLowerCase();

    if (site === 'tradingview') {
      // TradingView's full chart lives under /chart/. The toolbar selector is
      // a fallback for SPA/embedded variants that still expose the real chart.
      return /^\/chart(?:\/|$)/.test(path) || Boolean(document.querySelector('[data-name="header-intervals-button"]'));
    }

    if (site === 'exness') {
      const explicitTerminalPath = /\/(?:webtrading|web-terminal|terminal)(?:\/|$)/.test(path);
      const dedicatedTerminalHost = hostName.includes('exwebterm.com') || hostName.includes('extrade.global');
      const recentFrameSignal = Boolean(frameDetectedTimeframe && Date.now() - frameDetectedAt < 10_000);
      const localControlSignal = Boolean(detectExnessFromDocument(document));
      const evidence = hasChartEvidence() || recentFrameSignal || localControlSignal;

      // On normal exness.com pages we require either the known terminal URL or
      // genuine chart controls. Dedicated terminal hosts still require chart
      // evidence so login/landing screens never get the overlay.
      if (explicitTerminalPath) return true;
      if (dedicatedTerminalHost) return evidence;
      return localControlSignal || recentFrameSignal;
    }

    return false;
  }

  function isEligibleChartPage(force = false) {
    const now = Date.now();
    const href = location.href;
    if (!force && href === lastEligibilityHref && now - lastEligibilityCheck < 500) {
      return chartPageActive;
    }
    lastEligibilityHref = href;
    lastEligibilityCheck = now;
    chartPageActive = computeChartEligibility();
    return chartPageActive;
  }

  function parsePriceFromText(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/^\s*\(\d+\)\s*/, '').replace(/\u2212/g, '-');

    const explicit = text.match(/\b(?:bid|ask|last|price)\b[^0-9]{0,20}([0-9][0-9,]*(?:\.[0-9]+)?)/i);
    if (explicit) {
      const n = Number(explicit[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }

    const matches = [...text.matchAll(/(^|[^A-Za-z0-9])([0-9][0-9,]*(?:\.[0-9]+)?)(?![A-Za-z0-9])/g)];
    for (const match of matches) {
      const token = match[2];
      const end = (match.index || 0) + match[0].length;
      const following = text.slice(end, end + 2);
      if (/^\s*%/.test(following)) continue;
      const n = Number(token.replace(/,/g, ''));
      if (!Number.isFinite(n) || n <= 0) continue;
      // Decimal/comma prices are strong candidates. Integer prices are accepted
      // when large enough to be a realistic quoted market value.
      if (token.includes('.') || token.includes(',') || n >= 100) return n;
    }
    return null;
  }

  function visibleChartSymbol() {
    // Native chart header beats a stale ?symbol= URL after SPA navigation.
    for (const selector of ['[data-name="header-toolbar-symbol-search"]', '[data-name="header-toolbar-symbol-search-button"]', '[data-name="legend-source-title"]']) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisibleElement(el)) continue;
        const raw = el.getAttribute('data-symbol') || el.textContent || '';
        const token = raw.trim().match(/^([A-Z0-9_.-]+:[A-Z0-9_.!\/-]+|[A-Z0-9_.!\/-]+)/i)?.[1];
        const name = cleanInstrumentName(token);
        if (name) return {name, ref:token.includes(':') ? token.toUpperCase() : null};
      }
    }
    const token = String(document.title || '').replace(/^\s*\(\d+\)\s*/, '').match(/^([A-Z0-9._!/-]{2,20})\s+[0-9]/i)?.[1];
    return token ? {name:cleanInstrumentName(token), ref:null} : null;
  }

  function detectTradingViewSymbolRef() {
    if (hostSiteType() !== 'tradingview') return null;
    const visible = visibleChartSymbol();
    if (visible?.ref) return visible.ref;
    // Some chart builds expose the full exchange-qualified identity in data attributes.
    for (const el of document.querySelectorAll('[data-name="legend-source-item"] [data-symbol], [data-name="header-toolbar-symbol-search"][data-symbol]')) {
      if (!isVisibleElement(el)) continue;
      const ref = String(el.getAttribute('data-symbol') || '').toUpperCase();
      if (/^[A-Z0-9_.-]+:[A-Z0-9_.!\/-]+$/.test(ref) && (!visible || cleanInstrumentName(ref) === visible.name)) return ref;
    }
    try {
      const raw = new URL(location.href).searchParams.get('symbol');
      const value = String(raw || '').replace(/^=/, '').trim().toUpperCase();
      if (/^[A-Z0-9_.-]+:[A-Z0-9_.!\/-]+$/.test(value) && (!visible || cleanInstrumentName(value) === visible.name)) return value;
    } catch (_) {}
    return null;
  }

  function cleanInstrumentName(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
    if (s.includes(':')) s = s.split(':').pop();
    s = s.replace(/\//g, '');
    s = s.replace(/[^A-Z0-9._!-]/g, '');
    if (!s || s.length > 18) return null;
    if (/^(BID|ASK|OPEN|HIGH|LOW|CLOSE|VOLUME|CHG|CHANGE)$/.test(s)) return null;
    return s;
  }

  function detectInstrument(now = Date.now()) {
    if (now - lastInstrumentAt < 500 && lastInstrument) return lastInstrument;
    lastInstrumentAt = now;
    const site = hostSiteType();

    if (site === 'tradingview') {
      const visible = visibleChartSymbol();
      if (visible?.name) return (lastInstrument = visible.name);
    }

    // A visible top-page title/selected instrument must beat a stale iframe
    // snapshot immediately after an Exness/SPA symbol switch.
    const title = String(document.title || '').replace(/^\s*\(\d+\)\s*/, '').trim();
    const ex = title.match(/^([A-Z0-9._!/-]{3,20})\s+(?:Bid|Ask)\b/i);
    if (ex) {
      const n = cleanInstrumentName(ex[1]);
      if (n) return (lastInstrument = n);
    }
    const quoted = title.match(/^([A-Z0-9._!/-]{2,20})\s+[0-9][0-9,]*(?:\.[0-9]+)?/i);
    if (quoted) {
      const n = cleanInstrumentName(quoted[1]);
      if (n) return (lastInstrument = n);
    }

    if (site === 'tradingview') {
      const tvRef = detectTradingViewSymbolRef();
      if (tvRef) {
        const n = cleanInstrumentName(tvRef);
        if (n) return (lastInstrument = n);
      }
    }

    try {
      const selectedSelectors = [
        '[data-testid*="selected-symbol" i]',
        '[data-test*="selected-symbol" i]',
        '[data-testid*="selected-instrument" i]',
        '[data-test*="selected-instrument" i]',
        '[aria-current="true"][data-testid*="symbol" i]',
        '[aria-selected="true"][data-testid*="symbol" i]'
      ];
      for (const selector of selectedSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (!isVisibleElement(el)) continue;
          const raw = el.getAttribute?.('data-symbol') || el.textContent || el.getAttribute?.('aria-label') || '';
          const token = raw.toUpperCase().match(/\b[A-Z][A-Z0-9._!-]{1,17}(?:\/[A-Z0-9._!-]{1,12})?\b/)?.[0];
          const n = cleanInstrumentName(token);
          if (n) return (lastInstrument = n);
        }
      }
    } catch (_) {}

    if (frameMarketData && now - frameMarketAt < 3000) {
      const framed = cleanInstrumentName(frameMarketData.symbol);
      if (framed) return (lastInstrument = framed);
    }

    try {
      const selectors = [
        '[data-name*="legend-source-title" i]',
        '[data-testid*="symbol" i]',
        '[data-test*="symbol" i]',
        '[aria-label*="symbol" i]'
      ];
      let scanned = 0;
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (scanned++ > 30) break;
          if (!isVisibleElement(el)) continue;
          const raw = el.getAttribute?.('data-symbol') || el.textContent || el.getAttribute?.('aria-label') || '';
          const token = raw.toUpperCase().match(/\b[A-Z][A-Z0-9._!-]{1,17}(?:\/[A-Z0-9._!-]{1,12})?\b/)?.[0];
          const n = cleanInstrumentName(token);
          if (n) return (lastInstrument = n);
        }
      }
    } catch (_) {}
    return lastInstrument || '--';
  }

  function detectCurrentPrice(now = Date.now()) {
    if (now - lastPriceProbeAt < 180) {
      return now - lastKnownPriceAt < 4000 ? lastKnownPrice : null;
    }
    lastPriceProbeAt = now;

    let price = null;
    if (frameMarketData && cleanInstrumentName(frameMarketData.symbol) === lastInstrument && now - frameMarketAt < 2500 && Number.isFinite(frameMarketData.price)) {
      price = frameMarketData.price;
    }
    if (!price) {
      const titleSymbol = String(document.title || '').replace(/^\s*\(\d+\)\s*/, '').match(/^([A-Z0-9._!/-]{2,20})\s+[0-9]/i)?.[1];
      if (!titleSymbol || cleanInstrumentName(titleSymbol) === lastInstrument) price = parsePriceFromText(document.title);
    }
    if (!price) {
      const selectors = [
        '[data-testid*="bid" i]',
        '[data-testid*="ask" i]',
        '[data-testid*="price" i]',
        '[data-test*="bid" i]',
        '[data-test*="ask" i]',
        '[data-test*="price" i]',
        '[aria-label*="price" i]'
      ];
      let scanned = 0;
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (scanned++ > 50) break;
          if (!isVisibleElement(el)) continue;
          price = parsePriceFromText(el.textContent || el.getAttribute?.('aria-label') || '');
          if (price) break;
        }
        if (price || scanned > 50) break;
      }
    }

    if (!price) {
      const selected = detectedTimeframe && scannerOhlc.get(detectedTimeframe);
      if (selected && Number.isFinite(selected.close) && now - selected.fetchedAt < 5000) price = selected.close;
      if (!price) {
        const any = [...scannerOhlc.values()].find(v => Number.isFinite(v.close) && now - v.fetchedAt < 5000);
        if (any) price = any.close;
      }
    }

    if (Number.isFinite(price) && price > 0) {
      lastKnownPrice = price;
      lastKnownPriceAt = now;
      return price;
    }
    return now - lastKnownPriceAt < 4000 ? lastKnownPrice : null;
  }

  function detectSymbolProfile() {
    const instrument = detectInstrument(Date.now());
    const source = String(instrument || '').toUpperCase();

    if (/\b(BTC|BTCUSD|BTCUSDT|BITCOIN)\b/.test(source)) {
      return { key: 'BTC', step: 500, majorStep: 5000 };
    }
    if (/\b(XAU(?:USD)?|GOLD)\b/.test(source)) {
      return { key: 'GOLD', step: 10, majorStep: 100 };
    }
    if (/\b(USOIL|WTI|XTI(?:USD)?|CRUDE(?:\s+OIL)?)\b/.test(source)) {
      return { key: 'USOIL', step: 0.1, majorStep: 0.5 };
    }

    const fx = source.match(/^([A-Z]{6})(?:[._-]?[A-Z0-9]{1,4})?$/);
    if (fx) {
      const pair = fx[1];
      return {key:pair, step:pair.endsWith('JPY') ? 0.1 : 0.001, majorStep:pair.endsWith('JPY') ? 1 : 0.01};
    }
    const fallback = clampNumber(settings.roundNumberStep, 0.00000001, 1e12, 5);
    return { key: 'CUSTOM', step: fallback, majorStep: fallback * 10 };
  }

  function isMajorRound(value, majorStep) {
    if (!Number.isFinite(value) || !Number.isFinite(majorStep) || majorStep <= 0) return false;
    const units = value / majorStep;
    return Math.abs(units - Math.round(units)) < 1e-7;
  }

  function decimalPlacesForStep(step) {
    const n = Math.abs(Number(step));
    if (!Number.isFinite(n) || n <= 0) return 0;
    for (let d = 0; d <= 8; d++) {
      if (Math.abs(n - Number(n.toFixed(d))) < 1e-10) return d;
    }
    return 8;
  }

  function formatRoundPrice(value, step) {
    if (!Number.isFinite(value)) return '--';
    const decimals = decimalPlacesForStep(step);
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatRoundDistance(value) {
    if (!Number.isFinite(value)) return '(--)';
    const n = Math.abs(value);
    let decimals = 0;
    if (n < 1) decimals = 3;
    else if (n < 10) decimals = 3;
    else if (n < 100) decimals = 2;
    else if (n < 1000 && Math.abs(n - Math.round(n)) > 1e-8) decimals = 1;
    return `(${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })})`;
  }

  function formatLivePrice(value) {
    if (!Number.isFinite(value)) return '--';
    const profile = detectSymbolProfile();
    const max = profile.key === 'USOIL' ? 3 : profile.key === 'GOLD' ? 3 : profile.key === 'BTC' ? 2 : 5;
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max });
  }

  function roundLevels(price) {
    const profile = settings.autoRoundBySymbol ? detectSymbolProfile() : {
      key: 'CUSTOM',
      step: clampNumber(settings.roundNumberStep, 0.00000001, 1e12, 5),
      majorStep: clampNumber(settings.roundNumberStep, 0.00000001, 1e12, 5) * 10
    };
    const step = profile.step;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(step) || step <= 0) return null;
    const units = price / step;
    const nearest = Math.round(units);
    const exactlyOnLevel = Math.abs(units - nearest) < 1e-9;
    const lowerUnits = exactlyOnLevel ? nearest - 1 : Math.floor(units);
    const upperUnits = exactlyOnLevel ? nearest + 1 : Math.ceil(units);
    const lower = Number((lowerUnits * step).toPrecision(14));
    const upper = Number((upperUnits * step).toPrecision(14));
    return {
      ...profile,
      step,
      lower,
      upper,
      lowerMajor: isMajorRound(lower, profile.majorStep),
      upperMajor: isMajorRound(upper, profile.majorStep)
    };
  }

  function formatLiveClock(ms) {
    const d = new Date(ms);
    const p2 = v => String(v).padStart(2, '0');
    const mode = settings.clockFormat || '12h';
    if (mode === '12h') {
      const h24 = d.getHours();
      const h12 = h24 % 12 || 12;
      return `${h12}:${p2(d.getMinutes())} ${h24 >= 12 ? 'PM' : 'AM'}`;
    }
    return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  function formatBadgeRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const p2 = v => String(v).padStart(2, '0');
    return hours > 0 ? `${hours}:${p2(minutes)}:${p2(seconds)}` : `${minutes}:${p2(seconds)}`;
  }

  function remainingFor(now, tf) {
    const w = getWindow(now, tf);
    return w ? Math.max(0, w.end - now) : 0;
  }

  function parseOhlcFromText(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/\u00a0/g, ' ').replace(/\u2212/g, '-').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 900) return null;
    const number = '(-?[0-9][0-9,]*(?:\\.[0-9]+)?)';
    const read = label => {
      const m = text.match(new RegExp(`(?:^|\\s)(?:${label})\\s*[:=]?\\s*${number}`, 'i'));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const open = read('O|Open');
    const high = read('H|High');
    const low = read('L|Low');
    const close = read('C|Close');
    const ohlc = { open, high, low, close };
    return isValidOhlc(ohlc) ? ohlc : null;
  }

  function detectSelectedCandleOhlc(tf, now = Date.now(), expectedPrice = null) {
    if (frameMarketData && cleanInstrumentName(frameMarketData.symbol) === lastInstrument && now - frameMarketAt < 2500 && normalizeTimeframe(frameMarketData.timeframe) === tf && frameMarketData.ohlc) {
      const f = frameMarketData.ohlc;
      if (isValidOhlc(f)) {
        const normalized = {open:Number(f.open), high:Number(f.high), low:Number(f.low), close:Number(f.close)};
        if (!Number.isFinite(expectedPrice) || priceCompatibleWithCandle(expectedPrice, normalized)) return normalized;
      }
    }
    if (tf !== lastSelectedOhlcTf) {
      lastSelectedOhlcTf = tf;
      lastSelectedDirection = null;
      lastOhlcProbeAt = 0;
    }
    if (now - lastOhlcProbeAt < 220) {
      return lastSelectedDirection && (!Number.isFinite(expectedPrice) || priceCompatibleWithCandle(expectedPrice, lastSelectedDirection)) ? lastSelectedDirection : null;
    }
    lastOhlcProbeAt = now;
    const selectors = [
      '[data-name="legend-source-item"]',
      '[data-name*="legend" i]',
      '[data-testid*="ohlc" i]',
      '[data-test*="ohlc" i]',
      '[aria-label*="open" i][aria-label*="close" i]'
    ];
    let scanned = 0;
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (scanned++ > 80) break;
        if (!isVisibleElement(el)) continue;
        const ohlc = parseOhlcFromText(`${el.textContent || ''} ${el.getAttribute?.('aria-label') || ''}`);
        if (ohlc && (!Number.isFinite(expectedPrice) || priceCompatibleWithCandle(expectedPrice, ohlc))) {
          lastSelectedDirection = ohlc;
          return ohlc;
        }
      }
      if (scanned > 80) break;
    }
    return lastSelectedDirection && (!Number.isFinite(expectedPrice) || priceCompatibleWithCandle(expectedPrice, lastSelectedDirection)) ? lastSelectedDirection : null;
  }

  function boundaryStateKey(tf, assetKey = activeAssetKey) {
    return assetKey && tf ? `${assetKey}|${tf}` : null;
  }

  function ohlcRolloverDetected(previous, next) {
    if (!isValidOhlc(previous) || !isValidOhlc(next)) return false;
    const scale = Math.max(Math.abs(previous.open), Math.abs(previous.high), Math.abs(previous.low), Math.abs(previous.close), 1);
    const eps = scale * 1e-9;
    const openReset = Math.abs(next.open - previous.open) > eps;
    const rangeReset = next.high < previous.high - eps && next.low > previous.low + eps;
    return openReset || rangeReset;
  }

  function rememberVerifiedBoundary(tf, observedAt, source) {
    const key = boundaryStateKey(tf);
    if (!key) return;
    const parsed = parseTimeframe(tf);
    const quantum = parsed && ['m','h'].includes(parsed.unit) ? 60_000 : 1000;
    // Intraday provider bars start on exact clock-minute/second boundaries. Snap
    // away the scanner/DOM observation latency instead of baking it into timers.
    const anchor = Math.round(Number(observedAt) / quantum) * quantum;
    verifiedBoundaryAnchors.set(key, { anchor, observedAt:Number(observedAt), source:source || 'provider rollover' });
  }

  function observeProviderOhlc(tf, ohlc, now, source) {
    if (!isValidOhlc(ohlc)) return;
    const key = boundaryStateKey(tf);
    if (!key) return;
    const normalized = {open:Number(ohlc.open), high:Number(ohlc.high), low:Number(ohlc.low), close:Number(ohlc.close)};
    const previous = providerOhlcHistory.get(key);
    if (previous && ohlcRolloverDetected(previous.ohlc, normalized)) rememberVerifiedBoundary(tf, now, source);
    providerOhlcHistory.set(key, {ohlc:normalized, at:Number(now), source:source || 'provider'});
  }

  function verifiedBoundaryWindow(nowMs, tf) {
    const parsed = parseTimeframe(tf);
    if (!parsed || !['s','m','h'].includes(parsed.unit)) return null;
    const key = boundaryStateKey(tf);
    const record = key ? verifiedBoundaryAnchors.get(key) : null;
    if (!record || nowMs - record.observedAt > BOUNDARY_ANCHOR_MAX_AGE_MS) return null;
    const baseSeconds = {s:1, m:60, h:3600}[parsed.unit];
    const period = parsed.n * baseSeconds * 1000;
    const manualOffset = clampNumber(settings.offsetMinutes, -1440, 1440, 0) * 60_000;
    const anchor = record.anchor + manualOffset;
    const index = Math.floor((nowMs - anchor) / period);
    const start = anchor + index * period;
    return {start, end:start + period, verified:true, source:record.source};
  }

  function priceCompatibleWithCandle(price, ohlc) {
    if (!Number.isFinite(price) || !isValidOhlc(ohlc)) return false;
    const ref = Math.max(Math.abs(Number(ohlc.close)), Math.abs(Number(ohlc.open)), 1e-9);
    return Math.abs(price - Number(ohlc.close)) / ref <= 0.05;
  }

  function maybeRefreshScanner(now) {
    if (hostSiteType() !== 'tradingview') return;
    const symbol = detectTradingViewSymbolRef();
    if (!symbol) return;
    if (scannerSymbolRef && scannerSymbolRef !== symbol) scannerOhlc.clear();
    scannerSymbolRef = symbol;
    if (scannerRequestPending || now - lastScannerRequestAt < 1200) return;
    lastScannerRequestAt = now;
    scannerRequestPending = true;
    const requestGeneration = assetGeneration;
    const intervals = ['3m','5m','15m','30m','45m','1h','4h'];
    chrome.runtime.sendMessage({ type: 'TFC_TV_SCAN_OHLC', symbol, intervals }, response => {
      scannerRequestPending = false;
      if (chrome.runtime.lastError || !response?.ok || !response.ohlc) return;
      if (requestGeneration !== assetGeneration || detectTradingViewSymbolRef() !== symbol) return;
      scannerSymbolRef = symbol;
      const stamp = Date.now();
      for (const tf of intervals) {
        const item = response.ohlc[tf];
        if (!item) continue;
        const o = Number(item.open), h = Number(item.high), l = Number(item.low), c = Number(item.close);
        const candidate = {open:o, high:h, low:l, close:c};
        if (!isValidOhlc(candidate)) continue;
        observeProviderOhlc(tf, candidate, stamp, 'TradingView scanner rollover');
        scannerOhlc.set(tf, { ...candidate, exact:true, source:'TradingView scanner', fetchedAt:stamp });
      }
    });
  }

  function directionClass(open, current) {
    if (!Number.isFinite(open) || !Number.isFinite(current)) return 'unknown';
    const epsilon = Math.max(Math.abs(open), Math.abs(current), 1) * 1e-9;
    if (current > open + epsilon) return 'bull';
    if (current < open - epsilon) return 'bear';
    return 'flat';
  }

  function candleDataFor(tf, now, price, selectedTf, symbolKey) {
    let w = getWindow(now, tf);
    if (!w) return { cls:'unknown', exact:false, quality:'unknown', state:null, windowInfo:null };

    // The selected chart is the strongest source because it is the candle the
    // user is actually looking at. Never let a scanner snapshot override it.
    if (selectedTf === tf) {
      const active = detectSelectedCandleOhlc(tf, now, price);
      if (isValidOhlc(active)) {
        observeProviderOhlc(tf, active, now, 'active chart rollover');
        w = getWindow(now, tf) || w;
        const state = {
          start:w.start,
          open:Number(active.open), high:Number(active.high), low:Number(active.low), close:Number(active.close),
          current:Number(active.close), exact:true, source:'active chart', seenAt:now
        };
        candleDirectionState.set(`${symbolKey}|${tf}`, state);
        return {cls:directionClass(state.open, state.close), exact:true, quality:'exact', source:state.source, state, windowInfo:w};
      }
    }

    const scanned = scannerOhlc.get(tf);
    if (hostSiteType() === 'tradingview' && scanned && now - scanned.fetchedAt < 5000 && isValidOhlc(scanned)) {
      const liveClose = priceCompatibleWithCandle(price, scanned) ? price : scanned.close;
      const liveHigh = Math.max(scanned.high, liveClose, scanned.open);
      const liveLow = Math.min(scanned.low, liveClose, scanned.open);
      const state = {start:w.start, open:scanned.open, high:liveHigh, low:liveLow, close:liveClose, current:liveClose, exact:true, source:scanned.source};
      return {cls:directionClass(state.open, state.close), exact:true, quality:'exact', source:scanned.source, state, windowInfo:w};
    }

    // Fallback for timeframes whose hidden OHLC is not exposed by the host
    // (notably 3m / 45m on Exness and some TradingView scanner combinations).
    // Keep an independent live candle per asset + timeframe instead of leaving
    // the card blank or copying another timeframe's candle. If we enter midway
    // through an already-open candle, that first candle is explicitly partial;
    // after the next boundary it is tracked from its own first observed price.
    const key = `${symbolKey}|${tf}`;
    let state = candleDirectionState.get(key);
    if (!state || state.start !== w.start) {
      if (!Number.isFinite(price)) {
        return {cls:'unknown', exact:false, quality:'unknown', state:null, windowInfo:w};
      }
      const boundaryAge = Math.max(0, now - w.start);
      const partial = boundaryAge > 1500;
      state = {
        start:w.start,
        open:price,
        high:price,
        low:price,
        close:price,
        current:price,
        exact:false,
        partial,
        initializedAt:now,
        source:w.verified
          ? (partial ? 'provider-boundary live tracking (partial)' : 'provider-boundary live tracking')
          : (partial ? 'live timeframe tracking (partial until next boundary)' : 'live timeframe tracking'),
        seenAt:now
      };
    }

    if (Number.isFinite(price)) {
      state.current = price;
      state.close = price;
      state.high = Math.max(Number.isFinite(state.high) ? state.high : price, price, state.open);
      state.low = Math.min(Number.isFinite(state.low) ? state.low : price, price, state.open);
      state.seenAt = now;
    }
    candleDirectionState.set(key, state);
    return {cls:directionClass(state.open, state.close), exact:false, quality:'tracking', source:state.source, state, windowInfo:w};
  }

  function setBadgeDirection(el, data) {
    el.classList.remove('bull', 'bear', 'flat', 'unknown', 'estimated');
    el.classList.add(data?.cls || 'unknown');
    if (data?.quality === 'tracking') el.classList.add('estimated');
    el.dataset.quality = data?.quality || 'unknown';
  }

  function updateBadgeCandleVisual(el, data) {
    const state = data?.state;
    const opacity = clampNumber(settings.candleBgOpacity, 0, 100, 36) / 100;
    el.style.setProperty('--candle-opacity', String(Math.min(1, Math.max(.48, opacity * 2.25))));
    if (!state || ![state.open, state.high, state.low, state.close].every(Number.isFinite)) {
      el.style.setProperty('--wick-start', `${clampNumber(settings.candleInset, 0, 30, 5)}%`);
      el.style.setProperty('--wick-end', `${100 - clampNumber(settings.candleInset, 0, 30, 5)}%`);
      el.style.setProperty('--body-start', '46%');
      el.style.setProperty('--body-end', '54%');
      el.style.setProperty('--open-pos', '46%');
      el.style.setProperty('--close-pos', '54%');
      return;
    }
    const low = Math.min(state.low, state.open, state.close);
    const high = Math.max(state.high, state.open, state.close);
    const range = Math.max(1e-12, high - low);
    const inset = clampNumber(settings.candleInset, 0, 30, 5);
    const x = v => high === low ? 50 : inset + Math.max(0, Math.min(1, (v - low) / range)) * (100 - inset * 2);
    const op = x(state.open);
    const cp = x(state.close);
    const a = Math.min(op, cp), b = Math.max(op, cp);
    el.style.setProperty('--wick-start', `${clampNumber(settings.candleInset, 0, 30, 5)}%`);
    el.style.setProperty('--wick-end', `${100 - clampNumber(settings.candleInset, 0, 30, 5)}%`);
    el.style.setProperty('--body-start', `${a.toFixed(2)}%`);
    el.style.setProperty('--body-end', `${b.toFixed(2)}%`);
    el.style.setProperty('--open-pos', `${op.toFixed(2)}%`);
    el.style.setProperty('--close-pos', `${cp.toFixed(2)}%`);
  }

  function updateMarketContext(now, selectedTf = null) {
    const instrument = detectInstrument(now);
    const assetKey = detectTradingViewSymbolRef() || instrument;
    if (assetKey !== activeAssetKey) {
      activeAssetKey = assetKey;
      assetGeneration++;
      scannerOhlc.clear();
      candleDirectionState.clear();
      verifiedBoundaryAnchors.clear();
      providerOhlcHistory.clear();
      scannerSymbolRef = null;
      lastScannerRequestAt = 0;
      lastKnownPrice = null;
      lastKnownPriceAt = 0;
      lastPriceProbeAt = 0;
      lastSelectedDirection = null;
      lastSelectedOhlcTf = null;
      lastOhlcProbeAt = 0;
      if (cleanInstrumentName(frameMarketData?.symbol) !== instrument) {
        frameMarketData = null;
        frameMarketAt = 0;
      }
    }
    maybeRefreshScanner(now);
    const price = detectCurrentPrice(now);
    const profile = detectSymbolProfile();
    const levels = roundLevels(price);

    instrumentSymbol.textContent = instrument || '--';
    instrumentPrice.textContent = formatLivePrice(price);

    roundUpValue.textContent = levels ? formatRoundPrice(levels.upper, levels.step) : '--';
    roundDownValue.textContent = levels ? formatRoundPrice(levels.lower, levels.step) : '--';
    roundUpDistance.textContent = levels && Number.isFinite(price) ? formatRoundDistance(levels.upper - price) : '(--)';
    roundDownDistance.textContent = levels && Number.isFinite(price) ? formatRoundDistance(price - levels.lower) : '(--)';
    roundUp.classList.toggle('major', Boolean(levels?.upperMajor));
    roundDown.classList.toggle('major', Boolean(levels?.lowerMajor));
    if (levels) {
      const autoLabel = settings.autoRoundBySymbol ? `${levels.key}: step ${formatRoundPrice(levels.step, levels.step)}` : `Custom step ${formatRoundPrice(levels.step, levels.step)}`;
      roundUp.title = `${autoLabel} • nearest round above${levels.upperMajor ? ' • MAJOR round' : ''}`;
      roundDown.title = `${autoLabel} • nearest round below${levels.lowerMajor ? ' • MAJOR round' : ''}`;
    }

    liveClockValue.textContent = formatLiveClock(now);

    const closeItems = [
      ['3M', '3m', close3, close3Value],
      ['5M', '5m', close5, close5Value],
      ['15M', '15m', close15, close15Value],
      ['30M', '30m', close30, close30Value],
      ['45M', '45m', close45, close45Value],
      ['1H', '1h', close1H, close1HValue],
      ['4H', '4h', close4H, close4HValue]
    ];
    for (const [label, tf, badgeEl, valueEl] of closeItems) {
      valueEl.textContent = formatBadgeRemaining(remainingFor(now, tf));
      const data = candleDataFor(tf, now, price, selectedTf, `${activeAssetKey}|${profile.key}`);
      badgeEl.classList.toggle('selected', tf === selectedTf);
      badgeEl.setAttribute('aria-pressed', String(tf === selectedTf));
      setBadgeDirection(badgeEl, data);
      updateBadgeCandleVisual(badgeEl, data);
      const boundaryText = data.windowInfo?.verified ? 'provider-aligned boundary' : 'calendar boundary not yet provider-verified';
      badgeEl.title = `${label} current candle • ${data.exact ? 'provider OHLC' : data.quality === 'tracking' ? 'independent live tracking' : 'OHLC unavailable'} • ${boundaryText}${data.source ? ` • ${data.source}` : ''}`;
    }

    const line1 = [];
    if (settings.showInstrument) line1.push(`${instrument || '--'} ${formatLivePrice(price)}`);
    if (settings.showRoundNumbers) line1.push(`▲ ${roundUpValue.textContent} ${roundUpDistance.textContent}`, `▼ ${roundDownValue.textContent} ${roundDownDistance.textContent}`);
    const line2 = [];
    for (const [label, _tf, el, val] of closeItems) {
      if (el.style.display !== 'none') line2.push(`${label} ${val.textContent}`);
    }
    badgeContextLine1.textContent = line1.join('  ');
    badgeContextLine2.textContent = line2.join('  •  ');
    badgeContext.style.color = normalizeHex(settings.badgeNeutralColor, DEFAULTS.badgeNeutralColor);
    badgeContext.style.display = line1.length || line2.length ? '' : 'none';
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

    // URL parameters are fallback only: TradingView/Exness SPA navigation can
    // leave an old interval in the URL after the visible chart has changed.
    const fromUrl = detectFromUrl();
    if (fromUrl) {
      detectionSource = 'url fallback';
      return fromUrl;
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
    const providerWindow = verifiedBoundaryWindow(nowMs, tf);
    if (providerWindow) return providerWindow;

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
      return { start, end, verified:false, source:'calendar fallback' };
    }

    if (unit === 'W') {
      const weekMs = 7 * 86_400_000;
      const period = n * weekMs;
      const anchor = Date.UTC(1970, 0, 5) + offsetMs;
      const index = Math.floor((nowMs - anchor) / period);
      const start = anchor + index * period;
      return { start, end: start + period, verified:false, source:'calendar fallback' };
    }

    const baseSeconds = { s: 1, m: 60, h: 3600, D: 86400 }[unit];
    if (!baseSeconds) return null;
    const period = n * baseSeconds * 1000;
    const start = Math.floor(shifted / period) * period + offsetMs;
    return { start, end: start + period, verified:false, source:'calendar fallback' };
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const totalHours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const p2 = v => String(v).padStart(2, '0');
    if ((settings.countdownUnitMode || 'compact') === 'letters') {
      if (totalHours > 0) return `${totalHours}H:${p2(minutes)}M:${p2(seconds)}S`;
      return `${minutes}M:${p2(seconds)}S`;
    }
    if (totalHours > 0) return `${totalHours}:${p2(minutes)}:${p2(seconds)}`;
    return `${minutes}:${p2(seconds)}`;
  }

  function displayTf(tf) {
    const p = parseTimeframe(tf);
    if (!p) return '--';
    if (p.unit === 'm') {
      if (p.n % 10080 === 0) return `${p.n / 10080}W`;
      if (p.n % 1440 === 0) return `${p.n / 1440}D`;
      if (p.n % 60 === 0) return `${p.n / 60}H`;
      return `${p.n}M`;
    }
    if (p.unit === 'h') return `${p.n}H`;
    if (p.unit === 's') return `${p.n}S`;
    return `${p.n}${p.unit}`;
  }

  function updateProgressVisuals(ratio, elapsedRatio, phase) {
    const circumference = 2 * Math.PI * 44;
    // Dash lengths and SVG geometry now share viewBox units. Non-scaling
    // strokes previously interpreted the dash in screen pixels, hiding early drain.
    const actualRatio = Math.max(0, Math.min(1, ratio));
    // A 1.5% visibility floor makes the first second discernible on long TFs.
    // The timer and percentage remain exact; proportional arc resumes above it.
    const visualRatio = settings.progressMode === 'remaining' && elapsedRatio > 0
      ? Math.min(actualRatio, 0.985) : actualRatio;
    const dash = circumference * visualRatio;
    const gap = circumference - dash;
    for (const c of progressCircles) {
      c.style.strokeDasharray = `${dash} ${gap}`;
      c.style.strokeDashoffset = '0';
      c.style.stroke = phase.color;
      c.style.filter = 'none';
    }
    railFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
    railFill.style.backgroundColor = phase.color;
    wrap.style.setProperty('--phase', phase.color);

    if (settings.dynamicBorderColor) {
      wrap.style.borderColor = phase.color;
    } else {
      wrap.style.borderColor = normalizeHex(settings.borderColor, DEFAULTS.borderColor);
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
    const eligible = settings.enabled && isEligibleChartPage();
    host.style.display = eligible ? 'block' : 'none';
    if (!eligible) return;

    if ((detectionDirty && now - lastDetectionAt > 250) || now - lastDetectionAt > 1000) {
      const next = detectTimeframe();
      if (next) detectedTimeframe = next;
      lastDetectionAt = now;
      detectionDirty = false;
    }

    const tf = settings.detectionMode === 'manual'
      ? (normalizeTimeframe(settings.manualTimeframe) || '5m')
      : detectedTimeframe;

    updateMarketContext(now, tf);

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
    wrap.title = `Drag to move • ${windowInfo.verified ? 'provider-aligned candle boundary' : 'calendar-aligned boundary until provider rollover is verified'} • Customize from the extension popup`;

    classicTf.textContent = tfText;
    classicCount.textContent = countText;
    landscapeTf.textContent = tfText;
    landscapeCount.textContent = countText;
    badgeTf.textContent = tfText;
    badgeCount.textContent = countText;

    updateProgressVisuals(ratio, elapsedRatio, phase);
  }

  const FOREGROUND_FRAME_MS = 33; // ~30 FPS: 0.055% steps on a 1-minute candle.
  const HEARTBEAT_MS = 250;

  function forceClockResync({ redetect = false } = {}) {
    if (redetect) detectionDirty = true;
    // The displayed state is always derived from wall-clock time. Nothing is
    // decremented from a previous value, so sleep/background throttling cannot
    // accumulate countdown drift.
    lastPaint = 0;
    paint(Date.now());
  }

  function animationLoop(ts) {
    if (!document.hidden && ts - lastPaint >= FOREGROUND_FRAME_MS) {
      lastPaint = ts;
      paint(Date.now());
    }
    requestAnimationFrame(animationLoop);
  }

  // rAF is intentionally paused/throttled by browsers for hidden tabs. This
  // heartbeat is only a fallback; correctness never depends on how often it
  // fires because paint() recalculates from Date.now() on every invocation.
  setInterval(() => {
    if (document.hidden || performance.now() - lastPaint > HEARTBEAT_MS * 2) {
      paint(Date.now());
    }
  }, HEARTBEAT_MS);

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

  for (const card of closeBadgeElements) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const activate = async () => {
      card.title = 'Switching chart timeframe…';
      try {
        const response = await chrome.runtime.sendMessage({type:'TFC_SWITCH_REQUEST', timeframe:card.dataset.tf, frameId:chartFrameId});
        if (!response?.ok) card.title = 'This interval is unavailable in the chart menu. Select it from the chart toolbar.';
        detectionDirty = true;
        setTimeout(() => forceClockResync({redetect:true}), 250);
      } catch (_) { card.title = 'Refresh the chart to reconnect the extension.'; }
    };
    card.addEventListener('click', event => { event.stopPropagation(); activate(); });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); event.stopPropagation(); activate();}
    });
  }

  wrap.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.closeBadge') || settings.locked || event.button !== 0) return;
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

  window.addEventListener('resize', clampPosition, { passive: true });

  // Immediate catch-up after tab switching, window focus changes, BFCache
  // restoration, or a laptop/system sleep. This avoids waiting for the next
  // throttled timer before the ring snaps to the true candle position.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) forceClockResync({ redetect: true });
  }, { passive: true });
  window.addEventListener('focus', () => forceClockResync({ redetect: true }), { passive: true });
  window.addEventListener('pageshow', () => forceClockResync({ redetect: true }), { passive: true });
  window.addEventListener('online', () => forceClockResync({ redetect: false }), { passive: true });
  document.addEventListener('resume', () => forceClockResync({ redetect: true }), { passive: true });
  document.addEventListener('freeze', () => { lastPaint = 0; }, { passive: true });

  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'FRAME_MARKET') return;
    const tf = normalizeTimeframe(data.timeframe || data.market?.timeframe);
    if (tf) {
      frameDetectedTimeframe = tf;
      frameDetectedAt = Date.now();
    }
    const chartSymbol = hostSiteType() === 'tradingview' ? visibleChartSymbol()?.name : null;
    if (chartSymbol && cleanInstrumentName(data.market?.symbol) !== chartSymbol) return;
    if (data.market && typeof data.market === 'object') {
      frameMarketData = { ...data.market, timeframe: tf || data.market.timeframe };
      frameMarketAt = Date.now();
      if (Number.isFinite(frameMarketData.price)) {
        lastKnownPrice = frameMarketData.price;
        lastKnownPriceAt = frameMarketAt;
      }
    }
    detectionDirty = true;
  });

  const observer = new MutationObserver(() => { detectionDirty = true; lastEligibilityCheck = 0; lastInstrumentAt = 0; });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-checked', 'aria-selected', 'aria-pressed', 'class', 'data-value', 'data-interval', 'data-timeframe']
  });

  document.addEventListener('click', () => { detectionDirty = true; lastEligibilityCheck = 0; }, true);
  document.addEventListener('keydown', () => { detectionDirty = true; }, true);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'TFC_CHART_FRAME') chartFrameId = message.frameId;
  });

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
        layoutMode: effectiveLayout(),
        chartPageActive: isEligibleChartPage(true)
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
