"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Lock, Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { CaixaConfirmModal } from "@/app/caixa/CaixaConfirmModal"
import {
  assumirCaixaLiberado,
  bloquearCaixaOperador,
  desbloquearCaixaComPin,
  liberarCaixaParaTroca,
  obterContextoTrocaOperador,
} from "@/app/caixa/actions"
import {
  CANAL_TROCA_OPERADOR,
  minutosBloqueio,
  responsavelDiferente,
  type MotivoTrocaBloqueada,
  type TrocaContexto,
  type TrocaErro,
} from "@/app/caixa/caixaTrocaOperadorRegras"
import { performClientLogout } from "@/lib/auth/clientLogout"
import { resetCarrinhoPersistido } from "@/lib/caixa/resetCarrinhoPersistido"
import { cn } from "@/lib/utils"

type Aviso = (texto: string, opts?: { kind?: "success" | "error" | "warning" | "info" }) => void

const EVENTOS_ATIVIDADE = ["keydown", "pointerdown", "wheel", "touchstart"] as const

export function mensagemErroTroca(m: Mensagens, erro: TrocaErro): string {
  const c = m.caixa
  switch (erro) {
    case "em_uso": return c.troca_erro_em_uso
    case "outro_caixa": return c.troca_erro_outro_caixa
    case "nao_operador": return c.troca_erro_nao_operador
    case "caixa_fechado": return c.troca_erro_caixa_fechado
    case "pin_incorreto": return c.troca_erro_pin_incorreto
    case "pin_bloqueado": return c.troca_erro_pin_bloqueado
    case "pin_bloqueado_gerente": return c.troca_erro_pin_bloqueado_gerente
    case "sem_pin": return c.troca_erro_sem_pin
    case "pin_invalido": return c.troca_erro_pin_invalido
    default: return c.troca_erro_generico
  }
}

function avisarOutrasAbas() {
  try {
    const ch = new BroadcastChannel(CANAL_TROCA_OPERADOR)
    ch.postMessage({ tipo: "troca" })
    ch.close()
  } catch {
    /* navegador sem BroadcastChannel: o servidor continua barrando a aba antiga */
  }
}

/**
 * Estado e ações da troca de operador. O servidor é a autoridade (regra única no banco); aqui só a UX:
 * pré-condições, confirmação, recarga das outras abas e bloqueio por inatividade quando a loja exige PIN.
 */
