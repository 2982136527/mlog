import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdminLogin } from '@/lib/admin/permissions'

function buildLoginRedirect(req: NextRequest) {
  const callbackUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`
  const target = new URL('/admin/login', req.url)
  target.searchParams.set('callbackUrl', callbackUrl)
  return NextResponse.redirect(target)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin/login')) {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET
  })

  if (!token) {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    }
    return buildLoginRedirect(req)
  }

  const login = typeof token.login === 'string' ? token.login : undefined

  if (!isAdminLogin(login)) {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access denied'
          }
        },
        { status: 403 }
      )
    }
    return new NextResponse('Forbidden', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*']
}
