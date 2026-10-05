/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { FinanceiroPrimeiroUso } from './FinanceiroPrimeiroUso'
import { FinanceiroContent } from './FinanceiroContent'
import { FINANCEIRO_TABS } from './financeiroTabs'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/financeiro', useSearchParams: () => new URLSearchParams('q=cliente&de=2026-10-01'), useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('./FinanceiroReceberExtras', () => ({ FinanceiroReceberExtras: () => null }))
vi.mock('./FinanceiroWorkspace', () => ({ FinanceiroPaginacao: () => null }))
vi.mock('./FinanceiroTitulosOperations', () => ({ FinanceiroTitulosOperations: () => null }))
vi.mock('./DocumentoFiscalDetailSheet', () => ({ DocumentoFiscalDetailSheet: ({ documentoId }: { documentoId: string | null }) => documentoId ? <div role="dialog">{documentoId}</div> : null }))
vi.mock('@/app/gerente/financeiro/contas-pagar/ContasPagarListClient', () => ({ ContasPagarListClient: () => null }))

let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { container=document.createElement('div');document.body.appendChild(container);root=createRoot(container) })
afterEach(() => { flushSync(() => root.unmount());container.remove() })

const props = {
 contas: [], fiscal: [{ id:'documento-pendente',tipoDoc:'NFC-e',status:'PENDENTE',criadoEm:null }],
 contasLabels: { vazioTitulo:'Sem títulos',vazioSub:'Nenhum título',locale:'pt-BR' },
 panelLabels: { titulosEmAberto:'Títulos',filaFiscal:'Fila fiscal',filaFiscalVazioTitulo:'Sem documentos',filaFiscalVazioSub:'Nenhum pendente',fiscalStubTitulo:'Fiscal em preparação',fiscalStubSub:'Ainda indisponível',locale:'pt-BR' },
 clientesOpts: [],actorLojaId:'loja-a',caixasAbertos: [],
 contasPagar: { idioma:'pt',locale:'pt-BR',contasIniciais: [],hasMoreInicial:false,fornecedoresOpts: [],statusInicial:'',periodoInicial:'' },
 filterSection:null,kpiSection:null,
} as Omit<React.ComponentProps<typeof FinanceiroContent>, 'activeTab'>

it('A receber não repete a fila; Fiscal mantém o documento e abre seu detalhe', () => {
 flushSync(() => root.render(<AdminV2SessionProvider idioma="pt"><FinanceiroContent {...props} activeTab="receber" /></AdminV2SessionProvider>))
 expect(container.textContent).not.toContain('NFC-e')
 expect(container.querySelector('h2')?.textContent).toBe('Títulos')
 flushSync(() => root.render(<AdminV2SessionProvider idioma="pt"><FinanceiroContent {...props} activeTab="fiscal" /></AdminV2SessionProvider>))
 const button=Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('NFC-e'))
 expect(button).toBeDefined()
 flushSync(() => button!.click())
 expect(container.querySelector('[role=dialog]')?.textContent).toBe('documento-pendente')
})

it('navegação mostra a ordem operacional e preserva apenas os filtros próprios de cada aba', () => {
 flushSync(() => root.render(<AdminV2SessionProvider idioma="pt"><FinanceiroContent {...props} activeTab="receber" /></AdminV2SessionProvider>))
 const links=Array.from(container.querySelectorAll('nav a'))
 expect(links.map(a => a.textContent)).toEqual(['Resumo','A receber','A pagar','Contas e movimentos','PIX e cartões','Conciliação','Resultado','Fiscal','Categorias'])
 expect(links[1].getAttribute('aria-current')).toBe('page')
 expect(links[1].getAttribute('href')).toContain('q=cliente')
 expect(links[3].getAttribute('href')).toContain('de=2026-10-01')
 expect(links[3].getAttribute('href')).not.toContain('q=cliente')
 expect(FINANCEIRO_TABS.map(t => t.id)).toEqual(links.slice(0,8).map(a => new URL(a.getAttribute('href')!, 'https://local.test').searchParams.get('tab')))
})

it.each(['pt','zh'] as const)('primeiro uso em %s orienta saldo, reservas, despesas e taxas sem fazer lançamentos', idioma => {
 flushSync(() => root.render(<AdminV2SessionProvider idioma={idioma}><FinanceiroPrimeiroUso semContas /></AdminV2SessionProvider>))
 expect(container.textContent).toContain(idioma==='pt' ? 'Saldo inicial não é receita' : '期初余额不是收入')
 expect(container.textContent).toContain(idioma==='pt' ? 'aluguel' : '房租')
 expect(container.textContent).toContain(idioma==='pt' ? 'taxas' : '手续费')
 expect(container.querySelector(`a[href="${ROUTES.admin.financeiro}?tab=contas"]`)).not.toBeNull()
 expect(container.querySelector('form')).toBeNull()
 flushSync(() => root.render(<AdminV2SessionProvider idioma={idioma}><FinanceiroPrimeiroUso semContas={false} /></AdminV2SessionProvider>))
 expect(container.textContent).toBe('')
})
