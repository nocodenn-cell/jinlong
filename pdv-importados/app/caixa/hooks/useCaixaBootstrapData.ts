import { useEffect } from "react"
import {
  carregarRegrasPrecoCaixa,
  listarCategoriasAtalhoCaixa,
  obterLimiteSangriaSemGerente,
} from "@/app/caixa/actions"

type Params = {
  regrasErroPrefixo: string
  setCarregandoRegras: (value: boolean) => void
  setRegras: (regras: unknown[]) => void
  setCaixaMensagem: (mensagem: string | null) => void
  setLimiteSangriaSemGerente: (value: number) => void
  setCategoriasAtalho: (value: { id: string; nome: string }[]) => void
}

export function useCaixaBootstrapData({
  regrasErroPrefixo,
  setCarregandoRegras,
  setRegras,
  setCaixaMensagem,
  setLimiteSangriaSemGerente,
  setCategoriasAtalho,
}: Params) {
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      if (res.ok) {
        setRegras(res.regras)
        setCaixaMensagem(null)
      } else {
        setCaixaMensagem(`${regrasErroPrefixo} ${res.error}`)
        setRegras([])
      }
      setCarregandoRegras(false)
    })()
    return () => {
      cancelado = true
    }
  }, [regrasErroPrefixo, setCarregandoRegras, setRegras, setCaixaMensagem])

  useEffect(() => {
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
    let cancelado = false
    ;(async () => {
      const res = await listarCategoriasAtalhoCaixa()
      if (cancelado) return
      if (res.ok) setCategoriasAtalho(res.categorias)
    })()
    return () => {
      cancelado = true
    }
  }, [setCategoriasAtalho])
}
