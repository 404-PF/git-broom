import type { BroomConfig, CleanResult } from '../types/index.js'
import {
  getLocalBranches,
  getMergedBranches,
  getStaleBranches,
  getRemotes,
  deleteBranch,
  pruneRemote,
  garbageCollect,
  getGitDirSize,
} from '../core/git.js'
import { filterSafeToDelete, confirmAction, dryRunWarning } from '../core/safety.js'
import { logger, formatBytes } from '../utils/logger.js'

export async function cleanCommand(config: BroomConfig, cwd?: string): Promise<CleanResult> {
  const result: CleanResult = {
    deletedBranches: [],
    prunedRemotes: [],
    danglingObjectsRemoved: 0,
    spaceReclaimed: 0,
  }

  logger.header('Git Broom Cleanup')

  if (config.dryRun) {
    dryRunWarning()
  }

  const beforeSize = await getGitDirSize(cwd)

  const currentBranch = await getCurrentBranchSafe(cwd)
  const localBranches = await getLocalBranches(cwd)
  const mergedNames = new Set(await getMergedBranches(cwd))
  const staleBranches = await getStaleBranches(config.staleDays, cwd)

  const mergedBranches = localBranches.filter((b) => mergedNames.has(b.name))
  const staleNames = new Set(staleBranches.map((b) => b.name))
  const allCandidates = [
    ...mergedBranches,
    ...localBranches.filter((b) => staleNames.has(b.name) && !mergedNames.has(b.name)),
  ]

  const { safe, skipped } = filterSafeToDelete(allCandidates, currentBranch, config)

  logger.info(`Found ${safe.length} branches to clean:`)
  for (const b of safe) {
    const reason = mergedNames.has(b.name) ? 'merged' : `stale (>${config.staleDays}d)`
    logger.info(`  - ${b.name} (${reason})`)
  }
  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} branches:`)
    for (const s of skipped) logger.info(`  - ${s}`)
  }

  if (safe.length > 0) {
    if (!config.dryRun) {
      const confirmed = await confirmAction(
        `Delete ${safe.length} branches?`,
        config.skipConfirmation,
      )
      if (!confirmed) {
        logger.info('Aborted.')
        return result
      }
    }

    for (const branch of safe) {
      if (config.dryRun) {
        logger.info(`[dry-run] Would delete: ${branch.name}`)
      } else {
        await deleteBranch(branch.name, cwd)
        result.deletedBranches.push(branch.name)
        logger.success(`Deleted: ${branch.name}`)
      }
    }
  }

  const remotes = await getRemotes(cwd)
  for (const remote of remotes) {
    if (config.dryRun) {
      logger.info(`[dry-run] Would prune remote: ${remote}`)
    } else {
      await pruneRemote(remote, cwd)
      result.prunedRemotes.push(remote)
      logger.success(`Pruned remote: ${remote}`)
    }
  }

  if (!config.dryRun) {
    logger.info('Running garbage collection...')
    await garbageCollect(config.aggressive, cwd)
  } else {
    logger.info('[dry-run] Would run garbage collection')
  }

  const afterSize = await getGitDirSize(cwd)
  result.spaceReclaimed = Math.max(0, beforeSize - afterSize)

  logger.summary(result.deletedBranches.length, result.spaceReclaimed)

  return result
}

async function getCurrentBranchSafe(cwd?: string): Promise<string | null> {
  try {
    const { execa } = await import('execa')
    const { stdout } = await execa('git', ['branch', '--show-current'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}
