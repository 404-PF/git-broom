import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BroomConfig, GitBranch } from '../types/index.js'

const gitMocks = vi.hoisted(() => ({
  getCurrentBranch: vi.fn(),
  getLocalBranches: vi.fn(),
  getMergedBranches: vi.fn(),
  getStaleBranches: vi.fn(),
  getDanglingObjects: vi.fn(),
  getRemotes: vi.fn(),
  getGitDirSize: vi.fn(),
  deleteBranch: vi.fn(),
  pruneRemote: vi.fn(),
  garbageCollect: vi.fn(),
}))

const safetyMocks = vi.hoisted(() => ({
  isProtectedBranch: vi.fn(),
  filterSafeToDelete: vi.fn(),
  confirmAction: vi.fn(),
  dryRunWarning: vi.fn(),
}))

vi.mock('../core/git.js', () => gitMocks)
vi.mock('../core/safety.js', () => safetyMocks)

import { statusCommand } from './status.js'
import { branchesCommand } from './branches.js'
import { cleanCommand } from './clean.js'
import { objectsCommand } from './objects.js'

const baseConfig: BroomConfig = {
  protectedBranches: ['main', 'master', 'develop'],
  staleDays: 90,
  dryRun: true,
  aggressive: false,
  skipConfirmation: false,
  verbose: false,
  json: true,
}

function makeBranch(
  name: string,
  daysAgo: number,
  subject: string,
): GitBranch {
  const date = new Date('2026-07-08T00:00:00.000Z')
  date.setUTCDate(date.getUTCDate() - daysAgo)

  return {
    name,
    lastCommitDate: date,
    lastCommitHash: `${name}-hash`,
    lastCommitSubject: subject,
    isMerged: false,
    isRemote: false,
  }
}

describe('JSON command output', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('emits JSON for status', async () => {
    gitMocks.getCurrentBranch.mockResolvedValue('main')
    gitMocks.getLocalBranches.mockResolvedValue([makeBranch('main', 1, 'latest')])
    gitMocks.getMergedBranches.mockResolvedValue(['main'])
    gitMocks.getStaleBranches.mockResolvedValue([])
    gitMocks.getDanglingObjects.mockResolvedValue([{ type: 'blob', hash: 'abc123' }])
    gitMocks.getRemotes.mockResolvedValue(['origin'])
    gitMocks.getGitDirSize.mockResolvedValue(1024)

    await statusCommand(baseConfig)

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      currentBranch: 'main',
      totalBranches: 1,
      mergedBranches: 1,
      staleBranches: 0,
      danglingObjects: 1,
      gitDirSize: 1024,
      remotes: ['origin'],
      staleDays: 90,
    })
  })

  it('emits filtered JSON for branches', async () => {
    const merged = makeBranch('feature/merged', 5, 'merged work')
    const stale = makeBranch('feature/stale', 120, 'old work')
    const active = makeBranch('feature/active', 2, 'active work')
    const protectedBranch = makeBranch('main', 1, 'protected work')

    gitMocks.getLocalBranches.mockResolvedValue([merged, stale, active, protectedBranch])
    gitMocks.getMergedBranches.mockResolvedValue(['feature/merged'])
    gitMocks.getStaleBranches.mockResolvedValue([stale])
    safetyMocks.isProtectedBranch.mockImplementation((name: string) => name === 'main')

    await branchesCommand(baseConfig, { stale: true })

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      staleDays: 90,
      counts: {
        total: 4,
        merged: 1,
        stale: 1,
        active: 1,
        protected: 1,
      },
      branches: [
        {
          name: 'feature/stale',
          category: 'stale',
          lastCommitDate: stale.lastCommitDate.toISOString(),
          lastCommitHash: 'feature/stale-hash',
          lastCommitSubject: 'old work',
        },
      ],
    })
  })

  it('includes merged and stale branches when both filters are enabled', async () => {
    const merged = makeBranch('feature/merged', 5, 'merged work')
    const stale = makeBranch('feature/stale', 120, 'old work')
    const active = makeBranch('feature/active', 2, 'active work')

    gitMocks.getLocalBranches.mockResolvedValue([merged, stale, active])
    gitMocks.getMergedBranches.mockResolvedValue(['feature/merged'])
    gitMocks.getStaleBranches.mockResolvedValue([stale])
    safetyMocks.isProtectedBranch.mockReturnValue(false)

    await branchesCommand(baseConfig, { merged: true, stale: true })

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      staleDays: 90,
      counts: {
        total: 3,
        merged: 1,
        stale: 1,
        active: 1,
        protected: 0,
      },
      branches: [
        {
          name: 'feature/merged',
          category: 'merged',
          lastCommitDate: merged.lastCommitDate.toISOString(),
          lastCommitHash: 'feature/merged-hash',
          lastCommitSubject: 'merged work',
        },
        {
          name: 'feature/stale',
          category: 'stale',
          lastCommitDate: stale.lastCommitDate.toISOString(),
          lastCommitHash: 'feature/stale-hash',
          lastCommitSubject: 'old work',
        },
      ],
    })
  })

  it('emits JSON for clean dry-run with candidates and skips', async () => {
    const merged = makeBranch('feature/merged', 5, 'merged work')
    const stale = makeBranch('feature/stale', 120, 'old work')

    gitMocks.getGitDirSize.mockResolvedValue(4096)
    gitMocks.getCurrentBranch.mockResolvedValue('main')
    gitMocks.getLocalBranches.mockResolvedValue([merged, stale])
    gitMocks.getMergedBranches.mockResolvedValue(['feature/merged'])
    gitMocks.getStaleBranches.mockResolvedValue([stale])
    gitMocks.getRemotes.mockResolvedValue(['origin'])
    safetyMocks.filterSafeToDelete.mockReturnValue({
      safe: [merged],
      skipped: ['feature/stale (protected)'],
    })

    await cleanCommand(baseConfig)

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      dryRun: true,
      aggressive: false,
      staleDays: 90,
      currentBranch: 'main',
      candidateBranches: [{ name: 'feature/merged', reason: 'merged' }],
      skippedBranches: ['feature/stale (protected)'],
      deletedBranches: [],
      remotes: ['origin'],
      prunedRemotes: [],
      garbageCollectionRun: false,
      danglingObjectsRemoved: 0,
      beforeSize: 4096,
      afterSize: 4096,
      spaceReclaimed: 0,
    })
  })

  it('emits JSON for objects without mutating in dry-run mode', async () => {
    gitMocks.getDanglingObjects.mockResolvedValue([
      { type: 'commit', hash: 'c1' },
      { type: 'blob', hash: 'b1' },
    ])

    await objectsCommand(baseConfig, { prune: true })

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      pruneRequested: true,
      dryRun: true,
      total: 2,
      byType: {
        commit: 1,
        tree: 0,
        blob: 1,
      },
      objects: [
        { type: 'commit', hash: 'c1' },
        { type: 'blob', hash: 'b1' },
      ],
      pruned: false,
    })
    expect(gitMocks.garbageCollect).not.toHaveBeenCalled()
  })
})