export function useCaixaTrocaOperador({
  m,
  statusKey,
  motivoBloqueada,
  onMudou,
  aviso,
}: {
  m: Mensagens
  /** Muda quando o status do caixa muda (recarrega o contexto). */
  statusKey: string
  motivoBloqueada: MotivoTrocaBloqueada
  onMudou: () => Promise<void> | void
  aviso: Aviso
}) {
  const [ctx, setCtx] = useState<TrocaContexto | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [processando, setProcessando] = useState(false)

  const recarregar = useCallback(async () => {
    const r = await obterContextoTrocaOperador()
    setCtx(r.ok ? r.data : null)
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar, statusKey])

  // Troca/bloqueio em outra aba deste navegador: esta aba não pode seguir mostrando o operador antigo.
  useEffect(() => {
    let ch: BroadcastChannel | null = null
    try {
      ch = new BroadcastChannel(CANAL_TROCA_OPERADOR)
      ch.onmessage = () => globalThis.location?.reload()
    } catch {
      ch = null
    }
    return () => ch?.close()
  }, [])

  const pedirTroca = useCallback(() => {
    if (motivoBloqueada === "carrinho") return aviso(m.caixa.troca_bloqueada_carrinho, { kind: "warning" })
    if (motivoBloqueada) return aviso(m.caixa.troca_bloqueada_finalizando, { kind: "warning" })
    setConfirmando(true)
  }, [aviso, m, motivoBloqueada])

  const confirmarTroca = useCallback(async () => {
    const caixaId = ctx?.operando?.caixaId
    if (!caixaId || processando) return
    setProcessando(true)
    try {
      const r = await liberarCaixaParaTroca(caixaId)
      if (!r.ok) {
        aviso(mensagemErroTroca(m, r.erro), { kind: "error" })
        return
      }
      aviso(m.caixa.troca_saindo, { kind: "info" })
      avisarOutrasAbas()
      const sair = await performClientLogout()
      resetCarrinhoPersistido()
      globalThis.location?.assign(sair.ok ? "/login?next=%2Fcaixa&reason=troca_operador" : "/caixa")
    } finally {
      setProcessando(false)
      setConfirmando(false)
    }
  }, [aviso, ctx, m, processando])

  const assumir = useCallback(
    async (caixaId: string) => {
      if (processando) return
      setProcessando(true)
      try {
        const r = await assumirCaixaLiberado(caixaId)
        if (!r.ok) {
          aviso(mensagemErroTroca(m, r.erro), { kind: "error" })
          return
        }
        aviso(m.caixa.troca_assumido_ok, { kind: "success" })
        avisarOutrasAbas()
        await onMudou()
        await recarregar()
      } finally {
        setProcessando(false)
      }
    },
    [aviso, m, onMudou, processando, recarregar],
  )

  const bloquear = useCallback(
    async (motivo: "INATIVIDADE" | "MANUAL") => {
      const r = await bloquearCaixaOperador(motivo)
      if (!r.ok) {
        aviso(mensagemErroTroca(m, r.erro), { kind: "error" })
        return
      }
      avisarOutrasAbas()
      await recarregar()
      await onMudou()
    },
    [aviso, m, onMudou, recarregar],
  )

  const desbloquear = useCallback(
    async (pin: string): Promise<string | null> => {
      const r = await desbloquearCaixaComPin(pin)
      if (!r.ok) return mensagemErroTroca(m, r.erro)
      await recarregar()
      await onMudou()
      return null
    },
    [m, onMudou, recarregar],
  )

  // Bloqueio automático por inatividade: só com PIN exigido pela loja e o usuário operando o caixa.
  const operandoId = ctx?.operando?.caixaId ?? null
  const pinAtivo = ctx?.pin.ativo === true
  const minutos = minutosBloqueio(ctx?.pin.minutos)
  const bloquearRef = useRef(bloquear)
  bloquearRef.current = bloquear
  useEffect(() => {
    if (!pinAtivo || !operandoId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const armar = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void bloquearRef.current("INATIVIDADE"), minutos * 60_000)
    }
    armar()
    for (const ev of EVENTOS_ATIVIDADE) globalThis.addEventListener(ev, armar, { passive: true })
    return () => {
      if (timer) clearTimeout(timer)
      for (const ev of EVENTOS_ATIVIDADE) globalThis.removeEventListener(ev, armar)
    }
  }, [pinAtivo, operandoId, minutos])

  return { ctx, confirmando, setConfirmando, processando, pedirTroca, confirmarTroca, assumir, bloquear, desbloquear }
}

export type CaixaTrocaEstado = ReturnType<typeof useCaixaTrocaOperador>

