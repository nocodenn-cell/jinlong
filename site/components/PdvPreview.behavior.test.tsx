// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getHomeContent } from '@/lib/content'
import { PdvPreview } from './PdvPreview'

afterEach(cleanup)

describe('PdvPreview', () => {
  it('troca para atacado ao chegar em 6 unidades e volta ao diminuir', () => {
    const copy = getHomeContent('pt-BR').preview
    render(<PdvPreview locale="pt-BR" copy={copy} />)

    const increase = screen.getByRole('button', { name: `${copy.increase} Cabo HDMI 2 m` })
    const decrease = screen.getByRole('button', { name: `${copy.decrease} Cabo HDMI 2 m` })
    expect(screen.queryByText(copy.atacado)).toBeNull()

    for (let i = 0; i < 5; i += 1) fireEvent.click(increase)
    expect(screen.getByText(copy.atacado)).toBeTruthy()

    fireEvent.click(decrease)
    expect(screen.queryByText(copy.atacado)).toBeNull()
  })

  it('não permite quantidade negativa', () => {
    const copy = getHomeContent('pt-BR').preview
    render(<PdvPreview locale="pt-BR" copy={copy} />)
    const decrease = screen.getByRole('button', { name: `${copy.decrease} Cabo HDMI 2 m` })
    fireEvent.click(decrease)
    expect((decrease as HTMLButtonElement).disabled).toBe(true)
  })

  it('em zh mostra o nome chinês com o nome em português como apoio', () => {
    const copy = getHomeContent('zh-CN').preview
    render(<PdvPreview locale="zh-CN" copy={copy} />)
    expect(screen.getByText('蓝牙耳机')).toBeTruthy()
    expect(screen.getByText('Fone Bluetooth')).toBeTruthy()
  })
})
