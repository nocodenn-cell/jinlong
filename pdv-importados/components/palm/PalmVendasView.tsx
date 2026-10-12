'use client'

import Image from 'next/image'
import type { Mensagens } from '@/i18n/getMessages'
import { caixaFmt } from '@/app/caixa/caixaI18n'
import { formatDecimalBRL } from '@/lib/format/money'
import type { MeuPedidoPalm, ProdutoPalm } from '@/app/palm/domain/tiposPalm'

export type LinhaRascunho = {
  produtoId: string
  nome: string
  quantidade: number
  precoUnitario: number
  tipo: 'VAREJO' | 'ATACADO'
  quantidadeMinima: number | null
}

export type ClienteOpcao = { id: string; nome: string }

type Props = {
  m: Mensagens
  busca: string
  onBusca: (valor: string) => void
  onBuscar: () => void
  onAbrirCamera: () => void
  produtos: ProdutoPalm[]
  produtoId: string | null
  onEscolherProduto: (id: string) => void
  quantidade: number
  onQuantidade: (valor: number) => void
  onAdicionar: () => void
  linhas: LinhaRascunho[]
  onAlterarQtd: (produtoId: string, quantidade: number) => void
  onRemover: (produtoId: string) => void
  total: number
  clienteBusca: string
  onClienteBusca: (valor: string) => void
  onBuscarCliente: () => void
  clientes: ClienteOpcao[]
  clienteNome: string | null
  onEscolherCliente: (id: string | null) => void
  onEnviar: () => void
  enviando: boolean
  confirmacao: string | null
  erro: string | null
  historico: MeuPedidoPalm[]
  onCancelar: (id: string) => void
  motivo: string
  onMotivo: (valor: string) => void
}

export function PalmVendasView(props: Props) {
  const { m } = props
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="palm-vendas">
      <section className="flex flex-col gap-3">
        <h1 className="text-base font-semibold">{m.palm.vendas_titulo}</h1>
        <Busca m={m} busca={props.busca} onBusca={props.onBusca} onBuscar={props.onBuscar} onAbrirCamera={props.onAbrirCamera} />
        <ListaProdutos {...props} />
        {props.erro ? <p className="text-sm text-destructive" role="alert">{props.erro}</p> : null}
        {props.confirmacao ? <p className="text-sm font-medium" role="status">{props.confirmacao}</p> : null}
      </section>
      <section className="flex flex-col gap-3">
        <Pedido {...props} />
        <Historico {...props} />
      </section>
    </div>
  )
}

function Busca({ m, busca, onBusca, onBuscar, onAbrirCamera }: Pick<Props, 'm' | 'busca' | 'onBusca' | 'onBuscar' | 'onAbrirCamera'>) {
  return (
    <form className="flex flex-col gap-2" onSubmit={(evento) => { evento.preventDefault(); onBuscar() }}>
      <label className="text-sm" htmlFor="palm-busca">{m.palm.busca_placeholder}</label>
      <input id="palm-busca" value={busca} onChange={(evento) => onBusca(evento.target.value)} className="min-h-11 w-full rounded-md border border-border px-3" />
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" className="min-h-11 rounded-md bg-primary px-3 text-primary-foreground">{m.palm.buscar}</button>
        <button type="button" className="min-h-11 rounded-md border border-border px-3" onClick={onAbrirCamera}>{m.palm.ler_camera}</button>
      </div>
    </form>
  )
}

function ListaProdutos(props: Props) {
  const { m, produtos, produtoId, onEscolherProduto, quantidade, onQuantidade, onAdicionar } = props
  if (produtos.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {produtos.map((produto) => (
        <li key={produto.id}>
          <ProdutoCard m={m} produto={produto} ativo={produto.id === produtoId} onEscolher={() => onEscolherProduto(produto.id)} quantidade={quantidade} onQuantidade={onQuantidade} onAdicionar={onAdicionar} />
        </li>
      ))}
    </ul>
  )
}

function ProdutoCard({
  m, produto, ativo, onEscolher, quantidade, onQuantidade, onAdicionar,
}: {
  m: Mensagens
  produto: ProdutoPalm
  ativo: boolean
  onEscolher: () => void
  quantidade: number
  onQuantidade: (valor: number) => void
  onAdicionar: () => void
}) {
  return (
    <article className={`rounded-xl border p-3 ${ativo ? 'border-primary' : 'border-border'}`}>
      <button type="button" className="flex w-full gap-3 text-left" onClick={onEscolher}>
        {produto.imagem ? (
          <Image src={produto.imagem} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-md object-cover" />
        ) : <span className="h-16 w-16 rounded-md bg-muted" />}
        <span>
          <span className="block font-medium">{produto.nome}</span>
          {produto.descricao ? <span className="block text-sm text-muted-foreground">{produto.descricao}</span> : null}
          <span className="block text-sm">{m.palm.codigo}: {produto.codigo ?? '—'}</span>
          <span className="block text-sm">{m.palm.localizacao}: {produto.localizacao ?? m.palm.sem_localizacao}</span>
        </span>
      </button>
      <p className="mt-2 text-sm">
        {m.palm.varejo}: {produto.precoVarejo == null ? '—' : `${m.palm.moeda} ${formatDecimalBRL(produto.precoVarejo)}`}
        {' · '}
        {produto.precoAtacado == null
          ? m.palm.sem_atacado
          : `${m.palm.atacado} ${m.palm.moeda} ${formatDecimalBRL(produto.precoAtacado)} (${caixaFmt(m.palm.qtd_minima, { n: produto.atacadoMinimo ?? 0 })})`}
      </p>
      <p className={`text-sm ${produto.baixo ? 'font-semibold text-destructive' : ''}`}>
        {produto.estoque == null ? m.palm.sem_saldo : caixaFmt(m.palm.disponivel, { n: produto.estoque })}
        {produto.baixo ? ` · ${m.palm.estoque_baixo}` : ''}
      </p>
      {ativo ? (
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor={`qtd-${produto.id}`}>{m.palm.quantidade}</label>
          <input id={`qtd-${produto.id}`} inputMode="numeric" min={1} value={quantidade} onChange={(evento) => onQuantidade(Number(evento.target.value))} className="min-h-11 w-24 rounded-md border border-border px-3" />
          <button type="button" className="min-h-11 flex-1 rounded-md bg-primary px-3 text-primary-foreground" onClick={onAdicionar}>{m.palm.adicionar}</button>
        </div>
      ) : null}
    </article>
  )
}

