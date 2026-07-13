import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
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

  it("rejects unsafe ticket patterns without evaluating them", () => {
    expect(
      getBranchNamingWarnings("feature/" + "a".repeat(100) + "!", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ticketPattern: "(a+)+$",
        },
      }),
    ).toEqual([
      {
        branch: "feature/" + "a".repeat(100) + "!",
        reasons: ["uses an invalid or unsafe ticket pattern in .gitbroomrc"],
      },
    ]);
  });

  it("does not warn for protected branches", () => {
    expect(getBranchNamingWarnings("main", baseConfig)).toEqual([]);
  });

  it("respects * glob in ignorePatterns", () => {
    expect(
      getBranchNamingWarnings("dependabot/npm", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ignorePatterns: ["dependabot/*"],
        },
      }),
    ).toEqual([]);
  });

  it("respects ? single-character glob in ignorePatterns", () => {
    expect(
      getBranchNamingWarnings("release/1", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ignorePatterns: ["release/?"],
        },
      }),
    ).toEqual([]);
    expect(
      getBranchNamingWarnings("release/99", {
        ...baseConfig,
        branchNaming: {
          ...baseConfig.branchNaming!,
          ignorePatterns: ["release/?"],
        },
      }),
    ).not.toEqual([]);
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
    if (process.platform !== "win32") chmodSync(existingPreCommit, 0o755);
    vi.mocked(gitMocks.getGitPath).mockResolvedValue(existingHooksDirectory);

    await installHooks(existingCwd);
    expect(
      readFileSync(`${existingPreCommit}.git-broom-backup`, "utf8"),
    ).toContain("# existing hook");
    if (process.platform !== "win32") {
      expect(statSync(`${existingPreCommit}.git-broom-backup`).mode & 0o111).not.toBe(0);
    }
  });

  it.skipIf(process.platform === "win32")(
    "preserves symlinked hooks without overwriting their targets",
    async () => {
      const cwd = makeTempDir();
      const hooksDirectory = join(cwd, "hooks");
      const sharedHook = join(cwd, "shared-pre-commit");
      const existingPreCommit = join(hooksDirectory, "pre-commit");
      mkdirSync(hooksDirectory);
      writeFileSync(sharedHook, "# shared hook\n");
      symlinkSync(sharedHook, existingPreCommit);
      vi.mocked(gitMocks.getGitPath).mockResolvedValue(hooksDirectory);

      await installHooks(cwd);

      expect(lstatSync(`${existingPreCommit}.git-broom-backup`).isSymbolicLink()).toBe(true);
      expect(readFileSync(sharedHook, "utf8")).toBe("# shared hook\n");
      expect(lstatSync(existingPreCommit).isSymbolicLink()).toBe(false);
    },
  );
});
