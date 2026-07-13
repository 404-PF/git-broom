import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BroomConfig } from "../types/index.js";

const gitMocks = vi.hoisted(() => ({
  getGitPath: vi.fn(),
}));

vi.mock("./git.js", () => gitMocks);

import { getBranchNamingWarnings, HOOK_MARKER, installHooks } from "./hooks.js";

const baseConfig: BroomConfig = {
  protectedBranches: ["main"],
  staleDays: 90,
  dryRun: true,
  aggressive: false,
  skipConfirmation: false,
  verbose: false,
  json: false,
  branchNaming: {
    requireTicket: true,
    requirePrefix: true,
    ticketPattern: "[A-Z]+-\\d+",
    allowedPrefixes: ["feature", "fix"],
    ignorePatterns: [],
  },
};

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "git-broom-hooks-"));
}

describe("branch naming hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when a branch has no recognized prefix or ticket", () => {
    const warnings = getBranchNamingWarnings("work-in-progress", baseConfig);

    expect(warnings).toEqual([
      {
        branch: "work-in-progress",
        reasons: [
          "missing a recognized prefix (feature, fix)",
          "missing a ticket number matching [A-Z]+-\\d+",
        ],
      },
    ]);
  });

  it("accepts a branch with a configured prefix and ticket", () => {
    expect(
      getBranchNamingWarnings("feature/PROJ-42-cleanup", baseConfig),
    ).toEqual([]);
  });

  it("does not warn for protected or ignored branches", () => {
    expect(getBranchNamingWarnings("main", baseConfig)).toEqual([]);
    expect(
      getBranchNamingWarnings("dependabot/npm", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ignorePatterns: ["dependabot/*"],
        },
      }),
    ).toEqual([]);
    expect(
      getBranchNamingWarnings("release/1", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ignorePatterns: ["release/?"],
        },
      }),
    ).toEqual([]);
  });

  it("installs all hooks and preserves an existing hook", async () => {
    const cwd = makeTempDir();
    const hooksDirectory = join(cwd, "hooks");
    vi.mocked(gitMocks.getGitPath).mockResolvedValue(hooksDirectory);

    await expect(installHooks(cwd)).resolves.toEqual({
      hooksDirectory,
      installed: ["post-checkout", "pre-commit", "pre-push"],
      alreadyInstalled: [],
    });

    const existingHook = join(hooksDirectory, "pre-commit");
    expect(existsSync(existingHook)).toBe(true);
    expect(readFileSync(existingHook, "utf8")).toContain(HOOK_MARKER);

    await expect(installHooks(cwd)).resolves.toEqual({
      hooksDirectory,
      installed: [],
      alreadyInstalled: ["post-checkout", "pre-commit", "pre-push"],
    });

    const existingCwd = makeTempDir();
    const existingHooksDirectory = join(existingCwd, "hooks");
    const existingPreCommit = join(existingHooksDirectory, "pre-commit");
    mkdirSync(existingHooksDirectory);
    writeFileSync(existingPreCommit, "# existing hook\n");
    vi.mocked(gitMocks.getGitPath).mockResolvedValue(existingHooksDirectory);

    await installHooks(existingCwd);
    expect(
      readFileSync(`${existingPreCommit}.git-broom-backup`, "utf8"),
    ).toContain("# existing hook");
  });
});

