"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"

type Props = {
  m: Mensagens
  caixaAberto: boolean
  movimentandoCaixa: boolean
  finalizando: boolean
  validandoGerente: boolean
  gerenteValidadoAte: string | null
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onValidarGerente: () => void
}

export function CaixaPdvOperacoesButtons({
  m,
  caixaAberto,
  movimentandoCaixa,
  finalizando,
  validandoGerente,
  gerenteValidadoAte,
  onAbrirSuprimento,
  onAbrirSangria,
  onValidarGerente,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="bg-secondary text-secondary-foreground border border-border"
          onClick={onAbrirSuprimento}
          disabled={!caixaAberto || movimentandoCaixa || finalizando}
          aria-busy={movimentandoCaixa}
          title="Ctrl+Shift+S"
        >
          {m.caixa.suprimento} (+)
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/25"
          onClick={onAbrirSangria}
          disabled={!caixaAberto || movimentandoCaixa || finalizando}
          aria-busy={movimentandoCaixa}
          title="Ctrl+Shift+R"
        >
          {m.caixa.sangria} (-)
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="inline-flex items-center gap-2 bg-yellow-900/30 text-yellow-400 border border-yellow-700"
          onClick={onValidarGerente}
          disabled={validandoGerente || movimentandoCaixa}
          aria-busy={validandoGerente}
        >
          {!gerenteValidadoAte ? (
            <ImperialSealIcon
              className="h-4 w-4 shrink-0 app-accent-text"
              title={m.caixa.aria_selo_gerente}
              pulse
            />
          ) : null}
          {validandoGerente ? m.caixa.validando_gerente : m.caixa.validar_gerente}
        </Button>
      </div>
    </div>
  )
}
