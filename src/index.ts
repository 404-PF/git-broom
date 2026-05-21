import { Command, InvalidArgumentError } from 'commander'
import { resolveConfig } from './core/config.js'
import { isGitRepo } from './core/git.js'
import { parsePositiveInteger } from './core/validation.js'
import { logger } from './utils/logger.js'
import { statusCommand } from './commands/status.js'
import { cleanCommand } from './commands/clean.js'
import { branchesCommand } from './commands/branches.js'
import { objectsCommand } from './commands/objects.js'

const program = new Command()

function parseStaleDays(value: string): number {
  try {
    return parsePositiveInteger(value, 'stale-days')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'stale-days must be a positive integer'
    throw new InvalidArgumentError(message)
  }
}

program
  .name('git-broom')
  .description('A safety-first CLI tool to clean up stale branches and keep repositories tidy.')
  .version('0.1.0')
  .option('--repo <path>', 'Target repository directory', process.cwd())
  .option('--dry-run', 'Show what would happen without making changes', true)
  .option('--no-dry-run', 'Apply changes without dry run')
  .option('--yes', 'Skip confirmation prompts', false)
  .option('--aggressive', 'Deep clean with aggressive garbage collection', false)
  .option('--verbose', 'Show debug output', false)

program
  .command('status')
  .description('Show repository hygiene report')
  .action(async (opts, cmd) => {
    const parentOpts = cmd.parent.opts()
    const config = resolveConfig(parentOpts.repo, {
      dryRun: parentOpts.dryRun,
      skipConfirmation: parentOpts.yes,
      aggressive: parentOpts.aggressive,
      verbose: parentOpts.verbose,
    })
    await ensureGitRepo(parentOpts.repo)
    await statusCommand(config, parentOpts.repo)
  })

program
  .command('clean')
  .description('Clean stale branches and prune objects')
  .option('--stale-days <days>', 'Days of inactivity to consider a branch stale', parseStaleDays)
  .action(async (opts, cmd) => {
    const parentOpts = cmd.parent.opts()
    const config = resolveConfig(parentOpts.repo, {
      dryRun: parentOpts.dryRun,
      skipConfirmation: parentOpts.yes,
      aggressive: parentOpts.aggressive,
      verbose: parentOpts.verbose,
      staleDays: opts.staleDays,
    })
    await ensureGitRepo(parentOpts.repo)
    await cleanCommand(config, parentOpts.repo)
  })

program
  .command('branches')
  .description('List and manage branches by state')
  .option('--merged', 'Show only merged branches')
  .option('--stale', 'Show only stale branches')
  .option('--stale-days <days>', 'Days of inactivity to consider a branch stale', parseStaleDays)
  .action(async (opts, cmd) => {
    const parentOpts = cmd.parent.opts()
    const config = resolveConfig(parentOpts.repo, {
      dryRun: parentOpts.dryRun,
      skipConfirmation: parentOpts.yes,
      aggressive: parentOpts.aggressive,
      verbose: parentOpts.verbose,
      staleDays: opts.staleDays,
    })
    await ensureGitRepo(parentOpts.repo)
    await branchesCommand(
      config,
      {
        merged: opts.merged,
        stale: opts.stale,
        staleDays: opts.staleDays,
      },
      parentOpts.repo,
    )
  })

program
  .command('objects')
  .description('Inspect and prune dangling objects')
  .option('--prune', 'Remove dangling objects')
  .action(async (opts, cmd) => {
    const parentOpts = cmd.parent.opts()
    const config = resolveConfig(parentOpts.repo, {
      dryRun: parentOpts.dryRun,
      skipConfirmation: parentOpts.yes,
      aggressive: parentOpts.aggressive,
      verbose: parentOpts.verbose,
    })
    await ensureGitRepo(parentOpts.repo)
    await objectsCommand(config, { prune: opts.prune }, parentOpts.repo)
  })

async function ensureGitRepo(repoPath: string) {
  const isRepo = await isGitRepo(repoPath)
  if (!isRepo) {
    logger.error(`Not a git repository: ${repoPath}`)
    process.exit(1)
  }
}

program.parse()
