# Legacy Admin UI (referência histórica)

Arquivos movidos de `app/admin/_components/` após migração para **Admin V2 Dark Premium**.

- `AdminShell.tsx` — shell claro legado (`bg-slate-100`, `bg-white`)
- `AdminSidebar.tsx` — sidebar flat sem grupos GESTÃO/SISTEMA

**Não importar em runtime.** O painel admin usa:

- Shell: `@/components/ui/admin-v2/AdminV2Shell`
- CSS: `styles/admin-v2.css` (escopo `[data-admin-v2]`)
