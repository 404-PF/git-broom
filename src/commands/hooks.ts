import type { BroomConfig } from "../types/index.js";
import {
  getBranchNamingWarnings,
  installHooks,
  isHookName,
  type HookCheckResult,
  type HookName,
} from "../core/hooks.js";
import { getCurrentBranch } from "../core/git.js";
import { logger } from "../utils/logger.js";

export async function hooksInstallCommand(cwd?: string): Promise<void> {
  const result = await installHooks(cwd);

  logger.success(`Git hooks installed in ${result.hooksDirectory}`);
  if (result.installed.length > 0) {
    logger.info(`Installed: ${result.installed.join(", ")}`);
  }
  if (result.alreadyInstalled.length > 0) {
    logger.info(`Already installed: ${result.alreadyInstalled.join(", ")}`);
  }
}

export async function hooksCheckCommand(
  config: BroomConfig,
  options: { hook: string; force?: boolean; hookArgs?: string[] },
  cwd?: string,
): Promise<HookCheckResult> {
  let hook: HookName;
  if (isHookName(options.hook)) {
    hook = options.hook;
  } else {
    logger.warn(`Unknown hook name "${options.hook}", falling back to "pre-commit"`);
    hook = "pre-commit";
  }
  const branch = await getCurrentBranch(cwd);
  const isBranchCheckout =
    hook !== "post-checkout" ||
    !options.hookArgs ||
    options.hookArgs.length === 0 ||
    options.hookArgs.at(-1) === "1";
  const warnings =
    options.force || !isBranchCheckout
      ? []
      : getBranchNamingWarnings(branch, config);
  const result: HookCheckResult = {
    hook,
    branch,
    warnings,
    bypassed: Boolean(options.force),
  };

  if (config.json) {
    logger.json(result);
    return result;
  }

  for (const warning of warnings) {
    logger.warn(
      `Branch "${warning.branch}" may become stale: ${warning.reasons.join("; ")}. ` +
        "Use --force or Git --no-verify to bypass this warning.",
    );
  }

  return result;
}
