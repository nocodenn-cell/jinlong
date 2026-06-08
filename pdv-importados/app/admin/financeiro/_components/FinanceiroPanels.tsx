import { SectionCard } from '@/components/ui/admin-v2'
import { ContasReceberTable, type ContaLinha } from './ContasReceberTable'

type FinanceiroPanelsProps = {
  contas: ContaLinha[]
}

const filaFiscalPlaceholder = [
  { id: 'NFCE-10241', status: 'Em validacao', quando: 'ha 2 min' },
  { id: 'NFE-8841', status: 'Aguardando envio', quando: 'ha 7 min' },
  { id: 'NFCE-10238', status: 'Pronto para emissao', quando: 'ha 15 min' },
]

const docsFiscaisPlaceholder = [
  { doc: 'NF-e 8841', serie: '1', valor: 'R$ 1.240,00', situacao: 'Pendente' },
  { doc: 'NFC-e 10241', serie: '1', valor: 'R$ 198,50', situacao: 'Validando' },
  { doc: 'NFC-e 10238', serie: '1', valor: 'R$ 86,90', situacao: 'A emitir' },
]

export function FinanceiroPanels({ contas }: FinanceiroPanelsProps) {
  return (
    <div className="admin-v2-grid-2">
      <SectionCard title="Titulos em aberto">
        <ContasReceberTable contas={contas} />
      </SectionCard>

      <div className="admin-v2-stack">
        <SectionCard title="Fila fiscal">
          <ul className="space-y-2">
            {filaFiscalPlaceholder.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-[#242424] bg-[#111111] px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-jl-fg-1">{item.id}</p>
                  <p className="text-[11px] text-jl-fg-3">{item.quando}</p>
                </div>
                <span className="admin-v2-badge-muted rounded-full px-2 py-1 text-[11px]">{item.status}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Documentos fiscais"
          action={
            <button type="button" className="admin-v2-btn-secondary" disabled>
              Emitir selecionados (em breve)
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#242424] text-left text-jl-fg-3">
                  <th className="px-2 py-2 font-medium">Documento</th>
                  <th className="px-2 py-2 font-medium">Serie</th>
                  <th className="px-2 py-2 font-medium">Valor</th>
                  <th className="px-2 py-2 font-medium">Situacao</th>
                </tr>
              </thead>
              <tbody>
                {docsFiscaisPlaceholder.map((row) => (
                  <tr key={row.doc} className="border-b border-[#242424]">
                    <td className="px-2 py-2 text-jl-fg-1">{row.doc}</td>
                    <td className="px-2 py-2 text-jl-fg-2">{row.serie}</td>
                    <td className="px-2 py-2 text-jl-fg-1">{row.valor}</td>
                    <td className="px-2 py-2 text-jl-fg-2">{row.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
