"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  normalizeHumanTelemetryPayload,
  type EnqueueScanResult,
  type HumanTelemetryPayload,
  type HumanTelemetryPayloadInput,
  type ScanEventMeta,
  type ScanPipelineController,
  type ScanPipelineFlushReason,
  type ScanPipelineSnapshot,
} from "../../../../shared-core/src/pdv/scan-pipeline"
import { createScanPipelineController } from "../../../../shared-core/src/pdv/scan-pipeline-runtime"
import { runWebCaixaScanProcess, type WebCaixaScanDeps } from "./webCaixaScanProcess"
import { composeScanPipelineSinks, createCaixaScanTelemetrySink } from "./caixaScanTelemetrySink"
import { createPersistedCaixaScanTelemetrySink } from "./persistedCaixaScanTelemetrySink"

export type FlushLeiturasPendentesOptions = {
  reason?: Extract<ScanPipelineFlushReason, "manual" | "new_cupom">
}

export function useCaixaScanPipeline(deps: WebCaixaScanDeps) {
  const [buscandoPipeline, setBuscandoPipeline] = useState(false)
  const [pipelineDebugSnapshot, setPipelineDebugSnapshot] = useState<ScanPipelineSnapshot | null>(null)
  const [pipelineTelemetryTail, setPipelineTelemetryTail] = useState<HumanTelemetryPayload[]>([])

  const devCaptureSink = useMemo(
    () => ({
      emitTelemetry(payload: HumanTelemetryPayloadInput) {
        if (process.env.NODE_ENV === "production") return
        setPipelineTelemetryTail((prev) => [...prev.slice(-24), normalizeHumanTelemetryPayload(payload)])
      },
    }),
    [],
  )

  const telemetry = useMemo(
    () =>
      composeScanPipelineSinks(
        createCaixaScanTelemetrySink(),
        createPersistedCaixaScanTelemetrySink(),
        devCaptureSink,
      ),
    [devCaptureSink],
  )

  const depsRef = useRef<WebCaixaScanDeps>(deps)
  depsRef.current = { ...deps, telemetry }

  const controllerRef = useRef<ScanPipelineController | null>(null)

  useLayoutEffect(() => {
    const c = createScanPipelineController(
      {
        maxQueueDepth: 50,
        dedupeWindowMs: 0,
        enqueueWhilePaused: false,
      },
      async (ctx) => runWebCaixaScanProcess(ctx, depsRef.current),
      { telemetry },
    )
    controllerRef.current = c
    const unsub = c.subscribe((s) => {
      setBuscandoPipeline(s.isProcessing || s.queueDepth > 0)
      if (process.env.NODE_ENV !== "production") {
        setPipelineDebugSnapshot(s)
      }
    })
    return () => {
      unsub()
      c.shutdown()
      controllerRef.current = null
    }
  }, [telemetry])

  const enqueueLeitura = useCallback((codigo: string, meta?: ScanEventMeta): EnqueueScanResult | null => {
    const ctrl = controllerRef.current
    if (!ctrl) return null
    return ctrl.enqueue(codigo, meta)
  }, [])

  const flushLeiturasPendentes = useCallback((opts?: FlushLeiturasPendentesOptions) => {
    controllerRef.current?.flush({
      discardPending: true,
      reason: opts?.reason ?? "manual",
    })
  }, [])

  const pipelineDebug =
    process.env.NODE_ENV === "production"
      ? null
      : {
          snapshot: pipelineDebugSnapshot,
          telemetryTail: pipelineTelemetryTail,
        }

  return {
    enqueueLeitura,
    buscandoPipeline,
    flushLeiturasPendentes,
    pipelineDebug,
  }
}
