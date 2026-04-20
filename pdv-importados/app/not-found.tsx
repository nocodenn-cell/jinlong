import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Página não encontrada</h1>
      <p className="text-sm text-slate-600">O endereço não existe ou foi movido.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/" className="font-medium text-blue-700 underline hover:text-blue-900">
          Início
        </Link>
        <Link href="/login" className="font-medium text-blue-700 underline hover:text-blue-900">
          Login
        </Link>
      </div>
    </div>
  )
}
