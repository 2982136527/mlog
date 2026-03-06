import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'

function hasGistScope(scopeValue: unknown): boolean {
  if (typeof scopeValue !== 'string') {
    return false
  }

  return scopeValue
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .includes('gist')
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
      }
      return session
    }
  }
}

export function getAuthSession() {
  return getServerSession(authOptions)
}
