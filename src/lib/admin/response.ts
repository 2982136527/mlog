import { NextResponse } from 'next/server'

export function createRequestId(): string {
  return crypto.randomUUID()
}

export function ok<T extends Record<string, unknown>>(requestId: string, payload: T) {
  return NextResponse.json({ requestId, ...payload })
}

export function fail(requestId: string, status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      requestId,
      error: {
        code,
        message,
        ...extra
      }
    },
    { status }
  )
}
