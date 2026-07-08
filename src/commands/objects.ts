import type { BroomConfig, ObjectsReport } from '../types/index.js'
import { getDanglingObjects, garbageCollect } from '../core/git.js'
import { logger } from '../utils/logger.js'
import { confirmAction, dryRunWarning } from '../core/safety.js'

export async function objectsCommand(
  config: BroomConfig,
  options: { prune?: boolean },
  cwd?: string,
) : Promise<ObjectsReport> {
  const objects = await getDanglingObjects(cwd)
  const report: ObjectsReport = {
    pruneRequested: Boolean(options.prune),
    dryRun: config.dryRun,
    total: objects.length,
    byType: { commit: 0, tree: 0, blob: 0 },
    objects,
    pruned: false,
  }

  for (const obj of objects) report.byType[obj.type]++

  if (config.json) {
    if (options.prune && !config.dryRun) {
      const confirmed = await confirmAction(
        `Prune ${objects.length} dangling objects?`,
        config.skipConfirmation,
      )
      if (confirmed) {
        await garbageCollect(config.aggressive, cwd)
        report.pruned = true
      }
    }

    logger.json(report)
    return report
  }

  if (objects.length === 0) {
    logger.success('No dangling objects found.')
    return report
  }

  logger.header(`Dangling Objects (${objects.length})`)

  const rows = [
    ['TYPE', 'COUNT'],
    ['commits', String(report.byType.commit)],
    ['trees', String(report.byType.tree)],
    ['blobs', String(report.byType.blob)],
  ]
  logger.table(rows)
  console.log()

  if (options.prune) {
    if (config.dryRun) {
      dryRunWarning()
      logger.info(`Would prune ${objects.length} dangling objects.`)
      return report
    }

    const confirmed = await confirmAction(
      `Prune ${objects.length} dangling objects?`,
      config.skipConfirmation,
    )
    if (!confirmed) {
      logger.info('Aborted.')
      return report
    }

    logger.info('Running garbage collection...')
    await garbageCollect(config.aggressive, cwd)
    report.pruned = true
    logger.success('Dangling objects pruned.')
  } else {
    logger.info('Use --prune to remove dangling objects.')
  }

  return report
}
