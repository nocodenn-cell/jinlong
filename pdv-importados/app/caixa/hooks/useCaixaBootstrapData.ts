import { useEffect, useRef } from "react"
import {
  carregarRegrasPrecoCaixa,

  obterLimiteSangriaSemGerente,
  obterConfiguracoesParaCaixaWeb,
} from "@/app/caixa/actions"
import type { CarregarRegrasResult } from "@/app/caixa/caixaActionTypes"
import type { CaixaBootstrapInicial } from "@/app/caixa/caixaBootstrapTypes"

type Params = {
  regrasErroPrefixo: string
  setCarregandoRegras: (value: boolean) => void
  setRegras: (regras: unknown[]) => void
  setCaixaMensagem: (mensagem: string | null) => void
  setLimiteSangriaSemGerente: (value: number) => void
  setConfigCaixaWeb: (value: Record<string, string>) => void
  /**
   * Resultados já carregados no Server Component (`carregarBootstrapCaixa`). Cada
   * um é consumido UMA vez, na primeira execução do efeito correspondente; sem
   * pré-carga (ou nas execuções seguintes) a Server Action é chamada como antes.
   */
  inicial?: Pick<CaixaBootstrapInicial, "regras" | "limiteSangria" | "configuracoes"> | null
}

function consumir<T>(ref: { current: T | null }): T | null {
  const valor = ref.current
  ref.current = null
  return valor
}

export function useCaixaBootstrapData({
  regrasErroPrefixo,
  setCarregandoRegras,
  setRegras,
  setCaixaMensagem,
  setLimiteSangriaSemGerente,
  setConfigCaixaWeb,
  inicial,
}: Params) {
  const regrasInicialRef = useRef(inicial?.regras ?? null)
  const limiteInicialRef = useRef(inicial?.limiteSangria ?? null)
  const configInicialRef = useRef(inicial?.configuracoes ?? null)

  useEffect(() => {
    let cancelado = false
    const aplicar = (res: CarregarRegrasResult) => {
      if (res.ok) {
        setRegras(res.regras)
        setCaixaMensagem(null)
      } else {
        setCaixaMensagem(`${regrasErroPrefixo} ${res.error}`)
        setRegras([])
      }
      setCarregandoRegras(false)
    }

    const preCarregado = consumir(regrasInicialRef)
    if (preCarregado) {
      aplicar(preCarregado)
      return
    }

    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      aplicar(res)
    })()
    return () => {
      cancelado = true
    }
  }, [regrasErroPrefixo, setCarregandoRegras, setRegras, setCaixaMensagem])

  useEffect(() => {
    const preCarregado = consumir(limiteInicialRef)
    if (preCarregado) {
      if (preCarregado.ok) setLimiteSangriaSemGerente(preCarregado.limite)
      return
    }

    let cancelado = false
    ;(async () => {
      const res = await obterLimiteSangriaSemGerente()
      if (cancelado) return
      if (res.ok) setLimiteSangriaSemGerente(res.limite)
    })()
    return () => {
      cancelado = true
    }
  }, [setLimiteSangriaSemGerente])

  useEffect(() => {
    const preCarregado = consumir(configInicialRef)
    if (preCarregado) {
      setConfigCaixaWeb(preCarregado.ok ? preCarregado.mapa : {})
      return
    }

    let cancelado = false
    ;(async () => {
      const res = await obterConfiguracoesParaCaixaWeb()
      if (cancelado) return
      if (res.ok) setConfigCaixaWeb(res.mapa)
      else setConfigCaixaWeb({})
    })()
    return () => {
      cancelado = true
    }
  }, [setConfigCaixaWeb])

}
