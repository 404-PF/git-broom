import { execa } from 'execa'
import { statSync, readdirSync } from 'fs'
import { join } from 'path'
import type { GitBranch, DanglingObject } from '../types/index.js'
import { assertPositiveInteger } from './validation.js'

export async function git(args: string[], cwd?: string) {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--git-dir'], cwd)
    return true
  } catch {
    return false
  }
}

export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  try {
    const branch = await git(['branch', '--show-current'], cwd)
    return branch || null
  } catch {
    return null
  }
}

export async function getLocalBranches(cwd?: string): Promise<GitBranch[]> {
  const output = await git(
    ['for-each-ref', '--format=%(refname:short) %(committerdate:iso8601) %(objectname:short) %(subject)', 'refs/heads/'],
    cwd,
  )
  if (!output) return []

  return output.split('\n').map((line) => {
    const match = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(\S+)\s+(.*)$/)
    if (!match) {
      return {
        name: line.split(' ')[0] ?? '',
        lastCommitDate: new Date(0),
        lastCommitHash: '',
        lastCommitSubject: '',
        isMerged: false,
        isRemote: false,
      }
    }
    return {
      name: match[1]!,
      lastCommitDate: new Date(match[2]!),
      lastCommitHash: match[3]!,
      lastCommitSubject: match[4]!,
      isMerged: false,
      isRemote: false,
    }
  })
}

export async function getRemoteBranches(cwd?: string): Promise<GitBranch[]> {
  const output = await git(
    ['for-each-ref', '--format=%(refname:short) %(committerdate:iso8601) %(objectname:short) %(subject)', 'refs/remotes/'],
    cwd,
  )
  if (!output) return []

  return output.split('\n').map((line) => {
    const match = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(\S+)\s+(.*)$/)
    if (!match) {
      return {
        name: line.split(' ')[0] ?? '',
        lastCommitDate: new Date(0),
        lastCommitHash: '',
        lastCommitSubject: '',
        isMerged: false,
        isRemote: true,
      }
    }
    return {
      name: match[1]!,
      lastCommitDate: new Date(match[2]!),
      lastCommitHash: match[3]!,
      lastCommitSubject: match[4]!,
      isMerged: false,
      isRemote: true,
    }
  })
}

export async function getMergedBranches(cwd?: string): Promise<string[]> {
  const output = await git(['branch', '--merged'], cwd)
  if (!output) return []
  return output
    .split('\n')
    .map((b) => b.trim().replace(/^\*\s+/, ''))
    .filter(Boolean)
}

export async function getStaleBranches(days: number, cwd?: string): Promise<GitBranch[]> {
  assertPositiveInteger(days, 'days')
  const branches = await getLocalBranches(cwd)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return branches.filter((b) => b.lastCommitDate < cutoff)
}

export async function getDanglingObjects(cwd?: string): Promise<DanglingObject[]> {
  try {
    const output = await git(['fsck', '--unreachable', '--no-reflogs'], cwd)
    if (!output) return []

    return output
      .split('\n')
      .map((line) => {
        const match = line.match(/^unreachable\s+(\w+)\s+(\w+)$/)
        if (!match) return null
        return {
          type: match[1] as DanglingObject['type'],
          hash: match[2]!,
        }
      })
      .filter(Boolean) as DanglingObject[]
  } catch {
    return []
  }
}

export async function getRemotes(cwd?: string): Promise<string[]> {
  try {
    const output = await git(['remote'], cwd)
    if (!output) return []
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export async function getGitDirSize(cwd?: string): Promise<number> {
  const gitDir = join(cwd ?? process.cwd(), '.git')
  return dirSize(gitDir)
}

function dirSize(dir: string): number {
  let size = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        size += dirSize(fullPath)
      } else {
        try {
          size += statSync(fullPath).size
        } catch {
          // skip files we can't stat
        }
      }
    }
  } catch {
    // skip dirs we can't read
  }
  return size
}

export async function deleteBranch(branch: string, cwd?: string): Promise<void> {
  await git(['branch', '-D', branch], cwd)
}

export async function pruneRemote(remote: string, cwd?: string): Promise<void> {
  await git(['remote', 'prune', remote], cwd)
}

export async function garbageCollect(aggressive = false, cwd?: string): Promise<void> {
  const args = aggressive ? ['gc', '--prune=now', '--aggressive'] : ['gc', '--prune=now']
  await git(args, cwd)
}
