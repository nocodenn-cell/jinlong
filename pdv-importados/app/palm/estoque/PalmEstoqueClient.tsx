'use client'

import { useCallback, useMemo, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import type { ProdutoPalm } from '@/app/palm/domain/tiposPalm'
import { buscarProdutoPalm } from '@/app/palm/actions'
import { PalmBarcodeScanner } from '@/components/palm/PalmBarcodeScanner'
import { PalmEstoqueView } from '@/components/palm/PalmEstoqueView'

export function PalmEstoqueClient({ m }: { m: Mensagens }) {
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<ProdutoPalm[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const buscar = useCallback(async (termo: string) => {
    const res = await buscarProdutoPalm(termo)
    if (!res.ok) { setErro(res.error); setProdutos([]); return }
    setProdutos(res.produtos)
    setErro(res.produtos.length === 0 ? m.palm.sem_resultado : null)
  }, [m.palm.sem_resultado])
  const rotulos = useMemo(() => ({
    lendo: m.palm.camera_lendo,
    permissao: m.palm.camera_permissao,
    incompativel: m.palm.camera_incompativel,
    fechar: m.palm.camera_fechar,
  }), [m])
  return (
    <>
      <PalmEstoqueView
        m={m}
        busca={busca}
        onBusca={setBusca}
        onBuscar={() => void buscar(busca)}
        onAbrirCamera={() => setCamera(true)}
        produtos={produtos}
        erro={erro}
      />
      <PalmBarcodeScanner
        aberto={camera}
        rotulos={rotulos}
        onFechar={() => setCamera(false)}
        onCodigo={(codigo) => { setBusca(codigo); setCamera(false); void buscar(codigo) }}
      />
    </>
  )
}
