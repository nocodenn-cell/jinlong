import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/navigation/routes'
import type { PerfilUsuario } from '@/lib/auth/perfil'

type Textos = {
  titulo: string
  motivoUma: string
  motivoNenhuma: string
  acaoAdmin: string
  acaoDono: string
  acaoGerente: string
  irSaldos: string
  irEntradas: string
}

type Props = {
  quantidadeLojas: number
  perfil: PerfilUsuario
  textos: Textos
}

export function TransferenciaIndisponivel({ quantidadeLojas, perfil, textos }: Props) {
  const motivo = quantidadeLojas === 0 ? textos.motivoNenhuma : textos.motivoUma
  return (
    <div
      className="mt-6 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-5 text-[var(--color-warning-strong)]"
      role="status"
      data-testid="transferencia-indisponivel"
    >
      <h2 className="text-title font-semibold">{textos.titulo}</h2>
      <p className="mt-2 text-body leading-relaxed">{motivo}</p>
      <Acao perfil={perfil} textos={textos} />
    </div>
  )
}

function Acao({ perfil, textos }: { perfil: PerfilUsuario; textos: Textos }) {
  if (perfil === 'ADMIN') {
    return (
      <Button asChild className="mt-4">
        <Link href={ROUTES.admin.provisionamento}>{textos.acaoAdmin}</Link>
      </Button>
    )
  }
  if (perfil === 'DONO') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-body leading-relaxed">{textos.acaoDono}</p>
        <Button asChild variant="outline">
          <Link href={ROUTES.admin.estoque}>{textos.irSaldos}</Link>
        </Button>
      </div>
    )
  }
  return (
    <div className="mt-4 space-y-3">
      <p className="text-body leading-relaxed">{textos.acaoGerente}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={ROUTES.admin.estoqueRecebimento}>{textos.irEntradas}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={ROUTES.admin.estoque}>{textos.irSaldos}</Link>
        </Button>
      </div>
    </div>
  )
}
