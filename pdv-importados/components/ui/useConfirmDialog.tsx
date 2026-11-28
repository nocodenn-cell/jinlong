'use client'

import React, { useCallback, useRef, useState, type ReactNode } from 'react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'

/**
 * Confirmação de ação destrutiva no padrão do Design System (sprint UX 2026-11-27).
 *
 * Substitui `window.confirm`/`window.alert`: o diálogo nativo não segue o tema, mostra o
 * domínio do site no título, fica com botões em inglês/idioma do navegador (o operador
 * chinês via "OK/Cancel" no meio de uma tela em zh) e não permite destacar a ação perigosa.
 * Aqui o diálogo é o `DragonModal` (único primitivo de diálogo aceito), com foco preso,
 * Escape/backdrop = cancelar e o botão perigoso em vermelho.
 *
 * Uso:
 *   const { confirmar, dialogo } = useConfirmDialog()
 *   if (!(await confirmar({ titulo: t.excluir_confirma }))) return
 *   ...
 *   return <>{...}{dialogo}</>
 */

export type ConfirmDialogIdioma = 'pt' | 'zh'

export type ConfirmarOpcoes = {
  titulo: ReactNode
  /** Texto de apoio (consequência da ação). */
  mensagem?: ReactNode
  rotuloConfirmar?: string
  rotuloCancelar?: string
  /** Default true: botão vermelho e ícone de alerta. */
  perigo?: boolean
  /** Sem `idioma`, é inferido do próprio texto (ideogramas CJK → zh). */
  idioma?: ConfirmDialogIdioma
}

export type AvisoOpcoes = {
  titulo: ReactNode
  mensagem?: ReactNode
  rotuloOk?: string
  idioma?: ConfirmDialogIdioma
}

const ROTULOS: Record<ConfirmDialogIdioma, { confirmar: string; cancelar: string; ok: string; fechar: string }> = {
  pt: { confirmar: 'Confirmar', cancelar: 'Cancelar', ok: 'Entendi', fechar: 'Fechar' },
  zh: { confirmar: '确认', cancelar: '取消', ok: '知道了', fechar: '关闭' },
}

const CJK = /[㐀-鿿]/

/** Exportado para teste: o idioma dos botões acompanha o texto que o chamador já traduziu. */
export function inferirIdiomaConfirmacao(...textos: ReactNode[]): ConfirmDialogIdioma {
  return textos.some((t) => typeof t === 'string' && CJK.test(t)) ? 'zh' : 'pt'
}

type Estado =
  | { tipo: 'confirmar'; opcoes: ConfirmarOpcoes }
  | { tipo: 'aviso'; opcoes: AvisoOpcoes }
  | null

export function useConfirmDialog(): {
  confirmar: (opcoes: ConfirmarOpcoes) => Promise<boolean>
  avisar: (opcoes: AvisoOpcoes) => Promise<void>
  dialogo: ReactNode
} {
  const [estado, setEstado] = useState<Estado>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const encerrar = useCallback((ok: boolean) => {
    const r = resolver.current
    resolver.current = null
    setEstado(null)
    r?.(ok)
  }, [])

  const confirmar = useCallback((opcoes: ConfirmarOpcoes) => {
    // Um pedido novo enquanto outro está aberto cancela o anterior (nunca deixa promessa pendurada).
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setEstado({ tipo: 'confirmar', opcoes })
    })
  }, [])

  const avisar = useCallback((opcoes: AvisoOpcoes) => {
    resolver.current?.(false)
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve()
      setEstado({ tipo: 'aviso', opcoes })
    })
  }, [])

  let dialogo: ReactNode = null
  if (estado) {
    const { opcoes } = estado
    const idioma = opcoes.idioma ?? inferirIdiomaConfirmacao(opcoes.titulo, opcoes.mensagem)
    const r = ROTULOS[idioma]
    const perigo = estado.tipo === 'confirmar' ? estado.opcoes.perigo !== false : false
    dialogo = (
      <DragonModal
        open
        onClose={() => encerrar(false)}
        title={opcoes.titulo}
        variant={perigo ? 'danger' : 'default'}
        size="sm"
        closeLabel={r.fechar}
        data-testid={estado.tipo === 'confirmar' ? 'confirm-dialog' : 'aviso-dialog'}
        footer={
          estado.tipo === 'confirmar' ? (
            <>
              <Button type="button" variant="secondary" onClick={() => encerrar(false)}>
                {estado.opcoes.rotuloCancelar ?? r.cancelar}
              </Button>
              <Button
                type="button"
                variant={perigo ? 'danger' : 'primary'}
                data-testid="confirm-dialog-confirmar"
                onClick={() => encerrar(true)}
              >
                {estado.opcoes.rotuloConfirmar ?? r.confirmar}
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" onClick={() => encerrar(true)}>
              {estado.opcoes.rotuloOk ?? r.ok}
            </Button>
          )
        }
      >
        {opcoes.mensagem ? <div className="text-body text-[var(--color-text-secondary)]">{opcoes.mensagem}</div> : null}
      </DragonModal>
    )
  }

  return { confirmar, avisar, dialogo }
}
