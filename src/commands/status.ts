import type { BroomConfig } from '../types/index.js'
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

export async function statusCommand(config: BroomConfig, cwd?: string) {
  logger.header('Repository Status')

  const currentBranch = await getCurrentBranch(cwd)
  const localBranches = await getLocalBranches(cwd)
  const mergedBranches = await getMergedBranches(cwd)
  const staleBranches = await getStaleBranches(config.staleDays, cwd)
  const danglingObjects = await getDanglingObjects(cwd)
  const remotes = await getRemotes(cwd)
  const gitDirSize = await getGitDirSize(cwd)

  const rows = [
    ['Current branch', currentBranch ?? '(detached HEAD)'],
    ['Total branches', String(localBranches.length)],
    ['Merged branches', String(mergedBranches.length)],
    ['Stale branches (>' + config.staleDays + 'd)', String(staleBranches.length)],
    ['Dangling objects', String(danglingObjects.length)],
    ['Remotes', remotes.join(', ') || '(none)'],
    ['.git size', formatBytes(gitDirSize)],
  ]

  logger.table(rows)
  console.log()
}
