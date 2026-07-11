import chalk from 'chalk'
import type {
  BranchAgeBucket,
  BranchAgeHistogramEntry,
  BroomConfig,
  BranchCategory,
  BranchesReport,
  GitBranch,
} from '../types/index.js'
import { getLocalBranches, getMergedBranches, getStaleBranches } from '../core/git.js'
import { isProtectedBranch } from '../core/safety.js'
import { logger } from '../utils/logger.js'

const AGE_BUCKETS: readonly BranchAgeBucket[] = [
  '0-7d',
  '7-30d',
  '30-90d',
  '90d+',
]
const HISTOGRAM_BAR_WIDTH = 20

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
  if (options.merged && options.stale) return category === 'merged' || category === 'stale'
  if (options.merged) return category === 'merged'
  if (options.stale) return category === 'stale'
  return true
}

export function getBranchAgeBucket(
  lastCommitDate: Date,
  now = new Date(),
): BranchAgeBucket {
  const ageDays = Math.max(
    0,
    Math.floor(
      (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  )

  if (ageDays <= 7) return '0-7d'
  if (ageDays <= 30) return '7-30d'
  if (ageDays <= 90) return '30-90d'
  return '90d+'
}

export function buildBranchAgeHistogram(
  branches: Pick<GitBranch, 'lastCommitDate'>[],
  now = new Date(),
): BranchAgeHistogramEntry[] {
  const counts = new Map<BranchAgeBucket, number>(
    AGE_BUCKETS.map((bucket) => [bucket, 0]),
  )

  for (const branch of branches) {
    const bucket = getBranchAgeBucket(branch.lastCommitDate, now)
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return AGE_BUCKETS.map((bucket) => ({
    bucket,
    count: counts.get(bucket) ?? 0,
  }))
}

function colorHistogramRow(bucket: BranchAgeBucket, row: string): string {
  if (bucket === '0-7d') return chalk.green(row)
  if (bucket === '90d+') return chalk.red(row)
  return chalk.yellow(row)
}

function renderBranchAgeHistogram(histogram: BranchAgeHistogramEntry[]): void {
  logger.header('Branch Age Histogram')

  const maxCount = Math.max(...histogram.map((entry) => entry.count), 1)
  for (const entry of histogram) {
    const barLength =
      entry.count === 0
        ? 0
        : Math.max(
            1,
            Math.round((entry.count / maxCount) * HISTOGRAM_BAR_WIDTH),
          )
    const bar = '█'.repeat(barLength).padEnd(HISTOGRAM_BAR_WIDTH)
    const row = `${entry.bucket.padEnd(7)} ${bar} ${entry.count}`
    console.log(colorHistogramRow(entry.bucket, row))
  }
}

export async function branchesCommand(
  config: BroomConfig,
  options: {
    merged?: boolean
    stale?: boolean
    staleDays?: number
    histogram?: boolean
  },
  cwd?: string,
): Promise<BranchesReport> {
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

  if (options.histogram) {
    report.histogram = buildBranchAgeHistogram(report.branches)
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
    if (report.histogram) renderBranchAgeHistogram(report.histogram)
    return report
  }

  logger.table(rows)
  console.log()
  logger.info(
    `Total: ${localBranches.length} | Merged: ${merged.length} | Stale: ${stale.length} | Active: ${active.length} | Protected: ${protected_.length}`,
  )

  if (report.histogram) renderBranchAgeHistogram(report.histogram)

  return report
}
