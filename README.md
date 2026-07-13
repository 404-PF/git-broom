# 🧹 Git Broom

A safety-first CLI tool to automatically clean up stale branches, prune dangling Git objects, and keep your repositories tidy.

## Features

- **Dry-run by default** — see what would happen before any changes are made
- **Protected branches** — never delete `main`, `master`, `develop`, or custom patterns
- **Safety guards** — current branch is always skipped, confirmation prompts before deletion
- **Stale branch detection** — configurable inactivity threshold (default: 90 days)
- **Dangling object pruning** — clean up unreachable commits, trees, and blobs
- **Repository status report** — quick overview of branch hygiene and `.git` size
- **Branch naming hooks** — warn about branch names that lack a ticket or recognized prefix

## Installation

```bash
npm install -g @404-pf/git-broom
```

Or run locally from the project:

```bash
npm run dev -- [command]
```

## Usage

```bash
git-broom status          # Show repository hygiene report
git-broom clean           # Clean stale branches (dry-run by default)
git-broom branches        # List branches by state
git-broom objects         # Inspect dangling objects
git-broom hook install    # Install branch naming hooks
```

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--repo <path>` | Target repository directory | `cwd` |
| `--dry-run` | Show what would happen | `true` |
| `--no-dry-run` | Apply changes | — |
| `--yes` | Skip confirmation prompts | `false` |
| `--aggressive` | Deep clean with aggressive GC | `false` |
| `--verbose` | Show debug output | `false` |

### Commands

#### `status`

Show a quick report of your repository's health:

```
🧹 Repository Status
────────────────────────────────────────
Current branch         main
Total branches         12
Merged branches        5
Stale branches (>90d)  3
Dangling objects       47
Remotes                origin
.git size              15.2 MB
```

#### `clean`

Orchestrate a full cleanup:

1. Prune remote tracking branches
2. Delete merged local branches
3. Delete stale branches (configurable days)
4. Run garbage collection

```bash
git-broom clean                    # Dry run (default)
git-broom clean --no-dry-run       # Apply changes
git-broom clean --yes              # Skip confirmation
git-broom clean --stale-days 30    # Custom stale threshold
git-broom clean --aggressive       # Aggressive GC
```

#### `branches`

List branches categorized by state with name, status, last commit, and subject:

```bash
git-broom branches                 # All branches
git-broom branches --merged        # Only merged
git-broom branches --stale         # Only stale
git-broom branches --stale-days 60 # Custom threshold
git-broom branches --histogram     # Show branch age distribution
```

Use `--merged` to filter for branches already merged into HEAD, and `--stale` to filter for branches with no commits within the stale threshold (default: 90 days). With no filters, branches are categorized as **merged**, **stale**, **active**, or **protected**.

Use `--histogram` to show branch counts grouped into `0-7d`, `7-30d`, `30-90d`, and `90d+` age buckets. The ranges are color-coded from green for recent branches through yellow to red for branches older than 90 days.

#### `objects`

Inspect and prune dangling Git objects:

```bash
git-broom objects                  # Show dangling objects
git-broom objects --prune          # Remove them
git-broom objects --prune --aggressive  # Aggressive cleanup
```

## Configuration

Create a `.gitbroomrc` file in your repository or home directory:

```json
{
  "protectedBranches": ["main", "master", "develop", "release-*"],
  "staleDays": 60,
  "dryRun": true,
  "aggressive": false,
  "skipConfirmation": false,
  "verbose": false
}
```

Branch naming warnings are enabled by default for non-protected branches. Customize them with `branchNaming`:

```json
{
  "branchNaming": {
    "requireTicket": true,
    "requirePrefix": true,
    "ticketPattern": "[A-Z]+-\\d+",
    "allowedPrefixes": ["feature", "fix", "chore"],
    "ignorePatterns": ["dependabot/*"]
  }
}
```

| Field | Purpose | Expected value |
| --- | --- | --- |
| `requireTicket` | Require a ticket matching `ticketPattern` in the branch name. | Boolean |
| `requirePrefix` | Require the first branch path segment to be in `allowedPrefixes`. | Boolean |
| `ticketPattern` | Safe regular expression used to find a ticket identifier. | Safe regex string (no groups or alternation) |
| `allowedPrefixes` | Prefixes accepted as the first branch path segment. | Array of strings |
| `ignorePatterns` | Branch globs excluded from naming warnings. | Array of glob strings (`*` and `?` supported) |

Install `post-checkout`, `pre-commit`, and `pre-push` hooks with:

```bash
git-broom hook install
```

The hooks warn but do not block Git operations. Use Git's `--no-verify` option, `git-broom hooks check --force`, or set `GIT_BROOM_FORCE=1` to bypass a warning. Existing hooks are backed up as `<hook>.git-broom-backup` before Git Broom installs its wrapper.

> **Note:** Installed hooks use `#!/bin/sh` shell scripts. On Windows, Git Bash or WSL must be used to execute them. Git for Windows uses Git Bash by default, so hooks will work in standard Git for Windows installations.

## Safety

Git Broom is designed with safety as the top priority:

- **Dry-run is the default** — nothing is deleted unless you explicitly use `--no-dry-run`
- **Protected branches** — `main`, `master`, `develop`, and user-configured patterns are never deleted
- **Current branch** — the checked-out branch is always skipped
- **Confirmation prompts** — interactive confirmation before any deletion (skip with `--yes`)
- **Remote pruning** — remote tracking branches are pruned before evaluating staleness

## Development

```bash
npm install          # Install dependencies
npm run dev -- help  # Run in development mode
npm run build        # Build for production
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier formatting
npm test             # Run tests
```

## License

MIT — see [LICENSE](LICENSE)
