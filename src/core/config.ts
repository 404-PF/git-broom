import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BroomConfig } from '../types/index.js'

const configSchema = z.object({
  protectedBranches: z.array(z.string()).default(['main', 'master', 'develop']),
  staleDays: z.number().min(1).default(90),
  dryRun: z.boolean().default(true),
  aggressive: z.boolean().default(false),
  skipConfirmation: z.boolean().default(false),
  verbose: z.boolean().default(false),
})

const defaultConfig: BroomConfig = {
  protectedBranches: ['main', 'master', 'develop'],
  staleDays: 90,
  dryRun: true,
  aggressive: false,
  skipConfirmation: false,
  verbose: false,
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

function parseConfigFile(path: string): Partial<BroomConfig> {
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    return configSchema.partial().parse(parsed)
  } catch {
    return {}
  }
}

export function resolveConfig(cwd: string, cliOverrides: Partial<BroomConfig>): BroomConfig {
  const configFile = findConfigFile(cwd)
  const fileConfig = configFile ? parseConfigFile(configFile) : {}

  return {
    ...defaultConfig,
    ...fileConfig,
    ...cliOverrides,
  }
}
