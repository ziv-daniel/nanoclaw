---
name: chart-reading-edwards-magee
description: >
  Classical technical-analysis chart reading using the Edwards & Magee /
  Micha Stocks methodology. Use when the user wants a structured pattern-based
  read of a stock or index chart: Head & Shoulders, double tops/bottoms, flags,
  pennants, triangles, wedges, plus volume + candlestick confirmation. Pairs
  well with the trading agent group's `chart_engine.py` (which generates the
  daily/weekly/monthly annotated charts) and complements the more recent
  `technical-analysis` skill (Elliott Wave / ICT / Wyckoff). Outputs Hebrew
  trade idea, English internal logic. Educational analysis only — not licensed
  financial advice.
---

# Chart Reading — Edwards & Magee Classical TA

⚠️ **Disclaimer:** ניתוח טכני בלבד — לא ייעוץ השקעות.

Use this skill when the user asks for a **classical** TA read on a chart
(daily / weekly / monthly), or when delegating chart analysis from a trading
screener pipeline. For Elliott Wave, ICT/Smart Money, Wyckoff, or harmonic
patterns, prefer the `technical-analysis` skill.

## Inputs

- A chart image URL (e.g. Finviz) **or**
- A chart image file path (e.g. one of `chart_engine.py`'s `/tmp/<TICKER>_*.png`
  outputs) **or**
- OHLCV data + a ticker symbol (then fetch the chart yourself via Finviz)

## Fetching a chart from Finviz (no browser needed)

```
Daily candle:   https://finviz.com/chart.ashx?t=TICKER&ty=c&ta=1&p=d
Weekly candle:  https://finviz.com/chart.ashx?t=TICKER&ty=c&ta=1&p=w
Monthly candle: https://finviz.com/chart.ashx?t=TICKER&ty=c&ta=1&p=m

t=  ticker symbol (AAPL, TSLA, etc.)
ty= c=candle, l=line, o=ohlc
ta= 1=with indicators, 0=clean
p=  d=daily, w=weekly, m=monthly
```

Finviz is **US tickers only**. For Tel Aviv (TASE) tickers use Yahoo Finance or
the chart files emitted by `chart_engine.py`.

## Analysis framework

### Step 1 — Identify the trend

Determine the dominant trend before anything else:

- **Uptrend:** higher highs + higher lows
- **Downtrend:** lower highs + lower lows
- **Sideways:** price oscillating in a defined range

Use 3 timeframes:

1. Weekly — primary trend (big picture)
2. Daily — secondary trend (current setup)
3. 60m / 15m — entry timing (optional)

### Step 2 — Key levels

Mark these before any pattern analysis:

- **Horizontal S/R:** prior swing highs/lows, round numbers, high-volume nodes
- **Dynamic S/R:** 50-day MA, 200-day MA ("line of sanity"), trend lines
  through ≥2-3 pivots
- **Volume at price:** high-volume nodes = strong S/R; low-volume nodes = price
  moves through fast

The more times a level is tested → the more significant it is.

### Step 3 — Pattern recognition (Edwards & Magee classics)

**Reversal:**

- Head & Shoulders (bearish) / Inverse H&S (bullish)
- Double Top (M) / Double Bottom (W)
- Rounding bottom (saucer)

**Continuation:**

- Symmetrical / ascending / descending triangle
- Flag, pennant
- Rectangle (range)
- Rising wedge (bearish in either trend) / falling wedge (bullish in either)

For each pattern: state the breakout level, the volume requirement, the price
target (measured move), and the invalidation point.

### Step 4 — Volume confirmation

Volume is the truth detector — never ignore it.

- Bullish: volume rises on up days, falls on down days; high volume on
  resistance break = strong breakout; volume spike at lows = capitulation
- Bearish: volume rises on down days; low volume on rallies = distribution;
  weak-volume breakouts → suspect, wait for next candle

### Step 5 — Candlestick confirmation

At the key level, look for:

- Hammer / inverted hammer / pin bar — buyers absorbing
- Shooting star / hanging man — sellers overwhelming
- Bullish or bearish engulfing — momentum shift
- Doji — indecision; watch the next candle
- Strong full-body candles in trend direction = healthy momentum
- Inside bars = consolidation, energy building

### Step 6 — Invalidation

Every analysis needs a point where it's wrong. Bullish setup invalidated on a
close below the key support / recent swing low; bearish on a close above the
key resistance / recent swing high.

## Output (Hebrew)

```
📊 ניתוח טכני: [טיקר] | [טווח זמן] | [תאריך]

📈 מגמה:
[שורי / דובי / צידי] — [תיאור קצר של המבנה]

🔑 רמות מפתח:
• תמיכה: [מחיר] — [הסבר קצר]
• התנגדות: [מחיר] — [הסבר קצר]
• ממוצעים נעים: MA50=[X] MA200=[Y] — [מעל/מתחת]

📐 תבנית:
[שם התבנית] — [שלב: בהתפתחות / ממתין לאישור / בוצע פריצה]
[תיאור קצר מה הגרף מראה]

📊 ווליום:
[מאשר / לא מאשר / חלש] — [הסבר]

🎯 תרחישים:
• שורי: [מה צריך לקרות] → יעד [מחיר]
• דובי: [מה צריך לקרות] → יעד [מחיר]
• ביטול: [מתי הסטאפ מבוטל]

⚠️ ניתוח טכני בלבד — לא ייעוץ השקעות
```

## Data fetching code (Python)

Finviz chart image:

```python
import httpx

def get_finviz_chart(ticker: str, period: str = "d") -> bytes:
    url = f"https://finviz.com/chart.ashx?t={ticker}&ty=c&ta=1&p={period}"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; chart-reader/1.0)"}
    r = httpx.get(url, headers=headers, follow_redirects=True)
    return r.content  # PNG bytes
```

Yahoo Finance OHLCV (works for US + TASE; append `.TA` for Tel Aviv):

```python
import httpx
from datetime import datetime, timedelta

def get_ohlcv(ticker: str, days: int = 90) -> list[dict]:
    end = int(datetime.now().timestamp())
    start = int((datetime.now() - timedelta(days=days)).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?period1={start}&period2={end}&interval=1d"
    )
    r = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res = r.json()["chart"]["result"][0]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    return [
        {
            "date": datetime.fromtimestamp(t).strftime("%Y-%m-%d"),
            "open": q["open"][i],
            "high": q["high"][i],
            "low":  q["low"][i],
            "close": q["close"][i],
            "volume": q["volume"][i],
        }
        for i, t in enumerate(ts)
        if q["close"][i] is not None
    ]
```

## Operational notes

- A pattern is only confirmed on the **breakout candle close**, not the
  intrabar move.
- "The trend is your friend" — only take setups in the direction of the
  daily-timeframe dominant trend.
- When in doubt, zoom out. Weekly resolves daily ambiguity.
- Always look at volume — a pattern without volume confirmation is just a
  drawing.
- For Israeli stocks, Finviz won't work; use Yahoo Finance charts or the PNGs
  written to `/tmp` by `chart_engine.py`.
