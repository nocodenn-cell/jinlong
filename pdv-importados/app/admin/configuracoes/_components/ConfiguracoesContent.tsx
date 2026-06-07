'use client'

/**
 * FastProduct Admin — ConfiguracoesContent (Fase 7)
 *
 * Client component com 3 abas: Loja, PDV, Cadastros rápidos.
 * Cada aba é um form client-side que dispara actions do servidor.
 * Estados de erro/sucesso inline em cada form.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { cn } from '@/lib/utils'
import type { LojaConfig, PdvConfig } from '@/app/gerente/configuracoes/actions'
import { atualizarDadosLojaAction, atualizarConfiguracoesPdvAction } from '@/app/gerente/configuracoes/actions'
import { criarCliente } from '@/app/gerente/financeiro/actions'

export type ConfigDados = {
  loja: LojaConfig | null
  pdvConfig: PdvConfig | null
}

type Aba = 'loja' | 'pdv' | 'cadastros'

const REGIMES = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'] as const
const IDIOMAS = ['pt', 'zh'] as const
const TEMAS = ['noturno', 'novem'] as const
const FORMATOS = ['TERMICA', 'A4'] as const

const inputClass =
  'admin-v2-input w-full px-2.5 py-2 text-xs outline-none transition-colors focus:border-jl-accent/50'

export function ConfiguracoesContent({ dados }: { dados: ConfigDados }) {
  const router = useRouter()
  const [abaAtiva, setAbaAtiva] = useState<Aba>('loja')
  const [lojaErro, setLojaErro] = useState<string | null>(null)
  const [lojaSucesso, setLojaSucesso] = useState(false)
  const [pdvErro, setPdvErro] = useState<string | null>(null)
  const [pdvSucesso, setPdvSucesso] = useState(false)
  const [clienteErro, setClienteErro] = useState<string | null>(null)
  const [clienteSucesso, setClienteSucesso] = useState(false)

  const handleLojaSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLojaErro(null)
    setLojaSucesso(false)
    const fd = new FormData(e.currentTarget)
    const payload: LojaConfig = {
      id: dados.loja?.id,
      nome: String(fd.get('nome') ?? ''),
      cnpj: String(fd.get('cnpj') ?? ''),
      inscricao_estadual: fd.get('inscricao_estadual') ? String(fd.get('inscricao_estadual')) : null,
      telefone: fd.get('telefone') ? String(fd.get('telefone')) : null,
      email: fd.get('email') ? String(fd.get('email')) : null,
      logo_url: fd.get('logo_url') ? String(fd.get('logo_url')) : dados.loja?.logo_url ?? null,
      endereco_logradouro: fd.get('endereco_logradouro') ? String(fd.get('endereco_logradouro')) : null,
      endereco_numero: fd.get('endereco_numero') ? String(fd.get('endereco_numero')) : null,
      endereco_complemento: fd.get('endereco_complemento') ? String(fd.get('endereco_complemento')) : null,
      endereco_bairro: fd.get('endereco_bairro') ? String(fd.get('endereco_bairro')) : null,
      endereco_cidade: fd.get('endereco_cidade') ? String(fd.get('endereco_cidade')) : null,
      endereco_uf: fd.get('endereco_uf') ? String(fd.get('endereco_uf')) : null,
      endereco_cep: fd.get('endereco_cep') ? String(fd.get('endereco_cep')) : null,
      razao_social: fd.get('razao_social') ? String(fd.get('razao_social')) : null,
      nome_fantasia: fd.get('nome_fantasia') ? String(fd.get('nome_fantasia')) : null,
      cnae: fd.get('cnae') ? String(fd.get('cnae')) : null,
      numero_serie_nfce: Number(fd.get('numero_serie_nfce')) || 1,
      numero_serie_nfe: Number(fd.get('numero_serie_nfe')) || 1,
    }
    const res = await atualizarDadosLojaAction(payload)
    if (!res.ok) {
      setLojaErro(res.error)
    } else {
      setLojaSucesso(true)
      router.refresh()
      setTimeout(() => setLojaSucesso(false), 3000)
    }
  }

  const handlePdvSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPdvErro(null)
    setPdvSucesso(false)
    const fd = new FormData(e.currentTarget)
    const payload: PdvConfig = {
      loja_id: String(fd.get('loja_id') ?? ''),
      cfop_padrao: String(fd.get('cfop_padrao') ?? ''),
      cst_padrao: String(fd.get('cst_padrao') ?? ''),
      regime_tributario: String(fd.get('regime_tributario') ?? '') as PdvConfig['regime_tributario'],
      auto_enqueue_fiscal: fd.get('auto_enqueue_fiscal') === 'on',
      idioma_padrao: String(fd.get('idioma_padrao') ?? 'pt') as 'pt' | 'zh',
      tema_padrao: String(fd.get('tema_padrao') ?? 'noturno') as 'noturno' | 'novem',
      imprimir_cupom_auto: fd.get('imprimir_cupom_auto') === 'on',
      formato_impressao: String(fd.get('formato_impressao') ?? 'TERMICA') as 'TERMICA' | 'A4',
    }
    const res = await atualizarConfiguracoesPdvAction(payload)
    if (!res.ok) {
      setPdvErro(res.error)
    } else {
      setPdvSucesso(true)
      router.refresh()
      setTimeout(() => setPdvSucesso(false), 3000)
    }
  }

  const handleClienteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setClienteErro(null)
    setClienteSucesso(false)
    const fd = new FormData(e.currentTarget)
    const res = await criarCliente({
      nome: String(fd.get('cliente_nome') ?? ''),
      documento: fd.get('cliente_documento') ? String(fd.get('cliente_documento')) : undefined,
      telefone: fd.get('cliente_telefone') ? String(fd.get('cliente_telefone')) : undefined,
    })
    if (!res.success) {
      setClienteErro(res.error)
    } else {
      setClienteSucesso(true)
      router.refresh()
      setTimeout(() => setClienteSucesso(false), 3000)
      ;(e.currentTarget as HTMLFormElement).reset()
    }
  }

  return (
    <div className="admin-v2-page">
      <PageHeader title="Configurações" subtitle="Loja, PDV e cadastros rápidos" />

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-[#242424]">
        {(['loja', 'pdv', 'cadastros'] as const).map((aba) => (
          <button
            key={aba}
            type="button"
            onClick={() => setAbaAtiva(aba)}
            className={cn(
              'border-b-2 bg-transparent pb-3 pt-1 text-sm transition-colors',
              abaAtiva === aba
                ? 'border-jl-accent font-medium text-jl-fg-1'
                : 'border-transparent text-jl-fg-3 hover:text-jl-fg-2',
            )}
          >
            {aba === 'loja' ? 'Loja' : aba === 'pdv' ? 'PDV' : 'Cadastros'}
          </button>
        ))}
      </div>

      {abaAtiva === 'loja' && (
        <SectionCard title="Dados da loja">
          <form onSubmit={handleLojaSubmit} className="max-w-2xl space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome">
                <input name="nome" type="text" defaultValue={dados.loja?.nome ?? ''} className={inputClass} required />
              </FormField>
              <FormField label="CNPJ">
                <input
                  name="cnpj"
                  type="text"
                  defaultValue={dados.loja?.cnpj ?? ''}
                  placeholder="00.000.000/0000-00"
                  className={inputClass}
                  required
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Razão social">
                <input name="razao_social" type="text" defaultValue={dados.loja?.razao_social ?? ''} className={inputClass} />
              </FormField>
              <FormField label="Nome fantasia">
                <input name="nome_fantasia" type="text" defaultValue={dados.loja?.nome_fantasia ?? ''} className={inputClass} />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Inscrição estadual">
                <input
                  name="inscricao_estadual"
                  type="text"
                  defaultValue={dados.loja?.inscricao_estadual ?? ''}
                  className={inputClass}
                />
              </FormField>
              <FormField label="CNAE">
                <input name="cnae" type="text" defaultValue={dados.loja?.cnae ?? ''} placeholder="1234567" className={inputClass} />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">Contato</h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Telefone">
                <input name="telefone" type="tel" defaultValue={dados.loja?.telefone ?? ''} className={inputClass} />
              </FormField>
              <FormField label="E-mail">
                <input name="email" type="email" defaultValue={dados.loja?.email ?? ''} className={inputClass} />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">Endereço</h3>
            <FormField label="Logradouro">
              <input name="endereco_logradouro" type="text" defaultValue={dados.loja?.endereco_logradouro ?? ''} className={inputClass} />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Número">
                <input name="endereco_numero" type="text" defaultValue={dados.loja?.endereco_numero ?? ''} className={inputClass} />
              </FormField>
              <FormField label="Complemento">
                <input name="endereco_complemento" type="text" defaultValue={dados.loja?.endereco_complemento ?? ''} className={inputClass} />
              </FormField>
              <FormField label="Bairro">
                <input name="endereco_bairro" type="text" defaultValue={dados.loja?.endereco_bairro ?? ''} className={inputClass} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Cidade">
                <input name="endereco_cidade" type="text" defaultValue={dados.loja?.endereco_cidade ?? ''} className={inputClass} />
              </FormField>
              <FormField label="UF">
                <input name="endereco_uf" type="text" defaultValue={dados.loja?.endereco_uf ?? ''} maxLength={2} className={inputClass} />
              </FormField>
              <FormField label="CEP">
                <input
                  name="endereco_cep"
                  type="text"
                  defaultValue={dados.loja?.endereco_cep ?? ''}
                  placeholder="12345-678"
                  className={inputClass}
                />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">Série fiscal</h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="NFC-e">
                <input
                  name="numero_serie_nfce"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfce ?? 1}
                  className={inputClass}
                />
              </FormField>
              <FormField label="NF-e">
                <input
                  name="numero_serie_nfe"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfe ?? 1}
                  className={inputClass}
                />
              </FormField>
            </div>

            {lojaErro && <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]">{lojaErro}</div>}
            {lojaSucesso && (
              <div className="admin-v2-alert-success rounded-lg px-3 py-2 text-[12px]">Dados da loja salvos com sucesso</div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="admin-v2-btn-primary">
                Salvar dados da loja
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {abaAtiva === 'pdv' && (
        <SectionCard title="Configurações do PDV">
          <form onSubmit={handlePdvSubmit} className="max-w-2xl space-y-4">
            {!dados.loja?.id && (
              <div className="admin-v2-alert-warning rounded-lg px-3 py-2 text-[12px]">
                Salve os dados da loja antes de configurar o PDV.
              </div>
            )}

            <input type="hidden" name="loja_id" value={dados.loja?.id ?? ''} />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Regime tributário">
                <select name="regime_tributario" defaultValue={dados.pdvConfig?.regime_tributario ?? 'SIMPLES_NACIONAL'} className={inputClass}>
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Idioma padrão">
                <select name="idioma_padrao" defaultValue={dados.pdvConfig?.idioma_padrao ?? 'pt'} className={inputClass}>
                  {IDIOMAS.map((i) => (
                    <option key={i} value={i}>
                      {i === 'pt' ? 'Português' : '中文'}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tema padrão">
                <select name="tema_padrao" defaultValue={dados.pdvConfig?.tema_padrao ?? 'noturno'} className={inputClass}>
                  {TEMAS.map((t) => (
                    <option key={t} value={t}>
                      {t === 'noturno' ? 'Noturno' : 'Novembro'}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Formato de impressão">
                <select name="formato_impressao" defaultValue={dados.pdvConfig?.formato_impressao ?? 'TERMICA'} className={inputClass}>
                  {FORMATOS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'TERMICA' ? 'Térmica' : 'A4'}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="CFOP padrão">
                <input
                  name="cfop_padrao"
                  type="text"
                  defaultValue={dados.pdvConfig?.cfop_padrao ?? '5102'}
                  placeholder="5102"
                  className={inputClass}
                  required
                />
              </FormField>
              <FormField label="CST padrão">
                <input
                  name="cst_padrao"
                  type="text"
                  defaultValue={dados.pdvConfig?.cst_padrao ?? '00'}
                  placeholder="00"
                  maxLength={2}
                  className={inputClass}
                  required
                />
              </FormField>
            </div>

            <div className="space-y-2">
              <CheckboxLabel>
                <input name="auto_enqueue_fiscal" type="checkbox" defaultChecked={dados.pdvConfig?.auto_enqueue_fiscal ?? false} />
                Auto-enqueue documentos fiscais
              </CheckboxLabel>
              <CheckboxLabel>
                <input name="imprimir_cupom_auto" type="checkbox" defaultChecked={dados.pdvConfig?.imprimir_cupom_auto ?? false} />
                Imprimir cupom automaticamente
              </CheckboxLabel>
            </div>

            {pdvErro && <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]">{pdvErro}</div>}
            {pdvSucesso && (
              <div className="admin-v2-alert-success rounded-lg px-3 py-2 text-[12px]">Configurações do PDV salvas com sucesso</div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="admin-v2-btn-primary" disabled={!dados.loja?.id}>
                Salvar configurações PDV
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {abaAtiva === 'cadastros' && (
        <div className="max-w-2xl space-y-6">
          <SectionCard title="Cadastros rápidos" subtitle="Crie clientes, categorias, marcas e fornecedores">
            <div className="admin-v2-panel rounded-lg p-4">
              <h3 className="text-[13px] font-semibold text-jl-fg-1">Novo cliente</h3>
              <form onSubmit={handleClienteSubmit} className="mt-3 space-y-3">
                <FormField label="Nome">
                  <input name="cliente_nome" type="text" className={inputClass} required />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Documento">
                    <input name="cliente_documento" type="text" className={inputClass} />
                  </FormField>
                  <FormField label="Telefone">
                    <input name="cliente_telefone" type="tel" className={inputClass} />
                  </FormField>
                </div>

                {clienteErro && <div className="admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]">{clienteErro}</div>}
                {clienteSucesso && (
                  <div className="admin-v2-alert-success rounded-lg px-3 py-2 text-[12px]">Cliente criado com sucesso</div>
                )}

                <button type="submit" className="admin-v2-btn-primary">
                  <Plus size={14} aria-hidden />
                  Criar cliente
                </button>
              </form>
            </div>
          </SectionCard>

          <SectionCard title="Outras entidades">
            <p className="mb-3 text-[12px] text-jl-fg-3">Abrir em /gerente</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/gerente/produtos" className="admin-v2-btn-secondary">
                <Plus size={14} aria-hidden />
                Categoria
              </Link>
              <Link href="/gerente/produtos" className="admin-v2-btn-secondary">
                <Plus size={14} aria-hidden />
                Marca
              </Link>
              <Link href="/gerente/produtos" className="admin-v2-btn-secondary">
                <Plus size={14} aria-hidden />
                Fornecedor
              </Link>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-jl-fg-3">{label}</span>
      {children}
    </label>
  )
}

function CheckboxLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-jl-fg-2 [&_input]:accent-jl-accent">
      {children}
    </label>
  )
}
