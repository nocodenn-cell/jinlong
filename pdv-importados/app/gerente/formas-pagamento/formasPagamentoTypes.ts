export type FormaPagamentoRow = Readonly<{
  id: string
  codigo: string
  descricao: string
  tipo: 'CARTAO' | 'DINHEIRO' | 'PIX' | 'BOLETO' | 'OUTRO'
  ativo: boolean
}>

