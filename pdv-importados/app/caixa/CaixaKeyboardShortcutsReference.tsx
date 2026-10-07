"use client"

import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import type { Mensagens } from "@/i18n/getMessages"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { CAIXA_ATALHOS, atalhoRotulo } from "@/app/caixa/caixaAtalhos"

type Props = {
  m: Mensagens
  variant?: "default" | "classic"
  className?: string
  /** Estado do modal — controlado pelo dono (CaixaPageClient), para o atalho F1 alternar. */
  open: boolean
  onOpenChange: (open: boolean) => void
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
          keys: atalhoRotulo(CAIXA_ATALHOS.finalizar),
          label: m.caixa.finalizar_venda,
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.novoCupom),
          label: m.caixa.novo_cupom || "Novo Cupom",
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Navegação",
      shortcuts: [
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.ajuda),
          label: m.caixa.atalho_ajuda,
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.buscar),
          label: "Buscar Produto",
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.focoProduto),
          label: m.caixa.pdv_tab_produto,
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.pagamento),
          label: m.caixa.pdv_tab_pgto,
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.cliente),
          label: m.caixa.selecionar_cliente_titulo,
          context: "Sempre disponível",
        },
        {
          keys: CAIXA_ATALHOS.metodoPagamento.map(atalhoRotulo).join(" / "),
          label: m.caixa.pdv_metodo_pagamento_titulo,
          context: `${m.caixa.pdv_metodo_pagamento_dinheiro} · ${m.caixa.pdv_metodo_pagamento_pix} · ${m.caixa.pdv_metodo_pagamento_credito} · ${m.caixa.pdv_metodo_pagamento_debito}`,
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.aplicarDesconto),
          label: "Aplicar desconto",
          context: "Drawer F3",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.consultaRapida),
          label: m.caixa.operacoes_consulta_rapida,
          context: "Sempre disponível",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.fecharCaixa),
          label: m.caixa.fechar,
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Operações",
      shortcuts: [
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.suprimento),
          label: m.caixa.suprimento,
          context: "Caixa aberto",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.sangria),
          label: m.caixa.sangria,
          context: "Caixa aberto",
        },
      ],
    },
    {
      category: "Edição",
      shortcuts: [
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.desfazerRemocao),
          label: "Desfazer Remoção",
          context: "Item removido",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.reimprimir),
          label: m.caixa.reimprimir_cupom || "Reimprimir Recibo",
          context: "Após finalizar venda",
        },
      ],
    },
    {
      category: "Gerente (PDV Clássico)",
      shortcuts: [
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.excluirVenda),
          label: m.caixa.cart_bar_excluir_venda || "Excluir Venda",
          context: "Apenas PDV clássico",
        },
        {
          keys: atalhoRotulo(CAIXA_ATALHOS.finalizarClassico),
          label: m.caixa.finalizar_venda,
          context: "Apenas PDV clássico",
        },
      ],
    },
  ]
}

export function CaixaKeyboardShortcutsReference({ m, variant = "default", className, open, onOpenChange }: Props) {
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
        onClick={() => onOpenChange(true)}
        title={m.caixa.atalho_ajuda}
        aria-label={m.caixa.atalho_ajuda}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <DragonModal
        open={open}
        onClose={() => onOpenChange(false)}
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
