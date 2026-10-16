#!/bin/sh
# Ignored Build Step do projeto Vercel `pdv-importados` (Root Directory = pdv-importados).
# Substitui o comando que estava só no painel:
#   if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi
#
# Contrato da Vercel: exit 0 = IGNORA o build; exit 1 = EXECUTA o build.
#
# Preview: continua sempre ignorado (mesma política de antes). As variáveis de Preview deste
# projeto apontam para o Supabase de PRODUÇÃO (ver docs/infra/VERCEL_AUDITORIA_SITE_PDV.md);
# liberar Preview do ERP exige antes um Supabase de homologação no escopo Preview.
#
# Produção: executa o build, EXCETO quando dá para provar que todo arquivo alterado desde o último
# deploy de produção (VERCEL_GIT_PREVIOUS_SHA) está numa lista fechada de caminhos que o ERP não
# lê no build. Lista de exclusão, não de inclusão: qualquer caminho fora dela (inclusive um
# diretório novo) constrói o ERP. Sem base, base inexistente ou erro do git => executa o build.
#
# Teste: node --test scripts/vercel-pdv-ignore.test.mjs

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "[ignore-step] ambiente ${VERCEL_ENV:-indefinido}: Preview do ERP desativado, ignorando build"
  exit 0
fi

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$previous" ]; then
  echo "[ignore-step] produção sem VERCEL_GIT_PREVIOUS_SHA: executando build"
  exit 1
fi

if ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  echo "[ignore-step] commit base ${previous} indisponível: executando build"
  exit 1
fi

if ! changed=$(git diff --name-only "$previous" HEAD 2>/dev/null); then
  echo "[ignore-step] erro do git ao comparar com ${previous}: executando build"
  exit 1
fi

if [ -z "$changed" ]; then
  echo "[ignore-step] nenhum arquivo alterado desde ${previous}: ignorando build"
  exit 0
fi

# Caminhos que comprovadamente não entram no build do ERP:
#   site/      projeto Vercel próprio (jinlong-site), isolado do ERP
#   docs/      documentação
#   .github/   workflows do GitHub Actions (não rodam na Vercel)
#   *.md na raiz do repositório
relevant=$(printf '%s\n' "$changed" | grep -v -E '^(site/|docs/|\.github/)|^[^/]+\.md$')

if [ -z "$relevant" ]; then
  echo "[ignore-step] só site/, docs/, .github/ ou *.md da raiz mudaram desde ${previous}: ignorando build"
  exit 0
fi

echo "[ignore-step] mudanças que podem afetar o ERP desde ${previous}: executando build"
printf '%s\n' "$relevant" | head -n 10 | sed 's/^/  - /'
exit 1
