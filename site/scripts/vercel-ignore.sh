#!/bin/sh
# Ignored Build Step do projeto Vercel `jinlong-site` (Root Directory = site).
#
# Contrato da Vercel: exit 0 = IGNORA o build; exit 1 = EXECUTA o build.
# Regra de segurança: só ignora quando dá para PROVAR que nada relevante ao site mudou. Sem base,
# base inexistente ou erro de git => executa o build. Nunca ignora por dúvida.
#
# Base da comparação:
# 1. VERCEL_GIT_PREVIOUS_SHA (último deploy bem-sucedido deste projeto nesta branch).
# 2. Só em Preview e só quando (1) não existe — primeiro push de uma branch, ou branch que nunca
#    teve deploy do site: o ponto em que a branch saiu da `main` (merge-base com origin/main).
#    Sem isso, toda branch nova do ERP gerava um Preview do site (docs/infra/VERCEL_AUDITORIA_SITE_PDV.md).
#    Produção nunca usa este fallback.
#
# Relevante ao site: tudo em site/ (inclui site/vercel.json) e o que o install do monorepo lê na
# raiz (package.json, package-lock.json, .npmrc). backend/, docs/, pdv-importados/, pdv-local/
# e shared-core/ não alteram o site (o site não importa nada deles; ver site/lib/platform.test.ts).
# O vercel.json da raiz não é lido por este projeto (Root Directory = site).
#
# Teste: node --test scripts/vercel-site-ignore.test.mjs

RELEVANT_PATHS=". ../package.json ../package-lock.json ../.npmrc"
MAIN_FETCH_DEPTH="${VERCEL_IGNORE_MAIN_DEPTH:-200}"

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Checkout que só tem o esqueleto de site/ (sem aplicação): não há o que construir.
if [ ! -f package.json ]; then
  echo "[ignore-step] site/package.json ausente: nada para construir, ignorando build"
  exit 0
fi

compare_and_exit() {
  # shellcheck disable=SC2086
  git diff --quiet "$1" HEAD -- $RELEVANT_PATHS
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "[ignore-step] nenhuma mudança relevante ao site desde $2 $1: ignorando build"
    exit 0
  fi
  echo "[ignore-step] mudanças relevantes ao site (ou erro do git, status ${status}): executando build"
  exit 1
}

if [ -n "$previous" ]; then
  if ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
    echo "[ignore-step] commit base ${previous} indisponível: executando build"
    exit 1
  fi
  compare_and_exit "$previous" "o último deploy"
fi

if [ "${VERCEL_ENV:-}" != "preview" ]; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA (ambiente ${VERCEL_ENV:-indefinido}): executando build"
  exit 1
fi

# Preview sem deploy anterior do site nesta branch: compara com o ponto de saída da main.
if ! git fetch --no-tags --quiet --depth="$MAIN_FETCH_DEPTH" origin "+refs/heads/main:refs/remotes/origin/main" 2>/dev/null; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA e sem acesso à main: executando build"
  exit 1
fi

base=$(git merge-base HEAD refs/remotes/origin/main 2>/dev/null)
if [ -z "$base" ]; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA e merge-base com a main não encontrado: executando build"
  exit 1
fi

compare_and_exit "$base" "a saída da main (merge-base)"
