import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RegraPreco } from '@core/pricing/types'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@core/caixa/mapRegrasPreco'
import {
  buildMapaProdutoChaves,
  produtosCatalogoVendaveis,
  type ProdutoCacheLite,
} from '../catalogoLookup'
import { defaultPdvConfig } from '../config/pdvConfig'
import {
  mensagemErroComContexto,
  mensagemErroParaUsuario,
} from '../lib/mensagemErroUsuario'
import {
  mapPrecoAtacadoRow,
  type PrecoCanonicoSnapshot,
} from '../lib/resolverPrecoCanonicoLocal'

type CatalogoLocalInvoke = {
  produtos?: ProdutoCacheLite[]
  regras?: RegraPrecoRow[]
  precos_atacado?: Array<{
    id: string
    produto_id: string
    loja_id?: string | null
    quantidade_minima: number
    preco_unitario: number
    ativo?: boolean
  }>
}

type PdvConfigLocalInvoke = {
  gerente_id: string
  max_desconto_gerente_percentual: number
  quantidade_minima_atacado_padrao?: number | null
  loja_id?: string | null
}

export type CaixaSessaoInvoke = {
  id: string
}

type Params = {
  setRegras: (regras: RegraPreco[]) => void
  setGerenteId: (id: string) => void
  setMaxDescontoGerentePercentual: (n: number) => void
  setCaixaAtualId: (id: string | null) => void
  setMensagem: (msg: string | null) => void
  setQuantidadeMinimaAtacadoPadrao?: (n: number | null) => void
  setLojaId?: (id: string | null) => void
}

