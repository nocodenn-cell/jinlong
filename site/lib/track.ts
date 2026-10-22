// Rastreamento opcional, só carrega se a env existir. Eventos sem PII (sem nome/WhatsApp/loja).
type W = Window & { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void }
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ''
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || ''
export const GADS = process.env.NEXT_PUBLIC_GADS_CONVERSION || '' // formato AW-123456789/AbCdEf
export const GADS_ID = GADS.split('/')[0]
export function trackLead(): void {
  try {
    const w = window as W
    w.gtag?.('event', 'generate_lead', { product: 'jinlong' })
    if (GADS.includes('/')) w.gtag?.('event', 'conversion', { send_to: GADS })
    w.fbq?.('track', 'Lead')
  } catch (e) { console.warn('[jinlong-track]', e) }
}
