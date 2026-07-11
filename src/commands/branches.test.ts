import { describe, expect, it } from 'vitest'
import { buildBranchAgeHistogram, getBranchAgeBucket } from './branches.js'

const now = new Date('2026-07-08T00:00:00.000Z')

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('branch age histogram', () => {
  it('assigns branches to the documented age buckets', () => {
    expect(getBranchAgeBucket(daysAgo(7), now)).toBe('0-7d')
    expect(getBranchAgeBucket(daysAgo(8), now)).toBe('7-30d')
    expect(getBranchAgeBucket(daysAgo(30), now)).toBe('7-30d')
    expect(getBranchAgeBucket(daysAgo(31), now)).toBe('30-90d')
    expect(getBranchAgeBucket(daysAgo(90), now)).toBe('30-90d')
    expect(getBranchAgeBucket(daysAgo(91), now)).toBe('90d+')
  })

  it('includes every bucket and counts branches', () => {
    expect(
      buildBranchAgeHistogram(
        [1, 5, 8, 31, 91].map((days) => ({ lastCommitDate: daysAgo(days) })),
        now,
      ),
    ).toEqual([
      { bucket: '0-7d', count: 2 },
      { bucket: '7-30d', count: 1 },
      { bucket: '30-90d', count: 1 },
      { bucket: '90d+', count: 1 },
    ])
  })
})
