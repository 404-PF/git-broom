import type { ScheduleInterval } from '../types/index.js'

export function intervalToMs(interval: ScheduleInterval): number {
  switch (interval) {
    case 'daily':
      return 24 * 60 * 60 * 1000
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000
  }
}

