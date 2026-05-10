import type { Meta, StoryObj } from '@storybook/react'
import { CaixaHeader } from '@/app/caixa/CaixaHeader'

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
      description: 'Status atual do caixa',
    },
    regrasPrecoLoading: {
      control: 'boolean',
      description: 'Se as regras de preço estão carregando',
    },
    dinheiroSistema: {
      control: 'number',
      description: 'Valor em dinheiro no sistema',
    },
    blindClosure: {
      control: 'boolean',
      description: 'Se está em modo blind closure',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    m: {
      caixa: {
        logo_wordmark_alt: 'Dragon POS',
        data_hora_atual: '30/04/2026 14:20:00',
        status_caixa_aberto: 'Caixa Aberto',
        status_caixa_fechado: 'Caixa Fechado',
        dinheiro_em_sistema: 'Dinheiro em Sistema: R$',
        carregando_regras_preco: 'Carregando regras de preço...',
        aria_status_caixa: 'Status do caixa',
        aria_data_hora: 'Data e hora atual',
        aria_dinheiro_sistema: 'Valor em dinheiro no sistema',
      },
      pdv: {
        sair: 'Sair',
      },
    },
    idioma: 'pt-BR',
    caixaStatus: {
      aberto: true,
      dataAbertura: '2026-04-30T08:00:00Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.50,
    },
    regrasPrecoLoading: false,
    dinheiroSistema: 2500.50,
    blindClosure: false,
  },
}

export const Closed: Story = {
  args: {
    m: {
      caixa: {
        logo_wordmark_alt: 'Dragon POS',
        data_hora_atual: '30/04/2026 14:20:00',
        status_caixa_aberto: 'Caixa Aberto',
        status_caixa_fechado: 'Caixa Fechado',
        dinheiro_em_sistema: 'Dinheiro em Sistema: R$',
        carregando_regras_preco: 'Carregando regras de preço...',
        aria_status_caixa: 'Status do caixa',
        aria_data_hora: 'Data e hora atual',
        aria_dinheiro_sistema: 'Valor em dinheiro no sistema',
      },
      pdv: {
        sair: 'Sair',
      },
    },
    idioma: 'pt-BR',
    caixaStatus: {
      aberto: false,
    },
    regrasPrecoLoading: false,
    dinheiroSistema: 0,
    blindClosure: false,
  },
}

export const Loading: Story = {
  args: {
    m: {
      caixa: {
        logo_wordmark_alt: 'Dragon POS',
        data_hora_atual: '30/04/2026 14:20:00',
        status_caixa_aberto: 'Caixa Aberto',
        status_caixa_fechado: 'Caixa Fechado',
        dinheiro_em_sistema: 'Dinheiro em Sistema: R$',
        carregando_regras_preco: 'Carregando regras de preço...',
        aria_status_caixa: 'Status do caixa',
        aria_data_hora: 'Data e hora atual',
        aria_dinheiro_sistema: 'Valor em dinheiro no sistema',
      },
      pdv: {
        sair: 'Sair',
      },
    },
    idioma: 'pt-BR',
    caixaStatus: {
      aberto: true,
      dataAbertura: '2026-04-30T08:00:00Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.50,
    },
    regrasPrecoLoading: true,
    dinheiroSistema: 2500.50,
    blindClosure: false,
  },
}

export const BlindClosure: Story = {
  args: {
    m: {
      caixa: {
        logo_wordmark_alt: 'Dragon POS',
        data_hora_atual: '30/04/2026 14:20:00',
        status_caixa_aberto: 'Caixa Aberto',
        status_caixa_fechado: 'Caixa Fechado',
        dinheiro_em_sistema: 'Dinheiro em Sistema: R$',
        carregando_regras_preco: 'Carregando regras de preço...',
        aria_status_caixa: 'Status do caixa',
        aria_data_hora: 'Data e hora atual',
        aria_dinheiro_sistema: 'Valor em dinheiro no sistema',
      },
      pdv: {
        sair: 'Sair',
      },
    },
    idioma: 'pt-BR',
    caixaStatus: {
      aberto: true,
      dataAbertura: '2026-04-30T08:00:00Z',
      valorInicial: 1000,
      valorSistemaDinheiro: 2500.50,
    },
    regrasPrecoLoading: false,
    dinheiroSistema: 2500.50,
    blindClosure: true,
  },
}
