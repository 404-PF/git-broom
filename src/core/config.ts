import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { logger } from '../utils/logger.js'
import type { BranchNamingConfig, BroomConfig } from '../types/index.js'

export const DEFAULT_BRANCH_NAMING: BranchNamingConfig = {
  requireTicket: true,
  requirePrefix: true,
  ticketPattern: '[A-Z]+-\\d+',
  allowedPrefixes: ['feature', 'fix', 'bugfix', 'chore', 'docs', 'refactor', 'test'],
  ignorePatterns: [],
}

// Ticket patterns are intentionally limited to a small, bounded regex subset so
// malformed repository config cannot stall a Git hook with catastrophic backtracking.
export function isSafeTicketPattern(value: string): boolean {
  if (value.length > 128 || /[()|]/.test(value) || /\\[1-9]/.test(value)) {
    return false
  }

  try {
    new RegExp(value)
  } catch {
    return false
  }

  let inCharacterClass = false
  let escaped = false
  let quantifierCount = 0

  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '[') {
      inCharacterClass = true
      continue
    }
    if (character === ']') {
      inCharacterClass = false
      continue
    }
    if (!inCharacterClass && '*+?'.includes(character)) {
      quantifierCount++
    } else if (!inCharacterClass && character === '{') {
      const end = value.indexOf('}', index + 1)
      if (end === -1 || !/^\d+(,\d*)?$/.test(value.slice(index + 1, end))) {
        return false
      }
      quantifierCount++
      index = end
    }

    if (quantifierCount > 2) return false
  }

  return !inCharacterClass && !escaped
}

function cloneDefaultBranchNaming(): BranchNamingConfig {
  return structuredClone(DEFAULT_BRANCH_NAMING)
}

const scheduleSchema = z.object({
  interval: z.enum(['daily', 'weekly', 'monthly']),
  logFile: z.string().min(1).optional(),
})

const branchNamingSchema = z.object({
  requireTicket: z.boolean().default(DEFAULT_BRANCH_NAMING.requireTicket),
  requirePrefix: z.boolean().default(DEFAULT_BRANCH_NAMING.requirePrefix),
  ticketPattern: z
    .string()
    .min(1)
    .refine(isSafeTicketPattern, 'must be a valid safe ticket pattern')
    .default(DEFAULT_BRANCH_NAMING.ticketPattern),
  allowedPrefixes: z.array(z.string().min(1)).default([...DEFAULT_BRANCH_NAMING.allowedPrefixes]),
  ignorePatterns: z.array(z.string().min(1))
    .refine(
      (patterns) => patterns.every((pattern) => {
        let depth = 0
        for (const char of pattern) {
          if (char === '[') depth++
          else if (char === ']') depth--
          if (depth < 0) return false
        }
        return depth === 0
      }),
      'ignorePatterns contain unmatched brackets (glob uses *, ?, not [...])',
    )
    .default([...DEFAULT_BRANCH_NAMING.ignorePatterns]),
})

const configSchema = z.object({
  protectedBranches: z.array(z.string()).default(['main', 'master', 'develop']),
  staleDays: z.number().min(1).default(90),
  dryRun: z.boolean().default(true),
  aggressive: z.boolean().default(false),
  skipConfirmation: z.boolean().default(false),
  verbose: z.boolean().default(false),
  json: z.boolean().default(false),
  schedule: scheduleSchema.optional(),
  branchNaming: branchNamingSchema.default(cloneDefaultBranchNaming),
})

function createDefaultConfig(): BroomConfig {
  return {
    protectedBranches: ['main', 'master', 'develop'],
    staleDays: 90,
    dryRun: true,
    aggressive: false,
    skipConfirmation: false,
    verbose: false,
    json: false,
    schedule: undefined,
    branchNaming: cloneDefaultBranchNaming(),
  }
}

function findConfigFile(startDir: string): string | null {
  let current = startDir
  while (true) {
    const candidate = join(current, '.gitbroomrc')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function formatConfigError(error: unknown): string {
  if (error instanceof SyntaxError) return error.message
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function parseConfigFile(path: string): Partial<BroomConfig> {
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    return configSchema.partial().parse(parsed)
  } catch (error) {
    logger.warn(`Ignoring invalid config file at ${path}: ${formatConfigError(error)}`)
    return {}
  }
}

export function resolveConfig(cwd: string, cliOverrides: Partial<BroomConfig>): BroomConfig {
  const configFile = findConfigFile(cwd)
  const fileConfig = configFile ? parseConfigFile(configFile) : {}

  return {
    ...createDefaultConfig(),
    ...fileConfig,
    ...cliOverrides,
  }
}
