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
#    teve deploy do site: o histórico que a Vercel clonou. O clone da Vercel é raso e não consegue
#    buscar a `main` (`git fetch` falhou no Preview do PR #574), então comparamos
#    HEAD com CADA commit de fronteira do clone raso (.git/shallow; profundidade documentada: 10). Só ignora se nenhum deles
#    mostrar mudança relevante. Clone não raso ou com um único commit => executa.
#    Limite conhecido (só Preview): numa branch mais longa que a profundidade do clone, a mudança
#    feita no commit de fronteira em si, ou antes dele, não é vista. Um Redeploy resolve.
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

# Base fora do clone raso da Vercel (profundidade 10; acontece depois de vários commits ignorados
# seguidos): tenta buscar só aquele commit (`git diff` precisa apenas das duas árvores). Se a busca
# falhar (o clone da Vercel pode não ter acesso ao remoto), executa o build.
ensure_commit() {
  git cat-file -e "${1}^{commit}" 2>/dev/null && return 0
  git fetch --no-tags --quiet --depth=1 origin "$1" 2>/dev/null || return 1
  git cat-file -e "${1}^{commit}" 2>/dev/null
}

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Checkout que só tem o esqueleto de site/ (sem aplicação): não há o que construir.
if [ ! -f package.json ]; then
  echo "[ignore-step] site/package.json ausente: nada para construir, ignorando build"
  exit 0
fi

compare_and_exit() {
  # shellcheck disable=SC2086
  git diff --quiet --no-renames "$1" HEAD -- $RELEVANT_PATHS
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "[ignore-step] nenhuma mudança relevante ao site desde $2 $1: ignorando build"
    exit 0
  fi
  echo "[ignore-step] mudanças relevantes ao site (ou erro do git, status ${status}): executando build"
  exit 1
}

if [ -n "$previous" ]; then
  if ! ensure_commit "$previous"; then
    echo "[ignore-step] commit base ${previous} indisponível: executando build"
    exit 1
  fi
  compare_and_exit "$previous" "o último deploy"
fi

if [ "${VERCEL_ENV:-}" != "preview" ]; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA (ambiente ${VERCEL_ENV:-indefinido}): executando build"
  exit 1
fi

# Preview sem deploy anterior do site nesta branch: compara com as fronteiras do clone raso.
shallow_file=$(git rev-parse --git-path shallow 2>/dev/null)
if [ -z "$shallow_file" ] || [ ! -s "$shallow_file" ]; then
  echo "[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA e clone não raso: executando build"
  exit 1
fi

available=$(git rev-list --count HEAD 2>/dev/null)
echo "[ignore-step] Preview sem VERCEL_GIT_PREVIOUS_SHA: comparando com o clone raso (${available:-?} commits disponíveis)"
if [ -z "$available" ] || [ "$available" -lt 2 ]; then
  echo "[ignore-step] histórico insuficiente para comparar: executando build"
  exit 1
fi

for boundary in $(cat "$shallow_file"); do
  # shellcheck disable=SC2086
  git diff --quiet --no-renames "$boundary" HEAD -- $RELEVANT_PATHS
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "[ignore-step] mudanças relevantes ao site desde ${boundary} (ou erro do git, status ${status}): executando build"
    exit 1
  fi
done

echo "[ignore-step] nenhuma mudança relevante ao site nos ${available} commits do clone: ignorando build"
exit 0
