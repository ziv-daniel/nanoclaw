// Telemetry disabled in this fork. Both helpers are kept as no-ops so callers
// (setup/auto.ts, setup/lib/runner.ts, setup/lib/windowed-runner.ts) compile
// and run unchanged, but no install-id is generated and no event is sent.

export function installId(): string {
  return '';
}

export function emit(
  _event: string,
  _props: Record<string, string | number | boolean | undefined> = {},
): void {
  return;
}
