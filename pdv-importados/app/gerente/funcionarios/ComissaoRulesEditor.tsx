'use client'

import { useState, useEffect } from 'react'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { criarComissaoRegra, desativarComissaoRegra, type ComissaoRegraRow } from './actions'

interface Props {
  funcionarioId: string
  regraExistente?: ComissaoRegraRow | null
  onClose: () => void
  onSuccess: () => void
}

type TipoRegra = 'padrao' | 'por_produto' | 'por_categoria' | 'por_margem'

const inputClass =
  'w-full rounded-lg border border-jl-border-1 bg-[#0a0f1e] px-3 py-2 text-sm text-jl-fg-1 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30'

export function ComissaoRulesEditor({ funcionarioId, regraExistente, onClose, onSuccess }: Props) {
  const [tipoRegra, setTipoRegra] = useState<TipoRegra>(regraExistente?.tipo_regra || 'padrao')
  const [percentual, setPercentual] = useState(regraExistente?.percentual || 5)
  const [produtoId, setProdutoId] = useState(regraExistente?.produto_id || '')
  const [categoriaId, setCategoriaId] = useState(regraExistente?.categoria_id || '')
  const [margemMin, setMargemMin] = useState(regraExistente?.margem_minima?.toString() || '0')
  const [margemMax, setMargemMax] = useState(regraExistente?.margem_maxima?.toString() || '0')
  const [vigenciaInicio, setVigenciaInicio] = useState(
    regraExistente?.vigencia_inicio || new Date().toISOString().split('T')[0]
  )
  const [vigenciaFim, setVigenciaFim] = useState(regraExistente?.vigencia_fim || '')

  // Load produtos e categorias
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([])
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([])
  const [produtosLoading, setProdutosLoading] = useState(false)
  const [categoriasLoading, setCategoriasLoading] = useState(false)

  useEffect(() => {
    // Load produtos
    setProdutosLoading(true)
    // In production, would call an action to list produtos
    // For now, placeholder
    setProdutosLoading(false)

    // Load categorias
    setCategoriasLoading(true)
    // In production, would call an action to list categorias
    setCategoriasLoading(false)
  }, [])

  const { mutate: salvar, loading: salvando } = useGerenteMutation(
    async () => {
      // Validate inputs
      if (percentual < 0 || percentual > 100) {
        throw new Error('Comissão deve estar entre 0 e 100%.')
      }
      if (tipoRegra === 'por_produto' && !produtoId) {
        throw new Error('Selecione um produto.')
      }
      if (tipoRegra === 'por_categoria' && !categoriaId) {
        throw new Error('Selecione uma categoria.')
      }
      if (tipoRegra === 'por_margem') {
        if (!margemMin || !margemMax) throw new Error('Informe a faixa de margem.')
        if (parseFloat(margemMin) > parseFloat(margemMax)) {
          throw new Error('Margem mínima deve ser menor ou igual à margem máxima.')
        }
      }

      if (regraExistente) {
        // Edit existing rule - not implemented in Phase 1
        throw new Error('Edição de regras será implementada em versão futura.')
      } else {
        // Create new rule
        const input = {
          funcionario_id: funcionarioId,
          tipo_regra: tipoRegra,
          produto_id: tipoRegra === 'por_produto' ? produtoId : null,
          categoria_id: tipoRegra === 'por_categoria' ? categoriaId : null,
          margem_minima: tipoRegra === 'por_margem' ? parseFloat(margemMin) : null,
          margem_maxima: tipoRegra === 'por_margem' ? parseFloat(margemMax) : null,
          percentual,
          vigencia_inicio: vigenciaInicio,
          vigencia_fim: vigenciaFim || null,
        }

        const r = await criarComissaoRegra(input)
        if (!r.success) throw new Error(r.error)
      }

      return null
    },
    { successMessage: 'Regra salva com sucesso.' }
  )

  const { mutate: deletar, loading: deletando } = useGerenteMutation(
    async () => {
      if (!regraExistente) return null
      const r = await desativarComissaoRegra(regraExistente.id)
      if (!r.success) throw new Error(r.error)
      return null
    },
    { successMessage: 'Regra desativada.' }
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dragon-glass-backdrop px-4 py-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dragon-elev-2 w-full max-w-lg rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-4">
          <h2 className="text-base font-semibold text-jl-fg-1">
            {regraExistente ? 'Editar Regra de Comissão' : 'Nova Regra de Comissão'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-jl-fg-3 hover:text-jl-fg-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="px-5 py-4 space-y-4">
          {/* Tipo de Regra */}
          <div>
            <label className="block text-sm font-medium text-jl-fg-1 mb-2">Tipo de Regra</label>
            <select
              value={tipoRegra}
              onChange={(e) => setTipoRegra(e.target.value as TipoRegra)}
              disabled={regraExistente !== null}
              className={inputClass}
            >
              <option value="padrao">Padrão (aplicado quando nenhuma regra específica se aplica)</option>
              <option value="por_produto">Por Produto (para um produto específico)</option>
              <option value="por_categoria">Por Categoria (para uma categoria específica)</option>
              <option value="por_margem">Por Faixa de Margem (para faixas de margem de lucro)</option>
            </select>
          </div>

          {/* Selectors por tipo */}
          {tipoRegra === 'por_produto' && (
            <div>
              <label className="block text-sm font-medium text-jl-fg-1 mb-2">Produto</label>
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                disabled={produtosLoading}
                className={inputClass}
              >
                <option value="">Selecione um produto...</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipoRegra === 'por_categoria' && (
            <div>
              <label className="block text-sm font-medium text-jl-fg-1 mb-2">Categoria</label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={categoriasLoading}
                className={inputClass}
              >
                <option value="">Selecione uma categoria...</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipoRegra === 'por_margem' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-jl-fg-1 mb-2">Margem Mínima (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={margemMin}
                  onChange={(e) => setMargemMin(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-jl-fg-1 mb-2">Margem Máxima (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={margemMax}
                  onChange={(e) => setMargemMax(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* Percentual */}
          <div>
            <label className="block text-sm font-medium text-jl-fg-1 mb-2">Comissão (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={percentual}
                onChange={(e) => setPercentual(parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
              <span className="text-jl-fg-1 font-medium">%</span>
            </div>
          </div>

          {/* Vigência */}
          <div>
            <label className="block text-sm font-medium text-jl-fg-1 mb-2">Período de Vigência</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-jl-fg-3 mb-1 block">De (obrigatório)</label>
                <input
                  type="date"
                  value={vigenciaInicio}
                  onChange={(e) => setVigenciaInicio(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-jl-fg-3 mb-1 block">Até (opcional, deixe vazio para contínuo)</label>
                <input
                  type="date"
                  value={vigenciaFim}
                  onChange={(e) => setVigenciaFim(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="border-t border-jl-border-1 bg-jl-surface-elev px-5 py-3 flex justify-between gap-2">
          <div>
            {regraExistente && (
              <button
                type="button"
                onClick={() => void deletar(null)}
                disabled={deletando}
                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Desativar Regra
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors app-border app-btn-neutral"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void salvar(null)}
              disabled={salvando}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors app-btn-accent disabled:opacity-60"
            >
              {salvando ? '…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
