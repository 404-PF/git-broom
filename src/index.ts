import { Command } from 'commander'
import { pathToFileURL } from 'url'
import { resolveConfig } from './core/config.js'
import { isGitRepo } from './core/git.js'
import { logger } from './utils/logger.js'
import { statusCommand } from './commands/status.js'
import { cleanCommand } from './commands/clean.js'
import { branchesCommand } from './commands/branches.js'
import { objectsCommand } from './commands/objects.js'

type GlobalOptions = {
  repo: string
  dryRun: boolean
  yes: boolean
  aggressive: boolean
  verbose: boolean
  json: boolean
}

function getParentCommand(cmd: Command): Command {
  if (!cmd.parent) {
    throw new Error('Expected command to have a parent program')
  }

  return cmd.parent
}

function readGlobalOverrides(cmd: Command): GlobalOptions {
  return getParentCommand(cmd).opts<GlobalOptions>()
}

function maybeOverrideGlobalFlag(cmd: Command, optionName: 'json'): Partial<{ json: boolean }> {
  const parent = getParentCommand(cmd)

  return parent.getOptionValueSource(optionName) === 'default'
    ? {}
    : { [optionName]: parent.opts<GlobalOptions>()[optionName] }
}

export function createProgram(): Command {
  const program = new Command()

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
    .option('--json', 'Emit machine-readable JSON output', false)

  program
    .command('status')
    .description('Show repository hygiene report')
    .action(async (opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      const config = resolveConfig(parentOpts.repo, {
        dryRun: parentOpts.dryRun,
        skipConfirmation: parentOpts.yes,
        aggressive: parentOpts.aggressive,
        verbose: parentOpts.verbose,
        ...maybeOverrideGlobalFlag(cmd, 'json'),
      })
      await ensureGitRepo(parentOpts.repo)
      await statusCommand(config, parentOpts.repo)
    })

  program
    .command('clean')
    .description('Clean stale branches and prune objects')
    .option('--stale-days <days>', 'Days of inactivity to consider a branch stale')
    .action(async (opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      const config = resolveConfig(parentOpts.repo, {
        dryRun: parentOpts.dryRun,
        skipConfirmation: parentOpts.yes,
        aggressive: parentOpts.aggressive,
        verbose: parentOpts.verbose,
        ...maybeOverrideGlobalFlag(cmd, 'json'),
        staleDays: opts.staleDays ? parseInt(opts.staleDays, 10) : undefined,
      } as any)
      await ensureGitRepo(parentOpts.repo)
      await cleanCommand(config, parentOpts.repo)
    })

  program
    .command('branches')
    .description('List and manage branches by state')
    .option('--merged', 'Show only merged branches')
    .option('--stale', 'Show only stale branches')
    .option('--stale-days <days>', 'Days of inactivity to consider a branch stale')
    .action(async (opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      const config = resolveConfig(parentOpts.repo, {
        dryRun: parentOpts.dryRun,
        skipConfirmation: parentOpts.yes,
        aggressive: parentOpts.aggressive,
        verbose: parentOpts.verbose,
        ...maybeOverrideGlobalFlag(cmd, 'json'),
        staleDays: opts.staleDays ? parseInt(opts.staleDays, 10) : undefined,
      } as any)
      await ensureGitRepo(parentOpts.repo)
      await branchesCommand(
        config,
        {
          merged: opts.merged,
          stale: opts.stale,
          staleDays: opts.staleDays ? parseInt(opts.staleDays, 10) : undefined,
        },
        parentOpts.repo,
      )
    })

  program
    .command('objects')
    .description('Inspect and prune dangling objects')
    .option('--prune', 'Remove dangling objects')
    .action(async (opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      const config = resolveConfig(parentOpts.repo, {
        dryRun: parentOpts.dryRun,
        skipConfirmation: parentOpts.yes,
        aggressive: parentOpts.aggressive,
        verbose: parentOpts.verbose,
        ...maybeOverrideGlobalFlag(cmd, 'json'),
      })
      await ensureGitRepo(parentOpts.repo)
      await objectsCommand(config, { prune: opts.prune }, parentOpts.repo)
    })

  return program
}

async function ensureGitRepo(repoPath: string) {
  const isRepo = await isGitRepo(repoPath)
  if (!isRepo) {
    logger.error(`Not a git repository: ${repoPath}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createProgram().parse()
}
