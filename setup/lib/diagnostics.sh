# diagnostics.sh — telemetry disabled in this fork.
#
# Both helpers are kept as no-ops so existing `source` + `ph_event ...`
# calls in nanoclaw.sh / setup.sh continue to work without change, but
# no install-id is generated and no curl is made.

ph_install_id() { :; }
ph_event() { :; }
