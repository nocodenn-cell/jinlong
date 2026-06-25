'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { toggleAtivoUsuario } from '../actions'
import { CriarUsuarioModal } from './CriarUsuarioModal'
import { cn } from '@/lib/utils'

export type UsuarioLinha = {
  id: string
  nome: string
  perfil: string
  idioma_preferido: string
  ativo: boolean
  created_at: string
  loja_nome: string | null
}

export type LojaOpcao = { id: string; nome: string }

const PERFIL_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  DONO: 'Dono',
  GERENTE: 'Gerente',
  OPERADOR: 'Operador',
}

function PerfilPill({ perfil }: { perfil: string }) {
  const cls =
    perfil === 'DONO'
      ? 'admin-v2-badge-success'
      : perfil === 'GERENTE'
        ? 'admin-v2-badge-warning'
        : perfil === 'OPERADOR'
          ? 'admin-v2-badge-info'
          : 'admin-v2-badge-muted'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-[2px] text-[11px] font-medium leading-none',
        cls,
      )}
    >
      {PERFIL_LABEL[perfil] ?? perfil}
    </span>
  )
}

function ToggleBtn({
  usuario,
  onToggle,
}: {
  usuario: UsuarioLinha
  onToggle: (id: string, ativo: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle(usuario.id, usuario.ativo)
      }}
      className={cn(
        'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
        usuario.ativo
          ? 'text-red-400 hover:bg-red-400/10'
          : 'text-emerald-400 hover:bg-emerald-400/10',
      )}
    >
      {usuario.ativo ? 'Desativar' : 'Ativar'}
    </button>
  )
}

export function UsuariosTable({
  usuarios,
  lojas,
}: {
  usuarios: UsuarioLinha[]
  lojas: LojaOpcao[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [criarAberto, setCriarAberto] = useState(false)

  const handleToggle = (id: string, ativoAtual: boolean) => {
    setErro(null)
    startTransition(async () => {
      const res = await toggleAtivoUsuario({ usuario_id: id, ativo_atual: ativoAtual })
      if (!res.success) {
        setErro(res.error)
        return
      }
      router.refresh()
    })
  }

  const columns: Column<UsuarioLinha>[] = [
    {
      key: 'nome',
      header: 'Nome',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[200px] truncate text-[12px] font-medium text-jl-fg-1">{r.nome}</p>
        </div>
      ),
    },
    {
      key: 'perfil',
      header: 'Perfil',
      sortValue: (r) => r.perfil,
      cell: (r) => <PerfilPill perfil={r.perfil} />,
    },
    {
      key: 'loja',
      header: 'Loja',
      sortValue: (r) => r.loja_nome ?? '',
      cell: (r) => (
        <span className="text-[12px] text-jl-fg-2">{r.loja_nome ?? '—'}</span>
      ),
    },
    {
      key: 'idioma',
      header: 'Idioma',
      cell: (r) => (
        <span className="text-[12px] text-jl-fg-3">{r.idioma_preferido === 'zh' ? '中文' : 'PT'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      cell: (r) => (
        <span
          className={cn(
            'inline-flex items-center rounded px-2 py-[2px] text-[11px] font-medium leading-none',
            r.ativo ? 'admin-v2-badge-success' : 'admin-v2-badge-muted',
          )}
        >
          {r.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[#242424] px-4 py-3">
        <p className="text-[12px] text-jl-fg-3">
          {usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'}
        </p>
        <button
          type="button"
          onClick={() => setCriarAberto(true)}
          className="admin-v2-btn-primary flex items-center gap-1.5 text-[12px]"
        >
          <UserPlus size={13} aria-hidden />
          Novo usuário
        </button>
      </div>

      {erro ? (
        <p className="admin-v2-alert-danger mx-4 mt-3 rounded-lg px-3 py-2 text-[12px]">{erro}</p>
      ) : null}

      <DataTable
        data={usuarios}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>👤</span>
            <p className="text-[14px] font-medium text-jl-fg-2">Nenhum usuário encontrado</p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <ToggleBtn usuario={row} onToggle={handleToggle} />
        )}
      />

      {pending ? (
        <p className="px-4 py-2 text-[11px] text-jl-fg-3">Atualizando…</p>
      ) : null}

      <CriarUsuarioModal
        open={criarAberto}
        onClose={() => setCriarAberto(false)}
        lojas={lojas}
      />
    </div>
  )
}
