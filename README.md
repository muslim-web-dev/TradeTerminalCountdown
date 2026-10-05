# Timeframe Ring Countdown — v1.2.0

A draggable Chrome Manifest V3 candle countdown overlay for TradingView and Exness.

## What changed in v1.2

- Dedicated Exness Terminal support, including timeframe detection inside the Exness chart iframe.
- Broader Exness web-terminal host coverage.
- Upper-right default position matching a typical chart placement beside the right panel.
- Curved outer border with configurable width/color.
- Smooth candle-phase color progression based on elapsed percentage.
- Three configurable phase colors: fresh, warning, ready/close.
- Configurable warning/ready percentage thresholds.
- Dynamic countdown color and dynamic border color options.
- Three layouts:
  - Landscape: mini progress ring + large timeframe/countdown + right-side description.
  - Compact badge: wide timer badge with bottom progress rail.
  - Classic circle.
- Custom right-side description text.
- Larger, high-contrast timeframe/countdown typography.
- Separate landscape width/height controls.
- Position lock and per-site saved position.

## Install / update

1. Extract the ZIP.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. If installing fresh, click **Load unpacked** and choose the `timeframe-ring-extension-v1.2.0` folder.
5. If replacing an older unpacked build, replace its files and click **Reload** on the extension card.
6. Refresh any already-open TradingView and Exness tabs after the extension is reloaded.

## Exness note

Exness Terminal can put its chart controls inside an iframe. v1.2 checks the Exness chart iframe directly and also supports child-frame reporting. If Exness is already open while you update the extension, refresh the Exness tab once so the new content script is injected.

## Phase color behavior

Default thresholds:

- 0–33% elapsed: fresh/start color remains steady (green by default).
- 33–67%: smoothly blends from start color toward warning yellow.
- 67–100%: smoothly blends from warning yellow toward ready/close red.

The thresholds and all three colors are customizable.

## Time alignment

The timer uses standard candle boundaries. If a broker/server uses shifted candle boundaries, use **Candle alignment offset (min)** in the popup.


## v1.2 UI repair

- Rebuilt the landscape overlay so the ring is permanently anchored on the left and the countdown is permanently anchored on the right.
- Timeframe is centered inside the ring.
- Countdown is large and readable; the note sits directly underneath.
- Double-click the note on the chart to edit it.
- Rounded dynamic outer border and subtle glow follow the candle phase color.
- Default progress now drains toward candle close.
- Existing v1.1 stored layout values are migrated once to the repaired reference-style dimensions.
