import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/session'

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303)
  res.cookies.delete(ACCESS_COOKIE)
  res.cookies.delete(REFRESH_COOKIE)
  return res
}
