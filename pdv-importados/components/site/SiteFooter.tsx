import Link from 'next/link'
import type { HomeContent } from '@/lib/site/content'

export function SiteFooter({ content }: { content: HomeContent }) {
  const { footer } = content
  return (
    <footer className="site-footer">
      <div className="site-wrap site-footer__row">
        <p>{footer.rights}</p>
        <nav className="site-footer__links" aria-label="Legal">
          <Link href="/privacidade" hrefLang="pt-BR">
            {footer.privacy}
            {footer.ptOnly && <span lang="zh-CN"> {footer.ptOnly}</span>}
          </Link>
          <Link href="/termos" hrefLang="pt-BR">
            {footer.terms}
            {footer.ptOnly && <span lang="zh-CN"> {footer.ptOnly}</span>}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