/** Barra superior: "Turno de: X" (quando ≠ operador), Bloquear (com PIN) e Trocar operador. */
export function CaixaTrocaControles({ m, troca, userId }: { m: Mensagens; troca: CaixaTrocaEstado; userId: string | null }) {
  const ctx = troca.ctx
  if (!ctx?.operando) return null
  const responsavel = responsavelDiferente(ctx, userId)
  return (
    <>
      {responsavel ? (
        <span
          data-testid="caixa-turno-de"
          className="max-w-48 truncate rounded-md border px-2 py-1 text-xs font-medium border-jl-border-1 bg-jl-surface-soft sm:text-sm"
          title={caixaFmt(m.caixa.topbar_turno_de, { nome: responsavel })}
        >
          {caixaFmt(m.caixa.topbar_turno_de, { nome: responsavel })}
        </span>
      ) : null}
      {ctx.pin.ativo ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-xs font-semibold sm:text-sm border-jl-border-1"
          onClick={() => void troca.bloquear("MANUAL")}
          data-testid="caixa-btn-bloquear"
        >
          <Lock className="mr-1 h-3.5 w-3.5" aria-hidden />
          {m.caixa.troca_bloquear_btn}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-xs font-semibold sm:text-sm border-jl-border-1"
        onClick={troca.pedirTroca}
        disabled={troca.processando}
        data-testid="caixa-btn-trocar-operador"
      >
        <Repeat className="mr-1 h-3.5 w-3.5" aria-hidden />
        {m.caixa.troca_btn}
      </Button>
    </>
  )
}

function horaCurta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Avisos abaixo da barra: turno liberado para assumir; o próprio turno está com outra pessoa. */
export function CaixaTrocaAvisos({ m, troca }: { m: Mensagens; troca: CaixaTrocaEstado }) {
  const ctx = troca.ctx
  if (!ctx || ctx.operando || ctx.bloqueado) return null
  const pe = ctx.proprioEmUso
  if (!pe && ctx.liberados.length === 0) return null
  return (
    <div className="shrink-0 flex flex-col gap-2 px-4 pt-3 sm:px-6" data-testid="caixa-troca-avisos">
      {pe ? (
        <p role="status" className="rounded-md border px-3 py-2 text-sm border-amber-500/40 bg-amber-500/10">
          {pe.liberado
            ? m.caixa.troca_proprio_liberado
            : pe.bloqueado
              ? caixaFmt(m.caixa.troca_proprio_bloqueado, { nome: pe.operadorNome ?? "—" })
              : caixaFmt(m.caixa.troca_proprio_em_uso, { nome: pe.operadorNome ?? "—" })}
        </p>
      ) : null}
      {ctx.liberados.length > 0 ? (
        <section
          aria-label={m.caixa.troca_liberados_titulo}
          className="rounded-md border px-3 py-2 border-jl-border-1 bg-jl-surface-soft"
        >
          <p className="mb-1 text-sm font-semibold">{m.caixa.troca_liberados_titulo}</p>
          <ul className="flex flex-col gap-1.5">
            {ctx.liberados.map((l) => (
              <li key={l.caixaId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{caixaFmt(m.caixa.troca_liberado_item, { nome: l.responsavelNome, hora: horaCurta(l.dataAbertura) })}</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void troca.assumir(l.caixaId)}
                  disabled={troca.processando}
                  data-testid="caixa-btn-assumir-caixa"
                >
                  {m.caixa.troca_assumir_btn}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** Confirmação da troca + tela de bloqueio (PIN do MESMO operador; conferido no servidor). */
export function CaixaTrocaModais({ m, troca, operadorLabel }: { m: Mensagens; troca: CaixaTrocaEstado; operadorLabel: string }) {
  return (
    <>
      <CaixaConfirmModal
        open={troca.confirmando}
        title={m.caixa.troca_confirmar_titulo}
        description={m.caixa.troca_confirmar_desc}
        m={m}
        processing={troca.processando}
        confirmLabel={m.caixa.troca_btn}
        confirmVariant="primary"
        onOpenChange={troca.setConfirmando}
        onConfirm={() => void troca.confirmarTroca()}
      />
      {troca.ctx?.bloqueado ? <CaixaTelaBloqueio m={m} troca={troca} operadorLabel={operadorLabel} /> : null}
    </>
  )
}

function CaixaTelaBloqueio({ m, troca, operadorLabel }: { m: Mensagens; troca: CaixaTrocaEstado; operadorLabel: string }) {
  const [pin, setPin] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const enviar = async (valor: string) => {
    if (enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const e = await troca.desbloquear(valor)
      if (e) {
        setErro(e)
        setPin("")
        inputRef.current?.focus()
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="caixa-bloqueio-titulo"
      data-testid="caixa-tela-bloqueio"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur"
    >
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6 shadow-lg border-jl-border-1 bg-jl-surface-elev"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(pin)
        }}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5" aria-hidden />
          <h2 id="caixa-bloqueio-titulo" className="text-lg font-semibold">{m.caixa.bloqueio_titulo}</h2>
        </div>
        <p className="text-sm text-jl-fg-2">{caixaFmt(m.caixa.bloqueio_desc, { nome: operadorLabel })}</p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.caixa.bloqueio_pin_label}
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            disabled={enviando}
            data-testid="caixa-bloqueio-pin"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4)
              setPin(v)
              if (v.length === 4) void enviar(v)
            }}
            className={cn(
              "rounded-md border px-3 py-2 text-center text-2xl tracking-[0.5em] tabular-nums",
              "border-jl-border-1 bg-background focus:border-primary focus:outline-none",
            )}
          />
        </label>
        {erro ? <p role="alert" className="text-sm font-medium text-destructive">{erro}</p> : null}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await performClientLogout()
              globalThis.location?.assign("/login?next=%2Fcaixa")
            }}
          >
            {m.caixa.bloqueio_sair}
          </Button>
          <Button type="submit" disabled={enviando || pin.length !== 4} data-testid="caixa-bloqueio-desbloquear">
            {m.caixa.bloqueio_desbloquear}
          </Button>
        </div>
      </form>
    </div>
  )
}
