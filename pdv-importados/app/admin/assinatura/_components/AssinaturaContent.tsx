'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { calcularValorMensal, formatarBRL, type PlanoCatalogo } from '@/lib/cobranca/planos'
import { tc, type ChaveTexto } from '@/lib/cobranca/textos'
import { assinarPlanoAction, cancelarAssinaturaAction, pixDaFaturaAction, type Fatura, type MinhaAssinatura } from '../actions'

type Props = { idioma: string; assinatura: MinhaAssinatura | null; planos: PlanoCatalogo[]; faturas: Fatura[]; podeGerenciar: boolean }

export function AssinaturaContent({ idioma, assinatura, planos, faturas, podeGerenciar }: Props) {
  const t = (k: ChaveTexto) => tc(idioma, k)
  const router = useRouter()
  const [pend, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [pix, setPix] = useState<{ payload: string; imagemBase64: string } | null>(null)
  const [plano, setPlano] = useState(assinatura?.plano ?? 'ATACADO')
  const [fiscal, setFiscal] = useState(assinatura?.addons?.includes('FISCAL') ?? false)
  const [lojas, setLojas] = useState(assinatura?.qtd_lojas ?? 1)
  const [caixas, setCaixas] = useState(assinatura?.qtd_caixas ?? 1)
  const [forma, setForma] = useState<'PIX' | 'BOLETO' | 'CARTAO'>((assinatura?.forma_pagamento as 'PIX') ?? 'PIX')

  const calc = useMemo(() => {
    try { return calcularValorMensal(planos, plano, fiscal ? ['FISCAL'] : [], lojas, caixas) } catch { return null }
  }, [planos, plano, fiscal, lojas, caixas])
  const placeholder = planos.some((p) => p.preco_placeholder)
  const f = assinatura?.proxima_fatura ?? null
  const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString(idioma === 'zh' ? 'zh-CN' : 'pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

  if (assinatura?.legado) {
    return <main className="mx-auto max-w-2xl p-6"><h1 className="text-xl font-semibold">{t('titulo')}</h1><p className="mt-2 text-sm">{t('legado')}</p></main>
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('titulo')}</h1>
      {msg ? <p role="status" className="rounded border bg-gray-50 p-2 text-sm">{msg}</p> : null}

      <section className="grid gap-2 rounded border p-4 text-sm sm:grid-cols-2">
        <div><b>{t('plano')}:</b> {assinatura?.plano ?? '—'}{assinatura?.addons?.length ? ` + ${assinatura.addons.join(', ')}` : ''}</div>
        <div><b>{t('status')}:</b> {assinatura?.status ? t(`status_${assinatura.status}` as ChaveTexto) : '—'}</div>
        {assinatura?.status === 'TRIAL' ? <div><b>{t('trialAte')}:</b> {fmtData(assinatura.trial_fim)}</div> : null}
        {assinatura?.valor_mensal_centavos != null ? <div><b>{t('total')}:</b> {formatarBRL(assinatura.valor_mensal_centavos)}</div> : null}
        <div><b>{t('lojasPermitidas')}:</b> {assinatura?.lojas_ativas ?? '—'} / {assinatura?.qtd_lojas ?? '—'}</div>
        <div><b>{t('proximaCobranca')}:</b> {fmtData(assinatura?.proximo_vencimento ?? null)}</div>
      </section>
      {assinatura?.aviso_vencimento ? (
        <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
          {t('avisoSuspensao')}: {fmtData(assinatura.suspensao_prevista_em)} · {t('somenteLeitura')}
        </p>
      ) : null}

      <section className="rounded border p-4 text-sm">
        <h2 className="font-semibold">{t('proximaFatura')}</h2>
        {f ? (
          <div className="mt-2 space-y-2">
            <div>{formatarBRL(f.valor_centavos)} · {t('vencimento')}: {fmtData(f.vencimento)} · {f.status}</div>
            <div className="flex flex-wrap gap-2">
              {f.link_pagamento ? <a className="rounded bg-red-700 px-3 py-1.5 text-white" href={f.link_pagamento} target="_blank" rel="noreferrer">{t('pagar')}</a> : null}
              {podeGerenciar ? (
                <button type="button" className="rounded border px-3 py-1.5" disabled={pend}
                  onClick={() => start(async () => { const r = await pixDaFaturaAction(f.asaas_payment_id); if (r.ok) setPix(r.data); else setMsg(r.error) })}>
                  Pix
                </button>
              ) : null}
            </div>
            {pix ? (
              <div className="space-y-1">
                {pix.imagemBase64 ? <img alt="QR Code Pix" className="h-48 w-48" src={`data:image/png;base64,${pix.imagemBase64}`} /> : null}
                <label className="block text-xs">{t('pixCopiaCola')}<textarea readOnly className="mt-1 w-full rounded border p-1 font-mono text-xs" value={pix.payload} /></label>
              </div>
            ) : null}
          </div>
        ) : <p className="mt-2 text-gray-600">{t('semFatura')}</p>}
      </section>


      <section className="rounded border p-4 text-sm">
        <h2 className="font-semibold">{t('historico')}</h2>
        {faturas.length === 0 ? <p className="mt-2 text-gray-600">{t('semFatura')}</p> : (
          <table className="mt-2 w-full text-left">
            <tbody>
              {faturas.map((x) => (
                <tr key={x.id} className="border-t">
                  <td className="py-1">{fmtData(x.vencimento)}</td>
                  <td>{formatarBRL(x.valor_centavos)}</td>
                  <td>{t(({ PAGA: 'pago', PENDENTE: 'pendente', VENCIDA: 'vencida', CANCELADA: 'cancelada', ESTORNADA: 'estornada' } as Record<string, ChaveTexto>)[x.status] ?? 'pendente')}</td>
                  <td>{x.link_pagamento && x.status !== 'PAGA' ? <a className="underline" href={x.link_pagamento} target="_blank" rel="noreferrer">{t('regularizar')}</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {podeGerenciar ? (
        <section className="space-y-3 rounded border p-4 text-sm">
          <h2 className="font-semibold">{assinatura?.status === 'ATIVA' ? t('trocarPlano') : t('assinar')}</h2>
          {placeholder ? <p className="text-xs text-amber-700">{t('precoProvisorio')}</p> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {planos.filter((p) => p.tipo === 'PLANO').map((p) => (
              <label key={p.codigo} className={`cursor-pointer rounded border p-3 ${plano === p.codigo ? 'border-red-700 ring-1 ring-red-700' : ''}`}>
                <input type="radio" name="plano" className="sr-only" checked={plano === p.codigo} onChange={() => setPlano(p.codigo)} />
                <div className="font-medium">{p.nome}</div>
                <div>{formatarBRL(p.preco_loja_centavos)} / {t('lojas').toLowerCase()}</div>
                <div className="text-xs text-gray-600">{p.recursos.join(' · ')}</div>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fiscal} onChange={(e) => setFiscal(e.target.checked)} /> Fiscal (NFC-e/NF-e)</label>
          <div className="flex flex-wrap gap-4">
            <label>{t('lojas')} <input type="number" min={1} className="ml-1 w-20 rounded border p-1" value={lojas} onChange={(e) => setLojas(Number(e.target.value) || 1)} /></label>
            <label>{t('caixas')} <input type="number" min={1} className="ml-1 w-20 rounded border p-1" value={caixas} onChange={(e) => setCaixas(Number(e.target.value) || 1)} /></label>
            <label>{t('forma')} <select className="ml-1 rounded border p-1" value={forma} onChange={(e) => setForma(e.target.value as 'PIX')}>
              <option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARTAO">Cartão / 信用卡</option>
            </select></label>
          </div>
          <div><b>{t('total')}:</b> {calc ? formatarBRL(calc.totalCentavos) : '—'}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pend || !calc} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
              onClick={() => start(async () => {
                const r = await assinarPlanoAction({ plano: plano as 'BASICO', addons: fiscal ? ['FISCAL'] : [], qtdLojas: lojas, qtdCaixas: caixas, forma })
                setMsg(r.ok ? `OK · ${formatarBRL(r.data.valorCentavos)} · ${t('vencimento')}: ${fmtData(r.data.proximoVencimento)}` : r.error)
                router.refresh()
              })}>
              {assinatura?.status === 'ATIVA' ? t('trocarPlano') : t('assinar')}
            </button>
            {assinatura?.status && assinatura.status !== 'CANCELADA' ? (
              <button type="button" disabled={pend} className="rounded border border-red-700 px-4 py-2 text-red-700"
                onClick={() => { if (!window.confirm(t('confirmarCancelar'))) return; start(async () => { const r = await cancelarAssinaturaAction(); setMsg(r.ok ? 'OK' : r.error); router.refresh() }) }}>
                {t('cancelar')}
              </button>
            ) : null}
          </div>
        </section>
      ) : <p className="text-sm text-gray-600">{t('somenteDono')}</p>}
    </main>
  )
}
