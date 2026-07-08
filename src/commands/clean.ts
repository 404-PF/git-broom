import type { BroomConfig, CleanResult } from '../types/index.js'
import {
  getCurrentBranch,
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
  const beforeSize = await getGitDirSize(cwd)
  const currentBranch = await getCurrentBranch(cwd)
  const localBranches = await getLocalBranches(cwd)
  const mergedNames = new Set(await getMergedBranches(cwd))
  const staleBranches = await getStaleBranches(config.staleDays, cwd)
  const remotes = await getRemotes(cwd)

  const mergedBranches = localBranches.filter((b) => mergedNames.has(b.name))
  const staleNames = new Set(staleBranches.map((b) => b.name))
  const allCandidates = [
    ...mergedBranches,
    ...localBranches.filter((b) => staleNames.has(b.name) && !mergedNames.has(b.name)),
  ]
  const mutatingRun = !config.dryRun

  const { safe, skipped } = filterSafeToDelete(allCandidates, currentBranch, config)

  const result: CleanResult = {
    dryRun: config.dryRun,
    aggressive: config.aggressive,
    staleDays: config.staleDays,
    currentBranch,
    candidateBranches: safe.map((branch) => ({
      name: branch.name,
      reason: mergedNames.has(branch.name) ? 'merged' : 'stale',
    })),
    skippedBranches: skipped,
    deletedBranches: [],
    remotes,
    prunedRemotes: [],
    garbageCollectionRun: false,
    beforeSize,
    afterSize: beforeSize,
    spaceReclaimed: 0,
  }

  if (!config.json) {
    logger.header('Git Broom Cleanup')
    if (config.dryRun) {
      dryRunWarning()
    }
  }

  if (!config.json) {
    logger.info(`Found ${safe.length} branches to clean:`)
    for (const branch of result.candidateBranches) {
      const reason = branch.reason === 'merged' ? 'merged' : `stale (>${config.staleDays}d)`
      logger.info(`  - ${branch.name} (${reason})`)
    }
    if (skipped.length > 0) {
      logger.info(`Skipped ${skipped.length} branches:`)
      for (const skippedBranch of skipped) logger.info(`  - ${skippedBranch}`)
    }
  }

  if (mutatingRun && config.json && !config.skipConfirmation) {
    logger.error('JSON output for mutating clean runs requires --yes to keep stdout machine-readable.')
    process.exitCode = 1
    return result
  }

  if (safe.length > 0) {
    if (mutatingRun) {
      const confirmed = await confirmAction(
        `Delete ${safe.length} branches?`,
        config.skipConfirmation,
      )
      if (!confirmed) {
        if (config.json) {
          logger.json(result)
        } else {
          logger.info('Aborted.')
        }
        return result
      }
    }

    for (const branch of safe) {
      if (config.dryRun) {
        if (!config.json) logger.info(`[dry-run] Would delete: ${branch.name}`)
      } else {
        await deleteBranch(branch.name, cwd)
        result.deletedBranches.push(branch.name)
        if (!config.json) logger.success(`Deleted: ${branch.name}`)
      }
    }
  }

  for (const remote of remotes) {
    if (config.dryRun) {
      if (!config.json) logger.info(`[dry-run] Would prune remote: ${remote}`)
    } else {
      await pruneRemote(remote, cwd)
      result.prunedRemotes.push(remote)
      if (!config.json) logger.success(`Pruned remote: ${remote}`)
    }
  }

  if (!config.dryRun) {
    if (!config.json) logger.info('Running garbage collection...')
    await garbageCollect(config.aggressive, cwd)
    result.garbageCollectionRun = true
  } else {
    if (!config.json) logger.info('[dry-run] Would run garbage collection')
  }

  result.afterSize = await getGitDirSize(cwd)
  result.spaceReclaimed = Math.max(0, beforeSize - result.afterSize)

  if (config.json) {
    logger.json(result)
  } else {
    logger.summary(result.deletedBranches.length, result.spaceReclaimed)
  }

  return result
}
