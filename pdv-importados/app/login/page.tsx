import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#020617',
            color: '#9ca3af',
            fontSize: 14,
          }}
        >
          Carregando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
