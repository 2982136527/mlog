import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'

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
    async jwt({ token, profile }) {
      if (profile && 'login' in profile && typeof profile.login === 'string') {
        token.login = profile.login
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.login = typeof token.login === 'string' ? token.login : undefined
      }
      return session
    }
  }
}

export function getAuthSession() {
  return getServerSession(authOptions)
}
