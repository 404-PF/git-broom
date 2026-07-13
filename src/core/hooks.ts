import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { BranchNamingConfig, BroomConfig } from "../types/index.js";
import { DEFAULT_BRANCH_NAMING, isSafeTicketPattern } from "./config.js";
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

function matchesPattern(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starMatchIndex = 0;

  while (valueIndex < value.length) {
    const patternCharacter = pattern[patternIndex];
    if (patternCharacter === "?" || patternCharacter === value[valueIndex]) {
      valueIndex++;
      patternIndex++;
    } else if (patternCharacter === "*") {
      starIndex = patternIndex++;
      starMatchIndex = valueIndex;
    } else if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      starMatchIndex += 1;
      valueIndex = starMatchIndex;
    } else {
      return false;
    }
  }

  while (pattern[patternIndex] === "*") patternIndex++;
  return patternIndex === pattern.length;
}

function getBranchNamingReasons(
  branch: string,
  rules: BranchNamingConfig,
): string[] {
  const reasons: string[] = [];

  if (rules.requirePrefix) {
    const prefix = branch.split("/")[0];
    if (!rules.allowedPrefixes.includes(prefix)) {
      reasons.push(
        `missing a recognized prefix (${rules.allowedPrefixes.join(", ")})`,
      );
    }
  }

  if (rules.requireTicket) {
    if (!isSafeTicketPattern(rules.ticketPattern)) {
      reasons.push("uses an invalid or unsafe ticket pattern in .gitbroomrc");
    } else {
      // Compile once per branch — ticketPattern is validated at config parse time
      try {
        const ticketRegex = new RegExp(rules.ticketPattern);
        if (!ticketRegex.test(branch)) {
          reasons.push(`missing a ticket number matching ${rules.ticketPattern}`);
        }
      } catch {
        reasons.push("uses an invalid or unsafe ticket pattern in .gitbroomrc");
      }
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

// Git always invokes hooks via /bin/sh; this is a Git constraint, not a choice.
function renderHookScript(hook: HookName): string {
  // hook is a HOOK_NAMES enum literal — safe to interpolate without shell quoting
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
    `  echo "Warning: git-broom hooks check failed for ${hook}; continuing." >&2`,
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
      if (existsSync(backupPath)) {
        throw new Error(
          `Refusing to overwrite ${hookPath}: backup already exists at ${backupPath}`,
        );
      }
      renameSync(hookPath, backupPath);
    }

    writeFileSync(hookPath, renderHookScript(hook), {
      encoding: "utf8",
      mode: 0o755,
    });
    installed.push(hook);
  }

  return { hooksDirectory, installed, alreadyInstalled };
}

export function isHookName(value: string): value is HookName {
  return (HOOK_NAMES as readonly string[]).includes(value);
}
