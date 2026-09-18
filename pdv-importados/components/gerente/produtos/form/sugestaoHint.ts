/**
 * G-12 — combina o aviso de fonte da sugestão de cadastro com o aviso de
 * marca detectada (quando houver), em texto puro e testável.
 *
 * `s.marca` (retorno de `sugerirDadosCadastroPorGtin`) é texto livre da
 * fonte externa; o campo do formulário é `marcaId`, uma FK pro catálogo de
 * marcas da loja. Aplicar `s.marca` automaticamente a `marcaId` arriscaria
 * vincular a uma marca cadastrada errada (nome parecido) ou falhar em
 * silêncio — por isso a marca sugerida vira só um aviso textual; o operador
 * escolhe/cadastra a marca pelo campo normal, com o nome sugerido à mão.
 */
export function combinarSugestaoHint(
  baseHint: string | null,
  marca: string | null,
  marcaHintTemplate: string,
): string | null {
  const marcaHint = marca ? marcaHintTemplate.replace('{{marca}}', marca) : null
  const combinado = [baseHint, marcaHint].filter(Boolean).join(' ')
  return combinado.length > 0 ? combinado : null
}
