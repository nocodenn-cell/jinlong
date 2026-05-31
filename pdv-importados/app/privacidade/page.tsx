import type { Metadata } from 'next'
import { DocumentoLegal } from '@/components/legal/DocumentoLegal'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Política de Privacidade (LGPD) e Termos de Serviço da Plataforma.',
}

export default function PrivacidadePage() {
  return <DocumentoLegal destaque="privacidade" />
}
