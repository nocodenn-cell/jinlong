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
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pb-3 pt-5">
        <h1 className="text-[18px] font-semibold text-zinc-100">Configurações</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">Loja, PDV e cadastros rápidos</p>
      </div>

      {/* Tabs */}
      <div
        className="border-b border-zinc-800 px-6"
        style={{ display: 'flex', gap: '1.5rem', overflow: 'x auto' }}
      >
        {(['loja', 'pdv', 'cadastros'] as const).map((aba) => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            style={{
              paddingBottom: '12px',
              paddingTop: '12px',
              fontSize: '13px',
              fontWeight: abaAtiva === aba ? 500 : 400,
              color: abaAtiva === aba ? 'var(--fp-text-primary)' : 'var(--fp-text-muted)',
              borderBottom: abaAtiva === aba ? '2px solid #ffffff' : 'none',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              transition: 'color 120ms',
            }}
          >
            {aba === 'loja' ? 'Loja' : aba === 'pdv' ? 'PDV' : 'Cadastros'}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      <div className="px-6 py-5">
        {abaAtiva === 'loja' && (
          <form onSubmit={handleLojaSubmit} className="max-w-2xl space-y-4">
            <h2 className="text-[14px] font-semibold text-zinc-100">Dados da loja</h2>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome">
                <input
                  name="nome"
                  type="text"
                  defaultValue={dados.loja?.nome ?? ''}
                  className="admin-input"
                  required
                />
              </FormField>
              <FormField label="CNPJ">
                <input
                  name="cnpj"
                  type="text"
                  defaultValue={dados.loja?.cnpj ?? ''}
                  placeholder="00.000.000/0000-00"
                  className="admin-input"
                  required
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Razão social">
                <input
                  name="razao_social"
                  type="text"
                  defaultValue={dados.loja?.razao_social ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="Nome fantasia">
                <input
                  name="nome_fantasia"
                  type="text"
                  defaultValue={dados.loja?.nome_fantasia ?? ''}
                  className="admin-input"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Inscrição estadual">
                <input
                  name="inscricao_estadual"
                  type="text"
                  defaultValue={dados.loja?.inscricao_estadual ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="CNAE">
                <input
                  name="cnae"
                  type="text"
                  defaultValue={dados.loja?.cnae ?? ''}
                  placeholder="1234567"
                  className="admin-input"
                />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400">Contato</h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Telefone">
                <input
                  name="telefone"
                  type="tel"
                  defaultValue={dados.loja?.telefone ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="E-mail">
                <input
                  name="email"
                  type="email"
                  defaultValue={dados.loja?.email ?? ''}
                  className="admin-input"
                />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400">Endereço</h3>
            <FormField label="Logradouro">
              <input
                name="endereco_logradouro"
                type="text"
                defaultValue={dados.loja?.endereco_logradouro ?? ''}
                className="admin-input"
              />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Número">
                <input
                  name="endereco_numero"
                  type="text"
                  defaultValue={dados.loja?.endereco_numero ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="Complemento">
                <input
                  name="endereco_complemento"
                  type="text"
                  defaultValue={dados.loja?.endereco_complemento ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="Bairro">
                <input
                  name="endereco_bairro"
                  type="text"
                  defaultValue={dados.loja?.endereco_bairro ?? ''}
                  className="admin-input"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Cidade">
                <input
                  name="endereco_cidade"
                  type="text"
                  defaultValue={dados.loja?.endereco_cidade ?? ''}
                  className="admin-input"
                />
              </FormField>
              <FormField label="UF">
                <input
                  name="endereco_uf"
                  type="text"
                  defaultValue={dados.loja?.endereco_uf ?? ''}
                  maxLength={2}
                  className="admin-input"
                />
              </FormField>
              <FormField label="CEP">
                <input
                  name="endereco_cep"
                  type="text"
                  defaultValue={dados.loja?.endereco_cep ?? ''}
                  placeholder="12345-678"
                  className="admin-input"
                />
              </FormField>
            </div>

            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400">Série fiscal</h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="NFC-e">
                <input
                  name="numero_serie_nfce"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfce ?? 1}
                  className="admin-input"
                />
              </FormField>
              <FormField label="NF-e">
                <input
                  name="numero_serie_nfe"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfe ?? 1}
                  className="admin-input"
                />
              </FormField>
            </div>

            {lojaErro && (
              <div
                className="rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--fp-danger-bg)',
                  border: '1px solid var(--fp-danger-border)',
                  color: 'var(--fp-danger)',
                }}
              >
                {lojaErro}
              </div>
            )}
            {lojaSucesso && (
              <div
                className="rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--fp-success-bg)',
                  border: '1px solid var(--fp-success-border)',
                  color: 'var(--fp-success)',
                }}
              >
                ✓ Dados da loja salvos com sucesso
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="fp-btn fp-btn--primary">
                Salvar dados da loja
              </button>
            </div>
          </form>
        )}

        {abaAtiva === 'pdv' && (
          <form onSubmit={handlePdvSubmit} className="max-w-2xl space-y-4">
            <h2 className="text-[14px] font-semibold text-zinc-100">Configurações do PDV</h2>

            {!dados.loja?.id && (
              <div
                className="rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--fp-warning-bg)',
                  border: '1px solid var(--fp-warning-border)',
                  color: 'var(--fp-warning)',
                }}
              >
                Salve os dados da loja antes de configurar o PDV.
              </div>
            )}

            <input type="hidden" name="loja_id" value={dados.loja?.id ?? ''} />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Regime tributário">
                <select name="regime_tributario" defaultValue={dados.pdvConfig?.regime_tributario ?? 'SIMPLES_NACIONAL'} className="admin-input">
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Idioma padrão">
                <select name="idioma_padrao" defaultValue={dados.pdvConfig?.idioma_padrao ?? 'pt'} className="admin-input">
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
                <select name="tema_padrao" defaultValue={dados.pdvConfig?.tema_padrao ?? 'noturno'} className="admin-input">
                  {TEMAS.map((t) => (
                    <option key={t} value={t}>
                      {t === 'noturno' ? 'Noturno' : 'Novembro'}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Formato de impressão">
                <select name="formato_impressao" defaultValue={dados.pdvConfig?.formato_impressao ?? 'TERMICA'} className="admin-input">
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
                  className="admin-input"
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
                  className="admin-input"
                  required
                />
              </FormField>
            </div>

            <div className="space-y-2">
              <Label>
                <input
                  name="auto_enqueue_fiscal"
                  type="checkbox"
                  defaultChecked={dados.pdvConfig?.auto_enqueue_fiscal ?? false}
                  style={{ marginRight: '8px' }}
                />
                Auto-enqueue documentos fiscais
              </Label>
              <Label>
                <input
                  name="imprimir_cupom_auto"
                  type="checkbox"
                  defaultChecked={dados.pdvConfig?.imprimir_cupom_auto ?? false}
                  style={{ marginRight: '8px' }}
                />
                Imprimir cupom automaticamente
              </Label>
            </div>

            {pdvErro && (
              <div
                className="rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--fp-danger-bg)',
                  border: '1px solid var(--fp-danger-border)',
                  color: 'var(--fp-danger)',
                }}
              >
                {pdvErro}
              </div>
            )}
            {pdvSucesso && (
              <div
                className="rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--fp-success-bg)',
                  border: '1px solid var(--fp-success-border)',
                  color: 'var(--fp-success)',
                }}
              >
                ✓ Configurações do PDV salvas com sucesso
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="fp-btn fp-btn--primary" disabled={!dados.loja?.id}>
                Salvar configurações PDV
              </button>
            </div>
          </form>
        )}

        {abaAtiva === 'cadastros' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-[14px] font-semibold text-zinc-100">Cadastros rápidos</h2>
              <p className="mt-1 text-[12px] text-zinc-500">Crie clientes, categorias, marcas e fornecedores</p>
            </div>

            {/* Novo cliente */}
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: 'var(--fp-border)', background: 'var(--fp-bg-secondary)' }}
            >
              <h3 className="text-[13px] font-semibold text-zinc-100">Novo cliente</h3>
              <form onSubmit={handleClienteSubmit} className="mt-3 space-y-3">
                <FormField label="Nome">
                  <input
                    name="cliente_nome"
                    type="text"
                    className="admin-input"
                    required
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Documento">
                    <input
                      name="cliente_documento"
                      type="text"
                      className="admin-input"
                    />
                  </FormField>
                  <FormField label="Telefone">
                    <input
                      name="cliente_telefone"
                      type="tel"
                      className="admin-input"
                    />
                  </FormField>
                </div>

                {clienteErro && (
                  <div
                    className="rounded-lg px-3 py-2 text-[12px]"
                    style={{
                      background: 'var(--fp-danger-bg)',
                      border: '1px solid var(--fp-danger-border)',
                      color: 'var(--fp-danger)',
                    }}
                  >
                    {clienteErro}
                  </div>
                )}
                {clienteSucesso && (
                  <div
                    className="rounded-lg px-3 py-2 text-[12px]"
                    style={{
                      background: 'var(--fp-success-bg)',
                      border: '1px solid var(--fp-success-border)',
                      color: 'var(--fp-success)',
                    }}
                  >
                    ✓ Cliente criado com sucesso
                  </div>
                )}

                <button type="submit" className="fp-btn fp-btn--primary">
                  <Plus size={14} aria-hidden />
                  Criar cliente
                </button>
              </form>
            </div>

            {/* Links para outras entidades */}
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-zinc-400">Outras entidades (abrir em /gerente)</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/gerente/produtos" className="fp-btn fp-btn--secondary">
                  <Plus size={14} aria-hidden />
                  Categoria
                </Link>
                <Link href="/gerente/produtos" className="fp-btn fp-btn--secondary">
                  <Plus size={14} aria-hidden />
                  Marca
                </Link>
                <Link href="/gerente/produtos" className="fp-btn fp-btn--secondary">
                  <Plus size={14} aria-hidden />
                  Fornecedor
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .admin-input {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          background: var(--fp-bg-primary);
          border: 1px solid var(--fp-border);
          color: var(--fp-text-primary);
          outline: none;
          transition: border-color 120ms;
        }
        .admin-input:focus {
          border-color: #3f3f46;
        }
      `}</style>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium" style={{ color: 'var(--fp-text-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="flex items-center text-[12px]"
      style={{ color: 'var(--fp-text-secondary)', cursor: 'pointer' }}
    >
      {children}
    </label>
  )
}
