import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { BranchNamingConfig, BroomConfig } from "../types/index.js";
import { DEFAULT_BRANCH_NAMING } from "./config.js";
import { getGitPath } from "./git.js";
import { isProtectedBranch } from "./safety.js";

export const HOOK_MARKER = "# git-broom managed hook";
export const HOOK_NAMES = ["post-checkout", "pre-commit", "pre-push"] as const;
export type HookName = (typeof HOOK_NAMES)[number];

export interface BranchNamingWarning {
  branch: string;
  reasons: string[];
}

export interface HookInstallResult {
  hooksDirectory: string;
  installed: HookName[];
  alreadyInstalled: HookName[];
}

export interface HookCheckResult {
  hook: HookName;
  branch: string | null;
  warnings: BranchNamingWarning[];
  bypassed: boolean;
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\\\?/g, ".")}$`);
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    return globToRegex(pattern).test(value);
  } catch {
    return false;
  }
}

function getBranchNamingReasons(
  branch: string,
  rules: BranchNamingConfig,
): string[] {
  const reasons: string[] = [];

  if (rules.requirePrefix) {
    const prefix = branch.split("/")[0];
    if (!rules.allowedPrefixes.includes(prefix ?? "")) {
      reasons.push(
        `missing a recognized prefix (${rules.allowedPrefixes.join(", ")})`,
      );
    }
  }

  if (rules.requireTicket) {
    try {
      if (!new RegExp(rules.ticketPattern).test(branch)) {
        reasons.push(`missing a ticket number matching ${rules.ticketPattern}`);
      }
    } catch {
      reasons.push("uses an invalid ticket pattern in .gitbroomrc");
    }
  }

  return reasons;
}

export function getBranchNamingWarnings(
  branch: string | null,
  config: BroomConfig,
): BranchNamingWarning[] {
  if (!branch || isProtectedBranch(branch, config)) return [];
  const rules = config.branchNaming ?? DEFAULT_BRANCH_NAMING;
  if (rules.ignorePatterns.some((pattern) => matchesPattern(branch, pattern))) {
    return [];
  }

  const reasons = getBranchNamingReasons(branch, rules);
  return reasons.length > 0 ? [{ branch, reasons }] : [];
}

function renderHookScript(hook: HookName): string {
  return [
    "#!/bin/sh",
    HOOK_MARKER,
    'if [ -f "$0.git-broom-backup" ]; then',
    '  "$0.git-broom-backup" "$@"',
    "  status=$?",
    '  if [ "$status" -ne 0 ]; then exit "$status"; fi',
    "fi",
    'if [ "${GIT_BROOM_FORCE:-}" = "1" ]; then',
    `  git-broom hooks check --hook ${hook} --force "$@"`,
    "else",
    `  git-broom hooks check --hook ${hook} "$@"`,
    "fi",
    "status=$?",
    'if [ "$status" -ne 0 ]; then',
    '  echo "Warning: git-broom hooks check failed or is unavailable; continuing." >&2',
    "  exit 0",
    "fi",
    "",
  ].join("\n");
}

export async function installHooks(cwd?: string): Promise<HookInstallResult> {
  const hooksDirectory = await getGitPath("hooks", cwd);
  mkdirSync(hooksDirectory, { recursive: true });

  const installed: HookName[] = [];
  const alreadyInstalled: HookName[] = [];

  for (const hook of HOOK_NAMES) {
    const hookPath = join(hooksDirectory, hook);
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf8");
      if (existing.includes(HOOK_MARKER)) {
        alreadyInstalled.push(hook);
        continue;
      }

      const backupPath = `${hookPath}.git-broom-backup`;
      if (!existsSync(backupPath)) copyFileSync(hookPath, backupPath);
    }

    writeFileSync(hookPath, renderHookScript(hook), {
      encoding: "utf8",
      mode: 0o755,
    });
    chmodSync(hookPath, 0o755);
    installed.push(hook);
  }

  return { hooksDirectory, installed, alreadyInstalled };
}

export function isHookName(value: string): value is HookName {
  return (HOOK_NAMES as readonly string[]).includes(value);
}
