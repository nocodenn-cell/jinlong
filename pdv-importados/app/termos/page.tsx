import type { Metadata } from 'next'
import { DocumentoLegal } from '@/components/legal/DocumentoLegal'

export const metadata: Metadata = {
  title: 'Termos de Serviço',
  description: 'Termos de Serviço e Política de Privacidade da Plataforma.',
}

export default function TermosPage() {
  return <DocumentoLegal destaque="termos" />
}
