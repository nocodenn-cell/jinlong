import type { HomeContent } from '@/lib/content'
import type { LanguageSample } from '@/lib/content/types'
import { isDraftChineseVisible } from '@/lib/publication'
import type { SiteLocale } from '@/lib/locales'
import { Seal } from './Brand'
import { Mixed } from './Mixed'

function SampleFigure({ sample, lang }: { sample: LanguageSample; lang: SiteLocale }) {
  return (
    <figure lang={lang}>
      <figcaption>
        <span className="code">{sample.code}</span>
        {sample.name}
      </figcaption>
      <div className="jl-mini">
        <div className="jl-pdv-top">
          <Seal small />
          <strong>{sample.title}</strong>
        </div>
        <dl>
          {sample.rows.map(([term, value]) => (
            <Row key={term} term={term} value={value} />
          ))}
          <Row term={sample.total[0]} value={sample.total[1]} total />
        </dl>
        <div className="btn">{sample.button}</div>
      </div>
    </figure>
  )
}

function Row({ term, value, total = false }: { term: string; value: string; total?: boolean }) {
  return (
    <>
      <dt className={total ? 'tot' : undefined}>{term}</dt>
      <dd className={total ? 'tot' : undefined}>{value}</dd>
    </>
  )
}

/** O painel em chinês só aparece com o chinês publicado (ou em Preview/dev, como rascunho). */
export function LanguageCompare({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { languages } = content
  const showChinese = isDraftChineseVisible()
  return (
    <section className="jl-section" aria-labelledby="h-lang">
      <div className="jl-wrap">
        <span className="jl-eyebrow">{languages.eyebrow}</span>
        <h2 className="jl-h2" id="h-lang">
          <Mixed text={languages.title} locale={locale} />
        </h2>
        <p className="jl-lead">{languages.lead}</p>
        <div className={showChinese ? 'jl-langcmp' : 'jl-langcmp jl-langcmp--single'}>
          <SampleFigure sample={languages.pt} lang="pt-BR" />
          {showChinese && <SampleFigure sample={languages.zh} lang="zh-CN" />}
        </div>
      </div>
    </section>
  )
}
