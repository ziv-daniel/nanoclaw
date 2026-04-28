/**
 * Per-group container config, stored as a plain JSON file at
 * `groups/<folder>/container.json`. Mounted read-only inside the container
 * at `/workspace/agent/container.json` — the runner reads it at startup but
 * cannot modify it. Config changes go through the self-mod approval flow.
 *
 * All fields are optional — a missing file or a partial file both resolve
 * to sensible defaults. Writes are atomic-enough (write-then-rename is not
 * worth the ceremony here since there's only one writer in practice: the
 * host, from the delivery thread that processes approved system actions).
 *
 * Global MCP servers: any MCP servers defined in `groups/_global/container.json`
 * are merged into every group's config automatically. Group-level entries
 * override global ones when the key matches.
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  // Optional always-in-context guidance. When set, the host writes the
  // content to `.claude-fragments/mcp-<name>.md` at spawn and imports it
  // into the composed CLAUDE.md.
  instructions?: string;
}

export interface AdditionalMountConfig {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

export interface ContainerConfig {
  mcpServers: Record<string, McpServerConfig>;
  packages: { apt: string[]; npm: string[] };
  imageTag?: string;
  additionalMounts: AdditionalMountConfig[];
  /** Which skills to enable — array of skill names or "all" (default). */
  skills: string[] | 'all';
  /** Agent provider name (e.g. "claude", "opencode"). Default: "claude". */
  provider?: string;
  /** Agent group display name (used in transcript archiving). */
  groupName?: string;
  /** Assistant display name (used in system prompt / responses). */
  assistantName?: string;
  /** Agent group ID — set by the host, read by the runner. */
  agentGroupId?: string;
  /** Max messages per prompt. Falls back to code default if unset. */
  maxMessagesPerPrompt?: number;
}

const GLOBAL_FOLDER = '_global';

function emptyConfig(): ContainerConfig {
  return {
    mcpServers: {},
    packages: { apt: [], npm: [] },
    additionalMounts: [],
    skills: 'all',
  };
}

function configPath(folder: string): string {
  return path.join(GROUPS_DIR, folder, 'container.json');
}

/** Read MCP servers from the global config, silently returning {} on any error. */
function readGlobalMcpServers(): Record<string, McpServerConfig> {
  const p = configPath(GLOBAL_FOLDER);
  if (!fs.existsSync(p)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<ContainerConfig>;
    return raw.mcpServers ?? {};
  } catch {
    return {};
  }
}

/**
 * Read the container config for a group, returning sensible defaults for
 * any missing fields (or an entirely empty config if the file is absent).
 * Never throws for missing / malformed files — corruption logs a warning
 * via console.error and falls back to empty.
 *
 * Global MCP servers (from _global/container.json) are merged in as the base
 * layer; group-specific entries override them.
 */
export function readContainerConfig(folder: string): ContainerConfig {
  const globalMcpServers = folder !== GLOBAL_FOLDER ? readGlobalMcpServers() : {};
  const p = configPath(folder);
  if (!fs.existsSync(p)) {
    return { ...emptyConfig(), mcpServers: { ...globalMcpServers } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<ContainerConfig>;
    return {
      mcpServers: { ...globalMcpServers, ...(raw.mcpServers ?? {}) },
      packages: {
        apt: raw.packages?.apt ?? [],
        npm: raw.packages?.npm ?? [],
      },
      imageTag: raw.imageTag,
      additionalMounts: raw.additionalMounts ?? [],
      skills: raw.skills ?? 'all',
      provider: raw.provider,
      groupName: raw.groupName,
      assistantName: raw.assistantName,
      agentGroupId: raw.agentGroupId,
      maxMessagesPerPrompt: raw.maxMessagesPerPrompt,
    };
  } catch (err) {
    console.error(`[container-config] failed to parse ${p}: ${String(err)}`);
    return { ...emptyConfig(), mcpServers: { ...globalMcpServers } };
  }
}

/**
 * Write the container config for a group, creating the groups/<folder>/
 * directory if necessary. Pretty-printed JSON so diffs in the activation
 * flow are reviewable.
 */
export function writeContainerConfig(folder: string, config: ContainerConfig): void {
  const p = configPath(folder);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Apply a mutator function to a group's container config and persist the
 * result. Convenient for append-style changes like `install_packages` and
 * `add_mcp_server` handlers.
 */
export function updateContainerConfig(folder: string, mutate: (config: ContainerConfig) => void): ContainerConfig {
  const config = readContainerConfig(folder);
  mutate(config);
  writeContainerConfig(folder, config);
  return config;
}

/**
 * Initialize an empty container.json for a group if one doesn't already
 * exist. Idempotent — used from `group-init.ts`.
 */
export function initContainerConfig(folder: string): boolean {
  const p = configPath(folder);
  if (fs.existsSync(p)) return false;
  writeContainerConfig(folder, emptyConfig());
  return true;
}
