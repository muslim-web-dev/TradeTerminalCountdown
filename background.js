'use strict';

const CACHE_MS = 900;
const cache = new Map();
const unavailableCustomUntil = new Map();
const chartFramesByTab = new Map();


function validOhlc(open, high, low, close) {
  const values = [open, high, low, close].map(Number);
  if (!values.every(Number.isFinite)) return false;
  const [o, h, l, c] = values;
  if (!(h >= l && h >= o && h >= c && l <= o && l <= c)) return false;
  return values.every(n => n > 0);
}

function rememberChartFrame(tabId, frameId) {
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId < 0) return;
  const now = Date.now();
  let frames = chartFramesByTab.get(tabId);
  if (!frames) chartFramesByTab.set(tabId, frames = new Map());
  frames.set(frameId, now);
  for (const [id, at] of frames) if (now - at > 30_000) frames.delete(id);
}

async function trySwitchInFrame(tabId, frameId, timeframe) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, {type:'TFC_SWITCH_CHART', timeframe}, {frameId});
    return result?.ok ? result : null;
  } catch (_) {
    return null;
  }
}

async function routeTimeframeSwitch(tabId, preferredFrameId, timeframe) {
  const candidates = [0];
  if (Number.isInteger(preferredFrameId) && preferredFrameId > 0) candidates.push(preferredFrameId);
  const known = chartFramesByTab.get(tabId);
  if (known) {
    const recent = [...known.entries()]
      .filter(([, at]) => Date.now() - at <= 30_000)
      .sort((a, b) => b[1] - a[1])
      .map(([frameId]) => frameId);
    for (const frameId of recent) if (!candidates.includes(frameId)) candidates.push(frameId);
  }
  for (const frameId of candidates) {
    const result = await trySwitchInFrame(tabId, frameId, timeframe);
    if (result?.ok) return result;
  }
  return {ok:false};
}

function marketCandidates(symbol) {
  const exchange = String(symbol || '').split(':')[0].toUpperCase();
  const crypto = new Set(['BINANCE','COINBASE','KRAKEN','BITSTAMP','BYBIT','OKX','KUCOIN','GEMINI','BITFINEX']);
  const forex = new Set(['OANDA','FXCM','FOREXCOM','PEPPERSTONE','SAXO','ICMARKETS','BLACKBULL','THINKMARKETS','DARWINEX','GOMARKETS','EIGHTCAP']);
  const america = new Set(['NASDAQ','NYSE','AMEX','ARCA','CBOE','OTC']);
  const futures = new Set(['CME','CME_MINI','CBOT','COMEX','NYMEX','ICEUS','NYBOT','EUREX']);
  if (crypto.has(exchange)) return ['crypto','global'];
  if (forex.has(exchange)) return ['forex','cfd','global'];
  if (exchange === 'TVC') return ['cfd','forex','global'];
  if (america.has(exchange)) return ['america','global'];
  if (futures.has(exchange)) return ['futures','global'];
  return ['global','cfd','forex','crypto','futures','america'];
}

async function scanColumns(symbol, columns, markets) {
  for (const market of markets) {
    try {
      const response = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          symbols: { tickers: [symbol], query: { types: [] } },
          columns
        }),
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!response.ok) continue;
      const json = await response.json();
      const row = json?.data?.[0];
      if (!row || !Array.isArray(row.d)) continue;
      return row.d;
    } catch (_) {}
  }
  return null;
}

function intervalCode(tf) {
  return ({ '3m':'3', '5m':'5', '15m':'15', '30m':'30', '45m':'45', '1h':'60', '4h':'240' })[tf] || null;
}

async function fetchOhlc(symbol, intervals) {
  const requested = [...new Set((intervals || []).filter(intervalCode))];
  const key = `${symbol}|${requested.join(',')}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const markets = marketCandidates(symbol);
  const standard = requested.filter(tf => tf !== '45m' && tf !== '3m');
  const ohlc = {};

  if (standard.length) {
    const columns = [];
    for (const tf of standard) {
      const code = intervalCode(tf);
      columns.push(`open|${code}`, `high|${code}`, `low|${code}`, `close|${code}`);
    }
    const values = await scanColumns(symbol, columns, markets);
    if (values) {
      standard.forEach((tf, i) => {
        const offset = i * 4;
        const nums = values.slice(offset, offset + 4).map(Number);
        if (nums.length === 4 && validOhlc(nums[0], nums[1], nums[2], nums[3])) {
          ohlc[tf] = { open:nums[0], high:nums[1], low:nums[2], close:nums[3] };
        }
      });
    }
  }

  // Unsupported custom columns must not break the standard interval batch.
  for (const tf of ['3m', '45m']) {
    const unavailableKey = `${symbol}|${tf}`;
    if (!requested.includes(tf) || (unavailableCustomUntil.get(unavailableKey) || 0) > now) continue;
    const code = intervalCode(tf);
    const values = await scanColumns(symbol, ['open','high','low','close'].map(field => `${field}|${code}`), markets);
    const nums = values?.slice(0,4);
    if (nums?.length === 4) {
      const [open, high, low, close] = nums.map(Number);
      if (validOhlc(open, high, low, close)) ohlc[tf] = {open, high, low, close};
      else unavailableCustomUntil.set(unavailableKey, now + 60_000);
    } else unavailableCustomUntil.set(unavailableKey, now + 60_000);
  }

  const value = { ok:Object.keys(ohlc).length > 0, ohlc };
  cache.set(key, { at:now, value });
  return value;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'TFC_TV_SCAN_OHLC') return;
  const symbol = String(message.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9_.-]+:[A-Z0-9_.!\/-]+$/.test(symbol)) {
    sendResponse({ ok:false, error:'invalid-symbol' });
    return;
  }
  fetchOhlc(symbol, message.intervals)
    .then(sendResponse)
    .catch(() => sendResponse({ ok:false, error:'scan-failed' }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'TFC_REGISTER_FRAME' && sender.tab?.id != null) {
    rememberChartFrame(sender.tab.id, sender.frameId);
    chrome.tabs.sendMessage(sender.tab.id, {type:'TFC_CHART_FRAME', frameId:sender.frameId}, {frameId:0}).catch(() => {});
  }
  if (message?.type !== 'TFC_SWITCH_REQUEST' || sender.tab?.id == null) return;
  const frameId = Number.isInteger(message.frameId) && message.frameId >= 0 ? message.frameId : 0;
  routeTimeframeSwitch(sender.tab.id, frameId, message.timeframe)
    .then(reply)
    .catch(() => reply({ok:false}));
  return true;
});
