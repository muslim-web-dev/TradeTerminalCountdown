# v1.13.0 — all-timeframe candle formation

## Root cause
In v1.12.0, a hidden timeframe without exact provider OHLC was deliberately returned as `unknown` until a verified provider rollover existed. On Exness / embedded charts, 3M and 45M often do not expose hidden OHLC, so those cards could remain neutral and appear not to form.

## Fix
- Every card now has an independent `(asset, timeframe)` live candle state.
- 3M and 45M begin forming from observed live price instead of remaining blank.
- Each timeframe resets only at its own calculated/verified candle boundary.
- Active chart OHLC remains the strongest source and replaces tracked data for the selected timeframe.
- TradingView scanner OHLC remains exact-preferred where available.
- Mid-candle initialization is treated as partial rather than falsely called exact.
- Symbol changes still clear all candle state.

## Accuracy rule
The active selected timeframe can match the chart's visible OHLC exactly when the host exposes it. A hidden timeframe that the host does not expose cannot reconstruct price movement from before the extension started; it is therefore live-tracked and becomes complete after its next boundary while the extension remains running.
