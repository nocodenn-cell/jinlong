/**
 * Texto com placeholders de decisão pendente ("[PREÇO]", "[CONFIRMAR: ...]") destacados.
 * Os placeholders são intencionais e visíveis: não publicar em produção sem substituí-los.
 */
export const PLACEHOLDER = /(\[[^\]]+\])/

export function Ph({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, index) =>
        PLACEHOLDER.test(part) ? (
          <mark key={index} className="jl-ph" lang="pt-BR">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}
