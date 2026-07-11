import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitMocks = vi.hoisted(() => ({
  isGitRepo: vi.fn(),
}))

const commandMocks = vi.hoisted(() => ({
  statusCommand: vi.fn(),
  cleanCommand: vi.fn(),
  branchesCommand: vi.fn(),
  objectsCommand: vi.fn(),
  daemonCommand: vi.fn(),
  hooksInstallCommand: vi.fn(),
  hooksCheckCommand: vi.fn(),
}))

vi.mock('./core/git.js', () => gitMocks)
vi.mock('./commands/status.js', () => ({ statusCommand: commandMocks.statusCommand }))
vi.mock('./commands/clean.js', () => ({ cleanCommand: commandMocks.cleanCommand }))
vi.mock('./commands/branches.js', () => ({ branchesCommand: commandMocks.branchesCommand }))
vi.mock('./commands/objects.js', () => ({ objectsCommand: commandMocks.objectsCommand }))
vi.mock('./commands/daemon.js', () => ({ daemonCommand: commandMocks.daemonCommand }))
vi.mock('./commands/hooks.js', () => ({
  hooksInstallCommand: commandMocks.hooksInstallCommand,
  hooksCheckCommand: commandMocks.hooksCheckCommand,
}))

import { createProgram } from './index.js'

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'git-broom-cli-'))
}

describe('CLI JSON wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gitMocks.isGitRepo.mockResolvedValue(true)
  })

  it('passes --json through to statusCommand config', async () => {
    const repo = makeTempDir()
    const program = createProgram()

    await program.parseAsync(['node', 'git-broom', '--repo', repo, '--json', 'status'])

    expect(commandMocks.statusCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.statusCommand).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      repo,
    )
  })

  it('keeps config-backed json enabled when the CLI flag is omitted', async () => {
    const repo = makeTempDir()
    writeFileSync(join(repo, '.gitbroomrc'), JSON.stringify({ json: true }))
    const program = createProgram()

    await program.parseAsync(['node', 'git-broom', '--repo', repo, 'status'])

    expect(commandMocks.statusCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.statusCommand).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      repo,
    )
  })

  it('lets the CLI disable config-backed json with --no-json', async () => {
    const repo = makeTempDir()
    writeFileSync(join(repo, '.gitbroomrc'), JSON.stringify({ json: true }))
    const program = createProgram()

    await program.parseAsync(['node', 'git-broom', '--repo', repo, '--no-json', 'status'])

    expect(commandMocks.statusCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.statusCommand).toHaveBeenCalledWith(
      expect.objectContaining({ json: false }),
      repo,
    )
  })

  it('wires daemon to config-backed schedule and run-once mode', async () => {
    const repo = makeTempDir()
    writeFileSync(
      join(repo, '.gitbroomrc'),
      JSON.stringify({ schedule: { interval: 'weekly', logFile: 'logs/git-broom.log' } }),
    )
    const program = createProgram()

    await program.parseAsync(['node', 'git-broom', '--repo', repo, 'daemon', '--run-once'])

    expect(commandMocks.daemonCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.daemonCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        schedule: {
          interval: 'weekly',
          logFile: 'logs/git-broom.log',
        },
      }),
      { runOnce: true },
      repo,
    )
  })

  it('passes --histogram through to branchesCommand', async () => {
    const repo = makeTempDir()
    const program = createProgram()

    await program.parseAsync([
      'node',
      'git-broom',
      '--repo',
      repo,
      'branches',
      '--histogram',
    ])

    expect(commandMocks.branchesCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.branchesCommand).toHaveBeenCalledWith(
      expect.anything(),
      {
        merged: undefined,
        stale: undefined,
        staleDays: undefined,
        histogram: true,
      },
      repo,
    )
  })

  it('wires nested hook checks to the repository and hook arguments', async () => {
    const repo = makeTempDir()
    const program = createProgram()

    await program.parseAsync([
      'node',
      'git-broom',
      '--repo',
      repo,
      'hooks',
      'check',
      '--hook',
      'post-checkout',
      'old',
      'new',
      '1',
    ])

    expect(commandMocks.hooksCheckCommand).toHaveBeenCalledWith(
      expect.anything(),
      { hook: 'post-checkout', force: undefined, hookArgs: ['old', 'new', '1'] },
      repo,
    )
  })

  it('wires nested hook installation to the repository', async () => {
    const repo = makeTempDir()
    const program = createProgram()

    await program.parseAsync(['node', 'git-broom', '--repo', repo, 'hooks', 'install'])

    expect(commandMocks.hooksInstallCommand).toHaveBeenCalledWith(repo)
  })
})
