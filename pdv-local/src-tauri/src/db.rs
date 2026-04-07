use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use serde::Deserialize;
use tauri::Manager;
use serde_json::json;
use serde::Serialize;

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize)]
pub struct ItemVendaInput {
    pub produto_id: String,
    pub nome: String,
    pub quantidade: i64,
    pub preco_original: f64,
    pub preco_unitario: f64,
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
    pub categoria_id: Option<String>,
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
    pub gerente_senha_sha256: String,
    pub max_desconto_gerente_percentual: f64,
}

#[derive(Serialize)]
pub struct CatalogoLocalDto {
    pub produtos: Vec<ProdutoCacheDto>,
    pub regras: Vec<RegraPrecoCacheDto>,
}

#[derive(Serialize)]
pub struct SyncCatalogoResultDto {
    pub produtos_salvos: usize,
    pub regras_salvas: usize,
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

    Ok(())
}

fn operador_id_efetivo(input: &RegistrarVendaInput) -> Option<String> {
    let from_client = input.operador_id.clone();
    if let Some(ref s) = from_client {
        if Uuid::parse_str(s.trim()).is_ok() {
            return Some(s.trim().to_string());
        }
    }
    std::env::var("PDV_OPERADOR_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| Uuid::parse_str(s).is_ok())
}

pub fn registrar_venda_local(
    app: &tauri::AppHandle,
    input: RegistrarVendaInput,
) -> Result<String, String> {
    // Garantir schema sempre (seguro e evita falha caso init não rode por qualquer motivo).
    init_db(app)?;

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
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
      "itens": itens_payload
    })
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
    tx.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        [],
        |r| r.get(0),
    )
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
            "status": "ABERTO"
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
) -> Result<(), String> {
    init_db(app)?;
    if troco_fechamento < 0.0 {
        return Err("Troco de fechamento inválido".to_string());
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
        enqueue_outbox_tx(
            &tx,
            "CAIXA_FECHADO",
            &json!({
                "id": caixa_id,
                "data_fechamento": now,
                "valor_fechamento": troco_fechamento
            }),
        )?;
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
            "SELECT gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual
             FROM pdv_config_cache
             WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row([], |row| {
            Ok(PdvConfigCacheDto {
                gerente_id: row.get(0)?,
                gerente_senha_sha256: row.get(1)?,
                max_desconto_gerente_percentual: row.get(2)?,
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
            "SELECT id, nome, codigo_barras, preco_varejo, categoria_id, ativo
             FROM produtos_cache",
        )
        .map_err(|e| e.to_string())?;

    let produtos_iter = produtos_stmt.query_map([], |row| {
        Ok(ProdutoCacheDto {
            id: row.get(0)?,
            nome: row.get(1)?,
            codigo_barras: row.get(2)?,
            preco_varejo: row.get(3)?,
            categoria_id: row.get(4)?,
            ativo: row.get::<_, i64>(5)? != 0,
        })
    });

    let produtos: Vec<ProdutoCacheDto> = match produtos_iter {
        Ok(it) => it.map(|r| r.map_err(|e| e.to_string())).collect::<Result<Vec<_>, _>>()?,
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
        Ok(it) => it.map(|r| r.map_err(|e| e.to_string())).collect::<Result<Vec<_>, _>>()?,
        Err(e) => return Err(e.to_string()),
    };

    Ok(CatalogoLocalDto { produtos, regras })
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
    categoria_id: Option<String>,
    ativo: bool,
    origem: String,
    tem_nf: bool,
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
struct PdvConfigSupabaseRow {
    gerente_id: String,
    gerente_senha_sha256: String,
    max_desconto_gerente_percentual: f64,
}

#[derive(Deserialize)]
struct EdgeCatalogoResponse {
    ok: bool,
    #[serde(default)]
    produtos: Vec<ProdutoSupabaseRow>,
    #[serde(default)]
    regras: Vec<RegraPrecoSupabaseRow>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct EdgePdvConfigResponse {
    ok: bool,
    config: Option<PdvConfigSupabaseRow>,
    error: Option<String>,
}

fn endpoint_with_op(endpoint: &str, op: &str) -> String {
    if endpoint.contains('?') {
        format!("{endpoint}&op={op}")
    } else {
        format!("{endpoint}?op={op}")
    }
}

fn sync_endpoint_and_key() -> Result<(String, String), String> {
    let endpoint = std::env::var("SYNC_ENDPOINT")
        .map_err(|_| "Falta SYNC_ENDPOINT no ambiente do app".to_string())?;
    let sync_key =
        std::env::var("SYNC_KEY").map_err(|_| "Falta SYNC_KEY no ambiente do app".to_string())?;
    Ok((endpoint, sync_key))
}

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
    body: &str,
) -> Result<String, String> {
    let message = format!("{ts}.{nonce}.{body}");
    let mut mac = HmacSha256::new_from_slice(sync_key.as_bytes())
        .map_err(|e| format!("Falha ao inicializar assinatura HMAC: {e}"))?;
    mac.update(message.as_bytes());
    let bytes = mac.finalize().into_bytes();
    Ok(hex::encode(bytes))
}

fn signed_headers_for_request(
    sync_key: &str,
    body: &str,
    device_fingerprint: &str,
) -> Result<reqwest::header::HeaderMap, String> {
    let ts = unix_ts_now()?;
    let nonce = Uuid::new_v4().to_string();
    let signature = build_request_signature(sync_key, ts, &nonce, body)?;

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

    Ok(headers)
}

pub fn sync_catalogo_real(app: &tauri::AppHandle) -> Result<SyncCatalogoResultDto, String> {
    init_db(app)?;
    let (endpoint, sync_key) = sync_endpoint_and_key()?;
    let client = reqwest::blocking::Client::new();
    let catalogo_url = endpoint_with_op(&endpoint, "catalogo");
    let headers = signed_headers_for_request(
        &sync_key,
        "",
        &device_fingerprint_local(),
    )?;

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
            parsed.error.unwrap_or_else(|| "erro desconhecido".to_string())
        ));
    }

    let produtos_rows = parsed.produtos;
    let regras_rows = parsed.regras;

    let produtos_len = produtos_rows.len();
    let regras_len = regras_rows.len();

    let path = db_path(app)?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM produtos_cache", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM regras_preco_cache", [])
        .map_err(|e| e.to_string())?;

    for p in produtos_rows {
        tx.execute(
            "INSERT OR REPLACE INTO produtos_cache
             (id, nome, codigo_barras, preco_varejo, categoria_id, ativo, origem, tem_nf)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                p.id,
                p.nome,
                p.codigo_barras,
                p.preco_varejo,
                p.categoria_id,
                if p.ativo { 1 } else { 0 },
                p.origem,
                if p.tem_nf { 1 } else { 0 }
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

    tx.commit().map_err(|e| e.to_string())?;
    Ok(SyncCatalogoResultDto {
        produtos_salvos: produtos_len,
        regras_salvas: regras_len,
    })
}

pub fn sync_pdv_config_real(app: &tauri::AppHandle) -> Result<Option<PdvConfigCacheDto>, String> {
    init_db(app)?;
    let (endpoint, sync_key) = sync_endpoint_and_key()?;
    let client = reqwest::blocking::Client::new();
    let config_url = endpoint_with_op(&endpoint, "pdv_config");
    let headers = signed_headers_for_request(
        &sync_key,
        "",
        &device_fingerprint_local(),
    )?;

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
            parsed.error.unwrap_or_else(|| "erro desconhecido".to_string())
        ));
    }
    let row = match parsed.config {
        Some(r) => r,
        None => return Ok(None),
    };

    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO pdv_config_cache (id, gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual)
         VALUES (1, ?1, ?2, ?3)",
        params![row.gerente_id, row.gerente_senha_sha256, row.max_desconto_gerente_percentual],
    )
    .map_err(|e| e.to_string())?;

    Ok(Some(PdvConfigCacheDto {
        gerente_id: row.gerente_id,
        gerente_senha_sha256: row.gerente_senha_sha256,
        max_desconto_gerente_percentual: row.max_desconto_gerente_percentual,
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
    let pendentes_total = contagem_outbox(&conn, "SELECT COUNT(1) FROM outbox WHERE status = 'PENDENTE'")?;
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
        sync_endpoint_set: std::env::var("SYNC_ENDPOINT").is_ok(),
        sync_key_set: std::env::var("SYNC_KEY").is_ok(),
        outbox_pendentes: resumo.pendentes_total,
        outbox_prontos_sync: resumo.prontos_sync,
        outbox_em_backoff: resumo.em_backoff,
        outbox_dlq: resumo.dlq,
    })
}

