import type { ForumScopeState } from '@/types/forum'

function parseScopes(scopeValue: string): string[] {
  return scopeValue
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

export function hasDiscussionReadScope(scopeValue: string): boolean {
  const scopes = parseScopes(scopeValue)
  return scopes.includes('read:discussion') || scopes.includes('write:discussion') || scopes.includes('public_repo') || scopes.includes('repo')
}

export function hasDiscussionWriteScope(scopeValue: string): boolean {
  const scopes = parseScopes(scopeValue)
  return scopes.includes('write:discussion') || scopes.includes('public_repo') || scopes.includes('repo')
}

export function getForumScopeState(scopeValue: string): ForumScopeState {
  return {
    hasDiscussionReadScope: hasDiscussionReadScope(scopeValue),
    hasDiscussionWriteScope: hasDiscussionWriteScope(scopeValue)
  }
}
