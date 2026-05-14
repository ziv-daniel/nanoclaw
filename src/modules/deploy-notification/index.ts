/**
 * Deploy-notification module.
 *
 * Goal: emit a one-shot "what's new in this deploy" signal *only* when
 * the running ops branch has advanced past the SHA we last reported.
 * The previous design (notify on every container boot, with the full
 * changelog) was too noisy — warm restarts, image rebuilds and stack
 * cycles all triggered the same message.
 *
 * Contract:
 *   - On host startup we compare HEAD against `data/.last-notified-deploy-sha`.
 *   - If they differ, we write `logs/deploy.log` with the SHA + git-log
 *     diff between the two SHAs, and update the marker file.
 *   - n8n (or any external tooling) can tail `logs/deploy.log` after a
 *     successful deploy and forward the entry into whatever channel
 *     should be notified — keeps platform-side fan-out out of nanoclaw.
 *   - If the marker file does not exist (fresh install / first deploy
 *     after this feature lands) we seed it with the current HEAD and
 *     stay silent: avoids dumping an unbounded changelog on the user.
 *
 * Failure mode: any error (no git, no HEAD, fs failure) is logged and
 * swallowed. This is best-effort observability, never load-bearing.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from '../../config.js';
import { log } from '../../log.js';

const MARKER_FILE = path.join(DATA_DIR, '.last-notified-deploy-sha');
const DEPLOY_LOG = path.resolve(process.cwd(), 'logs', 'deploy.log');

function gitHeadSha(): string | null {
  try {
    return (
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

function gitLogBetween(fromSha: string, toSha: string): string {
  try {
    return execFileSync('git', ['log', '--oneline', '--no-decorate', `${fromSha}..${toSha}`], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function readMarker(): string | null {
  try {
    return fs.readFileSync(MARKER_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeMarker(sha: string): void {
  fs.mkdirSync(path.dirname(MARKER_FILE), { recursive: true });
  fs.writeFileSync(MARKER_FILE, `${sha}\n`, 'utf8');
}

function appendDeployLog(entry: string): void {
  fs.mkdirSync(path.dirname(DEPLOY_LOG), { recursive: true });
  fs.appendFileSync(DEPLOY_LOG, entry, 'utf8');
}

/**
 * Run on host boot. Synchronous, fire-and-forget. Never throws.
 */
export function notifyDeployIfNew(): void {
  const head = gitHeadSha();
  if (!head) return;

  const last = readMarker();
  if (last === head) return;

  if (!last) {
    writeMarker(head);
    return;
  }

  const changelog = gitLogBetween(last, head);
  if (!changelog) {
    writeMarker(head);
    return;
  }

  const stamp = new Date().toISOString();
  const entry = `\n=== deploy ${head.slice(0, 7)} @ ${stamp} ===\nfrom: ${last.slice(0, 7)}\n${changelog}\n`;

  try {
    appendDeployLog(entry);
    log.info('deploy-notification: HEAD advanced (logged to logs/deploy.log)', {
      from: last.slice(0, 7),
      to: head.slice(0, 7),
    });
    writeMarker(head);
  } catch (err) {
    log.warn('deploy-notification failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
