"use client"

import { CaixaGridLayout } from "@/components/caixa/CaixaGridLayout"
import { getMessages } from "@/i18n/getMessages"

// Dados mock para teste
const mockItens = [
  {
    id: "1",
    nome: "Produto Teste 1",
    quantidade: 2,
    precoUnitario: 50.00,
    precoOriginal: 60.00,
  },
  {
    id: "2", 
    nome: "Produto Teste 2",
    quantidade: 1,
    precoUnitario: 25.50,
    precoOriginal: 30.00,
  }
]

const mockMensagens = {
  caixa: {
    titulo_carrinho: "Carrinho",
    moeda_prefixo: "R$",
    produto_nao_encontrado: "Produto não encontrado",
    falha_busca: "Falha na busca",
    item_adicionado: "Item adicionado",
    estoque_baixo: "estoque baixo",
    estoque_abaixo_minimo: "abaixo do mínimo",
    estoque_dica_rep: "repor estoque",
    regras_erro_prefixo: "Erro ao carregar regras:",
    msg_fechar_cupom_nao_vazio: "Feche o cupom antes de fechar o caixa",
    msg_token_expirado: "Token expirado",
    msg_venda_ok: "Venda realizada com sucesso",
    msg_falha_finalizar: "Falha ao finalizar venda",
    msg_falha_gerente_rede: "Falha na rede do gerente",
    msg_validacao_falha: "Falha na validação",
    msg_lock_ate: "Bloqueado até",
    msg_gerente_ok: "Gerente validado",
    valor_inicial: "Valor inicial",
    valor_final: "Valor final",
    modal_valor_label: "Valor",
    modal_valor_placeholder: "0,00",
    msg_valor_inicial_invalido: "Valor inicial inválido",
    msg_valor_contado_invalido: "Valor contado inválido",
    modal_valor_titulo_abrir: "Abrir Caixa",
    modal_valor_titulo_fechar: "Fechar Caixa",
    modal_motivo_diferenca_titulo: "Motivo da Diferença",
    modal_motivo_blind_titulo: "Motivo do Fechamento",
    modal_motivo_diferenca_desc: "Diferença encontrada",
    modal_motivo_blind_desc: "Fechamento cego"
  }
}

export default function LayoutTestePage() {
  const totalBruto = mockItens.reduce((sum, item) => sum + (item.precoOriginal * item.quantidade), 0)
  const totalDesconto = mockItens.reduce((sum, item) => sum + ((item.precoOriginal - item.precoUnitario) * item.quantidade), 0)
  const totalLiquido = mockItens.reduce((sum, item) => sum + (item.precoUnitario * item.quantidade), 0)

  const handleAlterarQuantidade = (itemId: string, quantidade: number) => {
    console.log(`Alterar quantidade: ${itemId} -> ${quantidade}`)
  }

  const handleRemover = (itemId: string) => {
    console.log(`Remover item: ${itemId}`)
  }

  const handleAdicionarProduto = (codigo: string) => {
    console.log(`Adicionar produto: ${codigo}`)
  }

  return (
    <div className="min-h-screen">
      <div className="bg-blue-50 border-b border-blue-200 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-blue-900">🧪 Teste do Layout do Caixa</h1>
          <p className="text-blue-700 mt-2">
            Esta é uma página de teste para validar o layout grid do caixa com accessibility e estados interativos.
          </p>
        </div>
      </div>
      
      <CaixaGridLayout
        m={mockMensagens as any}
        idioma="pt"
        itens={mockItens}
        totalBruto={totalBruto}
        totalDesconto={totalDesconto}
        totalLiquido={totalLiquido}
        onAlterarQuantidade={handleAlterarQuantidade}
        onRemover={handleRemover}
        onAdicionarProduto={handleAdicionarProduto}
        buscando={false}
        carregandoRegras={false}
        mensagem={null}
        msgVendaOk={null}
        caixaAberto={true}
        operadorNome="Operador Teste"
        caixaId="99"
      />
    </div>
  )
}
