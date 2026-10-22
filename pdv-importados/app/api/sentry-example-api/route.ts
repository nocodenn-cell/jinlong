// Rota de teste do Sentry — só responde fora de produção.
export const dynamic = 'force-dynamic'

export function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  throw new Error('Sentry teste (preview) — erro intencional')
}