function Pedido(props: Props) {
  const { m, linhas, onAlterarQtd, onRemover, total, onEnviar, enviando } = props
  return (
    <div className="rounded-xl border border-border p-3">
      <h2 className="font-semibold">{m.palm.itens}</h2>
      {linhas.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{m.palm.vazio}</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {linhas.map((linha) => (
          <li key={linha.produtoId} className="flex items-center justify-between gap-2 text-sm">
            <span>{linha.nome}</span>
            <span className="flex items-center gap-2">
              <input aria-label={m.palm.quantidade} inputMode="numeric" min={1} value={linha.quantidade} onChange={(evento) => onAlterarQtd(linha.produtoId, Number(evento.target.value))} className="min-h-11 w-16 rounded-md border border-border px-2" />
              <span>{m.palm.moeda} {formatDecimalBRL(linha.precoUnitario)}</span>
              <button type="button" className="min-h-11 text-destructive" onClick={() => onRemover(linha.produtoId)}>{m.palm.remover}</button>
            </span>
          </li>
        ))}
      </ul>
      <Cliente {...props} />
      <p className="mt-3 text-base font-semibold">{m.palm.total}: {m.palm.moeda} {formatDecimalBRL(total)}</p>
      <button type="button" disabled={enviando || linhas.length === 0} className="mt-2 min-h-11 w-full rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50" onClick={onEnviar}>
        {enviando ? m.palm.enviando : m.palm.enviar}
      </button>
    </div>
  )
}

function Cliente(props: Props) {
  const { m, clienteBusca, onClienteBusca, onBuscarCliente, clientes, clienteNome, onEscolherCliente } = props
  return (
    <div className="mt-3">
      <label className="text-sm" htmlFor="palm-cliente">{m.palm.cliente}</label>
      <div className="mt-1 flex gap-2">
        <input id="palm-cliente" value={clienteBusca} onChange={(evento) => onClienteBusca(evento.target.value)} placeholder={m.palm.cliente_placeholder} className="min-h-11 w-full rounded-md border border-border px-3" />
        <button type="button" className="min-h-11 rounded-md border border-border px-3" onClick={onBuscarCliente}>{m.palm.buscar}</button>
      </div>
      {clienteNome ? <button type="button" className="mt-1 text-sm underline" onClick={() => onEscolherCliente(null)}>{m.palm.cliente_limpar}: {clienteNome}</button> : null}
      <ul>
        {clientes.map((cliente) => (
          <li key={cliente.id}>
            <button type="button" className="min-h-11 text-sm" onClick={() => onEscolherCliente(cliente.id)}>{cliente.nome}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Historico(props: Props) {
  const { m, historico, onCancelar, motivo, onMotivo } = props
  return (
    <div>
      <h2 className="font-semibold">{m.palm.historico}</h2>
      {historico.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{m.palm.historico_vazio}</p> : null}
      <label className="mt-2 block text-sm" htmlFor="palm-motivo">{m.palm.motivo}</label>
      <input id="palm-motivo" value={motivo} onChange={(evento) => onMotivo(evento.target.value)} placeholder={m.palm.motivo_placeholder} className="mt-1 min-h-11 w-full rounded-md border border-border px-3" />
      <ul className="mt-2 flex flex-col gap-2">
        {historico.map((pedido) => (
          <li key={pedido.id} className="rounded-md border border-border p-2 text-sm">
            <span>#{pedido.numeroLocal} · {rotuloStatus(m, pedido.status)} · {m.palm.moeda} {formatDecimalBRL(pedido.total)}</span>
            {pedido.status === 'EM_ESPERA' || pedido.status === 'RETOMADA' ? (
              <button type="button" className="mt-1 block min-h-11 text-destructive" onClick={() => onCancelar(pedido.id)}>{m.palm.cancelar}</button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function rotuloStatus(m: Mensagens, status: string): string {
  if (status === 'EM_ESPERA') return m.palm.status_EM_ESPERA
  if (status === 'RETOMADA') return m.palm.status_RETOMADA
  if (status === 'CONVERTIDA') return m.palm.status_CONVERTIDA
  if (status === 'DESCARTADA') return m.palm.status_DESCARTADA
  return status
}
