import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolve } from 'path'

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

import { execa } from 'execa'
import { getGitPath } from './git.js'

describe('getGitPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns absolute path unchanged', async () => {
    const absolutePath = 'C:\\home\\user\\project\\.git\\hooks'
    vi.mocked(execa).mockResolvedValue({ stdout: absolutePath } as any)

    const result = await getGitPath('hooks', 'C:\\some\\cwd')
    expect(result).toBe(absolutePath)
    expect(execa).toHaveBeenCalledWith('git', ['rev-parse', '--git-path', 'hooks'], { cwd: 'C:\\some\\cwd' })
  })

  it('resolves relative path against cwd', async () => {
    const relativePath = 'objects/pack'
    vi.mocked(execa).mockResolvedValue({ stdout: relativePath } as any)

    const cwd = 'C:\\home\\user\\project'
    const result = await getGitPath('objects/pack', cwd)
    expect(result).toBe(resolve(cwd, relativePath))
  })

  it('uses process.cwd() when cwd is omitted', async () => {
    const relativePath = 'objects/pack'
    vi.mocked(execa).mockResolvedValue({ stdout: relativePath } as any)

    const result = await getGitPath('objects/pack')
    expect(result).toBe(resolve(process.cwd(), relativePath))
  })
})