#!/usr/bin/env bash
# JL-COM-03: testes de concorrência de registrar_lead_comercial (idempotência e limite de taxa).
# Uso: BANCO=sec03_teste CONTAINER=supabase_db_fastproduct bash backend/scripts/sec03-commercial-leads-concorrencia.sh
# Roda SOMENTE em banco descartável. Cada sessão é uma chamada independente (simula instâncias concorrentes).
# Cada chamada faz COMMIT: os contadores e as linhas persistem durante o teste; a limpeza remove só os marcadores.
set -u
BANCO="${BANCO:?defina BANCO=<banco descartável>}"
CONTAINER="${CONTAINER:-supabase_db_fastproduct}"
DIR="$(mktemp -d)"
export MSYS_NO_PATHCONV=1

sql() { docker exec -i "$CONTAINER" psql -U postgres -d "$BANCO" -X -tA -c "$1"; }

# Protocolo válido (formato JL-AAMMDD-XXXXXX, sem 0 e 1) a partir de um número.
protocolo() { echo "JL-261104-$(printf '%06x' "$1" | tr '0123456789abcdef' 'ABCDEFGHJKMNPQRS')"; }

# Uma tentativa: chave, protocolo, IP do visitante (p_client_ip, como o servidor do site envia), nome, marcador de
# utm_source, arquivo de saída. A RPC roda como service_role (papel do servidor); anon não tem EXECUTE.
tentativa() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$BANCO" -X -tA -c "begin; set local role service_role; select public.registrar_lead_comercial('$1'::uuid, '$2', '$4', 'Loja Conc', '+5511900005555', 'whatsapp', 'pt-BR', NULL, NULL, NULL, '$5', NULL, NULL, '$3'); commit;" > "$6" 2>&1
}

sql "delete from public.commercial_leads where utm_source like 'sec03-conc%'; delete from public.commercial_lead_rate_limit where bucket like 'ip:%';" >/dev/null

# (a) Mesma chave, 10 sessões simultâneas (dentro do limite): um protocolo, uma linha.
K=66666666-6666-4666-8666-666666666666
for i in $(seq 1 10); do tentativa "$K" "$(protocolo $((12288 + i)))" 198.51.100.210 "Lead Conc Replay" "sec03-conc-a" "$DIR/a_$i.txt" & done; wait
PROTOS=$(cat "$DIR"/a_*.txt | grep -oE 'JL-[0-9]{6}-[A-Z2-9]{6}' | sort -u | wc -l)
ERROS=$(grep -l 'ERROR' "$DIR"/a_*.txt 2>/dev/null | wc -l)
LINHAS=$(sql "select count(*) from public.commercial_leads where idempotency_key='$K'")
echo "(a) mesma chave x10: protocolos distintos=$PROTOS (esperado 1); erros=$ERROS (esperado 0); linhas=$LINHAS (esperado 1)"

# (b) 20 chaves distintas do mesmo IP, simultâneas: exatamente 10 aceitas (limite), 10 recusadas.
for i in $(seq 1 20); do tentativa "$(printf '55555555-5555-4555-8555-%012d' "$i")" "$(protocolo $((8192 + i)))" 198.51.100.201 "Lead Conc Limite $i" "sec03-conc-b" "$DIR/b_$i.txt" & done; wait
ACEITAS=$(grep -l 'JL-' "$DIR"/b_*.txt | wc -l)
RECUSADAS=$(grep -l 'LEAD_RATE_LIMIT' "$DIR"/b_*.txt | wc -l)
CONTADOR=$(sql "select tentativas from public.commercial_lead_rate_limit where bucket like 'ip:%' order by tentativas desc limit 1")
echo "(b) 20 do mesmo IP: aceitas=$ACEITAS (esperado 10); recusadas=$RECUSADAS (esperado 10); contador=$CONTADOR (esperado 10: a recusa reverte o incremento, então não estende a janela)"

# Limpeza: somente os marcadores deste teste.
sql "delete from public.commercial_leads where utm_source like 'sec03-conc%'; delete from public.commercial_lead_rate_limit where bucket like 'ip:%';" >/dev/null
echo "limpeza feita (somente marcadores sec03-conc)"
rm -rf "$DIR"
