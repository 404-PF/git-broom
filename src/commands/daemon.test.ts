import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BroomConfig, CleanResult } from '../types/index.js'

const cleanMocks = vi.hoisted(() => ({
  cleanCommand: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  actualAppendFileSync: undefined as typeof import('fs').appendFileSync | undefined,
  appendFileSync: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  fsMocks.actualAppendFileSync = actual.appendFileSync
  return {
    ...actual,
    appendFileSync: fsMocks.appendFileSync,
  }
})

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('daemonCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let originalExitCode: string | number | null | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    fsMocks.appendFileSync.mockImplementation((...args) => {
      const [path, data, options] = args as Parameters<typeof import('fs').appendFileSync>
      fsMocks.actualAppendFileSync?.(path, data, options)
    })
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

  it('continues when schedule log writing fails', async () => {
    fsMocks.appendFileSync.mockImplementation(() => {
      throw new Error('disk full')
    })
    cleanMocks.cleanCommand.mockResolvedValue(makeResult())

    await expect(
      daemonCommand(
        {
          ...baseConfig,
          schedule: {
            interval: 'weekly',
            logFile: 'logs/git-broom.log',
          },
        },
        { runOnce: true },
        'C:\\repo',
      ),
    ).resolves.toBeUndefined()

    expect(cleanMocks.cleanCommand).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Failed to append cleanup log'))
  })

  it('clears the daemon interval and exits cleanly on SIGTERM', async () => {
    cleanMocks.cleanCommand.mockResolvedValue(makeResult())

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const onceSpy = vi.spyOn(process, 'once')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await daemonCommand(baseConfig, {}, 'C:\\repo')

    const intervalHandle = setIntervalSpy.mock.results[0]?.value
    const sigtermHandler = onceSpy.mock.calls.find(([event]) => event === 'SIGTERM')?.[1]

    expect(intervalHandle).toBeDefined()
    expect(sigtermHandler).toBeTypeOf('function')

    ;(sigtermHandler as (signal: NodeJS.Signals) => void)('SIGTERM')

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalHandle)
    expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'Received SIGTERM; shutting down daemon.')
    expect(exitSpy).toHaveBeenCalledWith(0)

    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
    onceSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('skips a scheduled tick while the previous cleanup is still running', async () => {
    const scheduledRun = createDeferred<CleanResult>()
    cleanMocks.cleanCommand.mockResolvedValueOnce(makeResult()).mockReturnValueOnce(scheduledRun.promise)

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const onceSpy = vi.spyOn(process, 'once')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await daemonCommand(baseConfig, {}, 'C:\\repo')

    const intervalCallback = setIntervalSpy.mock.calls[0]?.[0]
    expect(intervalCallback).toBeTypeOf('function')

    ;(intervalCallback as () => void)()
    await vi.waitFor(() => {
      expect(cleanMocks.cleanCommand).toHaveBeenCalledTimes(2)
    })

    ;(intervalCallback as () => void)()
    expect(cleanMocks.cleanCommand).toHaveBeenCalledTimes(2)
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Skipping scheduled cleanup because the previous cycle is still running.',
    )

    scheduledRun.resolve(makeResult())
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'Running scheduled cleanup (daily, dry-run)')
    })

    const sigtermHandler = onceSpy.mock.calls.find(([event]) => event === 'SIGTERM')?.[1]
    expect(sigtermHandler).toBeTypeOf('function')
    ;(sigtermHandler as (signal: NodeJS.Signals) => void)('SIGTERM')

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)

    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
    onceSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('fails safely when no schedule is configured', async () => {
    await daemonCommand({ ...baseConfig, schedule: undefined }, { runOnce: true }, 'C:\\repo')

    expect(cleanMocks.cleanCommand).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(1)
  })
})
