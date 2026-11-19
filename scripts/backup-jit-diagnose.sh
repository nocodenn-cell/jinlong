#!/usr/bin/env bash
# Diagnóstico seguro do backup (JIT/PAM). Roda na SUA máquina; não altera nada no projeto.
# Nunca imprime o valor do token: só código HTTP, comprimento e veredito.
#
# Uso:
#   export SUPABASE_BACKUP_JIT_PAT='...'          # o mesmo valor do secret do GitHub
#   export SUPABASE_PROJECT_REF='kbabmewnahysfvlybiak'
#   export SUPABASE_BACKUP_USER_ID='<uuid da vars.SUPABASE_BACKUP_USER_ID>'
#   bash scripts/backup-jit-diagnose.sh
set -euo pipefail

: "${SUPABASE_BACKUP_JIT_PAT:?defina SUPABASE_BACKUP_JIT_PAT}"
: "${SUPABASE_PROJECT_REF:?defina SUPABASE_PROJECT_REF}"
: "${SUPABASE_BACKUP_USER_ID:?defina SUPABASE_BACKUP_USER_ID}"
API="https://api.supabase.com/v1"
TOKEN="$SUPABASE_BACKUP_JIT_PAT"

echo "1) Formato: comprimento=$(printf '%s' "$TOKEN" | wc -c) (esperado 44 = sbp_ + 40)"
printf '%s' "$TOKEN" | grep -q '[[:space:]]' && echo "   ALERTA: há espaço/quebra de linha no token" || echo "   sem espaço em branco"
case "$TOKEN" in sbp_*) echo "   prefixo sbp_ ok" ;; *) echo "   ALERTA: prefixo diferente de sbp_" ;; esac

echo "2) A API de Management aceita o token?"
code=$(curl -sS -o /tmp/jit-get.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  "$API/projects/$SUPABASE_PROJECT_REF/database/jit")
echo "   GET database/jit -> HTTP $code"
[ "$code" = "200" ] || { echo "   VEREDITO: token inválido/expirado/sem acesso ao projeto -> gerar novo PAT"; exit 1; }

echo "3) O grant JIT existente é do usuário configurado em vars.SUPABASE_BACKUP_USER_ID?"
if grep -q "$SUPABASE_BACKUP_USER_ID" /tmp/jit-get.json; then
  echo "   user_id do grant == SUPABASE_BACKUP_USER_ID"
else
  echo "   ALERTA: o grant retornado NÃO é do user_id configurado"
fi

echo "4) Quem é o dono do token? (compare com SUPABASE_BACKUP_USER_ID)"
pcode=$(curl -sS -o /tmp/profile.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/profile" || true)
echo "   GET profile -> HTTP $pcode (se 404, endpoint indisponível: veja o dono em Account > Access Tokens)"
[ "$pcode" = "200" ] && { grep -q "$SUPABASE_BACKUP_USER_ID" /tmp/profile.json \
  && echo "   dono do token == SUPABASE_BACKUP_USER_ID" \
  || echo "   ALERTA: dono do token DIFERENTE de SUPABASE_BACKUP_USER_ID (causa provável do PAM)"; }

echo "5) Conexão real (mesma forma do workflow), só 'select 1':"
enc=$(printf '%s' "$TOKEN" | jq -sRr @uri)
host="aws-1-${SUPABASE_REGION:-sa-east-1}.pooler.supabase.com"
if psql "postgres://postgres.${SUPABASE_PROJECT_REF}:${enc}@${host}:5432/postgres?options=-c%20jit%3dtrue" \
  -Atc 'select 1' >/dev/null 2>/tmp/psql-err.txt; then
  echo "   CONEXÃO OK"
else
  sed -E "s#${TOKEN}#***#g; s#${enc}#***#g" /tmp/psql-err.txt | head -3
fi
rm -f /tmp/jit-get.json /tmp/profile.json /tmp/psql-err.txt
