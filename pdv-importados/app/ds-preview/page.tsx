'use client'

/**
 * Prova viva do Design System em camadas.
 * Os MESMOS componentes (components/ds) trocam de identidade (Theme Layer) e de
 * ergonomia (Density Layer) sem nenhuma alteração de markup — só os atributos
 * data-theme / data-density no DSRoot mudam. Demonstra a regra central:
 * "qualquer UI muda de identidade visual sem refactor".
 */
import { useState } from 'react'
import {
  DSRoot,
  Button,
  Card,
  CardTitle,
  CardSubtitle,
  Field,
  Input,
  Select,
  Stack,
  Text,
  Badge,
  type DSTheme,
  type DSDensity,
} from '@/components/ds'

const THEMES: DSTheme[] = ['commercial-gold', 'default', 'dragon']
const DENSITIES: DSDensity[] = ['compact', 'default', 'spacious']

export default function DsPreviewPage() {
  const [theme, setTheme] = useState<DSTheme>('commercial-gold')
  const [density, setDensity] = useState<DSDensity>('default')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)', padding: '2rem' }}>
      <DSRoot theme={theme} density={density}>
        <Stack style={{ maxWidth: 880, margin: '0 auto' }}>
          {/* Switchers — mesma UI, skins diferentes */}
          <Card elevation={2}>
            <CardTitle>Design System — prova de intercâmbio</CardTitle>
            <CardSubtitle>
              Troque tema e densidade. O markup abaixo é idêntico em todos os casos.
            </CardSubtitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '1rem' }}>
              <Field label="Theme Layer (skin)">
                <Select value={theme} onChange={(e) => setTheme(e.target.value as DSTheme)}>
                  {THEMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Density Layer (ergonomia)">
                <Select value={density} onChange={(e) => setDensity(e.target.value as DSDensity)}>
                  {DENSITIES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          {/* Buttons */}
          <Card>
            <CardTitle>Button</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="primary">Primário</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Perigo</Button>
              <Button variant="primary" size="sm">sm</Button>
              <Button variant="primary" size="lg">lg</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
          </Card>

          {/* Form + Badges */}
          <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
            <Card>
              <CardTitle>Form fields</CardTitle>
              <Stack style={{ marginTop: '1rem' }}>
                <Field label="Origem" htmlFor="o"><Input id="o" placeholder="fornecedor X" /></Field>
                <Field label="Quantidade" htmlFor="q"><Input id="q" type="number" placeholder="0" /></Field>
              </Stack>
            </Card>
            <Card recessive>
              <CardTitle>Badges (semântica via token)</CardTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                <Badge tone="success">Concluída</Badge>
                <Badge tone="warning">Pendente</Badge>
                <Badge tone="danger">Cancelada</Badge>
                <Badge tone="info">Processando</Badge>
                <Badge tone="neutral">Rascunho</Badge>
              </div>
              <Text as="p" tone="muted" style={{ marginTop: '1rem', fontSize: 'var(--ds-text-sm)' }}>
                Card recessivo + texto muted: hierarquia resolvida por token, não por tema.
              </Text>
            </Card>
          </div>
        </Stack>
      </DSRoot>
    </div>
  )
}
