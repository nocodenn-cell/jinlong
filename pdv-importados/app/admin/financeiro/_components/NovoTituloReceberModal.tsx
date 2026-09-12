'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePlus2 } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { criarTituloReceber } from '@/app/gerente/financeiro/actions'

/**
 * Lançamento manual de um título a receber.
 *
 * Antes vivia como um formulário permanentemente aberto no rodapé da lista,
 * competindo com os títulos existentes por atenção. Virou ação de cabeçalho,
 * como o "+ Incluir conta" do Bling — o lançamento manual é a exceção, não a
 * porta principal do módulo.
 *
 * A loja do título NÃO é escolhida aqui: `criarTituloReceber` a deriva do
 * próprio cliente selecionado (achado de review — usar a loja do ator gravava
 * título na loja errada para ADMIN multi-loja).
 */

type ClienteOpt = { id: string; nome: string }

type Props = Readonly<{
  idioma: Idioma
  clientes: ClienteOpt[]
  onClose: () => void
}>

export function NovoTituloReceberModal({ idioma, clientes, onClose }: Props) {
  const router = useRouter()
  const m = getMessages(idioma)
  const t = m.contas_receber

  const [clienteId, setClienteId] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const valorNum = Number(valor)
  const podeSalvar = Boolean(clienteId) && Number.isFinite(valorNum) && valorNum > 0

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!podeSalvar) {
      setErro(t.err_valor_positivo)
      return
    }
    startTransition(async () => {
      const r = await criarTituloReceber({
        cliente_id: clienteId,
        valor_total: valorNum,
        descricao: descricao.trim() || undefined,
        vencimento: vencimento || undefined,
      })
      if (!r.success) {
        setErro(r.error)
        return
      }
      emitGerenteToast({ kind: 'success', message: t.toast_criado })
      onClose()
      router.refresh()
    })
  }

  return (
    <DragonModal
      open
      onClose={onClose}
      title={t.novo_titulo}
      subtitle={t.novo_titulo_subtitulo}
      icon={FilePlus2}
      size="md"
      dismissable={!pending}
      closeLabel={m.comum.fechar}
      data-testid="novo-titulo-receber-modal"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="ar-novo-form" size="sm" disabled={pending || !podeSalvar}>
            {pending ? t.enviando : t.novo_salvar}
          </Button>
        </>
      }
    >
      {clientes.length === 0 ? (
        <div className="space-y-3 py-4 text-center">
          <p className="text-small text-fg-muted">{t.sem_clientes}</p>
          <Button asChild variant="secondary" size="sm">
            <Link href={ROUTES.admin.clientes}>{t.gerenciar_clientes}</Link>
          </Button>
        </div>
      ) : (
        <form id="ar-novo-form" onSubmit={submeter} className="admin-v2-stack">
          <div>
            <label htmlFor="ar-novo-cliente" className="mb-1 block text-caption font-medium text-fg-muted">
              {t.novo_cliente}
            </label>
            <select
              id="ar-novo-cliente"
              required
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value)
                setErro(null)
              }}
              className="fp-control w-full text-small"
            >
              <option value="">{t.novo_cliente_placeholder}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ar-novo-valor" className="mb-1 block text-caption font-medium text-fg-muted">
                {t.novo_valor}
              </label>
              <input
                id="ar-novo-valor"
                type="number"
                min={0.01}
                step="0.01"
                required
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value)
                  setErro(null)
                }}
                className="fp-control w-full text-small tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="ar-novo-venc" className="mb-1 block text-caption font-medium text-fg-muted">
                {t.novo_vencimento}
              </label>
              <input
                id="ar-novo-venc"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className="fp-control w-full text-small tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ar-novo-desc" className="mb-1 block text-caption font-medium text-fg-muted">
              {t.novo_descricao}
            </label>
            <input
              id="ar-novo-desc"
              type="text"
              maxLength={200}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={t.novo_descricao_placeholder}
              className="fp-control w-full text-small"
            />
          </div>

          {erro ? (
            <p role="alert" className="text-caption text-[var(--color-danger-strong)]">
              {erro}
            </p>
          ) : null}

          <Link
            href={ROUTES.admin.clientes}
            className="text-caption font-medium text-[var(--color-warning-strong)] hover:underline"
          >
            {t.gerenciar_clientes}
          </Link>
        </form>
      )}
    </DragonModal>
  )
}
