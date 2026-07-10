"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
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
      category: "Venda",
      shortcuts: [
        {
          keys: "F4 / F9",
          label: m.caixa.finalizar_venda,
          context: "Sempre disponível",
        },
        {
          keys: "F8",
          label: m.caixa.novo_cupom || "Novo Cupom",
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Navegação",
      shortcuts: [
        {
          keys: "F2 / Ctrl+B",
          label: "Buscar Produto",
          context: "Sempre disponível",
        },
        {
          keys: "F6",
          label: m.caixa.fechar,
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Operações",
      shortcuts: [
        {
          keys: "Ctrl+Shift+S",
          label: m.caixa.suprimento,
          context: "Caixa aberto",
        },
        {
          keys: "Ctrl+Shift+R",
          label: m.caixa.sangria,
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Edição",
      shortcuts: [
        {
          keys: "Ctrl+Z",
          label: "Desfazer Remoção",
          context: "Item removido",
        },
        {
          keys: "F12",
          label: m.caixa.reimprimir_cupom || "Reimprimir Recibo",
          context: "Após finalizar venda",
        },
      ],
    },
    {
      category: "Gerente (PDV Clássico)",
      shortcuts: [
        {
          keys: "Alt+Q",
          label: m.caixa.cart_bar_excluir_venda || "Excluir Venda",
          context: "Apenas PDV clássico",
        },
        {
          keys: "Alt+S",
          label: m.caixa.finalizar_venda,
          context: "Apenas PDV clássico",
        },
        {
          keys: "Alt+Z",
          label: m.caixa.pdv_tab_produto || "Aba Produto",
          context: "Apenas PDV clássico",
        },
        {
          keys: "Alt+C",
          label: m.caixa.pdv_tab_cliente || "Aba Cliente",
          context: "Apenas PDV clássico",
        },
        {
          keys: "Alt+B",
          label: m.caixa.pdv_tab_pgto || "Aba Pagamento",
          context: "Apenas PDV clássico",
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
            : "text-jl-fg-2 hover:bg-jl-surface-soft",
          className,
        )}
        onClick={() => setOpen(true)}
        title={m.caixa.atalho_ajuda || "Atalhos de Teclado (?)"}
        aria-label={m.caixa.atalho_ajuda || "Atalhos de Teclado"}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <DragonModal
        open={open}
        onClose={() => setOpen(false)}
        title="Atalhos de Teclado"
        subtitle="Lista completa de atalhos disponíveis no PDV"
        size="lg"
      >
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4">
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
        <div className="text-xs text-muted-foreground pt-4 border-t mt-6">
          Dica: Pressione <kbd>F2</kbd> ou <kbd>Ctrl+B</kbd> para buscar um produto rapidamente
        </div>
      </DragonModal>
    </>
  )
}
