import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'

function parseScopeItems(scopeValue: unknown): string[] {
  if (typeof scopeValue !== 'string') {
    return []
  }

  return scopeValue
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

function hasGistScope(scopeValue: unknown): boolean {
  return parseScopeItems(scopeValue).includes('gist')
}

function hasDiscussionReadScope(scopeValue: unknown): boolean {
  const scopes = parseScopeItems(scopeValue)
  return scopes.includes('read:discussion') || scopes.includes('write:discussion') || scopes.includes('public_repo') || scopes.includes('repo')
}

function hasDiscussionWriteScope(scopeValue: unknown): boolean {
  const scopes = parseScopeItems(scopeValue)
  return scopes.includes('write:discussion') || scopes.includes('public_repo') || scopes.includes('repo')
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt'
  },
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID || '',
      clientSecret: process.env.AUTH_GITHUB_SECRET || ''
    })
  ],
  pages: {
    signIn: '/admin/login'
  },
  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile && 'login' in profile && typeof profile.login === 'string') {
        token.login = profile.login
      }
      if (account) {
        if (typeof account.access_token === 'string') {
          token.githubAccessToken = account.access_token
        }
        if (typeof account.scope === 'string') {
          token.githubScope = account.scope
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.login = typeof token.login === 'string' ? token.login : undefined
        session.user.hasGistScope = hasGistScope(token.githubScope)
        session.user.hasDiscussionReadScope = hasDiscussionReadScope(token.githubScope)
        session.user.hasDiscussionWriteScope = hasDiscussionWriteScope(token.githubScope)
      }
      return session
    }
  }
}

export function getAuthSession() {
  return getServerSession(authOptions)
}
