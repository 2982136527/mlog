export type RepoCardStaticSnapshot = {
  stars: number
  forks: number
  openIssues: number
  snapshotAt: string
  language: string | null
  license: string | null
  pushedAt: string | null
  updatedAt: string | null
}

export type RepoCardsConfig = {
  enabled: boolean
  repoUrl: string
  repoFullName: string | null
  staticSnapshot: RepoCardStaticSnapshot | null
  updatedAt: string
  updatedBy: 'admin' | 'system'
}

export type AdminRepoCardsInput = {
  enabled: boolean
  repoUrl?: string
}

export type PostStaticSnapshot = {
  repoUrl: string | null
  repoFullName: string | null
  stars: number | null
  forks: number | null
  openIssues: number | null
  snapshotAt: string | null
  language: string | null
  license: string | null
  pushedAt: string | null
  updatedAt: string | null
}
