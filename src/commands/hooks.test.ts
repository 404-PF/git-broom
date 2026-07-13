import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BroomConfig } from "../types/index.js";

const gitMocks = vi.hoisted(() => ({
  getCurrentBranch: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
  getBranchNamingWarnings: vi.fn(),
  installHooks: vi.fn(),
  isHookName: vi.fn((value: string) =>
    ["post-checkout", "pre-commit", "pre-push"].includes(value),
  ),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  json: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../core/git.js", () => gitMocks);
vi.mock("../core/hooks.js", () => hookMocks);
vi.mock("../utils/logger.js", () => ({ logger: loggerMocks }));

import { hooksCheckCommand } from "./hooks.js";

const baseConfig: BroomConfig = {
  protectedBranches: ["main"],
  staleDays: 90,
  dryRun: true,
  aggressive: false,
  skipConfirmation: false,
  verbose: false,
  json: false,
};

describe("hooks check command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitMocks.getCurrentBranch.mockResolvedValue("work-in-progress");
    hookMocks.getBranchNamingWarnings.mockReturnValue([
      {
        branch: "work-in-progress",
        reasons: ["missing a recognized prefix"],
      },
    ]);
  });

  it("skips warnings for post-checkout file updates", async () => {
    const result = await hooksCheckCommand(
      baseConfig,
      { hook: "post-checkout", hookArgs: ["old", "new", "0"] },
      "repo",
    );

    expect(result).toEqual({
      hook: "post-checkout",
      branch: "work-in-progress",
      warnings: [],
      bypassed: false,
    });
    expect(hookMocks.getBranchNamingWarnings).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it("emits warnings for post-checkout branch updates", async () => {
    const result = await hooksCheckCommand(
      baseConfig,
      { hook: "post-checkout", hookArgs: ["old", "new", "1"] },
      "repo",
    );

    expect(result).toEqual({
      hook: "post-checkout",
      branch: "work-in-progress",
      warnings: [
        {
          branch: "work-in-progress",
          reasons: ["missing a recognized prefix"],
        },
      ],
      bypassed: false,
    });
    expect(hookMocks.getBranchNamingWarnings).toHaveBeenCalledWith(
      "work-in-progress",
      baseConfig,
    );
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Branch "work-in-progress" may become stale: missing a recognized prefix. ' +
        "Use --force or Git --no-verify to bypass this warning.",
    );
  });

  it("bypasses warnings when forced", async () => {
    const result = await hooksCheckCommand(
      baseConfig,
      { hook: "pre-commit", force: true },
      "repo",
    );

    expect(result).toEqual({
      hook: "pre-commit",
      branch: "work-in-progress",
      warnings: [],
      bypassed: true,
    });
    expect(hookMocks.getBranchNamingWarnings).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it("emits the result as JSON when configured", async () => {
    const config = { ...baseConfig, json: true };
    const result = await hooksCheckCommand(
      config,
      { hook: "pre-commit" },
      "repo",
    );

    expect(result).toEqual({
      hook: "pre-commit",
      branch: "work-in-progress",
      warnings: [
        {
          branch: "work-in-progress",
          reasons: ["missing a recognized prefix"],
        },
      ],
      bypassed: false,
    });
    expect(loggerMocks.json).toHaveBeenCalledWith(result);
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });
});
