import type { HomeContent } from '@/lib/content'
import { CONTACT_EMAIL, getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'
import { Ph } from './Placeholder'
import { TrialForm } from './TrialForm'

export function FinalCta({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { final, form } = content
  const whatsapp = getContactChannels(locale).find((c) => c.id === 'whatsapp')
  return (
    <section className="jl-final" id="shiyong" aria-labelledby="h-final">
      <span className="jl-sig" lang="zh-CN">
        金龙
      </span>
      <h2 id="h-final">{final.title}</h2>
      <p><Ph text={final.lead} /></p>
      <TrialForm copy={form} email={CONTACT_EMAIL} whatsappHref={whatsapp?.href ?? null} />
    </section>
  )
}
