"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Mensagens } from "@/i18n/getMessages"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  variant?: "default" | "classic"
  className?: string
}

interface ShortcutGroup {
  category: string
  shortcuts: Array<{
    keys: string
    label: string
    context?: string
  }>
}

function buildShortcutsData(m: Mensagens): ShortcutGroup[] {
  return [
    {
      category: m.caixa.atalho_categoria_venda || "Venda",
      shortcuts: [
        {
          keys: "F4 / F9",
          label: m.caixa.finalizar_venda || "Finalizar Venda",
          context: m.caixa.atalho_context_sempre || "Sempre disponível",
        },
        {
          keys: "F8",
          label: m.caixa.atalho_novo_cupom || "Novo Cupom",
          context: m.caixa.atalho_context_caixa_aberto || "Caixa aberto",
        },
      ],
    },
    {
      category: m.caixa.atalho_categoria_navegacao || "Navegação",
      shortcuts: [
        {
          keys: "F2 / Ctrl+B",
          label: m.caixa.atalho_busca || "Buscar Produto",
          context: m.caixa.atalho_context_sempre || "Sempre disponível",
        },
        {
          keys: "F6",
          label: m.caixa.fechar || "Fechar Caixa",
          context: m.caixa.atalho_context_caixa_aberto || "Caixa aberto",
        },
      ],
    },
    {
      category: m.caixa.atalho_categoria_operacoes || "Operações",
      shortcuts: [
        {
          keys: "Ctrl+Shift+S",
          label: m.caixa.suprimento || "Suprimento",
          context: m.caixa.atalho_context_caixa_aberto || "Caixa aberto",
        },
        {
          keys: "Ctrl+Shift+R",
          label: m.caixa.sangria || "Sangria",
          context: m.caixa.atalho_context_caixa_aberto || "Caixa aberto",
        },
      ],
    },
    {
      category: m.caixa.atalho_categoria_edicao || "Edição",
      shortcuts: [
        {
          keys: "Ctrl+Z",
          label: m.caixa.atalho_desfazer_remocao || "Desfazer Remoção",
          context: m.caixa.atalho_context_carrinho || "Item removido",
        },
        {
          keys: "F12",
          label: m.caixa.atalho_reimprimir || "Reimprimir Recibo",
          context: m.caixa.atalho_context_apos_venda || "Após finalizar venda",
        },
      ],
    },
    {
      category: m.caixa.atalho_categoria_gerente || "Gerente (PDV Clássico)",
      shortcuts: [
        {
          keys: "Alt+Q",
          label: m.caixa.atalho_excluir_venda || "Excluir Venda",
          context: m.caixa.atalho_context_pdv_classico || "Apenas PDV clássico",
        },
        {
          keys: "Alt+S",
          label: m.caixa.finalizar_venda || "Finalizar Venda",
          context: m.caixa.atalho_context_pdv_classico || "Apenas PDV clássico",
        },
        {
          keys: "Alt+Z",
          label: m.caixa.atalho_aba_produto || "Aba Produto",
          context: m.caixa.atalho_context_pdv_classico || "Apenas PDV clássico",
        },
        {
          keys: "Alt+C",
          label: m.caixa.atalho_aba_cliente || "Aba Cliente",
          context: m.caixa.atalho_context_pdv_classico || "Apenas PDV clássico",
        },
        {
          keys: "Alt+B",
          label: m.caixa.atalho_aba_pagamento || "Aba Pagamento",
          context: m.caixa.atalho_context_pdv_classico || "Apenas PDV clássico",
        },
      ],
    },
  ]
}

export function CaixaKeyboardShortcutsReference({ m, variant = "default", className }: Props) {
  const [open, setOpen] = useState(false)
  const classic = variant === "classic"
  const shortcutsData = buildShortcutsData(m)

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "text-xs font-medium px-2 py-1.5 h-auto",
          classic
            ? "text-primary-foreground hover:bg-white/15"
            : "text-jl-fg-2 hover:bg-white/[0.06]",
          className,
        )}
        onClick={() => setOpen(true)}
        title={m.caixa.atalho_ajuda || "Atalhos de Teclado (?)"}
        aria-label={m.caixa.atalho_ajuda || "Atalhos de Teclado"}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{m.caixa.atalho_titulo || "Atalhos de Teclado"}</DialogTitle>
            <DialogDescription>
              {m.caixa.atalho_descricao || "Lista completa de atalhos disponíveis no PDV"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {shortcutsData.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {group.category}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="grid grid-cols-[auto_1fr_auto] gap-4 text-xs items-start"
                    >
                      <kbd className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-muted text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {shortcut.keys}
                      </kbd>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {shortcut.label}
                        </span>
                        {shortcut.context && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.context}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground pt-4 border-t">
            {m.caixa.atalho_nota || "Dica: Pressione 'F2' ou 'Ctrl+B' para buscar um produto rapidamente"}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
