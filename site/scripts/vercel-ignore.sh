#!/bin/sh
# Ignored Build Step do projeto Vercel `jinlong-site` (Root Directory = site).
#
# Contrato da Vercel: exit 0 = IGNORA o build; exit 1 = EXECUTA o build.
# Regra de segurança: só ignora quando dá para PROVAR que nada relevante ao site mudou desde o
# último deploy bem-sucedido (VERCEL_GIT_PREVIOUS_SHA). Sem base, base inexistente ou erro de
# git => executa o build. Nunca ignora por dúvida.
#
# Relevante ao site: tudo em site/ (inclui site/vercel.json) e o que o install do monorepo lê na
# raiz (package.json, package-lock.json, .npmrc). backend/, docs/, pdv-importados/, pdv-local/
# e shared-core/ não alteram o site (o site não importa nada deles; ver site/lib/platform.test.ts).
# O vercel.json da raiz não é lido por este projeto (Root Directory = site).
#
# Teste: node --test scripts/vercel-site-ignore.test.mjs

RELEVANT_PATHS=". ../package.json ../package-lock.json ../.npmrc"

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Checkout que só tem o esqueleto de site/ (sem aplicação): não há o que construir.
if [ ! -f package.json ]; then
  echo "[ignore-step] site/package.json ausente: nada para construir, ignorando build"
  exit 0
fi

if [ -z "$previous" ]; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA: executando build"
  exit 1
fi

if ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  echo "[ignore-step] commit base ${previous} indisponível: executando build"
  exit 1
fi

# shellcheck disable=SC2086
git diff --quiet "$previous" HEAD -- $RELEVANT_PATHS
status=$?

if [ "$status" -eq 0 ]; then
  echo "[ignore-step] nenhuma mudança relevante ao site desde ${previous}: ignorando build"
  exit 0
fi

echo "[ignore-step] mudanças relevantes ao site (ou erro do git, status ${status}): executando build"
exit 1
