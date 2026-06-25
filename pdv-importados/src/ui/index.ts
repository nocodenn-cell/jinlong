/**
 * `@/ui` — ponto de entrada único do Design System (Sprint C).
 *
 * Páginas em `app/` e `features/` devem importar UI **apenas** daqui, nunca
 * de `@/components/ui/*` diretamente. Isso dá um boundary estável: a
 * implementação interna dos primitives pode mudar sem tocar nas páginas.
 *
 * Os primitives reexportados já existem e suportam variants (Sprint B foi
 * cumprida por adoção, não por reescrita — evitando duplicação de um sistema
 * já maduro). Tokens vêm de `./tokens`.
 */

// ── Tokens (sem React) ──────────────────────────────────────────────
export * from "./tokens"

// ── Primitives ──────────────────────────────────────────────────────
export { Button, buttonVariants, type ButtonProps } from "@/components/ui/button"
export { Badge, badgeVariants, type BadgeProps } from "@/components/ui/badge"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
export { Input } from "@/components/ui/input"
export { Skeleton } from "@/components/ui/skeleton"
