import { confirm } from '@inquirer/prompts'
import type { BroomConfig, GitBranch } from '../types/index.js'
import { logger } from '../utils/logger.js'

const PROTECTED_PATTERNS = ['main', 'master', 'develop', 'release', 'production']

export function isProtectedBranch(branch: string, config: BroomConfig): boolean {
  const allProtected = [...new Set([...config.protectedBranches, ...PROTECTED_PATTERNS])]
  return allProtected.some((pattern) => {
    if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
      return regex.test(branch)
    }
    return pattern === branch
  })
}

export function filterSafeToDelete(
  branches: GitBranch[],
  currentBranch: string | null,
  config: BroomConfig,
): { safe: GitBranch[]; skipped: string[] } {
  const safe: GitBranch[] = []
  const skipped: string[] = []

  for (const branch of branches) {
    if (branch.name === currentBranch) {
      skipped.push(`${branch.name} (currently checked out)`)
      continue
    }
    if (isProtectedBranch(branch.name, config)) {
      skipped.push(`${branch.name} (protected)`)
      continue
    }
    safe.push(branch)
  }

  return { safe, skipped }
}

export async function confirmAction(message: string, skip: boolean): Promise<boolean> {
  if (skip) return true
  logger.info(message)
  return confirm({ message: 'Proceed? (y/N)' })
}

export function dryRunWarning() {
  logger.warn('DRY RUN — no changes will be made. Use --no-dry-run to apply changes.')
}
