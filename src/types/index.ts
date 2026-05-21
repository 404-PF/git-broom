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
}

export interface CleanResult {
  deletedBranches: string[]
  prunedRemotes: string[]
  danglingObjectsRemoved: number
  spaceReclaimed: number
}

export interface BroomConfig {
  protectedBranches: string[]
  staleDays: number
  dryRun: boolean
  aggressive: boolean
  skipConfirmation: boolean
  verbose: boolean
}
