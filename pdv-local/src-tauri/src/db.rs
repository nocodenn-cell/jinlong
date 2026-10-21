use hmac::{Hmac, Mac};
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use sha2::Sha256;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use tauri::Manager;

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize)]
pub struct ItemVendaInput {
    pub produto_id: String,
    pub nome: String,
    pub quantidade: i64,
    pub preco_original: f64,
    pub preco_unitario: f64,
}

/// Uma parcela do pagamento combinado (opcional; ausente = venda de forma única, como antes).
#[derive(Deserialize, Clone, Debug)]
pub struct PagamentoVendaInput {
    pub forma_pagamento: String,
    pub valor: f64,
    /// Só CARTAO_CREDITO pode ser > 1 (1..24). Ausente = 1x.
    #[serde(default)]
    pub parcelas: Option<i64>,
}

#[derive(Deserialize)]
pub struct RegistrarVendaInput {
    pub caixa_id: Option<String>,
    pub operador_id: Option<String>,
    pub forma_pagamento: String,
    pub total_bruto: f64,
    pub total_desconto: f64,
    pub total_liquido: f64,
    pub itens: Vec<ItemVendaInput>,
    pub desconto_gerente_percentual: Option<f64>,
    pub desconto_gerente_valor: Option<f64>,
    pub gerente_id: Option<String>,
    pub desconto_gerente_token: Option<String>,
    /// Pagamento combinado / parcelas do crédito. `None` = comportamento histórico (forma escalar).
    #[serde(default)]
    pub pagamentos: Option<Vec<PagamentoVendaInput>>,
    /// Desconto autorizado por PIN do gerente: id do evento OVERRIDE_GERENTE. `None` = payload antigo.
    #[serde(default)]
    pub gerente_pin_evento_id: Option<String>,
}

const FORMAS_PAGAMENTO_VALIDAS: [&str; 4] = ["DINHEIRO", "PIX", "CARTAO_CREDITO", "CARTAO_DEBITO"];

fn centavos(v: f64) -> Option<i64> {
    if !v.is_finite() {
        return None;
    }
    let c = (v * 100.0).round();
    if (v * 100.0 - c).abs() > 1e-6 {
        return None; // mais de 2 casas decimais
    }
    Some(c as i64)
}

