import chalk from 'chalk'
import type { BroomConfig, BranchCategory, BranchesReport, GitBranch } from '../types/index.js'
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

function categoryLabel(category: BranchCategory): string {
  switch (category) {
    case 'merged':
      return chalk.green('merged')
    case 'stale':
      return chalk.yellow('stale')
    case 'active':
      return chalk.blue('active')
    case 'protected':
      return chalk.red('protected')
  }
}

function matchesFilter(category: BranchCategory, options: { merged?: boolean; stale?: boolean }): boolean {
  if (options.merged) return category === 'merged'
  if (options.stale) return category === 'stale'
  return true
}

export async function branchesCommand(
  config: BroomConfig,
  options: { merged?: boolean; stale?: boolean; staleDays?: number },
  cwd?: string,
) : Promise<BranchesReport> {

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

  const allBranches = [
    ...merged.map((branch) => ({ ...branch, category: 'merged' as const })),
    ...stale.map((branch) => ({ ...branch, category: 'stale' as const })),
    ...active.map((branch) => ({ ...branch, category: 'active' as const })),
    ...protected_.map((branch) => ({ ...branch, category: 'protected' as const })),
  ]

  const report: BranchesReport = {
    staleDays,
    counts: {
      total: localBranches.length,
      merged: merged.length,
      stale: stale.length,
      active: active.length,
      protected: protected_.length,
    },
    branches: allBranches
      .filter((branch) => matchesFilter(branch.category, options))
      .map((branch) => ({
        name: branch.name,
        category: branch.category,
        lastCommitDate: branch.lastCommitDate,
        lastCommitHash: branch.lastCommitHash,
        lastCommitSubject: branch.lastCommitSubject,
      })),
  }

  if (config.json) {
    logger.json(report)
    return report
  }

  logger.header('Branches')

  const rows: [string, string, string, string][] = [['NAME', 'STATUS', 'LAST COMMIT', 'SUBJECT']]

  for (const branch of report.branches) {
    rows.push(
      branchRow(
        {
          ...branch,
          isMerged: branch.category === 'merged',
          isRemote: false,
        },
        categoryLabel(branch.category),
      ),
    )
  }

  if (rows.length === 1) {
    logger.info('No branches found matching criteria.')
    return report
  }

  logger.table(rows)
  console.log()
  logger.info(
    `Total: ${localBranches.length} | Merged: ${merged.length} | Stale: ${stale.length} | Active: ${active.length} | Protected: ${protected_.length}`,
  )

  return report
}
