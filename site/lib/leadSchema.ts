import { z } from 'zod'

const txt = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^\u0000-\u001f\u007f<>]*$/)
const opt = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), txt(1, max).optional())
const optText = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), txt(min, max).optional())

/** Segmentos do formulário (valor gravado em commercial_leads.segment; rótulo vem do conteúdo por idioma). */
export const SEGMENT_VALUES = ['importados', 'eletronicos', 'utilidades', 'atacado', 'moda', 'outro'] as const

/** Campos extras do lead (validados com zod no cliente e no servidor). */
export const leadExtrasSchema = z.object({
  // Cidade saiu do formulário curto; continua aceita (coluna opcional) para não quebrar integrações.
  city: optText(2, 80),
  segment: z.enum(SEGMENT_VALUES),
  wechat: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().regex(/^[\w.+@-]{3,40}$/).optional(),
  ),
  idioma: z.enum(['pt-BR', 'zh-CN']),
  utm_source: opt(100),
  utm_medium: opt(100),
  utm_campaign: opt(100),
})

export type LeadExtras = z.infer<typeof leadExtrasSchema>
export type LeadExtraField = 'city' | 'segment' | 'wechat' | 'idioma'

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const

export function readUtms(search: string): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const p = new URLSearchParams(search)
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {}
  for (const k of UTM_KEYS) {
    const v = p.get(k)?.trim().slice(0, 100)
    if (v) out[k] = v
  }
  return out
}
