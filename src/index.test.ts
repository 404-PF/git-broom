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
}))

vi.mock('./core/git.js', () => gitMocks)
vi.mock('./commands/status.js', () => ({ statusCommand: commandMocks.statusCommand }))
vi.mock('./commands/clean.js', () => ({ cleanCommand: commandMocks.cleanCommand }))
vi.mock('./commands/branches.js', () => ({ branchesCommand: commandMocks.branchesCommand }))
vi.mock('./commands/objects.js', () => ({ objectsCommand: commandMocks.objectsCommand }))

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
})
