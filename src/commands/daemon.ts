import { appendFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import type { BroomConfig, CleanResult } from '../types/index.js'
import { logger } from '../utils/logger.js'
import { cleanCommand } from './clean.js'
import { intervalToMs } from '../core/schedule.js'

export interface DaemonOptions {
  runOnce?: boolean
}

function formatLogLine(result: CleanResult): string {
  return [
    new Date().toISOString(),
    `dryRun=${result.dryRun}`,
    `deleted=${result.deletedBranches.length}`,
    `prunedRemotes=${result.prunedRemotes.length}`,
    `garbageCollectionRun=${result.garbageCollectionRun}`,
    `spaceReclaimed=${result.spaceReclaimed}`,
  ].join(' ') + '\n'
}

function writeScheduleLog(logFile: string, result: CleanResult, cwd?: string) {
  const resolvedPath = cwd ? resolve(cwd, logFile) : resolve(logFile)
  mkdirSync(dirname(resolvedPath), { recursive: true })
  appendFileSync(resolvedPath, formatLogLine(result), 'utf8')
}

export async function daemonCommand(
  config: BroomConfig,
  options: DaemonOptions = {},
  cwd?: string,
): Promise<void> {
  if (!config.schedule) {
    logger.error('Scheduled cleanup requires a schedule entry in .gitbroomrc.')
    process.exitCode = 1
    return
  }

  if (!config.dryRun && !config.skipConfirmation) {
    logger.error('Live daemon runs require --yes so scheduled cleanups never block on confirmation.')
    process.exitCode = 1
    return
  }

  let cycleInFlight = false

  const runCycle = async () => {
    if (cycleInFlight) {
      if (!config.json) {
        logger.warn('Skipping scheduled cleanup because the previous cycle is still running.')
      }
      return
    }

    cycleInFlight = true

    try {
    if (!config.json) {
      logger.info(
        `Running scheduled cleanup (${config.schedule?.interval}, ${config.dryRun ? 'dry-run' : 'live'})`,
      )
    }

    const result = await cleanCommand(config, cwd)

    if (config.schedule?.logFile) {
      try {
        writeScheduleLog(config.schedule.logFile, result, cwd)
        if (!config.json) logger.info(`Appended cleanup log to ${config.schedule.logFile}`)
      } catch (error: unknown) {
        if (!config.json) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn(`Failed to append cleanup log to ${config.schedule.logFile}: ${message}`)
        }
      }
    }
    } finally {
      cycleInFlight = false
    }
  }

  await runCycle()

  if (options.runOnce) {
    return
  }

  const intervalMs = intervalToMs(config.schedule.interval)
  if (!config.json) {
    logger.info(`Daemon mode active; next cleanup runs every ${config.schedule.interval}.`)
  }

  const intervalHandle = setInterval(() => {
    void runCycle().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Scheduled cleanup failed: ${message}`)
    })
  }, intervalMs)

  const shutdown = (signal: NodeJS.Signals) => {
    clearInterval(intervalHandle)
    if (!config.json) {
      logger.info(`Received ${signal}; shutting down daemon.`)
    }
    process.exit(0)
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
