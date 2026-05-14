# Screener Workflow — NYSE & TASE

Single source of truth for all recurring market screener tasks. Each scheduled
trigger references this file and supplies parameters; do not duplicate the body
into individual cron prompts.

## Parameters

The trigger passes these as `key=value` pairs. Defaults apply when omitted.

| Param        | Allowed values            | Default | Notes                                      |
|--------------|---------------------------|---------|--------------------------------------------|
| `window`     | `pre-open`, `intraday`, `eod` | (required) | Selects branch behavior below.        |
| `market`     | `NYSE`, `TASE`            | (required) | Picks ticker groups + currency.        |
| `threshold`  | integer 0-100             | 75 for `pre-open`/`intraday`, 65 for `eod` | Screener score cutoff. |
| `budget`     | integer (ILS)             | 500     | Forwarded to TradingAdvisor only.          |

`market` resolves to:
- `NYSE` → screener groups `mags7`, `extra`; currency `USD`
- `TASE` → screener group `ta35`; currency `ILS`

## Common steps (all windows)

1. Run the screener for every group in the resolved set, sequentially:

   ```sh
   python3 /workspace/agent/screener.py \
       --group=<GROUP> \
       --threshold=<THRESHOLD> \
       --budget=<BUDGET>
   ```

   Output is JSON on stdout and is also written to `/tmp/screener_results.json`.
   Read both groups' opportunities and merge into a single deduped list keyed by
   `symbol`.

2. If the merged list is empty, **stay silent** — do not message the user, the
   trading channel, or any sub-agent.

## Branch: `window=pre-open` or `window=intraday`

For each opportunity in the merged list:

1. Generate annotated charts:

   ```sh
   python3 /workspace/agent/chart_engine.py <SYMBOL> <CURRENCY> /tmp
   ```

   Capture the JSON output (`{ ticker, last_close, charts, patterns, vision, ts }`).

2. Delegate to the analysis sub-agent — `send_message(to="TradingAnalyst", ...)`
   with: `score`, `RSI`, `MACD`, `MA150`, `setup_type`, `stop`, `target`, `R/R`,
   the 3 chart paths from `charts`, and the `vision` block from chart_engine.

3. Delegate to the position-sizing sub-agent —
   `send_message(to="TradingAdvisor", ...)` with the same payload plus
   `budget=<BUDGET>`.

4. Persist the alert to Qdrant collection `trading_alerts` (one record per
   `(symbol, ts)` pair: include `score`, `setup_type`, `stop`, `target`,
   `R/R`, `chart_paths`, `vision_summary`).

The user-facing reply (if any) goes to the trading channel in **Hebrew**, in the
existing concise alert format.

## Branch: `window=eod`

EOD is a confirmation pass — narrower output, no sub-agent delegation.

1. From the merged list, keep only opportunities whose `last_close` is within
   2% of `target` (i.e. `abs(last_close - target) / target <= 0.02`).
2. For each kept opportunity, send a single message to the trading channel in
   Hebrew:

   ```
   ✅ [<name>] (<symbol>) — סגירה יומית מעל ההתנגדות <price>. אישור EOD — שוקלים כניסה מחר בפתיחה.
   ```

3. Do **not** call `chart_engine.py`, do **not** notify TradingAnalyst /
   TradingAdvisor, do **not** write to Qdrant on the EOD branch.
4. If no opportunity passes the 2% filter, stay silent.

## Routing & escalation

This group's `routing.json` forces `claude-opus-4-6` / `medium` and escalates to
`claude-opus-4-7` / `high` whenever the turn touches chart-analysis keywords
(see the `intentRules` block). When you call `chart_engine.py` and start
analyzing the resulting charts, the escalation should fire automatically. No
manual `[route:...]` prefix is required.

## Notes

- All replies to the user are in Hebrew; this workflow file and any internal
  reasoning stays in English.
- `screener.py` reads `/workspace/agent/watchlist.json` — that file lives in
  this group's folder and defines the `mags7` / `ta35` / `extra` groups.
- `chart_engine.py` writes annotated PNGs into `/tmp` and returns their paths
  in the JSON; the sub-agents read them from there.
- This workflow runs in the `telegram_trading` agent group only. Do not invoke
  it from `telegram_main` (Andy) — domain tasks belong to the agent that owns
  the work.
