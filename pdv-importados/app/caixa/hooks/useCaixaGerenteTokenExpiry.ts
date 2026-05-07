import { useEffect } from "react"

type Params = {
  gerenteValidadoAte: string | null
  onExpire: () => void
}

export function useCaixaGerenteTokenExpiry({ gerenteValidadoAte, onExpire }: Params) {
  useEffect(() => {
    if (!gerenteValidadoAte) return

    const expiraEmMs = Date.parse(gerenteValidadoAte)
    if (!Number.isFinite(expiraEmMs)) {
      onExpire()
      return
    }

    const checkExpiracao = () => {
      if (Date.now() >= expiraEmMs) onExpire()
    }

    checkExpiracao()
    const timer = globalThis.setInterval(checkExpiracao, 1000)
    return () => globalThis.clearInterval(timer)
  }, [gerenteValidadoAte, onExpire])
}
