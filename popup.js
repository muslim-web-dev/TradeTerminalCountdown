const SETTINGS_VERSION = 2;

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
    Object.assign(merged, {
      settingsVersion: SETTINGS_VERSION,
      layoutMode: 'landscape',
      landscapeWidth: 330,
      landscapeHeight: 104,
      ringSize: 78,
      ringThickness: 8,
      fontSize: 34,
      timeframeFontSize: 17,
      descriptionFontSize: 12,
      panelPadding: 14,
      borderRadius: 26,
      borderWidth: 2,
      overallScale: 100,
      showTimeframe: true,
      showCountdown: true,
      showDescription: true,
      progressMode: 'remaining',
      showPhaseLabel: false
    });
    if (!source.descriptionText || String(source.descriptionText).replace(/\s+/g, ' ').trim().toUpperCase() === 'CANDLE CLOSE') {
      merged.descriptionText = 'Double-click to edit note';
    }
  }
  return merged;
}

const ids = Object.keys(DEFAULTS);
let settings = { ...DEFAULTS };
let saveTimer = null;

const $ = id => document.getElementById(id);

function assignToForm() {
  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    const value = settings[id];
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  refreshOutputs();
  refreshMode();
}

function readFromForm() {
  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range' || el.type === 'number') value = Number(el.value);
    else value = el.value;
    settings[id] = value;
  }

  // Keep the two phase thresholds logically ordered.
  if (settings.readyStartPercent <= settings.warningStartPercent) {
    settings.readyStartPercent = Math.min(99, settings.warningStartPercent + 1);
    if ($('readyStartPercent')) $('readyStartPercent').value = settings.readyStartPercent;
  }
}

function refreshOutputs() {
  const units = {
    fontSize: 'px', timeframeFontSize: 'px', descriptionFontSize: 'px', ringSize: 'px',
    ringThickness: 'px', landscapeWidth: 'px', landscapeHeight: 'px', overallScale: '%',
    backgroundOpacity: '%', panelPadding: 'px', borderRadius: 'px', borderWidth: 'px',
    warningStartPercent: '%', readyStartPercent: '%'
  };
  document.querySelectorAll('[data-out]').forEach(el => {
    const key = el.dataset.out;
    el.textContent = `${settings[key]}${units[key] || ''}`;
  });
}

function refreshMode() {
  $('manualWrap').style.opacity = settings.detectionMode === 'manual' ? '1' : '.45';
  $('manualTimeframe').disabled = settings.detectionMode !== 'manual';
}

async function saveNow() {
  clearTimeout(saveTimer);
  readFromForm();
  refreshOutputs();
  refreshMode();
  await chrome.storage.sync.set({ tfc_settings: settings });
  updateStatus();
}

function queueSave() {
  readFromForm();
  refreshOutputs();
  refreshMode();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 70);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(type) {
  try {
    const tab = await activeTab();
    if (!tab?.id) return null;
    return await chrome.tabs.sendMessage(tab.id, { type }, { frameId: 0 });
  } catch (_) {
    return null;
  }
}

async function updateStatus() {
  const status = $('status');
  const response = await send('TFC_GET_STATUS');
  if (!response?.ok) {
    status.textContent = 'Open or refresh a TradingView / Exness chart.';
    return;
  }
  const detected = response.detectedTimeframe || 'not detected';
  const effective = response.effectiveTimeframe || '—';
  const source = response.detectionSource && response.detectionSource !== 'none'
    ? ` • ${response.detectionSource}`
    : '';
  status.textContent = response.mode === 'manual'
    ? `Manual ${effective} • ${response.site}`
    : `Detected ${detected} • ${response.site}${source}`;
}

async function init() {
  const result = await chrome.storage.sync.get('tfc_settings');
  settings = migrateSettings(result.tfc_settings || {});
  if (Number((result.tfc_settings || {}).settingsVersion || 0) < SETTINGS_VERSION) {
    await chrome.storage.sync.set({ tfc_settings: settings });
  }
  assignToForm();

  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('input', queueSave);
    el.addEventListener('change', queueSave);
  }

  $('resetPosition').addEventListener('click', async () => {
    await send('TFC_RESET_POSITION');
  });

  $('redetect').addEventListener('click', async () => {
    await send('TFC_REDETECT');
    await updateStatus();
  });

  $('resetAll').addEventListener('click', async () => {
    settings = { ...DEFAULTS };
    assignToForm();
    await chrome.storage.sync.set({ tfc_settings: settings });
    await send('TFC_RESET_POSITION');
    await updateStatus();
  });

  await updateStatus();
}

init();
