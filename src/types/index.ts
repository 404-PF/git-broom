export interface GitBranch {
  name: string
  lastCommitDate: Date
  lastCommitHash: string
  lastCommitSubject: string
  isMerged: boolean
  isRemote: boolean
}

export interface DanglingObject {
  type: 'commit' | 'tree' | 'blob'
  hash: string
}

export interface RepoStatus {
  currentBranch: string | null
  totalBranches: number
  mergedBranches: number
  staleBranches: number
  danglingObjects: number
  gitDirSize: number
  remotes: string[]
  staleDays: number
}

export interface CleanResult {
  dryRun: boolean
  aggressive: boolean
  staleDays: number
  currentBranch: string | null
  candidateBranches: Array<{
    name: string
    reason: 'merged' | 'stale'
  }>
  skippedBranches: string[]
  deletedBranches: string[]
  remotes: string[]
  prunedRemotes: string[]
  garbageCollectionRun: boolean
  beforeSize: number
  afterSize: number
  spaceReclaimed: number
}

export type ScheduleInterval = 'daily' | 'weekly' | 'monthly'

export interface ScheduleConfig {
  interval: ScheduleInterval
  logFile?: string
}

export interface BranchNamingConfig {
  requireTicket: boolean
  requirePrefix: boolean
  ticketPattern: string
  allowedPrefixes: string[]
  ignorePatterns: string[]
}

export interface BroomConfig {
  protectedBranches: string[]
  staleDays: number
  dryRun: boolean
  aggressive: boolean
  skipConfirmation: boolean
  verbose: boolean
  json: boolean
  schedule?: ScheduleConfig
  branchNaming?: BranchNamingConfig
}

export type BranchCategory = 'merged' | 'stale' | 'active' | 'protected'

export interface BranchReportEntry {
  name: string
  category: BranchCategory
  lastCommitDate: Date
  lastCommitHash: string
  lastCommitSubject: string
}

export type BranchAgeBucket = '0-7d' | '7-30d' | '30-90d' | '90d+'

export interface BranchAgeHistogramEntry {
  bucket: BranchAgeBucket
  count: number
}

export interface BranchesReport {
  staleDays: number
  counts: {
    total: number
    merged: number
    stale: number
    active: number
    protected: number
  }
  branches: BranchReportEntry[]
  histogram?: BranchAgeHistogramEntry[]
}

export interface ObjectsReport {
  pruneRequested: boolean
  dryRun: boolean
  total: number
  byType: {
    commit: number
    tree: number
    blob: number
  }
  objects: DanglingObject[]
  pruned: boolean
}
