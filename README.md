# Timeframe Ring Countdown v1.13.0

## v1.13.0 candle-formation fix

- 3M and 45M no longer stay blank when the host does not expose hidden OHLC.
- Every timeframe now owns an independent live OHLC tracker keyed by asset + timeframe.
- The selected chart timeframe still overrides tracking with the chart's exact visible OHLC.
- Scanner/provider OHLC still overrides tracked data whenever exact data is available.
- A tracker started midway through an existing candle is marked partial internally; from the next timeframe boundary it builds that candle from its own observed open/high/low/close.
- Instrument changes clear all prior timeframe states so candles cannot leak between assets.


Chrome Manifest V3 floating dashboard for TradingView and Exness chart/terminal pages.

## Dashboard layout

The landscape view has been rebuilt to match the requested trading dashboard layout:

- left: active-timeframe circular progress ring with the real timeframe label (`5M`, `1H`, `4H`, etc.);
- top center: large active-candle countdown (`2:47:12`, `2:12`, etc.);
- top right: plain local numerical clock with no icon and no seconds (`11:12 AM` by default);
- second row, first sub-panel: detected chart instrument + live price (`XAUUSD 4,538.5`);
- second row: one clean split panel — instrument + live price on the left, upper/lower round levels on the right; each round level now includes the live distance from current price;
- bottom row: clearer fixed-size `3M`, `5M`, `15M`, `30M`, `45M`, `1H`, `4H` candle cards with larger labels and full-width horizontal candle geometry.

Each timeframe card contains a centered, high-contrast horizontal current-candle preview. The extra inner pill/border around the timeframe/countdown has been removed for readability. The card itself does not stretch with the candle. Instead, the real current O/H/L/C values are normalized across the fixed card width:

- low = left edge of the usable wick area;
- high = right edge;
- open/close = horizontal candle-body endpoints;
- bullish candles use the configured bullish color;
- bearish candles use the configured bearish color;
- unverified candles stay neutral instead of being falsely marked bullish/bearish.

The candle body and wick update while the chart price changes. Countdown values are always derived from wall-clock time instead of decrementing stored values, so tab throttling/sleep does not create countdown drift.

## Multi-timeframe OHLC accuracy

### TradingView

For TradingView chart pages, v1.13.0 requests current multi-timeframe OHLC for the detected `EXCHANGE:SYMBOL` through TradingView's scanner service for the commonly exposed scanner intervals (5M, 15M, 30M, 1H, 4H). The current chart price is used between scanner refreshes so the close/body can respond immediately.

3M and 45M are handled separately because TradingView's scanner does not consistently expose those intervals. If exact provider OHLC is available it is used. Otherwise each card forms independently from observed live price; when 3M or 45M is the selected chart timeframe, the visible chart OHLC immediately overrides the tracker with exact current-candle values.

### Exness

Exness Terminal does not expose exact historical OHLC for every hidden timeframe. v1.13.0 reads the selected chart timeframe's visible OHLC exactly and gives every hidden card its own live tracker, so 3M and 45M keep forming instead of staying blank. A tracker started midway through an already-open candle is internally marked partial; after its next boundary it has observed that candle from its own start.

## Popup controls

Existing settings are migrated and the following remain configurable:

- overlay enabled/disabled;
- automatic/manual active timeframe;
- layout mode;
- countdown text format;
- main/countdown/timeframe/info font sizes;
- clock 12h/24h format, font, size and color;
- instrument and live-price colors;
- upper/lower round-level colors;
- bullish/bearish/neutral timeframe-card colors;
- candle preview opacity;
- timeframe-card width and height;
- ring size/thickness;
- panel background, opacity, border, radius, padding and shadow;
- which timeframe cards are visible;
- progress direction and candle alignment offset;
- drag-position lock.

BTC / Gold / US Oil round-number rules from earlier versions are preserved.

## Install / update

1. Extract the ZIP.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Remove the old unpacked build or replace its files with the v1.13.0 folder.
5. Click **Load unpacked** (or **Reload** if you replaced the existing folder).
6. Refresh the TradingView / Exness chart tab once.

Saved positions and existing synced settings are migrated automatically.


v1.11.2: Circle beside countdown, instrument/price and clock; round levels below. Candle cards span the complete panel width and size to fit countdowns. 45M uses live tracked OHLC when scanner OHLC is unavailable; tracking is identified in its tooltip. Historical OHLC before tracking began is unavailable.


v1.11: 3M card; click/keyboard native chart timeframe selection; selected interval color; equal top columns; collapsible popup sections; card padding, candle inset, card gap, row gap and typography controls. Unsupported chart intervals cannot be forced.

Ring fix: SVG dash units scale with the circle. Remaining mode shows a minimum 1.5% gap as soon as elapsed time is positive, then drains proportionally. Countdown and percentage use exact time.

Asset switching: visible chart symbol takes precedence over stale URL symbols. Price/OHLC/tracking caches reset per asset; late scanner responses are discarded. If exchange identity cannot be verified, candles track the current asset until exact OHLC is available. Forex round steps use 0.001 (JPY pairs 0.1).


## v1.13.0 accuracy hardening

- selected chart OHLC now has priority over scanner OHLC for the active timeframe;
- OHLC is validated (`low <= open/close <= high`) before a candle is accepted;
- scanner/chart candle rollovers are observed to learn the provider's real intraday bar phase instead of assuming every symbol starts on a UTC/Unix boundary;
- learned bar boundaries are used by countdowns after verification, reducing 4H/session alignment errors;
- TradingView scanner candles no longer pretend their current bar started at a locally guessed timestamp;
- Exness/unsupported hidden timeframes now form with independent live tracking instead of staying blank; mid-candle starts are marked partial rather than falsely labeled exact;
- active chart controls are preferred over stale URL interval parameters;
- timeframe switching now falls back across recently registered chart frames instead of trusting one last iframe id;
- asset changes clear only active-asset state and reject stale asynchronous scanner responses;
- candle tooltips distinguish chart/scanner exact data from verified tracking and unavailable data.

Important limitation: when Exness does not expose a hidden timeframe's OHLC, the extension cannot recover price movement that happened before it started observing that candle. It therefore labels that first hidden candle as tracked/partial rather than exact. The selected timeframe still uses the chart's visible OHLC.
