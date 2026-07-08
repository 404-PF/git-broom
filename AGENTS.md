# AGENTS.md

## Purpose

`git-broom` is a safety-first Node.js CLI for inspecting repository hygiene and cleaning stale Git state.

When making changes, preserve the product's core promise:

- Destructive actions should stay explicit and hard to trigger accidentally.
- `--dry-run` should remain the default behavior.
- Output should help users understand what will happen before anything mutates.
- Cross-platform behavior matters, especially Windows compatibility.

## Stack Snapshot

- Runtime: Node.js `>=24`
- Language: TypeScript
- Module system: ESM only (`"type": "module"`)
- CLI framework: `commander`
- Process runner: `execa`
- Prompts: `@inquirer/prompts`
- Validation: `zod`
- Output: `chalk`
- Build: `tsup`
- Tests: `vitest`

## Commands

```bash
npm run dev -- status
npm run dev -- clean
npm run dev -- branches --stale
npm run dev -- objects --prune

npm run build
npm run typecheck
npm run lint
npm run format
npm test
```

Notes:

- Always include `--` before CLI subcommand args when using `npm run dev`.
- `npm run dev` executes `tsx src/index.ts`.
- `npm run build` outputs the CLI bundle to `dist/index.js`.
- `npm run prepack` runs the build automatically before packaging.

## Verification Order

Run checks in this order after code changes:

`npm run typecheck` -> `npm run lint` -> `npm test`

Testing note:

- `vitest` is configured.
- There is already a source-level test at `src/core/config.test.ts`.
- Prefer adding focused automated coverage for config resolution, safety filters, and command behavior when touching those areas.

## CLI Surface

Global options:

- `--repo <path>`: target repository, defaults to `process.cwd()`
- `--dry-run`: simulate changes, enabled by default
- `--no-dry-run`: allow mutations
- `--yes`: skip confirmation prompts
- `--aggressive`: use aggressive garbage collection
- `--verbose`: show debug output

Subcommands:

- `status`: show current branch, branch counts, dangling object count, remotes, and `.git` size
- `clean [--stale-days <days>]`: delete safe stale/merged branches, prune remotes, and run garbage collection
- `branches [--merged] [--stale] [--stale-days <days>]`: categorize branches as merged, stale, active, or protected
- `objects [--prune]`: inspect dangling objects and optionally prune them

## Config Behavior

Configuration is loaded from `.gitbroomrc` by walking upward from the target repo path.

Expected `.gitbroomrc` format:

```json
{
  "protectedBranches": ["main", "master", "develop"],
  "staleDays": 90,
  "dryRun": true,
  "aggressive": false,
  "skipConfirmation": false,
  "verbose": false
}
```

Rules:

- `.gitbroomrc` is parsed as JSON, not YAML or INI.
- Invalid config files are ignored with a warning.
- CLI overrides win over file config, and file config wins over built-in defaults.
- Keep config parsing tolerant enough to avoid breaking read-only inspection commands because of bad user config.

## Safety Invariants

- Never change the default of `dryRun: true` unless the user explicitly opts into real mutations.
- Do not remove confirmation prompts for mutating operations unless `--yes` or equivalent config explicitly skips them.
- Preserve branch protection behavior.
- The currently checked out branch must never be deleted.
- Protected branches currently include user-configured names plus built-in patterns:
  - `main`
  - `master`
  - `develop`
  - `release`
  - `production`
- Wildcard protection patterns are supported via `*`.

If you modify clean-up behavior, verify that dry-run output and real execution stay aligned.

## Architecture

```text
src/
  index.ts             commander CLI entrypoint and option wiring
  commands/
    status.ts          repository hygiene summary
    clean.ts           stale branch cleanup, remote prune, garbage collection
    branches.ts        branch categorization and listing
    objects.ts         dangling object inspection and pruning
  core/
    git.ts             all Git process execution and repo inspection helpers
    safety.ts          branch protection and confirmation flow
    config.ts          .gitbroomrc discovery, parsing, and merge with defaults
  types/
    index.ts           shared domain and config types
  utils/
    logger.ts          human-friendly terminal output and formatting
```

## Repo-Specific Guidance

- Keep Git command execution centralized in `src/core/git.ts`; avoid scattering raw `execa('git', ...)` calls unless there is a strong reason.
- Prefer extending shared types in `src/types/index.ts` when command/core contracts change.
- Preserve CLI output readability; this project is user-facing and summary text matters.
- Favor small, composable helpers in `core/` for logic that may need direct tests.
- When changing command options, update both `src/index.ts` wiring and any affected config or help text assumptions.

## Cross-Platform Constraints

- Do not use Unix-only utilities such as `du` to measure `.git` size.
- Use the cross-platform `dirSize()` path already established in `src/core/git.ts`.
- Be careful with path handling and shell assumptions; this repo must work on Windows.

## Change Checklist

- Did you preserve `--dry-run` as the default?
- Did you keep mutating behavior behind explicit opt-in?
- Did you avoid deleting protected or checked-out branches?
- Did you keep Git interactions centralized and typed?
- Did you run `typecheck`, `lint`, and `test` in that order?
