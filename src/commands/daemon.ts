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

  const runCycle = async () => {
    if (!config.json) {
      logger.info(
        `Running scheduled cleanup (${config.schedule?.interval}, ${config.dryRun ? 'dry-run' : 'live'})`,
      )
    }

    const result = await cleanCommand(config, cwd)

    if (config.schedule?.logFile) {
      writeScheduleLog(config.schedule.logFile, result, cwd)
      if (!config.json) logger.info(`Appended cleanup log to ${config.schedule.logFile}`)
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

  setInterval(() => {
    void runCycle().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Scheduled cleanup failed: ${message}`)
    })
  }, intervalMs)
}

