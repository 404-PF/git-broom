# Contributing to Git Broom

Thank you for your interest in contributing to Git Broom! This guide will help you get started.

## Getting Started

### Requirements

- **Node.js >= 24** (see `engines` in package.json)
- **npm** (comes with Node.js)

### Setup

```bash
git clone https://github.com/404-PF/git-broom.git
cd git-broom
npm install
```

## Development Workflow

### Running the CLI

```bash
npm run dev -- <command>     # Run in development mode (note: -- required before args)
npm run dev -- help          # Show help
npm run dev -- status        # Show repository status
npm run dev -- clean         # Dry-run clean (default)
```

### Building

```bash
npm run build                # tsup → dist/index.js
```

### Code Quality

Run these commands in order before submitting changes:

```bash
npm run typecheck            # TypeScript type checking
npm run lint                 # ESLint
npm run format               # Prettier formatting
npm test                     # Vitest tests
```

## Project Structure

```
src/
  index.ts           → Commander CLI entry point (bin: git-broom)
  commands/          → Subcommands: status, clean, branches, objects
  core/
    git.ts           → execa wrappers for git operations
    safety.ts        → Branch protection, confirmation prompts
    config.ts        → .gitbroomrc parsing with Zod validation
  types/index.ts     → Shared TypeScript interfaces
  utils/logger.ts    → Chalk output, table formatting
```

## Key Constraints

- **ESM only** — `"type": "module"` in package.json
- **Dry-run by default** — clean commands never mutate without `--no-dry-run`
- **Safety first** — protected branches and current branch are never deleted
- **Windows compatibility** — avoid Unix-only commands; use cross-platform utilities from `src/core/git.ts`

## Adding Features

1. Create a new branch from `main`
2. Make your changes following the existing code style
3. Run `npm run typecheck && npm run lint && npm test`
4. Commit with a clear, concise message
5. Open a pull request

## Adding Tests

Tests use Vitest and live in the `test/` directory:

```bash
npm test                     # Run all tests
npm run test:watch           # Watch mode
```

Match test file names to source files (e.g., `src/core/git.ts` → `test/core/git.test.ts`).

## Reporting Issues

- **Bug reports**: Include steps to reproduce, expected behavior, and actual behavior
- **Feature requests**: Describe the use case and expected behavior
- Open issues at: https://github.com/404-PF/git-broom/issues

## Pull Requests

- Keep PRs focused on a single change
- Include tests for new functionality
- Update documentation if behavior changes
- Follow the existing code style (run `npm run format`)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
