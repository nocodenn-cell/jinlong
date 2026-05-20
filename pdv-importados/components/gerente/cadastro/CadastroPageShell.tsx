'use client'

import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { CampoFiltro } from './FiltroLateralCadastro'
import { FiltroLateralCadastro } from './FiltroLateralCadastro'
import { CadastroRapidoBlock } from './CadastroRapidoBlock'
import { TabelaCadastroPadrao } from './TabelaCadastroPadrao'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import type { GerenteTableColumn } from '@/components/gerente/GerenteTable'

type Props = Readonly<{
  titulo: string
  novoLabel: string
  onNovo: () => void
  filtrosTitulo: string
  camposFiltro: CampoFiltro[]
  onFiltrar: () => void
  onLimpar: () => void
  labelFiltrar: string
  labelLimpar: string
  cadastroRapidoTitle: string
  cadastroRapidoSubtitle: string
  cadastroRapidoContent: ReactNode
  listaTitulo: string
  listaMeta: ReactNode
  colunas: GerenteTableColumn[]
  tableChildren: ReactNode
  modals?: ReactNode
}>

export function CadastroPageShell({
  titulo,
  novoLabel,
  onNovo,
  filtrosTitulo,
  camposFiltro,
  onFiltrar,
  onLimpar,
  labelFiltrar,
  labelLimpar,
  cadastroRapidoTitle,
  cadastroRapidoSubtitle,
  cadastroRapidoContent,
  listaTitulo,
  listaMeta,
  colunas,
  tableChildren,
  modals,
}: Props) {
  return (
    <>
      {modals}

      <GerenteStickyToolbar>
        <GerenteFilterBar
          title={titulo}
          rightSlot={
            <button
              type="button"
              onClick={onNovo}
              className="app-btn-accent inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              {novoLabel}
            </button>
          }
        />
      </GerenteStickyToolbar>

      <div className="grid gap-4 px-4 py-4 md:px-6 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-4">
          <FiltroLateralCadastro
            title={filtrosTitulo}
            campos={camposFiltro}
            onFiltrar={onFiltrar}
            onLimpar={onLimpar}
            labelFiltrar={labelFiltrar}
            labelLimpar={labelLimpar}
          />
          <CadastroRapidoBlock title={cadastroRapidoTitle} subtitle={cadastroRapidoSubtitle}>
            {cadastroRapidoContent}
          </CadastroRapidoBlock>
        </div>

        <div className="flex flex-col gap-3">
          <TabelaCadastroPadrao
            sectionTitle={listaTitulo}
            sectionMeta={listaMeta}
            columns={colunas}
            tone="dragon"
          >
            {tableChildren}
          </TabelaCadastroPadrao>
        </div>
      </div>
    </>
  )
}
