# Artefatos locais (não versionados)

Arquivos JSON gerados por diagnósticos (ex.: anti-replay do `sync-outbox`) podem conter **URL do projeto** e metadados de ambiente. Por isso:

- `*.json` nesta pasta está no `.gitignore` da raiz do monorepo.
- Gere relatórios com `-OutputFile` apontando para aqui ou para um diretório fora do Git.
- **Não** commite chaves (`SYNC_KEY`), `service_role` nem URLs reais de produção.
- Scripts de diagnóstico podem aceitar senha de gerente via `SYNC_DIAG_GERENTE_SENHA` ou `-ValidarGerenteSenha`; trate como segredo descartável (CI: variável mascarada).