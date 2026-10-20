import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AtivacaoPdvGate } from './ativacao/AtivacaoPdvGate'
import { initSentry } from './lib/sentry'

initSentry()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AtivacaoPdvGate>
      <App />
    </AtivacaoPdvGate>
  </React.StrictMode>
)

// #37 — Remove o splash de boot assim que o app pinta. Dois requestAnimationFrame
// garantem que o React commitou e o navegador desenhou o app por baixo antes de
// iniciar o fade, evitando qualquer flash entre splash e tela montada.
function dismissBootSplash(): void {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      splash.classList.add('boot-splash--hidden')
      const remove = () => splash.remove()
      splash.addEventListener('transitionend', remove, { once: true })
      // Fallback caso o transitionend não dispare (ex.: reduced-motion sem transição).
      window.setTimeout(remove, 600)
    }),
  )
}

dismissBootSplash()

