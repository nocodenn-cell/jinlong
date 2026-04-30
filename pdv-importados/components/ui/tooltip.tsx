"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      "app-surface app-border",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  /** Posição padrão do tooltip */
  side?: "top" | "right" | "bottom" | "left"
  /** Atraso para mostrar (ms) */
  delayDuration?: number
  /** Se deve evitar colisões com bordas */
  collisionPadding?: number
  /** Desabilitar tooltip */
  disabled?: boolean
}

export function TooltipWrapper({
  children,
  content,
  side = "top",
  delayDuration = 400,
  collisionPadding = 8,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) {
    return <>{children}</>
  }

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} collisionPadding={collisionPadding}>
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

// Componentes específicos para o caixa
export function CaixaTooltip({
  children,
  content,
  ...props
}: TooltipProps) {
  return (
    <TooltipWrapper
      {...props}
      side="top"
      delayDuration={300}
      className="text-xs app-surface-text"
    >
      {children}
    </TooltipWrapper>
  )
}

// Tooltips específicos para ações comuns do caixa
export function SuprimentoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Adicionar dinheiro ao caixa (Ctrl+Shift+S)">
      {children}
    </CaixaTooltip>
  )
}

export function SangriaTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Retirar dinheiro do caixa (Ctrl+Shift+R)">
      {children}
    </CaixaTooltip>
  )
}

export function FinalizarTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Finalizar venda (F4)">
      {children}
    </CaixaTooltip>
  )
}

export function NovoCupomTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Limpar carrinho e começar novo cupom">
      {children}
    </CaixaTooltip>
  )
}

export function FecharCaixaTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Fechar caixa (F6)">
      {children}
    </CaixaTooltip>
  )
}

export function GerenteTooltip({ children }: { children: React.ReactNode }) {
  return (
    <CaixaTooltip content="Validar senha de gerente para descontos">
      {children}
    </CaixaTooltip>
  )
}

// Tooltip para informações de produto
export function ProdutoTooltip({ 
  children, 
  produto 
}: { 
  children: React.ReactNode
  produto: {
    nome: string
    preco_varejo: number
    preco_atacado: number
    quantidade_estoque: number | null
    estoque_minimo: number | null
  }
}) {
  const content = (
    <div className="space-y-1">
      <div className="font-medium">{produto.nome}</div>
      <div className="text-xs space-y-0.5">
        <div>Varejo: R$ {produto.preco_varejo.toFixed(2)}</div>
        <div>Atacado: R$ {produto.preco_atacado.toFixed(2)}</div>
        {produto.quantidade_estoque !== null && (
          <div>Estoque: {produto.quantidade_estoque}</div>
        )}
        {produto.estoque_minimo !== null && produto.estoque_minimo > 0 && (
          <div>Mínimo: {produto.estoque_minimo}</div>
        )}
      </div>
    </div>
  )

  return (
    <CaixaTooltip content={content} side="right">
      {children}
    </CaixaTooltip>
  )
}

// Tooltip para status do caixa
export function CaixaStatusTooltip({ 
  children, 
  status 
}: { 
  children: React.ReactNode
  status: {
    aberto: boolean
    dataAbertura?: string
    valorInicial?: number
    valorSistemaDinheiro?: number
  }
}) {
  const content = status.aberto ? (
    <div className="space-y-1">
      <div className="font-medium">Caixa Aberto</div>
      <div className="text-xs space-y-0.5">
        {status.dataAbertura && (
          <div>Aberto: {new Date(status.dataAbertura).toLocaleString()}</div>
        )}
        {status.valorInicial !== undefined && (
          <div>Inicial: R$ {status.valorInicial.toFixed(2)}</div>
        )}
        {status.valorSistemaDinheiro !== undefined && (
          <div>Saldo: R$ {status.valorSistemaDinheiro.toFixed(2)}</div>
        )}
      </div>
    </div>
  ) : (
    <div className="space-y-1">
      <div className="font-medium">Caixa Fechado</div>
      <div className="text-xs">Clique para abrir o caixa</div>
    </div>
  )

  return (
    <CaixaTooltip content={content} side="bottom">
      {children}
    </CaixaTooltip>
  )
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
}
