"use client"

import type {
  HumanTelemetryPayload,
  ScanPipelineSnapshot,
} from "../../../../shared-core/src/pdv/scan-pipeline"

type Props = {
  buscandoPipeline: boolean
  snapshot: ScanPipelineSnapshot | null
  telemetryTail: HumanTelemetryPayload[]
  /** Cupom ativo no cliente (DEV). */
  activeCupomSessionId?: string
}

/**
 * Overlay DEV: estado do pipeline + últimos eventos de telemetria (sem acoplar a Sentry/console).
 */
export function CaixaScanPipelineDevPanel({
  buscandoPipeline,
  snapshot,
  telemetryTail,
  activeCupomSessionId,
}: Props) {
  if (process.env.NODE_ENV === "production") return null

  const cur = snapshot?.currentScan
  const lastWithDuration = [...telemetryTail]
    .reverse()
    .find((e) => typeof e.durationMs === "number")

  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: 9998,
        maxWidth: 360,
        maxHeight: "42vh",
        overflow: "auto",
        padding: "8px 10px",
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        lineHeight: 1.35,
        background: "rgba(15, 23, 42, 0.92)",
        color: "#e2e8f0",
        borderRadius: 6,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}
      aria-label="Debug pipeline de leituras (DEV)"
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#94a3b8" }}>scan pipeline · DEV</div>
      <div>buscandoPipeline: {String(buscandoPipeline)}</div>
      <div>queueDepth: {snapshot?.queueDepth ?? "—"}</div>
      <div>isProcessing: {String(snapshot?.isProcessing ?? false)}</div>
      <div>isPaused: {String(snapshot?.isPaused ?? false)}</div>
      <div style={{ marginTop: 6, wordBreak: "break-all" }}>
        currentScan:{" "}
        {cur
          ? `#${cur.sequenceNumber} ${cur.state} · ${cur.event.codigo.slice(0, 24)}`
          : "—"}
      </div>
      {activeCupomSessionId != null && activeCupomSessionId !== "" && (
        <div style={{ marginTop: 4, wordBreak: "break-all", color: "#86efac" }}>
          cupomSessionId (ativo): {activeCupomSessionId.slice(0, 36)}
          {activeCupomSessionId.length > 36 ? "…" : ""}
        </div>
      )}
      {lastWithDuration && (
        <div style={{ marginTop: 6, color: "#a5b4fc" }}>
          último com duration: {lastWithDuration.event} = {lastWithDuration.durationMs}ms
        </div>
      )}
      <div style={{ marginTop: 8, fontWeight: 600, color: "#94a3b8" }}>telemetria (tail)</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 14 }}>
        {telemetryTail.slice(-8).map((e, i) => (
          <li key={`${e.at}-${e.event}-${i}`} style={{ marginBottom: 2 }}>
            v{e.schemaVersion} {e.event}
            {e.durationMs != null ? ` ${e.durationMs}ms` : ""}
            {e.reason ? ` · ${e.reason}` : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
