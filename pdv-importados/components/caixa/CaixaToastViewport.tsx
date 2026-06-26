"use client"

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react"
import type { CaixaToastKind } from "@/app/caixa/hooks/useCaixaMensagens"

type CaixaToastItem = {
  id: number
  kind: CaixaToastKind
  text: string
}

type Props = {
  items: CaixaToastItem[]
  onDismiss: (id: number) => void
}

const kindClass: Record<CaixaToastKind, string> = {
  info:
    'border border-primary/40 bg-card/95 text-foreground shadow-lg backdrop-blur-sm',
  success:
    'border border-success/45 bg-card/95 text-success shadow-lg backdrop-blur-sm',
  warning:
    'border border-amber-500/45 bg-card/95 text-amber-800 shadow-lg backdrop-blur-sm',
  error:
    'border border-destructive/45 bg-card/95 text-destructive shadow-lg backdrop-blur-sm',
}

const kindIcon: Record<CaixaToastKind, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
}

/**
 * #10 da auditoria: leitor de tela precisa anunciar o toast. Erro/aviso são
 * `role="alert"` (assertivo — interrompe), sucesso/info são `role="status"`
 * (polido). O role/aria-live fica POR ITEM (não num wrapper único) p/ que a
 * urgência case com o tipo. Ícone Lucide à esquerda + botão X explícito; o
 * clique no corpo continua dispensando (operador já usa esse gesto).
 */
export function CaixaToastViewport({ items, onDismiss }: Props) {
  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] grid max-w-[22rem] gap-2">
      {items.map((item) => {
        const Icon = kindIcon[item.kind]
        const assertive = item.kind === 'error' || item.kind === 'warning'
        return (
          <div
            key={item.id}
            role={assertive ? 'alert' : 'status'}
            aria-live={assertive ? 'assertive' : 'polite'}
            onClick={() => onDismiss(item.id)}
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm shadow-lg transition-opacity hover:opacity-90 ${kindClass[item.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words">{item.text}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDismiss(item.id)
              }}
              aria-label="Dispensar"
              className="-mr-1 -mt-0.5 flex-shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
