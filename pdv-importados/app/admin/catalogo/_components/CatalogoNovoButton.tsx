'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ClipboardList } from 'lucide-react'
import { ROUTES } from '@/lib/navigation/routes'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { Button } from '@/components/ui/button'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { useRouter } from 'next/navigation'

export function CatalogoNovoButton({
  label,
  labelCompleto,
  titleHint,
  m,
  opcoes,
  idioma,
}: {
  label: string
  /** Cadastro completo (página `novo/completo`). Sem rótulo, o link não é exibido. */
  labelCompleto?: string
  /** Ex.: “Atalho: N” — aparece no title do botão. */
  titleHint?: string
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  idioma: Idioma
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="gap-1.5"
        title={titleHint ? `${label} (${titleHint})` : label}
      >
        <Plus size={14} aria-hidden />
        {label}
      </Button>

      {labelCompleto ? (
        <Button asChild variant="secondary" className="gap-1.5">
          <Link href={ROUTES.admin.catalogoCompletoNovo}>
            <ClipboardList size={14} aria-hidden />
            {labelCompleto}
          </Link>
        </Button>
      ) : null}

      <NovoProdutoModal
        open={open}
        onOpenChange={setOpen}
        m={m}
        opcoes={opcoes}
        idioma={idioma}
        onCriado={() => {
          router.refresh()
        }}
      />
    </>
  )
}
