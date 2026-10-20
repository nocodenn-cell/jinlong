import { TesteGratisForm } from './TesteGratisForm'

export const metadata = { title: 'Teste grátis 15 dias · Jinlong PDV / 免费试用' }

export default function TesteGratisPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <TesteGratisForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
    </main>
  )
}
