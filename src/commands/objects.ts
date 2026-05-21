import chalk from 'chalk'
import type { BroomConfig } from '../types/index.js'
import { getDanglingObjects, garbageCollect } from '../core/git.js'
import { logger, formatBytes } from '../utils/logger.js'
import { confirmAction, dryRunWarning } from '../core/safety.js'

export async function objectsCommand(
  config: BroomConfig,
  options: { prune?: boolean },
  cwd?: string,
) {
  const objects = await getDanglingObjects(cwd)

  if (objects.length === 0) {
    logger.success('No dangling objects found.')
    return
  }

  logger.header(`Dangling Objects (${objects.length})`)

  const byType = { commit: 0, tree: 0, blob: 0 }
  for (const obj of objects) byType[obj.type]++

  const rows = [
    ['TYPE', 'COUNT'],
    ['commits', String(byType.commit)],
    ['trees', String(byType.tree)],
    ['blobs', String(byType.blob)],
  ]
  logger.table(rows)
  console.log()

  if (options.prune) {
    if (config.dryRun) {
      dryRunWarning()
      logger.info(`Would prune ${objects.length} dangling objects.`)
      return
    }

    const confirmed = await confirmAction(
      `Prune ${objects.length} dangling objects?`,
      config.skipConfirmation,
    )
    if (!confirmed) {
      logger.info('Aborted.')
      return
    }

    logger.info('Running garbage collection...')
    await garbageCollect(config.aggressive, cwd)
    logger.success('Dangling objects pruned.')
  } else {
    logger.info('Use --prune to remove dangling objects.')
  }
}
