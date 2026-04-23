/**
 * Re-monta a cada navegação — animação leve (opacity + scale) em toda troca de rota.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/template
 */
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return <div className="dragon-page-enter">{children}</div>
}