export function usePdvLocalCatalogo({
  setRegras,
  setGerenteId,
  setMaxDescontoGerentePercentual,
  setCaixaAtualId,
  setMensagem,
  setQuantidadeMinimaAtacadoPadrao,
  setLojaId,
}: Params) {
  const [tauriDisponivel, setTauriDisponivel] = useState(false)
  const [produtosPorCodigoBarras, setProdutosPorCodigoBarras] = useState<
    Record<string, ProdutoCacheLite>
  >({})
  const [produtosCatalogo, setProdutosCatalogo] = useState<ProdutoCacheLite[]>([])
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [ultimoErroSincCatalogo, setUltimoErroSincCatalogo] = useState<string | null>(null)
  const [sincronizandoCatalogo, setSincronizandoCatalogo] = useState(false)
  /** Regras legado (PROMOCAO etc.) — não alimentam preço automático ATACADO. */
  const regrasRef = useRef<RegraPreco[]>([])
  const precoCanonicoRef = useRef<PrecoCanonicoSnapshot>({
    lojaId: null,
    quantidadeMinimaAtacadoPadrao: null,
    tiers: [],
  })

  const aplicarCacheCatalogo = useCallback(
    (cache: CatalogoLocalInvoke | null | undefined) => {
      if (!cache) return
      const regras: RegraPreco[] = (cache.regras ?? [])
        .filter((r) => r.ativo)
        .map(mapRegraPrecoRow)

      regrasRef.current = regras
      setRegras(regras)

      const tiers = (cache.precos_atacado ?? []).map(mapPrecoAtacadoRow)
      precoCanonicoRef.current = {
        ...precoCanonicoRef.current,
        tiers,
      }

      const produtosArr = cache.produtos ?? []
      const produtosVendaveis = produtosCatalogoVendaveis(produtosArr)
      setProdutosCatalogo(produtosVendaveis)
      setProdutosPorCodigoBarras(buildMapaProdutoChaves(produtosVendaveis))
    },
    [setRegras],
  )

  const aplicarConfig = useCallback(
    (cfg: PdvConfigLocalInvoke | null | undefined) => {
      if (!cfg) return
      setGerenteId(cfg.gerente_id ?? defaultPdvConfig.gerenteId)
      setMaxDescontoGerentePercentual(
        Number(cfg.max_desconto_gerente_percentual ?? defaultPdvConfig.maxDescontoGerentePercentual),
      )
      const minPadrao =
        cfg.quantidade_minima_atacado_padrao == null
          ? null
          : Number(cfg.quantidade_minima_atacado_padrao)
      const loja = cfg.loja_id?.trim() ? cfg.loja_id.trim() : null
      precoCanonicoRef.current = {
        ...precoCanonicoRef.current,
        quantidadeMinimaAtacadoPadrao: minPadrao,
        lojaId: loja,
      }
      setQuantidadeMinimaAtacadoPadrao?.(minPadrao)
      setLojaId?.(loja)
    },
    [
      setGerenteId,
      setMaxDescontoGerentePercentual,
      setQuantidadeMinimaAtacadoPadrao,
      setLojaId,
    ],
  )

  const sincronizarCatalogoManual = useCallback(async () => {
    if (!tauriDisponivel) return
    setSincronizandoCatalogo(true)
    setUltimoErroSincCatalogo(null)
    try {
      const r = await invoke<{
        produtos_salvos: number
        regras_salvas: number
        precos_atacado_salvos?: number
      }>('sync_catalogo_real_cmd')
      const cache2 = (await invoke('catalogo_local_get_cmd')) as CatalogoLocalInvoke
      aplicarCacheCatalogo(cache2)
      const tiers = r.precos_atacado_salvos ?? 0
      setMensagem(
        `Catálogo atualizado: ${r.produtos_salvos} produto(s), ${r.regras_salvas} regra(s), ${tiers} faixa(s) atacado.`,
      )
    } catch (e) {
      const msg = String(e)
      const amigavel = mensagemErroComContexto('Sincronização do catálogo', msg)
      setUltimoErroSincCatalogo(amigavel)
      setMensagem(amigavel)
    } finally {
      setSincronizandoCatalogo(false)
    }
  }, [tauriDisponivel, aplicarCacheCatalogo, setMensagem])

  useEffect(() => {
    const check = () => {
      const w = window as unknown as {
        __TAURI__?: { core?: { invoke?: unknown } }
      }
      return w?.__TAURI__?.core?.invoke !== undefined
    }

    setTauriDisponivel(check())

    let tries = 0
    const t = globalThis.setInterval(() => {
      tries += 1
      if (check()) {
        setTauriDisponivel(true)
        globalThis.clearInterval(t)
      } else if (tries >= 15) {
        globalThis.clearInterval(t)
      }
    }, 200)

    return () => globalThis.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!tauriDisponivel) return

    let cancelled = false

    async function inicializar() {
      try {
        const cfg = await invoke<PdvConfigLocalInvoke | null>('pdv_config_local_get_cmd')
        if (!cancelled) aplicarConfig(cfg)
      } catch {
        // fallback abaixo
      }

      try {
        const caixa = await invoke<CaixaSessaoInvoke | null>('load_caixa_atual_cmd')
        if (!cancelled && caixa?.id) {
          setCaixaAtualId(String(caixa.id))
        }
      } catch {
        // ignora
      }

      try {
        await invoke('sync_pdv_config_real_cmd')
        const cfg2 = await invoke<PdvConfigLocalInvoke | null>('pdv_config_local_get_cmd')
        if (!cancelled) aplicarConfig(cfg2)
      } catch {
        // offline: mantém cache local/fallback
      }

      try {
        const cache1 = (await invoke('catalogo_local_get_cmd')) as CatalogoLocalInvoke
        if (!cancelled) aplicarCacheCatalogo(cache1)
      } catch {
        // sem cache local ainda
      }

      try {
        await invoke('sync_catalogo_real_cmd')
        const cache2 = (await invoke('catalogo_local_get_cmd')) as CatalogoLocalInvoke
        if (!cancelled) {
          aplicarCacheCatalogo(cache2)
          setUltimoErroSincCatalogo(null)
        }
      } catch (e) {
        if (!cancelled) setUltimoErroSincCatalogo(mensagemErroParaUsuario(String(e)))
      } finally {
        if (!cancelled) setCarregandoCatalogo(false)
      }
    }

    void inicializar()
    return () => {
      cancelled = true
    }
  }, [tauriDisponivel, aplicarConfig, aplicarCacheCatalogo, setCaixaAtualId])

  return {
    tauriDisponivel,
    produtosPorCodigoBarras,
    produtosCatalogo,
    carregandoCatalogo,
    ultimoErroSincCatalogo,
    sincronizandoCatalogo,
    sincronizarCatalogoManual,
    aplicarCacheCatalogo,
    regrasRef,
    /** Inputs da PRICE_RESOLUTION_CHAIN (tiers + loja + min padrao). */
    precoCanonicoRef,
  }
}
