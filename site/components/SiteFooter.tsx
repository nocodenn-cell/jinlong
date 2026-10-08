import type { HomeContent } from '@/lib/content'
import { erpHref } from '@/lib/erpLinks'

export function SiteFooter({ content }: { content: HomeContent }) {
  const { footer } = content
  return (
    <footer className="site-footer">
      <div className="site-wrap site-footer__row">
        <p>{footer.rights}</p>
        <nav className="site-footer__links" aria-label="Legal">
          <a href={erpHref('/privacidade')} hrefLang="pt-BR">
            {footer.privacy}
            {footer.ptOnly && <span lang="zh-CN"> {footer.ptOnly}</span>}
          </a>
          <a href={erpHref('/termos')} hrefLang="pt-BR">
            {footer.terms}
            {footer.ptOnly && <span lang="zh-CN"> {footer.ptOnly}</span>}
          </a>
        </nav>
      </div>
    </footer>
  )
}
