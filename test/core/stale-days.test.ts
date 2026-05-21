import { describe, expect, it } from 'vitest'
import { parsePositiveInteger } from '../../src/core/validation.js'
import { getStaleBranches } from '../../src/core/git.js'

describe('stale days validation', () => {
  it('parses positive integer CLI values', () => {
    expect(parsePositiveInteger('30', 'stale-days')).toBe(30)
  })

  it('rejects non-numeric CLI values', () => {
    expect(() => parsePositiveInteger('abc', 'stale-days')).toThrow('stale-days must be a positive integer')
  })

  it('rejects partial numeric CLI values', () => {
    expect(() => parsePositiveInteger('30days', 'stale-days')).toThrow('stale-days must be a positive integer')
  })

  it('rejects zero and negative CLI values', () => {
    expect(() => parsePositiveInteger('0', 'stale-days')).toThrow('stale-days must be a positive integer')
    expect(() => parsePositiveInteger('-1', 'stale-days')).toThrow('stale-days must be a positive integer')
  })

  it('rejects invalid getStaleBranches day values before querying git', async () => {
    await expect(getStaleBranches(Number.NaN)).rejects.toThrow('days must be a positive integer')
    await expect(getStaleBranches(0)).rejects.toThrow('days must be a positive integer')
    await expect(getStaleBranches(-1)).rejects.toThrow('days must be a positive integer')
  })
})
