import type { Meta, StoryObj } from '@storybook/react'
import { CaixaHeader } from '@/app/caixa/CaixaHeader'
import type { Mensagens } from '@/i18n/getMessages'
import pt from '@/i18n/pt.json'

const m = pt as Mensagens

const noop = () => {}

const meta: Meta<typeof CaixaHeader> = {
  title: 'Caixa/CaixaHeader',
  component: CaixaHeader,
  parameters: {
    docs: {
      description: {
        component: 'Header do caixa com logo, data/hora e status do caixa.',
      },
    },
  },
  argTypes: {
    caixaStatus: {
      control: 'object',
      description: 'Status atual do caixa (aberto com saldo ou fechado)',
    },
    carregandoRegras: {
      control: 'boolean',
      description: 'Se as regras de preço estão carregando',
    },
    processandoCaixa: {
      control: 'boolean',
      description: 'Se abrir/fechar caixa está em andamento',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    m,
    idioma: 'pt',
    layoutVariant: 'default',
    operadorLabel: 'operador@exemplo.com',
    carregandoRegras: false,
    caixaStatus: {
      aberto: true,
      caixaId: 'a0000001-0000-4000-8000-0000000000ca',
      dataAbertura: '2026-04-30T08:00:00.000Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.5,
      blindClosureEnabled: false,
    },
    processandoCaixa: false,
    onAbrirCaixa: noop,
    onFecharCaixa: noop,
  },
}

export const Closed: Story = {
  args: {
    m,
    idioma: 'pt',
    layoutVariant: 'default',
    operadorLabel: 'operador@exemplo.com',
    carregandoRegras: false,
    caixaStatus: { aberto: false },
    processandoCaixa: false,
    onAbrirCaixa: noop,
    onFecharCaixa: noop,
  },
}

export const Loading: Story = {
  args: {
    m,
    idioma: 'pt',
    layoutVariant: 'default',
    operadorLabel: 'operador@exemplo.com',
    carregandoRegras: true,
    caixaStatus: {
      aberto: true,
      caixaId: 'a0000001-0000-4000-8000-0000000000ca',
      dataAbertura: '2026-04-30T08:00:00.000Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.5,
      blindClosureEnabled: false,
    },
    processandoCaixa: false,
    onAbrirCaixa: noop,
    onFecharCaixa: noop,
  },
}

export const BlindClosure: Story = {
  args: {
    m,
    idioma: 'pt',
    layoutVariant: 'default',
    operadorLabel: 'operador@exemplo.com',
    carregandoRegras: false,
    caixaStatus: {
      aberto: true,
      caixaId: 'b0000002-0000-4000-8000-0000000000ca',
      dataAbertura: '2026-04-30T08:00:00.000Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.5,
      blindClosureEnabled: true,
    },
    processandoCaixa: false,
    onAbrirCaixa: noop,
    onFecharCaixa: noop,
  },
}

export const ClassicTopBar: Story = {
  args: {
    ...BlindClosure.args,
    layoutVariant: 'classic',
    caixaStatus: {
      aberto: true,
      caixaId: 'c0000003-0000-4000-8000-0000000000ca',
      dataAbertura: '2026-04-30T08:00:00.000Z',
      valorInicial: 500,
      valorSistemaDinheiro: 1200.25,
      blindClosureEnabled: false,
    },
  },
}
