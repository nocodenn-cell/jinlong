import Image from 'next/image'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { Mensagens } from '@/i18n/getMessages'
import { formatBRL } from '@/lib/format/money'
import { interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import { cn } from '@/lib/utils'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

function origemTexto(p: ProdutoGerenteRow, mp: Mensagens['produtos']): string {
  if (p.origem === 'china_manual') return mp.origem_china
  return mp.origem_brasil_nf
}

export type ProdutosListaImpressaoProps = Readonly<{
  className?: string
  rows: readonly ProdutoGerenteRow[]
  m: Mensagens
  idioma: Idioma
}>

/**
 * Conteúdo só visível na impressão: tabela com todos os produtos do conjunto filtrado
 * (sem paginação), texto preto sobre branco para leitura em papel.
 */
export function ProdutosListaImpressao({ className, rows, m, idioma }: ProdutosListaImpressaoProps) {
  const p = m.produtos
  const locale = idioma === 'pt' ? 'pt-BR' : 'zh-CN'
  const dataStr = new Date().toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div
      className={cn(
        'hidden min-h-screen bg-white p-6 text-[11px] text-black print:block',
        className,
      )}
    >
      <header className="mb-4 border-b border-neutral-300 pb-3">
        <h1 className="text-base font-bold tracking-tight text-black">{p.print_titulo}</h1>
        <p className="mt-1 text-[10px] text-neutral-700">
          {interpolateTemplate(p.print_gerado_em, {
            data: dataStr,
            count: String(rows.length),
          })}
        </p>
      </header>
      <table className="w-full border-collapse border border-neutral-400">
        <thead>
          <tr className="bg-neutral-100 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-800">
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.print_col_id}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.foto_coluna}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.nome}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.codigo_barras}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5 text-right">{p.preco_varejo}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.origem_label}</th>
            <th className="border border-neutral-400 px-1.5 py-1.5">{p.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="break-inside-avoid">
              <td className="border border-neutral-400 px-1.5 py-1 font-mono text-[10px] text-neutral-800">
                {row.id}
              </td>
              <td className="border border-neutral-400 px-1 py-1 text-center align-middle">
                {row.imagem_url ? (
                  <Image
                    src={row.imagem_url}
                    alt=""
                    width={36}
                    height={36}
                    className="mx-auto max-h-9 max-w-[2.25rem] rounded object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </td>
              <td className="border border-neutral-400 px-1.5 py-1 font-medium text-neutral-900">{row.nome}</td>
              <td className="border border-neutral-400 px-1.5 py-1 font-mono text-[10px]">
                {row.codigo_barras ?? '—'}
              </td>
              <td className="border border-neutral-400 px-1.5 py-1 text-right tabular-nums">
                {formatBRL(Number(row.preco_varejo), locale)}
              </td>
              <td className="border border-neutral-400 px-1.5 py-1">{origemTexto(row, p)}</td>
              <td className="border border-neutral-400 px-1.5 py-1">
                {row.ativo ? p.ativo : p.inativo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