/// Valida o pagamento combinado no mesmo contrato do servidor (`registrar_venda_com_itens[_v2]`):
/// formas conhecidas, valor > 0 com 2 casas, soma == total líquido (troco já descontado do dinheiro),
/// parcelas 1..24 só no crédito, no máximo uma linha por forma.
pub fn validar_pagamentos_venda(
    pagamentos: &Option<Vec<PagamentoVendaInput>>,
    total_liquido: f64,
) -> Result<(), String> {
    let Some(lista) = pagamentos else { return Ok(()) };
    if lista.is_empty() {
        return Err("Informe ao menos uma forma de pagamento.".to_string());
    }
    let total = centavos(total_liquido).ok_or("Total da venda inválido.")?;
    let mut soma: i64 = 0;
    let mut vistas: Vec<&str> = Vec::new();
    for p in lista {
        let forma = p.forma_pagamento.as_str();
        if !FORMAS_PAGAMENTO_VALIDAS.contains(&forma) {
            return Err(format!("Forma de pagamento inválida: {forma}."));
        }
        if vistas.contains(&forma) {
            return Err("Use cada forma de pagamento uma única vez.".to_string());
        }
        vistas.push(forma);
        let c = centavos(p.valor).ok_or("Valor de pagamento inválido.")?;
        if c <= 0 {
            return Err("Cada pagamento precisa ser maior que zero.".to_string());
        }
        if let Some(n) = p.parcelas {
            if !(1..=24).contains(&n) || (n > 1 && forma != "CARTAO_CREDITO") {
                return Err("Parcelas só no crédito, de 1 a 24.".to_string());
            }
        }
        soma += c;
    }
    if soma != total {
        return Err("A soma dos pagamentos precisa ser igual ao total da venda.".to_string());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct OutboxEvent {
    pub id: String,
    pub tipo: String,
    pub payload_json: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Diagnostics {
    pub db_path: String,
    pub sync_endpoint_set: bool,
    pub sync_key_set: bool,
    /// Todos com `status = PENDENTE` (inclui os que aguardam `next_retry_at`).
    pub outbox_pendentes: i64,
    /// Prontos para envio agora (pendente e sem backoff futuro).
    pub outbox_prontos_sync: i64,
    pub outbox_em_backoff: i64,
    /// `status = ERRO` — exigem ação manual ou reprocessamento.
    pub outbox_dlq: i64,
}

#[derive(Serialize)]
pub struct OutboxResumo {
    pub pendentes_total: i64,
    pub prontos_sync: i64,
    pub em_backoff: i64,
    pub dlq: i64,
}

/// Resposta de `POST ?op=validar_gerente` na Edge (desconto gerente com token para sync estrito).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidarGerentePdvDto {
    pub token: String,
    pub expira_em: String,
    pub max_desconto_percentual: f64,
}

fn outbox_max_falhas_consecutivas() -> i64 {
    std::env::var("OUTBOX_MAX_SYNC_FAILURES")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(12)
        .max(1)
}

/// Backoff após falha `n` (1-based): 15s, 30s, … até teto 1h.
fn backoff_segundos_apos_falha(n: i64) -> i64 {
    let n = n.max(1);
    let exp = (n - 1).min(8) as u32;
    (15i64 * (1i64 << exp)).min(3600)
}

#[derive(Serialize)]
pub struct CaixaSessaoDto {
    pub id: String,
    pub operador_id: Option<String>,
    pub troco_inicial: f64,
    pub troco_fechamento: Option<f64>,
    pub status: String,
}

#[derive(Serialize)]
pub struct ProdutoCacheDto {
    pub id: String,
    pub nome: String,
    pub codigo_barras: Option<String>,
    pub preco_varejo: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preco_atacado: Option<f64>,
    pub categoria_id: Option<String>,
    pub ativo: bool,
    pub status_publicacao: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imagem_url: Option<String>,
}

#[derive(Serialize)]
pub struct PrecoAtacadoCacheDto {
    pub id: String,
    pub produto_id: String,
    pub loja_id: Option<String>,
    pub quantidade_minima: f64,
    pub preco_unitario: f64,
    pub ativo: bool,
}

#[derive(Serialize)]
pub struct RegraPrecoCacheDto {
    pub id: String,
    pub tipo_regra: String,
    pub produto_id: Option<String>,
    pub categoria_id: Option<String>,
    pub quantidade_minima: f64,
    pub quantidade_maxima: Option<f64>,
    pub tipo_desconto: String,
    pub valor_desconto: f64,
    pub data_validade: Option<String>,
    pub ativo: bool,
}

#[derive(Serialize)]
pub struct PdvConfigCacheDto {
    pub gerente_id: String,
    pub max_desconto_gerente_percentual: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantidade_minima_atacado_padrao: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loja_id: Option<String>,
}

#[derive(Serialize)]
pub struct CatalogoLocalDto {
    pub produtos: Vec<ProdutoCacheDto>,
    pub regras: Vec<RegraPrecoCacheDto>,
    pub precos_atacado: Vec<PrecoAtacadoCacheDto>,
}

#[derive(Serialize)]
pub struct SyncCatalogoResultDto {
    pub produtos_salvos: usize,
    pub regras_salvas: usize,
    pub precos_atacado_salvos: usize,
}

pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver app_local_data_dir: {e}"))?;

    let mut dir = base_dir;
    dir.push("pdv-local");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar pasta do banco: {e}"))?;

    let mut file = dir;
    file.push("pdv_local.db");
    Ok(file)
}

pub fn init_db(app: &tauri::AppHandle) -> Result<(), String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS vendas (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          caixa_id TEXT,
          operador_id TEXT,
          total_bruto REAL NOT NULL,
          total_desconto REAL NOT NULL,
          total_liquido REAL NOT NULL,
          forma_pagamento TEXT NOT NULL,
          sincronizado INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS itens_venda (
          id TEXT PRIMARY KEY,
          venda_id TEXT NOT NULL,
          produto_id TEXT NOT NULL,
          nome TEXT NOT NULL,
          quantidade INTEGER NOT NULL,
          preco_original REAL NOT NULL,
          preco_unitario REAL NOT NULL,
          FOREIGN KEY (venda_id) REFERENCES vendas(id)
        );

        -- Pagamento combinado / parcelas (aditivo: bancos antigos ganham a tabela vazia; vendas antigas
        -- continuam só com vendas.forma_pagamento).
        CREATE TABLE IF NOT EXISTS vendas_pagamentos (
          id TEXT PRIMARY KEY,
          venda_id TEXT NOT NULL,
          forma_pagamento TEXT NOT NULL,
          valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
          parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 24),
          FOREIGN KEY (venda_id) REFERENCES vendas(id)
        );

        CREATE TABLE IF NOT EXISTS descontos_venda (
          venda_id TEXT PRIMARY KEY,
          gerente_id TEXT,
          desconto_percentual REAL,
          desconto_valor REAL,
          FOREIGN KEY (venda_id) REFERENCES vendas(id)
        );

        CREATE TABLE IF NOT EXISTS outbox (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          tipo TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDENTE',
          tentativas INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        -- ============================================================
        -- Caixa local (abertura/fechamento/sangrias)
        -- ============================================================
        CREATE TABLE IF NOT EXISTS caixas_sessoes (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          operador_id TEXT,
          troco_inicial REAL NOT NULL,
          troco_fechamento REAL,
          status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','FECHADO'))
        );

        CREATE TABLE IF NOT EXISTS movimentos_caixa (
          id TEXT PRIMARY KEY,
          caixa_id TEXT NOT NULL,
          tipo TEXT NOT NULL CHECK (tipo IN ('SANGRIA','SUPRIMENTO')),
          valor REAL NOT NULL,
          observacao TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (caixa_id) REFERENCES caixas_sessoes(id)
        );

        -- ============================================================
        -- Cache local do catálogo (produtos + regras)
        -- ============================================================
        CREATE TABLE IF NOT EXISTS produtos_cache (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          codigo_barras TEXT,
          preco_varejo REAL NOT NULL,
          categoria_id TEXT,
          ativo INTEGER NOT NULL,
          origem TEXT,
          tem_nf INTEGER
        );

        CREATE TABLE IF NOT EXISTS regras_preco_cache (
          id TEXT PRIMARY KEY,
          tipo_regra TEXT NOT NULL,
          produto_id TEXT,
          categoria_id TEXT,
          quantidade_minima REAL NOT NULL,
          quantidade_maxima REAL,
          tipo_desconto TEXT NOT NULL,
          valor_desconto REAL NOT NULL,
          data_validade TEXT,
          ativo INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pdv_config_cache (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          gerente_id TEXT NOT NULL,
          gerente_senha_sha256 TEXT NOT NULL,
          max_desconto_gerente_percentual REAL NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    // Upgrade "forward-compatible" para bases já criadas antes das colunas novas.
    // Se a coluna não existir, o ALTER TABLE funciona; se já existir, ignoramos o erro.
    let _ = conn.execute("ALTER TABLE vendas ADD COLUMN caixa_id TEXT", []);
    let _ = conn.execute("ALTER TABLE vendas ADD COLUMN operador_id TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE pdv_config_cache ADD COLUMN max_desconto_gerente_percentual REAL NOT NULL DEFAULT 30",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE outbox ADD COLUMN falhas_consecutivas INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE outbox ADD COLUMN next_retry_at TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE produtos_cache ADD COLUMN imagem_url TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE produtos_cache ADD COLUMN status_publicacao TEXT",
        [],
    );
    let _ = conn.execute(
        "UPDATE produtos_cache SET status_publicacao = CASE WHEN ativo = 1 THEN 'PUBLICADO' ELSE 'INATIVO' END WHERE status_publicacao IS NULL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE produtos_cache ADD COLUMN preco_atacado REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE pdv_config_cache ADD COLUMN quantidade_minima_atacado_padrao REAL",
        [],
    );
    let _ = conn.execute("ALTER TABLE pdv_config_cache ADD COLUMN loja_id TEXT", []);
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS precos_atacado_cache (
          id TEXT PRIMARY KEY,
          produto_id TEXT NOT NULL,
          loja_id TEXT,
          quantidade_minima REAL NOT NULL,
          preco_unitario REAL NOT NULL,
          ativo INTEGER NOT NULL
        );",
    );

    Ok(())
}

fn operador_id_efetivo(input: &RegistrarVendaInput) -> Option<String> {
    let from_client = input.operador_id.clone();
    if let Some(ref s) = from_client {
        if Uuid::parse_str(s.trim()).is_ok() {
            return Some(s.trim().to_string());
        }
    }
    // Login por PIN: operador que está no caixa agora.
    if let Some(op) = crate::operador::operador_atual() {
        if Uuid::parse_str(op.usuario_id.trim()).is_ok() {
            return Some(op.usuario_id);
        }
    }
    std::env::var("PDV_OPERADOR_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| Uuid::parse_str(s).is_ok())
}

/// registrar_venda_com_itens (backend) exige p_caixa_id desde a migration
/// 20260814105031 — rejeitar aqui, antes de qualquer escrita local, em vez de
/// gravar e enfileirar uma venda que só vai falhar no sync (Edge/RPC).
pub(crate) fn loja_id_configurada(conn: &Connection) -> Result<String, String> {
    let loja = conn
        .query_row(
            "SELECT loja_id FROM pdv_config_cache WHERE id = 1",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    loja.ok_or_else(|| "LOJA_NAO_CONFIGURADA".to_string())
}

fn validar_caixa_id_obrigatorio(caixa_id: &Option<String>) -> Result<(), String> {
    match caixa_id.as_deref().map(str::trim) {
        Some(cid) if !cid.is_empty() => Ok(()),
        _ => Err("caixa_id é obrigatório para registrar uma venda.".to_string()),
    }
}

pub fn registrar_venda_local(
    app: &tauri::AppHandle,
    input: RegistrarVendaInput,
) -> Result<String, String> {
    validar_caixa_id_obrigatorio(&input.caixa_id)?;
    validar_pagamentos_venda(&input.pagamentos, input.total_liquido)?;

    // Garantir schema sempre (seguro e evita falha caso init não rode por qualquer motivo).
    init_db(app)?;

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let loja_id = loja_id_configurada(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let venda_id = Uuid::new_v4().to_string();
    let operador_gravado = operador_id_efetivo(&input);

    let troco_inicial_caixa: Option<f64> = match &input.caixa_id {
        Some(cid) => tx
            .query_row(
                "SELECT troco_inicial FROM caixas_sessoes WHERE id = ?1",
                params![cid],
                |row| row.get::<_, f64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?,
        None => None,
    };

    tx.execute(
        "INSERT INTO vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            venda_id,
            input.caixa_id,
            operador_gravado,
            input.total_bruto,
            input.total_desconto,
            input.total_liquido,
            input.forma_pagamento,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Precisamos dos itens no payload da outbox e também gerar um `item_id`
    // estável dentro do evento (para idempotência quando o sync reprocessa).
    let mut itens_payload: Vec<serde_json::Value> = Vec::new();

    for item in input.itens {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO itens_venda
              (id, venda_id, produto_id, nome, quantidade, preco_original, preco_unitario)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item_id,
                venda_id,
                item.produto_id,
                item.nome,
                item.quantidade,
                item.preco_original,
                item.preco_unitario,
            ],
        )
        .map_err(|e| e.to_string())?;

        itens_payload.push(json!({
          "item_id": item_id,
          "produto_id": item.produto_id,
          "nome": item.nome,
          "quantidade": item.quantidade,
          "preco_original": item.preco_original,
          "preco_unitario": item.preco_unitario
        }));
    }

    let mut pagamentos_payload: Option<Vec<serde_json::Value>> = None;
    if let Some(lista) = &input.pagamentos {
        let mut v = Vec::new();
        for p in lista {
            let c = centavos(p.valor).ok_or("Valor de pagamento inválido.")?;
            let parcelas = p.parcelas.unwrap_or(1);
            tx.execute(
                "INSERT INTO vendas_pagamentos (id, venda_id, forma_pagamento, valor_centavos, parcelas)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![Uuid::new_v4().to_string(), venda_id, p.forma_pagamento, c, parcelas],
            )
            .map_err(|e| e.to_string())?;
            let mut j = json!({ "forma_pagamento": p.forma_pagamento, "valor": (c as f64) / 100.0 });
            if parcelas > 1 {
                j["parcelas"] = json!(parcelas);
            }
            v.push(j);
        }
        pagamentos_payload = Some(v);
    }

    // Registrar, se houver, informações de desconto especial de gerente
    if let (Some(p), Some(v), Some(gerente_id)) = (
        input.desconto_gerente_percentual,
        input.desconto_gerente_valor,
        input.gerente_id.clone(),
    ) {
        tx.execute(
            "INSERT OR REPLACE INTO descontos_venda (venda_id, gerente_id, desconto_percentual, desconto_valor)
             VALUES (?1, ?2, ?3, ?4)",
            params![venda_id, gerente_id, p, v],
        )
        .map_err(|e| e.to_string())?;
    }

    // Enfileirar evento para sincronização posterior (Supabase)
    let outbox_id = Uuid::new_v4().to_string();
    let payload = json!({
      "venda_id": venda_id,
      "caixa_id": input.caixa_id,
      "operador_id": operador_gravado,
      "troco_inicial_caixa": troco_inicial_caixa,
      "forma_pagamento": input.forma_pagamento,
      "total_bruto": input.total_bruto,
      "total_desconto": input.total_desconto,
      "total_liquido": input.total_liquido,
      "desconto_gerente_percentual": input.desconto_gerente_percentual,
      "desconto_gerente_valor": input.desconto_gerente_valor,
      "gerente_id": input.gerente_id,
      "desconto_gerente_token": input.desconto_gerente_token,
      "loja_id": loja_id,
      "itens": itens_payload
    });
    // Só eventos novos com pagamento combinado levam `pagamentos` — itens antigos da outbox ficam idênticos.
    let payload = match pagamentos_payload {
        Some(p) => {
            let mut obj = payload;
            obj["pagamentos"] = json!(p);
            obj
        }
        None => payload,
    };
    let payload = match input.gerente_pin_evento_id.as_deref().map(str::trim).filter(|s| Uuid::parse_str(s).is_ok()) {
        Some(ev) => {
            let mut obj = payload;
            obj["gerente_pin_evento_id"] = json!(ev);
            obj
        }
        None => payload,
    }
    .to_string();

    tx.execute(
        "INSERT INTO outbox (id, tipo, payload_json) VALUES (?1, ?2, ?3)",
        params![outbox_id, "VENDA_REGISTRADA", payload],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(venda_id)
}

pub fn get_caixa_atual(app: &tauri::AppHandle) -> Result<Option<CaixaSessaoDto>, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, operador_id, troco_inicial, troco_fechamento, status
             FROM caixas_sessoes
             WHERE status = 'ABERTO'
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row([], |row| {
            Ok(CaixaSessaoDto {
                id: row.get(0)?,
                operador_id: row.get(1)?,
                troco_inicial: row.get(2)?,
                troco_fechamento: row.get(3)?,
                status: row.get(4)?,
            })
        })
        .optional();

    match row {
        Ok(opt) => Ok(opt),
        Err(e) => Err(e.to_string()),
    }
}

fn sqlite_iso_utc(tx: &rusqlite::Transaction<'_>) -> Result<String, String> {
    tx.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

/// Enfileira evento na outbox (mesmo contrato enviado à Edge `sync-outbox`).
fn enqueue_outbox_tx(
    tx: &rusqlite::Transaction<'_>,
    tipo: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let payload_str = payload.to_string();
    tx.execute(
        "INSERT INTO outbox (id, tipo, payload_json) VALUES (?1, ?2, ?3)",
        params![id, tipo, payload_str],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn abrir_caixa_local(
    app: &tauri::AppHandle,
    operador_id: Option<String>,
    troco_inicial: f64,
) -> Result<String, String> {
    // Login por PIN: sem operador explícito, usa quem está no caixa (None se o PIN estiver desligado).
    let operador_id = operador_id
        .filter(|s| Uuid::parse_str(s.trim()).is_ok())
        .or_else(|| crate::operador::operador_atual().map(|o| o.usuario_id));
    init_db(app)?;
    if troco_inicial < 0.0 {
        return Err("Troco inicial inválido".to_string());
    }

    // Se já existir caixa aberto, reutilizamos.
    if let Some(sessao) = get_caixa_atual(app)? {
        return Ok(sessao.id);
    }

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let loja_id = loja_id_configurada(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let caixa_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO caixas_sessoes (id, operador_id, troco_inicial, status)
         VALUES (?1, ?2, ?3, 'ABERTO')",
        params![caixa_id, operador_id, troco_inicial],
    )
    .map_err(|e| e.to_string())?;

    let now = sqlite_iso_utc(&tx)?;
    enqueue_outbox_tx(
        &tx,
        "CAIXA_ABERTO",
        &json!({
            "id": caixa_id,
            "operador_id": operador_id,
            "data_abertura": now,
            "valor_inicial": troco_inicial,
            "status": "ABERTO",
            "loja_id": loja_id
        }),
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(caixa_id)
}

pub fn registrar_movimento_caixa_local(
    app: &tauri::AppHandle,
    caixa_id: String,
    tipo: String,
    valor: f64,
    observacao: Option<String>,
) -> Result<String, String> {
    init_db(app)?;
    if valor <= 0.0 {
        return Err("Valor do movimento inválido".to_string());
    }

    if tipo != "SANGRIA" && tipo != "SUPRIMENTO" {
        return Err("Tipo inválido".to_string());
    }

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mov_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO movimentos_caixa (id, caixa_id, tipo, valor, observacao)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![mov_id, caixa_id, tipo, valor, observacao],
    )
    .map_err(|e| e.to_string())?;

    let now = sqlite_iso_utc(&tx)?;
    enqueue_outbox_tx(
        &tx,
        "MOVIMENTO_CAIXA",
        &json!({
            "id": mov_id,
            "caixa_id": caixa_id,
            "tipo": tipo,
            "valor": valor,
            "observacao": observacao,
            "created_at": now
        }),
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(mov_id)
}

pub fn fechar_caixa_local(
    app: &tauri::AppHandle,
    caixa_id: String,
    troco_fechamento: f64,
    fechamento_observacao: Option<String>,
) -> Result<(), String> {
    init_db(app)?;
    if troco_fechamento < 0.0 {
        return Err("Troco de fechamento inválido".to_string());
    }

    let obs_trimmed = fechamento_observacao
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(ref s) = obs_trimmed {
        if s.len() > 500 {
            return Err("Observação de fechamento muito longa (máx. 500 caracteres).".to_string());
        }
    }

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let n = tx
        .execute(
            "UPDATE caixas_sessoes
         SET status = 'FECHADO', troco_fechamento = ?2
         WHERE id = ?1 AND status = 'ABERTO'",
            params![caixa_id, troco_fechamento],
        )
        .map_err(|e| e.to_string())?;

    if n > 0 {
        let now = sqlite_iso_utc(&tx)?;
        let payload = if let Some(s) = obs_trimmed {
            json!({
                "id": caixa_id,
                "data_fechamento": now,
                "valor_fechamento": troco_fechamento,
                "fechamento_observacao": s,
            })
        } else {
            json!({
                "id": caixa_id,
                "data_fechamento": now,
                "valor_fechamento": troco_fechamento,
            })
        };
        enqueue_outbox_tx(&tx, "CAIXA_FECHADO", &payload)?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn pdv_config_local_get(app: &tauri::AppHandle) -> Result<Option<PdvConfigCacheDto>, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT gerente_id, max_desconto_gerente_percentual,
                    quantidade_minima_atacado_padrao, loja_id
             FROM pdv_config_cache
             WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row([], |row| {
            Ok(PdvConfigCacheDto {
                gerente_id: row.get(0)?,
                max_desconto_gerente_percentual: row.get(1)?,
                quantidade_minima_atacado_padrao: row.get(2)?,
                loja_id: row.get(3)?,
            })
        })
        .optional();

    match row {
        Ok(opt) => Ok(opt),
        Err(e) => Err(e.to_string()),
    }
}

// -----------------------------
// Cache local (get)
// -----------------------------
pub fn catalogo_local_get(app: &tauri::AppHandle) -> Result<CatalogoLocalDto, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let mut produtos_stmt = conn
        .prepare(
            "SELECT id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id, ativo, status_publicacao, imagem_url
             FROM produtos_cache",
        )
        .map_err(|e| e.to_string())?;

    let produtos_iter = produtos_stmt.query_map([], |row| {
        Ok(ProdutoCacheDto {
            id: row.get(0)?,
            nome: row.get(1)?,
            codigo_barras: row.get(2)?,
            preco_varejo: row.get(3)?,
            preco_atacado: row.get(4)?,
            categoria_id: row.get(5)?,
            ativo: row.get::<_, i64>(6)? != 0,
            status_publicacao: row.get(7)?,
            imagem_url: row.get(8)?,
        })
    });

    let produtos: Vec<ProdutoCacheDto> = match produtos_iter {
        Ok(it) => it
            .map(|r| r.map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
        Err(e) => return Err(e.to_string()),
    };

    let mut regras_stmt = conn
        .prepare(
            "SELECT id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima,
                    tipo_desconto, valor_desconto, data_validade, ativo
             FROM regras_preco_cache",
        )
        .map_err(|e| e.to_string())?;

    let regras_iter = regras_stmt.query_map([], |row| {
        Ok(RegraPrecoCacheDto {
            id: row.get(0)?,
            tipo_regra: row.get(1)?,
            produto_id: row.get(2)?,
            categoria_id: row.get(3)?,
            quantidade_minima: row.get(4)?,
            quantidade_maxima: row.get(5)?,
            tipo_desconto: row.get(6)?,
            valor_desconto: row.get(7)?,
            data_validade: row.get(8)?,
            ativo: row.get::<_, i64>(9)? != 0,
        })
    });

    let regras: Vec<RegraPrecoCacheDto> = match regras_iter {
        Ok(it) => it
            .map(|r| r.map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
        Err(e) => return Err(e.to_string()),
    };

    let mut tiers_stmt = conn
        .prepare(
            "SELECT id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo
             FROM precos_atacado_cache",
        )
        .map_err(|e| e.to_string())?;

    let tiers_iter = tiers_stmt.query_map([], |row| {
        Ok(PrecoAtacadoCacheDto {
            id: row.get(0)?,
            produto_id: row.get(1)?,
            loja_id: row.get(2)?,
            quantidade_minima: row.get(3)?,
            preco_unitario: row.get(4)?,
            ativo: row.get::<_, i64>(5)? != 0,
        })
    });

    let precos_atacado: Vec<PrecoAtacadoCacheDto> = match tiers_iter {
        Ok(it) => it
            .map(|r| r.map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
        Err(e) => return Err(e.to_string()),
    };

    Ok(CatalogoLocalDto {
        produtos,
        regras,
        precos_atacado,
    })
}

// -----------------------------
// Cache local (sync real Supabase)
// -----------------------------
#[derive(Deserialize)]
struct ProdutoSupabaseRow {
    id: String,
    nome: String,
    codigo_barras: Option<String>,
    preco_varejo: f64,
    #[serde(default)]
    preco_atacado: Option<f64>,
    categoria_id: Option<String>,
    ativo: bool,
    #[serde(default)]
    status_publicacao: Option<String>,
    origem: String,
    tem_nf: bool,
    #[serde(default)]
    imagem_url: Option<String>,
}

#[derive(Deserialize)]
struct RegraPrecoSupabaseRow {
    id: String,
    tipo_regra: String,
    produto_id: Option<String>,
    categoria_id: Option<String>,
    quantidade_minima: f64,
    quantidade_maxima: Option<f64>,
    tipo_desconto: String,
    valor_desconto: f64,
    data_validade: Option<String>,
    ativo: bool,
}

#[derive(Deserialize)]
struct PrecoAtacadoSupabaseRow {
    id: String,
    produto_id: String,
    loja_id: Option<String>,
    quantidade_minima: f64,
    preco_unitario: f64,
    #[serde(default = "default_true")]
    ativo: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize)]
struct PdvConfigSupabaseRow {
    gerente_id: String,
    max_desconto_gerente_percentual: f64,
    #[serde(default)]
    quantidade_minima_atacado_padrao: Option<f64>,
    #[serde(default)]
    loja_id: Option<String>,
}

#[derive(Deserialize)]
struct EdgeCatalogoResponse {
    ok: bool,
    #[serde(default)]
    produtos: Vec<ProdutoSupabaseRow>,
    #[serde(default)]
    regras: Vec<RegraPrecoSupabaseRow>,
    #[serde(default)]
    precos_atacado: Vec<PrecoAtacadoSupabaseRow>,
    #[serde(default)]
    loja_id: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct EdgePdvConfigResponse {
    ok: bool,
    config: Option<PdvConfigSupabaseRow>,
    error: Option<String>,
}

pub(crate) fn endpoint_with_op(endpoint: &str, op: &str) -> String {
    if endpoint.contains('?') {
        format!("{endpoint}&op={op}")
    } else {
        format!("{endpoint}?op={op}")
    }
}

/// Credenciais de sync: ativação por código (preferida) ou `.env` legado (SYNC_ENDPOINT + SYNC_KEY).
pub(crate) fn sync_endpoint_and_key() -> Result<(String, String), String> {
    if let Some(a) = crate::ativacao::atual() {
        return Ok((a.endpoint, a.sync_key));
    }
    let endpoint = std::env::var("SYNC_ENDPOINT")
        .map_err(|_| "Falta SYNC_ENDPOINT no ambiente do app".to_string())?;
    let sync_key =
        std::env::var("SYNC_KEY").map_err(|_| "Falta SYNC_KEY no ambiente do app".to_string())?;
    Ok((endpoint, sync_key))
}

#[cfg(test)]
fn canonical_path_with_query(raw_url: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(raw_url).map_err(|e| format!("URL inválida: {e}"))?;
    let mut out = url.path().to_string();
    if let Some(q) = url.query() {
        out.push('?');
        out.push_str(q);
    }
    Ok(out)
}

fn unix_ts_now() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .map_err(|e| format!("Relógio do sistema inválido: {e}"))
}

fn build_request_signature(
    sync_key: &str,
    ts: i64,
    nonce: &str,
    device_fingerprint: &str,
    body: &str,
) -> Result<String, String> {
    let message = format!("{ts}.{nonce}.{device_fingerprint}.{body}");
    let mut mac = HmacSha256::new_from_slice(sync_key.as_bytes())
        .map_err(|e| format!("Falha ao inicializar assinatura HMAC: {e}"))?;
    mac.update(message.as_bytes());
    let bytes = mac.finalize().into_bytes();
    Ok(hex::encode(bytes))
}

pub(crate) fn signed_headers_for_request(
    sync_key: &str,
    body: &str,
    device_fingerprint: &str,
) -> Result<reqwest::header::HeaderMap, String> {
    let ts = unix_ts_now()?;
    let nonce = Uuid::new_v4().to_string();
    let signature = build_request_signature(sync_key, ts, &nonce, device_fingerprint, body)?;

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "X-SYNC-KEY",
        reqwest::header::HeaderValue::from_str(sync_key).map_err(|e| e.to_string())?,
    );
    headers.insert(
        "x-device-fingerprint",
        reqwest::header::HeaderValue::from_str(device_fingerprint).map_err(|e| e.to_string())?,
    );
    headers.insert(
        "X-SYNC-TS",
        reqwest::header::HeaderValue::from_str(&ts.to_string()).map_err(|e| e.to_string())?,
    );
    headers.insert(
        "X-SYNC-NONCE",
        reqwest::header::HeaderValue::from_str(&nonce).map_err(|e| e.to_string())?,
    );
    headers.insert(
        "X-SYNC-SIGNATURE",
        reqwest::header::HeaderValue::from_str(&signature).map_err(|e| e.to_string())?,
    );
    // Ativado: a loja é a do dispositivo (o servidor ignora/recusa qualquer outra).
    let loja_ativacao = crate::ativacao::atual().map(|a| a.loja_id);
    if let Some(loja) = loja_ativacao.or_else(|| std::env::var("PDV_LOJA_ID").ok()) {
        let loja = loja.trim();
        if !loja.is_empty() {
            headers.insert(
                "x-loja-id",
                reqwest::header::HeaderValue::from_str(loja).map_err(|e| e.to_string())?,
            );
        }
    }

    Ok(headers)
}

/// `reqwest::blocking::Client::new()` não tem timeout — numa rede de loja
/// instável isso trava o comando Tauri indefinidamente (e o intervalo de 15s
/// do sync da outbox nunca se recupera) em vez de falhar rápido para o
/// backoff/DLQ existente.
pub(crate) fn http_client_with_timeout() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

pub fn sync_catalogo_real(app: &tauri::AppHandle) -> Result<SyncCatalogoResultDto, String> {
    init_db(app)?;
    let (endpoint, sync_key) = sync_endpoint_and_key()?;
    let client = http_client_with_timeout()?;
    let catalogo_url = endpoint_with_op(&endpoint, "catalogo");
    let headers = signed_headers_for_request(&sync_key, "", &device_fingerprint_local())?;

    let resp = client
        .get(catalogo_url)
        .headers(headers)
        .send()
        .map_err(|e| format!("Falha ao sincronizar catálogo na Edge: {e}"))?;
    let status = resp.status();
    let body = resp
        .text()
        .map_err(|e| format!("Falha ao ler resposta do catálogo: {e}"))?;
    if !status.is_success() {
        return Err(format!("Catálogo Edge erro ({status}): {body}"));
    }
    let parsed: EdgeCatalogoResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta inválida do catálogo: {e}. Body={body}"))?;
    if !parsed.ok {
        return Err(format!(
            "Catálogo Edge retornou ok=false: {}",
            parsed
                .error
                .unwrap_or_else(|| "erro desconhecido".to_string())
        ));
    }

    let produtos_rows = parsed.produtos;
    let regras_rows = parsed.regras;
    let tiers_rows = parsed.precos_atacado;

    let produtos_len = produtos_rows.len();
    let regras_len = regras_rows.len();
    let tiers_len = tiers_rows.len();

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM produtos_cache", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM regras_preco_cache", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM precos_atacado_cache", [])
        .map_err(|e| e.to_string())?;

    for p in produtos_rows {
        tx.execute(
            "INSERT OR REPLACE INTO produtos_cache
             (id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id, ativo, status_publicacao, origem, tem_nf, imagem_url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                p.id,
                p.nome,
                p.codigo_barras,
                p.preco_varejo,
                p.preco_atacado,
                p.categoria_id,
                if p.ativo { 1 } else { 0 },
                p.status_publicacao,
                p.origem,
                if p.tem_nf { 1 } else { 0 },
                p.imagem_url
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for r in regras_rows {
        tx.execute(
            "INSERT OR REPLACE INTO regras_preco_cache
             (id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima,
              tipo_desconto, valor_desconto, data_validade, ativo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                r.id,
                r.tipo_regra,
                r.produto_id,
                r.categoria_id,
                r.quantidade_minima,
                r.quantidade_maxima,
                r.tipo_desconto,
                r.valor_desconto,
                r.data_validade,
                if r.ativo { 1 } else { 0 }
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for t in tiers_rows {
        tx.execute(
            "INSERT OR REPLACE INTO precos_atacado_cache
             (id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                t.id,
                t.produto_id,
                t.loja_id,
                t.quantidade_minima,
                t.preco_unitario,
                if t.ativo { 1 } else { 0 }
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Persistir loja do payload (quando Edge devolve) no config cache se já existir linha.
    if let Some(loja) = parsed.loja_id {
        let _ = tx.execute(
            "UPDATE pdv_config_cache SET loja_id = ?1 WHERE id = 1",
            params![loja],
        );
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(SyncCatalogoResultDto {
        produtos_salvos: produtos_len,
        regras_salvas: regras_len,
        precos_atacado_salvos: tiers_len,
    })
}

#[derive(Deserialize)]
struct ValidarGerentePdvApiResponse {
    ok: bool,
    token: Option<String>,
    expira_em: Option<String>,
    max_desconto_percentual: Option<f64>,
    error: Option<String>,
}

/// Valida senha do gerente na Edge (`op=validar_gerente`) com o mesmo HMAC do sync-outbox.
pub fn validar_gerente_sync(senha: String) -> Result<ValidarGerentePdvDto, String> {
    let (endpoint, sync_key) = sync_endpoint_and_key()?;
    let trimmed = senha.trim().to_string();
    if trimmed.is_empty() {
        return Err("Senha do gerente é obrigatória.".to_string());
    }
    if trimmed.len() > 128 {
        return Err("Senha inválida (máx. 128 caracteres).".to_string());
    }

    let client = http_client_with_timeout()?;
    let url = endpoint_with_op(&endpoint, "validar_gerente");
    let body = serde_json::json!({ "senha": trimmed }).to_string();
    let headers = signed_headers_for_request(&sync_key, &body, &device_fingerprint_local())?;

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .headers(headers)
        .body(body)
        .send()
        .map_err(|e| format!("Falha ao validar gerente na Edge: {e}"))?;

    let status = res.status();
    let text = res
        .text()
        .map_err(|e| format!("Falha ao ler resposta de validar gerente: {e}"))?;

    let parsed: ValidarGerentePdvApiResponse = serde_json::from_str(&text)
        .map_err(|_| format!("Resposta inválida de validar gerente ({status}): {text}"))?;

    if !parsed.ok {
        let err = parsed
            .error
            .unwrap_or_else(|| format!("erro desconhecido (HTTP {status})"));
        let msg = match err.as_str() {
            "ERRO_PERSISTENCIA_TOKEN" => {
                "Não foi possível registrar o desconto no servidor. Tente novamente em instantes."
                    .to_string()
            }
            _ => err,
        };
        return Err(msg);
    }

    let token = parsed
        .token
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Resposta sem token de gerente.".to_string())?;
    let expira_em = parsed
        .expira_em
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Resposta sem expiração do token.".to_string())?;
    let max_desconto_percentual = parsed.max_desconto_percentual.unwrap_or(20.0);

    Ok(ValidarGerentePdvDto {
        token,
        expira_em,
        max_desconto_percentual,
    })
}

pub fn sync_pdv_config_real(app: &tauri::AppHandle) -> Result<Option<PdvConfigCacheDto>, String> {
    init_db(app)?;
    let (endpoint, sync_key) = sync_endpoint_and_key()?;
    let client = http_client_with_timeout()?;
    let config_url = endpoint_with_op(&endpoint, "pdv_config");
    let headers = signed_headers_for_request(&sync_key, "", &device_fingerprint_local())?;

    let resp = client
        .get(config_url)
        .headers(headers)
        .send()
        .map_err(|e| format!("Falha ao sincronizar pdv_config na Edge: {e}"))?;

    let status = resp.status();
    let body = resp
        .text()
        .map_err(|e| format!("Falha ao ler resposta de pdv_config: {e}"))?;
    if !status.is_success() {
        return Err(format!("pdv_config Edge erro ({status}): {body}"));
    }
    let parsed: EdgePdvConfigResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta inválida de pdv_config: {e}. Body={body}"))?;
    if !parsed.ok {
        return Err(format!(
            "pdv_config Edge retornou ok=false: {}",
            parsed
                .error
                .unwrap_or_else(|| "erro desconhecido".to_string())
        ));
    }
    let row = match parsed.config {
        Some(r) => r,
        None => return Ok(None),
    };

    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO pdv_config_cache
         (id, gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual,
          quantidade_minima_atacado_padrao, loja_id)
         VALUES (1, ?1, '', ?2, ?3, ?4)",
        params![
            row.gerente_id,
            row.max_desconto_gerente_percentual,
            row.quantidade_minima_atacado_padrao,
            row.loja_id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Some(PdvConfigCacheDto {
        gerente_id: row.gerente_id,
        max_desconto_gerente_percentual: row.max_desconto_gerente_percentual,
        quantidade_minima_atacado_padrao: row.quantidade_minima_atacado_padrao,
        loja_id: row.loja_id,
    }))
}

pub fn outbox_pendentes(app: &tauri::AppHandle) -> Result<i64, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT COUNT(1) FROM outbox WHERE status = 'PENDENTE'")
        .map_err(|e| e.to_string())?;
    let count: i64 = stmt
        .query_row([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

fn contagem_outbox(conn: &Connection, sql: &str) -> Result<i64, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let n: i64 = stmt
        .query_row([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(n)
}

pub fn outbox_resumo(app: &tauri::AppHandle) -> Result<OutboxResumo, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let pendentes_total = contagem_outbox(
        &conn,
        "SELECT COUNT(1) FROM outbox WHERE status = 'PENDENTE'",
    )?;
    let prontos_sync = contagem_outbox(
        &conn,
        "SELECT COUNT(1) FROM outbox WHERE status = 'PENDENTE' \
         AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))",
    )?;
    let em_backoff = contagem_outbox(
        &conn,
        "SELECT COUNT(1) FROM outbox WHERE status = 'PENDENTE' \
         AND next_retry_at IS NOT NULL AND next_retry_at > datetime('now')",
    )?;
    let dlq = contagem_outbox(&conn, "SELECT COUNT(1) FROM outbox WHERE status = 'ERRO'")?;
    Ok(OutboxResumo {
        pendentes_total,
        prontos_sync,
        em_backoff,
        dlq,
    })
}

/// Volta itens da DLQ (`ERRO`) para a fila (`PENDENTE`) com contadores zerados.
pub fn outbox_reprocessar_dlq(app: &tauri::AppHandle) -> Result<i64, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "UPDATE outbox SET status = 'PENDENTE', falhas_consecutivas = 0, \
             next_retry_at = NULL, last_error = NULL WHERE status = 'ERRO'",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i64)
}

pub fn diagnostics(app: &tauri::AppHandle) -> Result<Diagnostics, String> {
    init_db(app)?;
    let db = db_path(app)?;
    let resumo = outbox_resumo(app)?;
    Ok(Diagnostics {
        db_path: db.to_string_lossy().to_string(),
        sync_endpoint_set: crate::ativacao::atual().is_some() || std::env::var("SYNC_ENDPOINT").is_ok(),
        sync_key_set: crate::ativacao::atual().is_some() || std::env::var("SYNC_KEY").is_ok(),
        outbox_pendentes: resumo.pendentes_total,
        outbox_prontos_sync: resumo.prontos_sync,
        outbox_em_backoff: resumo.em_backoff,
        outbox_dlq: resumo.dlq,
    })
}

pub fn outbox_listar_pendentes(
    app: &tauri::AppHandle,
    limite: i64,
) -> Result<Vec<OutboxEvent>, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, tipo, payload_json, created_at
             FROM outbox
             WHERE status = 'PENDENTE'
               AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
             ORDER BY created_at ASC, id ASC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limite], |row| {
            Ok(OutboxEvent {
                id: row.get(0)?,
                tipo: row.get(1)?,
                payload_json: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, String>>()
}

pub fn outbox_marcar_enviado(app: &tauri::AppHandle, ids: &[String]) -> Result<i64, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    init_db(app)?;
    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut afetados: i64 = 0;
    for id in ids {
        tx.execute(
            "UPDATE outbox
             SET status = 'ENVIADO',
                 tentativas = tentativas + 1,
                 last_error = NULL,
                 falhas_consecutivas = 0,
                 next_retry_at = NULL
             WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        afetados += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(afetados)
}

/// Falha retornada pela Edge para um evento específico: retry com backoff ou DLQ após N falhas.
pub fn outbox_marcar_falha_item_sync(
    app: &tauri::AppHandle,
    id: &str,
    erro: &str,
) -> Result<(), String> {
    init_db(app)?;
    let max = outbox_max_falhas_consecutivas();
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let falhas_atual: i64 = conn
        .query_row(
            "SELECT COALESCE(falhas_consecutivas, 0) FROM outbox WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Outbox id não encontrado: {id} — {e}"))?;

    let novo = falhas_atual + 1;

    if novo >= max {
        conn.execute(
            "UPDATE outbox SET
               status = 'ERRO',
               tentativas = tentativas + 1,
               falhas_consecutivas = ?1,
               last_error = ?2,
               next_retry_at = NULL
             WHERE id = ?3",
            params![novo, erro, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let secs = backoff_segundos_apos_falha(novo);
        let modifier = format!("+{secs} seconds");
        conn.execute(
            "UPDATE outbox SET
               status = 'PENDENTE',
               tentativas = tentativas + 1,
               falhas_consecutivas = ?1,
               last_error = ?2,
               next_retry_at = datetime('now', ?3)
             WHERE id = ?4",
            params![novo, erro, modifier, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Sincronização simulada: marca registros pendentes como ENVIADO.
/// Próximo passo: substituir por envio real para Supabase (Edge Function).
pub fn sync_outbox_simulado(app: &tauri::AppHandle, limite: i64) -> Result<i64, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Seleciona pendentes (precisa coletar em memória para não segurar borrow do tx até o commit)
    let ids: Vec<String> = {
        let mut stmt = tx
            .prepare(
                "SELECT id FROM outbox WHERE status = 'PENDENTE' ORDER BY created_at ASC, id ASC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limite], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| r.map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, String>>()?
    };

    let mut enviados: i64 = 0;
    for id in ids {
        tx.execute(
            "UPDATE outbox SET status = 'ENVIADO', tentativas = tentativas + 1, last_error = NULL, \
             falhas_consecutivas = 0, next_retry_at = NULL WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        enviados += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(enviados)
}

#[derive(Serialize)]
struct SyncRequest {
    events: Vec<OutboxEvent>,
}

#[derive(Deserialize)]
struct SyncResponse {
    ok: bool,
    processed: Vec<String>,
    failed: Vec<SyncFailed>,
}

#[derive(Deserialize)]
struct SyncFailed {
    id: String,
    error: String,
}

/// Sync real: envia eventos pendentes para a Edge Function do Supabase.
/// Configuração via variáveis de ambiente:
/// - SYNC_ENDPOINT: ex. https://<project>.supabase.co/functions/v1/sync-outbox
/// - SYNC_KEY: segredo compartilhado (header X-SYNC-KEY)
/// - DEVICE_FINGERPRINT: opcional (fallback automático quando ausente)
pub fn device_fingerprint_local() -> String {
    if let Some(a) = crate::ativacao::atual() {
        return a.device_fingerprint;
    }
    if let Ok(v) = std::env::var("DEVICE_FINGERPRINT") {
        let normalized = v.trim().to_lowercase();
        if !normalized.is_empty() {
            return normalized.chars().take(200).collect();
        }
    }

    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    format!(
        "desktop-{}-{}",
        user.trim().to_lowercase(),
        host.trim().to_lowercase()
    )
    .chars()
    .take(200)
    .collect()
}

pub fn sync_outbox_real(app: &tauri::AppHandle, limite: i64) -> Result<i64, String> {
    let (endpoint, sync_key) = sync_endpoint_and_key()?;

    let events = outbox_listar_pendentes(app, limite)?;
    if events.is_empty() {
        return Ok(0);
    }

    let client = http_client_with_timeout()?;
    let device_fingerprint = device_fingerprint_local();
    let body = serde_json::to_string(&SyncRequest { events })
        .map_err(|e| format!("Falha ao serializar payload de sync: {e}"))?;
    let headers = signed_headers_for_request(&sync_key, &body, &device_fingerprint)?;
    let res = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .headers(headers)
        .body(body)
        .send()
        .map_err(|e| format!("Falha HTTP ao sincronizar: {e}"))?;

    let status = res.status();
    let body = res
        .text()
        .map_err(|e| format!("Falha ao ler resposta HTTP: {e}"))?;

    if !status.is_success() {
        return Err(format!("Erro da Edge Function ({status}): {body}"));
    }

    let parsed: SyncResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta inválida da Edge Function: {e}. Body={body}"))?;
    if !parsed.ok {
        return Err(format!("Edge Function retornou ok=false. Body={body}"));
    }

    // Marcar processados como ENVIADO
    let enviados = outbox_marcar_enviado(app, &parsed.processed)?;

    // Marcar falhas como ERRO (não aborta o sync)
    for f in parsed.failed {
        let _ = outbox_marcar_falha_item_sync(app, &f.id, &f.error);
    }

    Ok(enviados)
}

#[cfg(test)]
mod tests {
    use super::{validar_pagamentos_venda, PagamentoVendaInput};

    fn pg(forma: &str, valor: f64, parcelas: Option<i64>) -> PagamentoVendaInput {
        PagamentoVendaInput { forma_pagamento: forma.to_string(), valor, parcelas }
    }

    #[test]
    fn pagamentos_ausentes_mantem_comportamento_antigo() {
        assert!(validar_pagamentos_venda(&None, 10.0).is_ok());
    }

    #[test]
    fn pagamento_combinado_valido_e_soma_em_centavos() {
        let l = Some(vec![pg("DINHEIRO", 0.1, None), pg("PIX", 0.2, None), pg("CARTAO_CREDITO", 99.7, Some(3))]);
        assert!(validar_pagamentos_venda(&l, 100.0).is_ok());
    }

    #[test]
    fn pagamento_combinado_rejeita_soma_divergente_forma_repetida_e_invalida() {
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", 50.0, None)]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", 150.0, None)]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", 50.0, None), pg("PIX", 50.0, None)]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("BOLETO", 100.0, None)]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", 100.001, None)]), 100.001).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", -1.0, None), pg("DINHEIRO", 101.0, None)]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![]), 100.0).is_err());
    }

    #[test]
    fn parcelas_so_no_credito_de_1_a_24() {
        assert!(validar_pagamentos_venda(&Some(vec![pg("CARTAO_CREDITO", 100.0, Some(24))]), 100.0).is_ok());
        assert!(validar_pagamentos_venda(&Some(vec![pg("CARTAO_CREDITO", 100.0, Some(25))]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("CARTAO_CREDITO", 100.0, Some(0))]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("CARTAO_DEBITO", 100.0, Some(2))]), 100.0).is_err());
        assert!(validar_pagamentos_venda(&Some(vec![pg("PIX", 100.0, Some(1))]), 100.0).is_ok());
    }
}

#[cfg(test)]
mod tests_existentes {
    use super::{
        backoff_segundos_apos_falha, build_request_signature, canonical_path_with_query,
        endpoint_with_op, validar_caixa_id_obrigatorio,
    };

    #[test]
    fn validar_caixa_id_obrigatorio_rejeita_none_e_vazio_aceita_uuid() {
        assert!(validar_caixa_id_obrigatorio(&None).is_err());
        assert!(validar_caixa_id_obrigatorio(&Some("".to_string())).is_err());
        assert!(validar_caixa_id_obrigatorio(&Some("   ".to_string())).is_err());
        assert!(validar_caixa_id_obrigatorio(&Some("11111111-1111-1111-1111-111111111111".to_string())).is_ok());
    }

    #[test]
    fn backoff_cresce_exponencialmente_e_respeita_teto() {
        assert_eq!(backoff_segundos_apos_falha(1), 15);
        assert_eq!(backoff_segundos_apos_falha(2), 30);
        assert_eq!(backoff_segundos_apos_falha(3), 60);
        assert_eq!(backoff_segundos_apos_falha(4), 120);
        assert_eq!(backoff_segundos_apos_falha(20), 3600);
    }

    #[test]
    fn endpoint_with_op_adiciona_query_param_corretamente() {
        let base = "https://example.supabase.co/functions/v1/sync-outbox";
        assert_eq!(
            endpoint_with_op(base, "catalogo"),
            "https://example.supabase.co/functions/v1/sync-outbox?op=catalogo"
        );

        let com_query = "https://example.supabase.co/functions/v1/sync-outbox?debug=1";
        assert_eq!(
            endpoint_with_op(com_query, "pdv_config"),
            "https://example.supabase.co/functions/v1/sync-outbox?debug=1&op=pdv_config"
        );
    }

    #[test]
    fn canonical_path_with_query_funciona() {
        let path = canonical_path_with_query(
            "https://example.supabase.co/functions/v1/sync-outbox?op=catalogo&debug=1",
        )
        .expect("path deve ser válido");
        assert_eq!(path, "/functions/v1/sync-outbox?op=catalogo&debug=1");
    }

    #[test]
    fn assinatura_hmac_muda_com_nonce_e_corpo() {
        let key = "segredo-de-teste";
        let ts = 1_770_000_000i64;
        let sig1 = build_request_signature(key, ts, "nonce-a", "device-a", "{\"events\":[]}")
            .expect("assinatura 1");
        let sig2 = build_request_signature(key, ts, "nonce-b", "device-a", "{\"events\":[]}")
            .expect("assinatura 2");
        let sig3 = build_request_signature(key, ts, "nonce-a", "device-a", "{\"events\":[1]}")
            .expect("assinatura 3");
        let sig4 = build_request_signature(key, ts, "nonce-a", "device-b", "{\"events\":[]}")
            .expect("assinatura 4");

        assert_ne!(sig1, sig2);
        assert_ne!(sig1, sig3);
        assert_ne!(sig1, sig4);
        assert_eq!(sig1.len(), 64);
    }
}
