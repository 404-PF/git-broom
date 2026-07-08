import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BroomConfig, CleanResult } from '../types/index.js'

const cleanMocks = vi.hoisted(() => ({
  cleanCommand: vi.fn(),
}))

vi.mock('./clean.js', () => ({ cleanCommand: cleanMocks.cleanCommand }))

import { daemonCommand } from './daemon.js'

const baseConfig: BroomConfig = {
  protectedBranches: ['main', 'master', 'develop'],
  staleDays: 90,
  dryRun: true,
  aggressive: false,
  skipConfirmation: false,
  verbose: false,
  json: false,
  schedule: {
    interval: 'daily',
  },
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'git-broom-daemon-'))
}

function makeResult(overrides: Partial<CleanResult> = {}): CleanResult {
  return {
    dryRun: true,
    aggressive: false,
    staleDays: 90,
    currentBranch: 'main',
    candidateBranches: [],
    skippedBranches: [],
    deletedBranches: [],
    remotes: ['origin'],
    prunedRemotes: [],
    garbageCollectionRun: false,
    beforeSize: 2048,
    afterSize: 2048,
    spaceReclaimed: 0,
    ...overrides,
  }
}

describe('daemonCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let originalExitCode: string | number | null | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    originalExitCode = process.exitCode
    process.exitCode = undefined
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    process.exitCode = originalExitCode
  })

  it('runs a single scheduled cleanup cycle and exits in run-once mode', async () => {
    cleanMocks.cleanCommand.mockResolvedValue(makeResult())

    await daemonCommand(baseConfig, { runOnce: true }, 'C:\\repo')

    expect(cleanMocks.cleanCommand).toHaveBeenCalledTimes(1)
    expect(cleanMocks.cleanCommand).toHaveBeenCalledWith(baseConfig, 'C:\\repo')
  })

  it('appends cleanup activity to the configured log file', async () => {
    const cwd = makeTempDir()
    const logFile = 'logs/git-broom.log'
    cleanMocks.cleanCommand.mockResolvedValue(
      makeResult({
        deletedBranches: ['feature/old'],
        prunedRemotes: ['origin'],
        garbageCollectionRun: true,
        spaceReclaimed: 1024,
      }),
    )

    await daemonCommand(
      {
        ...baseConfig,
        schedule: {
          interval: 'weekly',
          logFile,
        },
      },
      { runOnce: true },
      cwd,
    )

    const logPath = join(cwd, logFile)
    expect(existsSync(logPath)).toBe(true)
    const contents = readFileSync(logPath, 'utf8')
    expect(contents).toContain('deleted=1')
    expect(contents).toContain('prunedRemotes=1')
    expect(contents).toContain('garbageCollectionRun=true')
  })

  it('fails safely when no schedule is configured', async () => {
    await daemonCommand({ ...baseConfig, schedule: undefined }, { runOnce: true }, 'C:\\repo')

    expect(cleanMocks.cleanCommand).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(1)
  })
})

