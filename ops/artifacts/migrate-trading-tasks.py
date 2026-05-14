#!/usr/bin/env python3
"""
Build the SQL to:
  1. Cancel the 14 Hebrew screener tasks in Andy's session_db.
  2. Insert 14 English short-trigger replacements in telegram_trading's session_db.

This script only emits SQL on stdout (in two parts separated by a sentinel line).
The actual sqlite3 invocation is wrapped in srv.py on the server.
"""
import json
import sys
import time

ANDY_DB = "/nc/data/v2-sessions/ag-1777150999662-ryx8n1/sess-1777150999664-5y9mnf/inbound.db"
TRADING_DB = "/nc/data/v2-sessions/ag-1777540885651-2ftbhz/sess-1777570121371-3srgqp/inbound.db"

OLD_IDS = [
    "task-1778247109576-d6td8l",
    "task-1778248610071-80by2z",
    "task-1778250053120-6f0clq",
    "task-1778251554836-828igt",
    "task-1778166647156-gvnltx",
    "task-1778182258698-mpgu08",
    "task-1778185800752-drdtdl",
    "task-1778138193312-xhj02k",
    "task-1778138196625-csj8cj",
    "task-1778138411188-2l8xpy",
    "task-1778139913015-bcls3f",
    "task-1778141414801-me7q10",
    "task-1778164245046-mzjvrm",
    "task-1778165145296-wcygsd",
]

# (recurrence, process_after, market, window)
TASKS = [
    ("30 16 * * 1-5",   "2026-05-11T13:30:00.000Z", "NYSE", "pre-open"),
    ("55 16 * * 1-5",   "2026-05-11T13:55:00.000Z", "NYSE", "pre-open"),
    ("20 17 * * 1-5",   "2026-05-11T14:20:00.000Z", "NYSE", "pre-open"),
    ("45 17 * * 1-5",   "2026-05-11T14:45:00.000Z", "NYSE", "pre-open"),
    ("10 18 * * 1-5",   "2026-05-08T15:10:00.000Z", "NYSE", "pre-open"),
    ("30 18-22 * * 1-5","2026-05-08T15:30:00.000Z", "NYSE", "intraday"),
    ("30 23 * * 1-5",   "2026-05-08T20:30:00.000Z", "NYSE", "eod"),
    ("30 9 * * 0-4",    "2026-05-10T06:30:00.000Z", "TASE", "pre-open"),
    ("55 9 * * 0-4",    "2026-05-10T06:55:00.000Z", "TASE", "pre-open"),
    ("20 10 * * 0-4",   "2026-05-10T07:20:00.000Z", "TASE", "pre-open"),
    ("45 10 * * 0-4",   "2026-05-10T07:45:00.000Z", "TASE", "pre-open"),
    ("10 11 * * 0-4",   "2026-05-10T08:10:00.000Z", "TASE", "pre-open"),
    ("30 11-17 * * 0-4","2026-05-10T08:30:00.000Z", "TASE", "intraday"),
    ("45 17 * * 0-4",   "2026-05-10T14:45:00.000Z", "TASE", "eod"),
]


def trigger_prompt(window: str, market: str) -> str:
    if window == "eod":
        return (
            f"Run the workflow defined in /workspace/agent/tasks/screener-workflow.md "
            f"with window=eod market={market} budget=500."
        )
    return (
        f"Run the workflow defined in /workspace/agent/tasks/screener-workflow.md "
        f"with window={window} market={market} threshold=75 budget=500."
    )


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_andy_sql() -> str:
    ids = ", ".join(sql_quote(i) for i in OLD_IDS)
    return (
        "BEGIN;\n"
        "UPDATE messages_in\n"
        "  SET status = 'completed', recurrence = NULL\n"
        f"  WHERE id IN ({ids}) AND kind = 'task' AND status IN ('pending', 'paused');\n"
        f"SELECT 'andy_cancelled=' || changes();\n"
        "COMMIT;\n"
    )


def build_trading_sql() -> str:
    base_ms = int(time.time() * 1000)
    lines = [
        "BEGIN;",
        "-- Compute next even seq, atomically, by snapshotting MAX before INSERTs.",
    ]
    # Use a CTE-free strategy: read max then increment in app logic. Since
    # sqlite3 CLI runs each statement standalone, we'll inline the increment
    # via a temporary value. Easiest is to use a temp table with a counter.
    lines += [
        "CREATE TEMP TABLE IF NOT EXISTS _seq(v INTEGER);",
        "DELETE FROM _seq;",
        "INSERT INTO _seq(v) SELECT IFNULL(MAX(seq), 0) FROM messages_in;",
        # Round up to next even.
        "UPDATE _seq SET v = CASE WHEN v % 2 = 0 THEN v + 2 ELSE v + 1 END;",
    ]
    for i, (rec, pa, market, window) in enumerate(TASKS):
        new_id = f"task-{base_ms + i}-mig{i+1:02d}"
        prompt = trigger_prompt(window, market)
        content = json.dumps({"prompt": prompt, "script": None}, ensure_ascii=False)
        lines.append(
            "INSERT INTO messages_in "
            "(id, seq, kind, timestamp, status, process_after, recurrence, "
            "trigger, platform_id, channel_type, thread_id, content, series_id) "
            f"VALUES ({sql_quote(new_id)}, (SELECT v FROM _seq), 'task', "
            "datetime('now'), 'pending', "
            f"{sql_quote(pa)}, {sql_quote(rec)}, 1, NULL, NULL, NULL, "
            f"{sql_quote(content)}, {sql_quote(new_id)});"
        )
        lines.append("UPDATE _seq SET v = v + 2;")
    lines += [
        "SELECT 'trading_inserted=' || (SELECT COUNT(*) FROM messages_in "
        f"WHERE id LIKE 'task-{base_ms}%' OR id LIKE 'task-{base_ms+1}%' "
        f"OR id LIKE 'task-{base_ms+13}%');",
        "DROP TABLE _seq;",
        "COMMIT;",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "andy":
        sys.stdout.write(build_andy_sql())
    elif len(sys.argv) > 1 and sys.argv[1] == "trading":
        sys.stdout.write(build_trading_sql())
    else:
        print("usage: migrate-trading-tasks.py andy|trading", file=sys.stderr)
        sys.exit(2)
