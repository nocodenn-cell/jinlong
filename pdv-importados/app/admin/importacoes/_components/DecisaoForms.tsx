'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { aprovarAction, mudarEstadoAction } from '../actions'
import { Campo, ErroFormulario, useAcao, type TextosImport } from './campos'

function Motivo({ rotulo, valor, onChange, testId }: { rotulo: string; valor: string; onChange: (v: string) => void; testId: string }) {
  return (
    <Campo rotulo={rotulo} obrigatorio>
      {(id) => (
        <textarea
          id={id}
          className="fp-control w-full text-small"
          rows={2}
          value={valor}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
      )}
    </Campo>
  )
}

/** Aprovar: o servidor recalcula com o motor e o banco revalida o DONO — o botão é só a intenção. */
export function AprovarForm({ t, operacaoId, apuracaoId }: { t: TextosImport; operacaoId: string; apuracaoId: string }) {
  const { executar, pendente, erro } = useAcao(t)
  const [motivo, setMotivo] = useState('')
  return (
    <form
      className="flex flex-col gap-2"
      aria-label={t.aprov_aprovar}
      onSubmit={(e) => {
        e.preventDefault()
        executar(() => aprovarAction(operacaoId, apuracaoId, motivo), () => setMotivo(''), t.salvo)
      }}
    >
      <Motivo rotulo={t.aprov_motivo} valor={motivo} onChange={setMotivo} testId="imp-aprovar-motivo" />
      <ErroFormulario mensagem={erro} />
      <div>
        <Button type="submit" variant="success" disabled={pendente || motivo.trim().length < 10} data-testid="imp-aprovar">
          {pendente ? t.aprov_aprovando : t.aprov_aprovar}
        </Button>
      </div>
    </form>
  )
}

export function EstadoForm({ t, operacaoId, acao }: { t: TextosImport; operacaoId: string; acao: 'REABRIR' | 'CANCELAR' }) {
  const { executar, pendente, erro } = useAcao(t)
  const [motivo, setMotivo] = useState('')
  const rotulo = acao === 'REABRIR' ? t.aprov_reabrir_motivo : t.aprov_cancelar_motivo
  const botao = acao === 'REABRIR' ? t.aprov_reabrir : t.aprov_cancelar
  return (
    <form
      className="flex flex-col gap-2"
      aria-label={botao}
      onSubmit={(e) => {
        e.preventDefault()
        executar(() => mudarEstadoAction(operacaoId, acao, motivo), () => setMotivo(''), t.salvo)
      }}
    >
      <Motivo rotulo={rotulo} valor={motivo} onChange={setMotivo} testId={`imp-${acao.toLowerCase()}-motivo`} />
      <ErroFormulario mensagem={erro} />
      <div>
        <Button type="submit" variant={acao === 'CANCELAR' ? 'danger' : 'outline'} disabled={pendente || motivo.trim().length < 10} data-testid={`imp-${acao.toLowerCase()}`}>
          {pendente ? t.salvando : botao}
        </Button>
      </div>
    </form>
  )
}
