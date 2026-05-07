"use client"

export default function LayoutTestePage() {
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

      <div className="p-6 text-sm text-blue-900">
        Página de teste temporariamente desativada para manter compatibilidade de build.
      </div>
    </div>
  )
}
