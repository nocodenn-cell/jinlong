type Resultado = { ok: true } | { ok: false; error: string }

export async function atualizarPedidoEspera(
  id: string,
  operacao: (id: string) => Promise<Resultado>,
  onErro: (mensagem: string) => void,
  mensagemPadrao: string,
): Promise<void> {
  try {
    const resultado = await operacao(id)
    if (!resultado.ok) {
      console.error("[caixa.espera.atualizacao_falhou]", { id, error: resultado.error })
      onErro(resultado.error)
    }
  } catch (error) {
    console.error("[caixa.espera.atualizacao_falhou]", { id, error })
    onErro(mensagemPadrao)
  }
}
