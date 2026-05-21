# AGENTS.md

## Commands

```bash
npm run dev -- <args>        # Run CLI (note: -- required before subcommand args)
npm run build                # tsup → dist/index.js
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src
npm run format               # prettier --write src
npm test                     # vitest run
```

## Key Constraints

- **Node ≥ 24** required (`engines` in package.json)
- **ESM only** (`"type": "module"` in package.json)
- **`--dry-run` is the default** — clean commands never mutate without `--no-dry-run`
- **Windows compatibility**: do not use `du` or other Unix-only commands for `.git` size — use the cross-platform `dirSize()` in `src/core/git.ts`

## Architecture

```
src/
  index.ts           → commander CLI entry (bin: git-broom)
  commands/          → status, clean, branches, objects
  core/
    git.ts           → execa wrappers for all git operations
    safety.ts        → branch protection, confirmation prompts
    config.ts        → .gitbroomrc → zod validation → BroomConfig
  types/index.ts     → shared interfaces
  utils/logger.ts    → chalk output, table formatting
```

## Verification Order

`typecheck → lint → test`

## Testing

- No tests written yet — `vitest` is configured, `test/` directory exists
- When adding tests, use `npm test` to run, `npm run test:watch` for watch mode
