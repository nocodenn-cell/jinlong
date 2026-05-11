export type ContatoGerenteListaRow =
  | {
      id: string
      tipo: 'CLIENTE'
      nome: string
      documento: string | null
      telefone: string | null
      ativo: boolean
    }
  | {
      id: string
      tipo: 'FORNECEDOR'
      nome: string
      documento: string
      telefone: null
      ativo: null
    }
