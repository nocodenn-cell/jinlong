import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RegraPreco } from '@core/pricing/types'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@core/caixa/mapRegrasPreco'
import {
  buildMapaProdutoChaves,
  produtosCatalogoAtivos,
  type ProdutoCacheLite,
} from '../catalogoLookup'
import { defaultPdvConfig } from '../config/pdvConfig'
import {
  mensagemErroComContexto,
  mensagemErroParaUsuario,
} from '../lib/mensagemErroUsuario'

type CatalogoLocalInvoke = {
  produtos?: ProdutoCacheLite[]
  regras?: RegraPrecoRow[]
}

type PdvConfigLocalInvoke = {
  gerente_id: string
  max_desconto_gerente_percentual: number
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
}

export function usePdvLocalCatalogo({
  setRegras,
  setGerenteId,
  setMaxDescontoGerentePercentual,
  setCaixaAtualId,
  setMensagem,
}: Params) {
  const [tauriDisponivel, setTauriDisponivel] = useState(false)
  const [produtosPorCodigoBarras, setProdutosPorCodigoBarras] = useState<
    Record<string, ProdutoCacheLite>
  >({})
  const [produtosCatalogo, setProdutosCatalogo] = useState<ProdutoCacheLite[]>([])
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [ultimoErroSincCatalogo, setUltimoErroSincCatalogo] = useState<string | null>(null)
  const [sincronizandoCatalogo, setSincronizandoCatalogo] = useState(false)

  const aplicarCacheCatalogo = useCallback(
    (cache: CatalogoLocalInvoke | null | undefined) => {
      if (!cache) return
      const regras: RegraPreco[] = (cache.regras ?? [])
        .filter((r) => r.ativo)
        .map(mapRegraPrecoRow)

      setRegras(regras)

      const produtosArr = cache.produtos ?? []
      setProdutosCatalogo(produtosCatalogoAtivos(produtosArr))
      setProdutosPorCodigoBarras(buildMapaProdutoChaves(produtosArr))
    },
    [setRegras],
  )

  const sincronizarCatalogoManual = useCallback(async () => {
    if (!tauriDisponivel) return
    setSincronizandoCatalogo(true)
    setUltimoErroSincCatalogo(null)
    try {
      const r = await invoke<{
        produtos_salvos: number
        regras_salvas: number
      }>('sync_catalogo_real_cmd')
      const cache2 = (await invoke('catalogo_local_get_cmd')) as CatalogoLocalInvoke
      aplicarCacheCatalogo(cache2)
      setMensagem(
        `Catálogo atualizado: ${r.produtos_salvos} produto(s), ${r.regras_salvas} regra(s).`,
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
    const t = window.setInterval(() => {
      tries += 1
      if (check()) {
        setTauriDisponivel(true)
        window.clearInterval(t)
      } else if (tries >= 15) {
        window.clearInterval(t)
      }
    }, 200)

    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!tauriDisponivel) return

    let cancelled = false

    async function inicializar() {
      try {
        const cfg = await invoke<PdvConfigLocalInvoke | null>('pdv_config_local_get_cmd')
        if (!cancelled && cfg) {
          setGerenteId(cfg.gerente_id ?? defaultPdvConfig.gerenteId)
          setMaxDescontoGerentePercentual(
            Number(cfg.max_desconto_gerente_percentual ?? defaultPdvConfig.maxDescontoGerentePercentual),
          )
        }
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
        if (!cancelled && cfg2) {
          setGerenteId(cfg2.gerente_id ?? defaultPdvConfig.gerenteId)
          setMaxDescontoGerentePercentual(
            Number(cfg2.max_desconto_gerente_percentual ?? defaultPdvConfig.maxDescontoGerentePercentual),
          )
        }
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
  }, [tauriDisponivel, setMaxDescontoGerentePercentual, aplicarCacheCatalogo, setGerenteId, setCaixaAtualId])

  return {
    tauriDisponivel,
    produtosPorCodigoBarras,
    produtosCatalogo,
    carregandoCatalogo,
    ultimoErroSincCatalogo,
    sincronizandoCatalogo,
    sincronizarCatalogoManual,
    aplicarCacheCatalogo,
  }
}
