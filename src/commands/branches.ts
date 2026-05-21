import chalk from 'chalk'
import type { BroomConfig, GitBranch } from '../types/index.js'
import { getLocalBranches, getMergedBranches, getStaleBranches } from '../core/git.js'
import { isProtectedBranch } from '../core/safety.js'
import { logger } from '../utils/logger.js'

function formatDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

function branchRow(branch: GitBranch, category: string): [string, string, string, string] {
  return [
    branch.name,
    category,
    formatDate(branch.lastCommitDate),
    branch.lastCommitSubject.slice(0, 50),
  ]
}

export async function branchesCommand(
  config: BroomConfig,
  options: { merged?: boolean; stale?: boolean; staleDays?: number },
  cwd?: string,
) {
  logger.header('Branches')

  const localBranches = await getLocalBranches(cwd)
  const mergedNames = new Set(await getMergedBranches(cwd))
  const staleDays = options.staleDays ?? config.staleDays
  const staleBranches = await getStaleBranches(staleDays, cwd)
  const staleNames = new Set(staleBranches.map((b) => b.name))

  const merged: GitBranch[] = []
  const stale: GitBranch[] = []
  const active: GitBranch[] = []
  const protected_: GitBranch[] = []

  for (const branch of localBranches) {
    if (isProtectedBranch(branch.name, config)) {
      protected_.push(branch)
    } else if (mergedNames.has(branch.name)) {
      merged.push(branch)
    } else if (staleNames.has(branch.name)) {
      stale.push(branch)
    } else {
      active.push(branch)
    }
  }

  const rows: [string, string, string, string][] = [['NAME', 'STATUS', 'LAST COMMIT', 'SUBJECT']]

  if (!options.stale || options.merged) {
    for (const b of merged) rows.push(branchRow(b, chalk.green('merged')))
  }
  if (!options.merged || options.stale) {
    for (const b of stale) rows.push(branchRow(b, chalk.yellow('stale')))
  }
  if (!options.merged && !options.stale) {
    for (const b of active) rows.push(branchRow(b, chalk.blue('active')))
    for (const b of protected_) rows.push(branchRow(b, chalk.red('protected')))
  }

  if (rows.length === 1) {
    logger.info('No branches found matching criteria.')
    return
  }

  logger.table(rows)
  console.log()
  logger.info(
    `Total: ${localBranches.length} | Merged: ${merged.length} | Stale: ${stale.length} | Active: ${active.length} | Protected: ${protected_.length}`,
  )
}
