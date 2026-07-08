import type { BroomConfig, RepoStatus } from '../types/index.js'
import {
  getCurrentBranch,
  getLocalBranches,
  getMergedBranches,
  getStaleBranches,
  getDanglingObjects,
  getRemotes,
  getGitDirSize,
} from '../core/git.js'
import { logger, formatBytes } from '../utils/logger.js'

export async function statusCommand(config: BroomConfig, cwd?: string): Promise<RepoStatus> {
  const currentBranch = await getCurrentBranch(cwd)
  const localBranches = await getLocalBranches(cwd)
  const mergedBranches = await getMergedBranches(cwd)
  const staleBranches = await getStaleBranches(config.staleDays, cwd)
  const danglingObjects = await getDanglingObjects(cwd)
  const remotes = await getRemotes(cwd)
  const gitDirSize = await getGitDirSize(cwd)

  const report: RepoStatus = {
    currentBranch,
    totalBranches: localBranches.length,
    mergedBranches: mergedBranches.length,
    staleBranches: staleBranches.length,
    danglingObjects: danglingObjects.length,
    gitDirSize,
    remotes,
    staleDays: config.staleDays,
  }

  if (config.json) {
    logger.json(report)
    return report
  }

  logger.header('Repository Status')

  const rows = [
    ['Current branch', currentBranch ?? '(detached HEAD)'],
    ['Total branches', String(report.totalBranches)],
    ['Merged branches', String(report.mergedBranches)],
    ['Stale branches (>' + config.staleDays + 'd)', String(report.staleBranches)],
    ['Dangling objects', String(report.danglingObjects)],
    ['Remotes', remotes.join(', ') || '(none)'],
    ['.git size', formatBytes(gitDirSize)],
  ]

  logger.table(rows)
  console.log()

  return report
}
