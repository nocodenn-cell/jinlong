"use client"

import { useCallback, useState } from "react"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/forms"
import { ErrorState } from "@/components/ui/feedback"
import type { Mensagens } from "@/i18n/getMessages"
import { criarClienteRelampagoPdv } from "@/app/caixa/actions"

type Props = {
  m: Mensagens
  /** Nome do cliente vinculado à venda atual; `null` = Consumidor Final (padrão). */
  clienteNome: string | null
  onClienteCriado: (payload: { id: string; nome: string }) => void
}

export function CaixaClienteTab({ m, clienteNome, onClienteCriado }: Props) {
  const [formAberto, setFormAberto] = useState(false)
  const [nome, setNome] = useState("")
  const [documento, setDocumento] = useState("")
  const [celular, setCelular] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setNome("")
    setDocumento("")
    setCelular("")
    setErro(null)
    setFormAberto(false)
  }, [])

  const handleSalvar = useCallback(async () => {
    setErro(null)
    if (nome.trim().length < 2) {
      setErro(m.caixa.pdv_cliente_nome_obrigatorio)
      return
    }
    setSalvando(true)
    try {
      const res = await criarClienteRelampagoPdv({ nome, documento, celular })
      if (!res.success) {
        setErro(res.error)
        return
      }
      onClienteCriado(res.data)
      resetForm()
    } finally {
      setSalvando(false)
    }
  }, [nome, documento, celular, m, onClienteCriado, resetForm])

  return (
    <section
      role="tabpanel"
      aria-label={m.caixa.pdv_tab_aria_cliente}
      className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {m.caixa.pdv_cliente_cupom_titulo}
        </span>
        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
          {clienteNome ?? m.caixa.pdv_cliente_consumidor_final}
        </div>
      </div>

      {!formAberto ? (
        <button
          type="button"
          onClick={() => setFormAberto(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          {m.caixa.pdv_cliente_cadastrar_novo_btn}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3" data-caixa-atalho-bloqueado="true">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {m.caixa.pdv_cliente_cadastro_rapido_titulo}
          </span>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {m.caixa.pdv_cliente_nome_completo_label} *
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={salvando}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {m.caixa.pdv_cliente_documento_label} *
              <Input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                disabled={salvando}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {m.caixa.pdv_cliente_celular_label}
              <Input
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                disabled={salvando}
              />
            </label>
          </div>
          {erro ? <ErrorState dense description={erro} /> : null}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={resetForm} disabled={salvando} className="flex-1">
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSalvar()}
              disabled={salvando}
              loading={salvando}
              className="flex-1"
            >
              {m.caixa.pdv_cliente_salvar_btn}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
