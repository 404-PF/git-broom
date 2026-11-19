import { Command } from 'commander'
import { pathToFileURL } from 'url'
import { resolveConfig } from './core/config.js'
import { isGitRepo } from './core/git.js'
import { logger } from './utils/logger.js'
import { statusCommand } from './commands/status.js'
import { cleanCommand } from './commands/clean.js'
import { branchesCommand } from './commands/branches.js'
import { objectsCommand } from './commands/objects.js'
import { daemonCommand } from './commands/daemon.js'
import { hooksCheckCommand, hooksInstallCommand } from './commands/hooks.js'

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

  let parent = cmd.parent
  while (parent.parent) parent = parent.parent
  return parent
}

function readGlobalOverrides(cmd: Command): GlobalOptions {
  return getParentCommand(cmd).opts<GlobalOptions>()
}

function maybeOverrideGlobalFlag(
  cmd: Command,
  optionName: 'json',
): Partial<Pick<GlobalOptions, 'json'>> {
  const parent = getParentCommand(cmd)
  const optionValue = parent.opts<GlobalOptions>()[optionName]

  return parent.getOptionValueSource(optionName) === 'default' || optionValue === undefined
    ? {}
    : { [optionName]: optionValue }
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
    .option('--json', 'Emit machine-readable JSON output')
    .option('--no-json', 'Disable machine-readable JSON output')

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
    .option(
      '--stale-days <days>',
      'Days of inactivity to consider a branch stale',
    )
    .option('--histogram', 'Show branch age distribution histogram')
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
          histogram: opts.histogram,
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

  program
    .command('daemon')
    .description('Run scheduled cleanup cycles from .gitbroomrc')
    .option('--run-once', 'Run a single scheduled cleanup cycle and exit')
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
      await daemonCommand(config, { runOnce: opts.runOnce }, parentOpts.repo)
    })

  const hooks = program
    .command('hooks')
    .alias('hook')
    .description('Install and run branch naming Git hooks')

  hooks
    .command('install')
    .description('Install post-checkout, pre-commit, and pre-push hooks')
    .action(async (_opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      await ensureGitRepo(parentOpts.repo)
      await hooksInstallCommand(parentOpts.repo)
    })

  hooks
    .command('check')
    .description('Check the current branch name from a Git hook')
    .argument('[hookArgs...]', 'Arguments passed by Git to the hook')
    .option('--hook <hook>', 'Git hook being executed', 'pre-commit')
    .option('--force', 'Bypass branch naming warnings')
    .action(async (hookArgs, opts, cmd) => {
      const parentOpts = readGlobalOverrides(cmd)
      const config = resolveConfig(parentOpts.repo, {
        dryRun: parentOpts.dryRun,
        skipConfirmation: parentOpts.yes,
        aggressive: parentOpts.aggressive,
        verbose: parentOpts.verbose,
        ...maybeOverrideGlobalFlag(cmd, 'json'),
      })
      await ensureGitRepo(parentOpts.repo)
      await hooksCheckCommand(
        config,
        { hook: opts.hook, force: opts.force, hookArgs },
        parentOpts.repo,
      )
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
