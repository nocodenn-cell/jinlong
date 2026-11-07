'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { adminImportacaoHref } from '@/lib/navigation/routes'
import { apurarAction } from '../actions'
import { ErroFormulario, useAcao, type TextosImport } from './campos'

export function ApurarBotoes({ t, operacaoId }: { t: TextosImport; operacaoId: string }) {
  const router = useRouter()
  const { executar, pendente, erro } = useAcao(t)
  const rodar = (tipo: 'SIMULACAO' | 'APURACAO') =>
    executar(
      () => apurarAction(operacaoId, tipo),
      (d) => router.push(adminImportacaoHref(operacaoId, { aba: 'apuracao', apuracao: d.apuracaoId })),
      t.salvo,
    )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" aria-busy={pendente}>
        <Button type="button" variant="outline" disabled={pendente} onClick={() => rodar('SIMULACAO')} data-testid="imp-simular">
          {pendente ? t.apu_calculando : t.apu_simular}
        </Button>
        <Button type="button" disabled={pendente} onClick={() => rodar('APURACAO')} data-testid="imp-calcular">
          {pendente ? t.apu_calculando : t.apu_calcular}
        </Button>
      </div>
      <ErroFormulario mensagem={erro} />
    </div>
  )
}