pub fn outbox_listar_pendentes(app: &tauri::AppHandle, limite: i64) -> Result<Vec<OutboxEvent>, String> {
    init_db(app)?;
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, tipo, payload_json, created_at
             FROM outbox
             WHERE status = 'PENDENTE'
               AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
             ORDER BY created_at ASC
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
pub fn outbox_marcar_falha_item_sync(app: &tauri::AppHandle, id: &str, erro: &str) -> Result<(), String> {
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
                "SELECT id FROM outbox WHERE status = 'PENDENTE' ORDER BY created_at ASC LIMIT ?1",
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
fn device_fingerprint_local() -> String {
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
    format!("desktop-{}-{}", user.trim().to_lowercase(), host.trim().to_lowercase())
        .chars()
        .take(200)
        .collect()
}

pub fn sync_outbox_real(app: &tauri::AppHandle, limite: i64) -> Result<i64, String> {
    let endpoint = std::env::var("SYNC_ENDPOINT")
        .map_err(|_| "Falta SYNC_ENDPOINT no ambiente do app".to_string())?;
    let sync_key =
        std::env::var("SYNC_KEY").map_err(|_| "Falta SYNC_KEY no ambiente do app".to_string())?;

    let events = outbox_listar_pendentes(app, limite)?;
    if events.is_empty() {
        return Ok(0);
    }

    let client = reqwest::blocking::Client::new();
    let device_fingerprint = device_fingerprint_local();
    let body = serde_json::to_string(&SyncRequest { events })
        .map_err(|e| format!("Falha ao serializar payload de sync: {e}"))?;
    let headers = signed_headers_for_request(
        &sync_key,
        &body,
        &device_fingerprint,
    )?;
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
    use super::{
        backoff_segundos_apos_falha, build_request_signature, canonical_path_with_query,
        endpoint_with_op,
    };

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
        let sig1 = build_request_signature(key, ts, "nonce-a", "{\"events\":[]}")
            .expect("assinatura 1");
        let sig2 = build_request_signature(key, ts, "nonce-b", "{\"events\":[]}")
            .expect("assinatura 2");
        let sig3 = build_request_signature(key, ts, "nonce-a", "{\"events\":[1]}")
            .expect("assinatura 3");

        assert_ne!(sig1, sig2);
        assert_ne!(sig1, sig3);
        assert_eq!(sig1.len(), 64);
    }
}

