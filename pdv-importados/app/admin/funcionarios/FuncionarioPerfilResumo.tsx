'use client'

import { useState } from 'react'
import { listarRotasPainelDoPerfil } from '@/lib/admin/policy/adminPolicy'
import { destinoPosLoginPorPerfil, isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { ROUTES } from '@/lib/navigation/routes'
import { podeAtribuirPerfil, podeEditarAlvo, type PerfilFuncionarioUi } from './funcionarioPolicies'

export type PerfilResumoLabels = {
  verPermissoes: string
  ocultarPermissoes: string
  introOperador: string
  introGerente: string
  destinoLabel: string
  semPainel: string
  rotasLabel: string
  tambemPdv: string
  gerenteNaoEditaGerente: string
  atribuidoPor: string
  perfilOperador: string
  perfilGerente: string
  perfilDono: string
  perfilAdmin: string
}

type Props = {
  perfil: PerfilFuncionarioUi
  labels: PerfilResumoLabels
}

const ATORES = ['GERENTE', 'DONO', 'ADMIN'] as const

export function FuncionarioPerfilResumo({ perfil, labels: L }: Props) {
  const [aberto, setAberto] = useState(false)
  const destino = destinoPosLoginPorPerfil(perfil, {
    caixaHome: ROUTES.caixa.home,
    adminDashboard: ROUTES.admin.dashboard,
  })
  const rotas = listarRotasPainelDoPerfil(perfil)
  const intro = perfil === 'OPERADOR' ? L.introOperador : L.introGerente
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-caption" data-testid="funcionario-perfil-resumo">
      <p className="text-fg">{intro}</p>
      <p className="mt-1 text-fg-muted">{L.destinoLabel}: {destino}</p>
      {isPerfilPainelGerencial(perfil) ? <p className="mt-1 text-fg-muted">{L.tambemPdv}</p> : null}
      {mostrarLimiteGerente(perfil) ? <p className="mt-1 text-fg-muted">{L.gerenteNaoEditaGerente}</p> : null}
      <p className="mt-1 text-fg-muted">{L.atribuidoPor.replace('{perfis}', quemAtribui(perfil, L))}</p>
      <button type="button" className="mt-2 font-medium text-brand" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {aberto ? L.ocultarPermissoes : L.verPermissoes}
      </button>
      {aberto ? <ListaRotas rotas={rotas} rotulo={L.rotasLabel} vazio={L.semPainel} /> : null}
    </div>
  )
}

function mostrarLimiteGerente(perfil: PerfilFuncionarioUi): boolean {
  if (perfil !== 'GERENTE') return false
  return !podeEditarAlvo({ id: 'ator', perfil: 'GERENTE' }, { id: 'alvo', perfil: 'GERENTE' })
}

function quemAtribui(perfil: PerfilFuncionarioUi, L: PerfilResumoLabels): string {
  const nomes = ATORES.filter((ator) => podeAtribuirPerfil(ator, perfil)).map((ator) => nomePerfil(ator, L))
  return nomes.join(', ')
}

function nomePerfil(perfil: string, L: PerfilResumoLabels): string {
  if (perfil === 'OPERADOR') return L.perfilOperador
  if (perfil === 'GERENTE') return L.perfilGerente
  if (perfil === 'DONO') return L.perfilDono
  return L.perfilAdmin
}

function ListaRotas({ rotas, rotulo, vazio }: { rotas: string[]; rotulo: string; vazio: string }) {
  if (rotas.length === 0) return <p className="mt-2 text-fg-muted">{vazio}</p>
  return (
    <div className="mt-2">
      <p className="font-medium text-fg">{rotulo}</p>
      <ul className="mt-1 list-disc pl-4 text-fg-muted">
        {rotas.map((rota) => (
          <li key={rota}>{rota}</li>
        ))}
      </ul>
    </div>
  )
}
