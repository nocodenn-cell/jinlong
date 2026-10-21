//! Login rápido do operador por PIN (P0). Decisões: caixa do terminal (opção A: a troca não fecha o caixa),
//! PIN de 4 dígitos, bloqueio por inatividade (padrão 3 min, vem da loja).
//!
//! * Online: `sync-outbox?op=validar_operador` (PBKDF2 no servidor, contador 5/10 no banco, auditoria).
//! * Offline: cache `sync-outbox?op=operadores` gravado no SQLite CIFRADO com chave derivada do segredo do
//!   dispositivo (HMAC-SHA256 em modo contador + tag HMAC, encrypt-then-MAC). O cache nunca tem o hash do banco,
//!   só `hash_dispositivo` = HMAC(sync_key, "pdv-pin-v1:<id>:<pbkdf2>"). Expira em 7 dias sem sync.
//! * 5 erros seguidos ⇒ 5 min bloqueado; 10 ⇒ só o gerente (reset no painel) libera. Erros offline vão para a
//!   outbox (`OPERADOR_EVENTO`) e somam no contador do servidor no próximo sync.

use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

pub const ERROS_BLOQUEIO_CURTO: i64 = 5;
pub const ERROS_BLOQUEIO_GERENTE: i64 = 10;
pub const BLOQUEIO_CURTO_SEG: i64 = 5 * 60;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OperadorAtual {
    pub usuario_id: String,
    pub nome: String,
    pub papel: String,
}

static OPERADOR_ATUAL: Mutex<Option<OperadorAtual>> = Mutex::new(None);

pub fn operador_atual() -> Option<OperadorAtual> {
    OPERADOR_ATUAL.lock().ok().and_then(|g| g.clone())
}

fn definir_operador_atual(op: Option<OperadorAtual>) {
    if let Ok(mut g) = OPERADOR_ATUAL.lock() {
        *g = op;
    }
}

// ─── cripto ─────────────────────────────────────────────────────────────────────────────────────────

fn hmac(key: &[u8], parts: &[&[u8]]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC aceita qualquer tamanho de chave");
    for p in parts {
        mac.update(p);
    }
    mac.finalize().into_bytes().into()
}

/// PBKDF2-HMAC-SHA256 com 32 bytes de saída (um bloco). Igual ao WebCrypto/Node do servidor.
pub fn pbkdf2_sha256(senha: &[u8], salt: &[u8], iteracoes: u32) -> [u8; 32] {
    let mut u = hmac(senha, &[salt, &1u32.to_be_bytes()]);
    let mut t = u;
    for _ in 1..iteracoes {
        u = hmac(senha, &[&u]);
        for (a, b) in t.iter_mut().zip(u.iter()) {
            *a ^= b;
        }
    }
    t
}

pub fn hash_dispositivo(sync_key: &str, usuario_id: &str, pin: &str, salt_hex: &str, iteracoes: u32) -> Result<String, String> {
    let salt = hex::decode(salt_hex).map_err(|_| "salt inválido".to_string())?;
    let h = hex::encode(pbkdf2_sha256(pin.as_bytes(), &salt, iteracoes));
    let msg = format!("pdv-pin-v1:{usuario_id}:{h}");
    Ok(hex::encode(hmac(sync_key.as_bytes(), &[msg.as_bytes()])))
}

fn iguais_tempo_constante(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn chaves_cache(sync_key: &str) -> ([u8; 32], [u8; 32]) {
    (
        hmac(sync_key.as_bytes(), &[b"pdv-operadores-cache-enc-v1"]),
        hmac(sync_key.as_bytes(), &[b"pdv-operadores-cache-mac-v1"]),
    )
}

fn keystream_xor(k_enc: &[u8; 32], nonce: &[u8], dados: &mut [u8]) {
    for (i, bloco) in dados.chunks_mut(32).enumerate() {
        let ks = hmac(k_enc, &[nonce, &(i as u64).to_be_bytes()]);
        for (d, k) in bloco.iter_mut().zip(ks.iter()) {
            *d ^= k;
        }
    }
}

pub fn cifrar(sync_key: &str, claro: &[u8]) -> String {
    let (k_enc, k_mac) = chaves_cache(sync_key);
    let nonce = Uuid::new_v4().as_bytes().to_vec();
    let mut ct = claro.to_vec();
    keystream_xor(&k_enc, &nonce, &mut ct);
    let tag = hmac(&k_mac, &[&nonce, &ct]);
    format!("v1.{}.{}.{}", hex::encode(&nonce), hex::encode(&ct), hex::encode(tag))
}

pub fn decifrar(sync_key: &str, blob: &str) -> Result<Vec<u8>, String> {
    let partes: Vec<&str> = blob.split('.').collect();
    if partes.len() != 4 || partes[0] != "v1" {
        return Err("CACHE_INVALIDO".into());
    }
    let nonce = hex::decode(partes[1]).map_err(|_| "CACHE_INVALIDO")?;
    let mut ct = hex::decode(partes[2]).map_err(|_| "CACHE_INVALIDO")?;
    let tag = hex::decode(partes[3]).map_err(|_| "CACHE_INVALIDO")?;
    let (k_enc, k_mac) = chaves_cache(sync_key);
    if !iguais_tempo_constante(&hmac(&k_mac, &[&nonce, &ct]), &tag) {
        return Err("CACHE_ADULTERADO".into());
    }
    keystream_xor(&k_enc, &nonce, &mut ct);
    Ok(ct)
}

// ─── cache ───────────────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperadorCacheItem {
    pub usuario_id: String,
    pub nome: String,
    pub papel: String,
    #[serde(default)]
    pub idioma: Option<String>,
    pub tem_pin: bool,
    pub pin_salt: Option<String>,
    pub pin_iteracoes: Option<u32>,
    pub hash_dispositivo: Option<String>,
    pub bloqueado_ate: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperadoresCache {
    pub loja_id: String,
    pub exigir_pin_operador: bool,
    pub bloqueio_inatividade_min: i64,
    pub emitido_em: String,
    pub expira_em: String,
    pub operadores: Vec<OperadorCacheItem>,
}

#[derive(Deserialize)]
struct EdgeOperadoresResponse {
    ok: bool,
    #[serde(default)]
    disponivel: bool,
    loja_id: Option<String>,
    #[serde(default)]
    exigir_pin_operador: bool,
    bloqueio_inatividade_min: Option<i64>,
    emitido_em: Option<String>,
    expira_em: Option<String>,
    #[serde(default)]
    operadores: Vec<OperadorCacheItem>,
}

/// O que a tela recebe: nunca salt/hash.
#[derive(Serialize, Clone, Debug)]
pub struct OperadorPublicoDto {
    pub usuario_id: String,
    pub nome: String,
    pub papel: String,
    pub idioma: String,
    pub tem_pin: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct OperadoresStatusDto {
    /// false = sem cache válido (PDV antigo/servidor sem a migration/expirado) ⇒ fluxo sem PIN.
    pub disponivel: bool,
    pub expirado: bool,
    pub exigir_pin_operador: bool,
    pub bloqueio_inatividade_min: i64,
    pub expira_em: Option<String>,
    pub operadores: Vec<OperadorPublicoDto>,
    pub operador_atual: Option<OperadorAtual>,
}

pub fn init_tabelas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS operadores_cache (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           blob TEXT NOT NULL,
           expira_em_unix INTEGER NOT NULL,
           atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         );
         CREATE TABLE IF NOT EXISTS operador_pin_tentativas (
           usuario_id TEXT PRIMARY KEY,
           erros INTEGER NOT NULL DEFAULT 0,
           bloqueado_ate_unix INTEGER
         );",
    )
    .map_err(|e| e.to_string())
}

fn agora_unix() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn iso_para_unix(s: &str) -> Option<i64> {
    // "YYYY-MM-DDTHH:MM:SS(.fff)Z" — formato do toISOString() do servidor.
    let b = s.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    // dias desde 1970 (algoritmo civil de Howard Hinnant)
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let dias = era * 146097 + doe - 719468;
    Some(dias * 86400 + h * 3600 + mi * 60 + se)
}

fn bloqueado_servidor(b: &Option<String>, agora: i64) -> bool {
    match b.as_deref() {
        None => false,
        Some("infinity") => true,
        Some(s) => iso_para_unix(s).map(|t| t > agora).unwrap_or(false),
    }
}

pub fn salvar_cache(conn: &Connection, sync_key: &str, cache: &OperadoresCache) -> Result<(), String> {
    let claro = serde_json::to_vec(cache).map_err(|e| e.to_string())?;
    let exp = iso_para_unix(&cache.expira_em).unwrap_or_else(|| agora_unix() + 7 * 86400);
    conn.execute(
        "INSERT OR REPLACE INTO operadores_cache (id, blob, expira_em_unix) VALUES (1, ?1, ?2)",
        params![cifrar(sync_key, &claro), exp],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// (cache, expirado). Cache adulterado/de outro dispositivo ⇒ None.
pub fn ler_cache(conn: &Connection, sync_key: &str, agora: i64) -> Result<Option<(OperadoresCache, bool)>, String> {
    let row: Option<(String, i64)> = conn
        .query_row("SELECT blob, expira_em_unix FROM operadores_cache WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((blob, exp)) = row else { return Ok(None) };
    let Ok(claro) = decifrar(sync_key, &blob) else { return Ok(None) };
    let cache: OperadoresCache = serde_json::from_slice(&claro).map_err(|e| e.to_string())?;
    Ok(Some((cache, exp <= agora)))
}

fn status_de(cache: Option<(OperadoresCache, bool)>) -> OperadoresStatusDto {
    match cache {
        None => OperadoresStatusDto {
            disponivel: false,
            expirado: false,
            exigir_pin_operador: false,
            bloqueio_inatividade_min: 3,
            expira_em: None,
            operadores: vec![],
            operador_atual: operador_atual(),
        },
        Some((c, expirado)) => OperadoresStatusDto {
            disponivel: !expirado,
            expirado,
            exigir_pin_operador: c.exigir_pin_operador,
            bloqueio_inatividade_min: c.bloqueio_inatividade_min.clamp(1, 60),
            expira_em: Some(c.expira_em.clone()),
            operadores: c
                .operadores
                .iter()
                .map(|o| OperadorPublicoDto {
                    usuario_id: o.usuario_id.clone(),
                    nome: o.nome.clone(),
                    papel: o.papel.clone(),
                    idioma: o.idioma.clone().unwrap_or_else(|| "pt".into()),
                    tem_pin: o.tem_pin,
                })
                .collect(),
            operador_atual: operador_atual(),
        },
    }
}

fn abrir(app: &tauri::AppHandle) -> Result<Connection, String> {
    crate::db::init_db(app)?;
    let conn = Connection::open(crate::db::db_path(app)?).map_err(|e| e.to_string())?;
    init_tabelas(&conn)?;
    Ok(conn)
}

pub fn operadores_local(app: &tauri::AppHandle) -> Result<OperadoresStatusDto, String> {
    let conn = abrir(app)?;
    let Ok((_, key)) = crate::db::sync_endpoint_and_key() else { return Ok(status_de(None)) };
    Ok(status_de(ler_cache(&conn, &key, agora_unix())?))
}

pub fn operadores_sync(app: &tauri::AppHandle) -> Result<OperadoresStatusDto, String> {
    let conn = abrir(app)?;
    let (endpoint, key) = crate::db::sync_endpoint_and_key()?;
    let client = crate::db::http_client_with_timeout()?;
    let headers = crate::db::signed_headers_for_request(&key, "", &crate::db::device_fingerprint_local())?;
    let resp = client
        .get(crate::db::endpoint_with_op(&endpoint, "operadores"))
        .headers(headers)
        .send()
        .map_err(|e| format!("Falha ao sincronizar operadores: {e}"))?;
    let status = resp.status();
    let body = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        // Edge antiga (sem a op) responde 400 INVALID_OPERATION ⇒ segue com o que tiver no cache.
        return Ok(status_de(ler_cache(&conn, &key, agora_unix())?));
    }
    let parsed: EdgeOperadoresResponse =
        serde_json::from_str(&body).map_err(|_| format!("Resposta inválida de operadores ({status})"))?;
    if !parsed.ok || !parsed.disponivel {
        return Ok(status_de(ler_cache(&conn, &key, agora_unix())?));
    }
    let cache = OperadoresCache {
        loja_id: parsed.loja_id.unwrap_or_default(),
        exigir_pin_operador: parsed.exigir_pin_operador,
        bloqueio_inatividade_min: parsed.bloqueio_inatividade_min.unwrap_or(3),
        emitido_em: parsed.emitido_em.unwrap_or_default(),
        expira_em: parsed.expira_em.unwrap_or_default(),
        operadores: parsed.operadores,
    };
    salvar_cache(&conn, &key, &cache)?;
    // Servidor diz "livre" e não há erro offline pendente de envio ⇒ zera o contador local.
    let pendentes_pin: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM outbox WHERE tipo = 'OPERADOR_EVENTO' AND status = 'PENDENTE'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);
    if pendentes_pin == 0 {
        let agora = agora_unix();
        for o in &cache.operadores {
            if !bloqueado_servidor(&o.bloqueado_ate, agora) {
                let _ = conn.execute("DELETE FROM operador_pin_tentativas WHERE usuario_id = ?1", params![o.usuario_id]);
            }
        }
    }
    let mut st = status_de(Some((cache, false)));
    // operador desligado some do cache ⇒ sai do caixa
    if let Some(atual) = operador_atual() {
        if !st.operadores.iter().any(|o| o.usuario_id == atual.usuario_id) {
            definir_operador_atual(None);
            st.operador_atual = None;
        }
    }
    Ok(st)
}

// ─── verificação ─────────────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ValidarPinDto {
    pub ok: bool,
    pub offline: bool,
    pub usuario_id: Option<String>,
    pub nome: Option<String>,
    pub papel: Option<String>,
    /// PIN_INCORRETO | PIN_BLOQUEADO | PIN_BLOQUEADO_GERENTE | SEM_PIN | SEM_CACHE | PIN_SEM_PERMISSAO | PIN_INVALIDO
    pub erro: Option<String>,
    pub bloqueado_ate_unix: Option<i64>,
    /// Evento de auditoria (OVERRIDE_GERENTE) — vai na venda para o servidor aceitar o desconto sem senha.
    #[serde(default)]
    pub evento_id: Option<String>,
}

fn falha(erro: &str, offline: bool, bloqueado: Option<i64>) -> ValidarPinDto {
    ValidarPinDto { ok: false, offline, usuario_id: None, nome: None, papel: None, erro: Some(erro.into()), bloqueado_ate_unix: bloqueado, evento_id: None }
}

pub fn pin_valido_formato(pin: &str) -> bool {
    pin.len() == 4 && pin.bytes().all(|c| c.is_ascii_digit())
}

fn bloqueio_local(conn: &Connection, uid: &str, agora: i64) -> Result<Option<(i64, i64)>, String> {
    let row: Option<(i64, Option<i64>)> = conn
        .query_row(
            "SELECT erros, bloqueado_ate_unix FROM operador_pin_tentativas WHERE usuario_id = ?1",
            params![uid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(match row {
        Some((erros, Some(ate))) if ate > agora => Some((erros, ate)),
        _ => None,
    })
}

/// Registra erro local; devolve Some(bloqueado_ate) se bloqueou. i64::MAX = só o gerente.
fn registrar_erro_local(conn: &Connection, uid: &str, agora: i64) -> Result<Option<i64>, String> {
    conn.execute(
        "INSERT INTO operador_pin_tentativas (usuario_id, erros) VALUES (?1, 1)
         ON CONFLICT(usuario_id) DO UPDATE SET erros = erros + 1",
        params![uid],
    )
    .map_err(|e| e.to_string())?;
    let erros: i64 = conn
        .query_row("SELECT erros FROM operador_pin_tentativas WHERE usuario_id = ?1", params![uid], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let ate = if erros >= ERROS_BLOQUEIO_GERENTE {
        Some(i64::MAX)
    } else if erros % ERROS_BLOQUEIO_CURTO == 0 {
        Some(agora + BLOQUEIO_CURTO_SEG)
    } else {
        None
    };
    if let Some(a) = ate {
        conn.execute("UPDATE operador_pin_tentativas SET bloqueado_ate_unix = ?2 WHERE usuario_id = ?1", params![uid, a])
            .map_err(|e| e.to_string())?;
    }
    Ok(ate)
}

/// Conferência offline pura (testável): cache + PIN ⇒ resultado; atualiza contador local.
pub fn validar_offline(
    conn: &Connection,
    sync_key: &str,
    cache: &OperadoresCache,
    usuario_id: &str,
    pin: &str,
    para_gerente: bool,
    agora: i64,
) -> Result<ValidarPinDto, String> {
    let Some(op) = cache.operadores.iter().find(|o| o.usuario_id == usuario_id) else {
        return Ok(falha("PIN_INCORRETO", true, None));
    };
    if let Some((_, ate)) = bloqueio_local(conn, usuario_id, agora)? {
        return Ok(falha(if ate == i64::MAX { "PIN_BLOQUEADO_GERENTE" } else { "PIN_BLOQUEADO" }, true, Some(ate)));
    }
    if bloqueado_servidor(&op.bloqueado_ate, agora) {
        return Ok(falha("PIN_BLOQUEADO", true, None));
    }
    let (Some(salt), Some(iter), Some(esperado)) = (&op.pin_salt, op.pin_iteracoes, &op.hash_dispositivo) else {
        return Ok(falha("SEM_PIN", true, None));
    };
    let calc = hash_dispositivo(sync_key, usuario_id, pin, salt, iter)?;
    if !iguais_tempo_constante(calc.as_bytes(), esperado.as_bytes()) {
        let ate = registrar_erro_local(conn, usuario_id, agora)?;
        return Ok(match ate {
            Some(a) if a == i64::MAX => falha("PIN_BLOQUEADO_GERENTE", true, Some(a)),
            Some(a) => falha("PIN_BLOQUEADO", true, Some(a)),
            None => falha("PIN_INCORRETO", true, None),
        });
    }
    if para_gerente && op.papel != "GERENTE" && op.papel != "DONO" {
        return Ok(falha("PIN_SEM_PERMISSAO", true, None));
    }
    let _ = conn.execute("DELETE FROM operador_pin_tentativas WHERE usuario_id = ?1", params![usuario_id]);
    Ok(ValidarPinDto {
        ok: true,
        offline: true,
        usuario_id: Some(op.usuario_id.clone()),
        nome: Some(op.nome.clone()),
        papel: Some(op.papel.clone()),
        erro: None,
        bloqueado_ate_unix: None,
        evento_id: None,
    })
}

#[derive(Deserialize)]
struct EdgeValidarResponse {
    ok: bool,
    error: Option<String>,
    usuario_id: Option<String>,
    nome: Option<String>,
    papel: Option<String>,
    evento_id: Option<String>,
}

/// Ok(None) = sem rede/servidor indisponível ⇒ cair para offline.
fn validar_online(usuario_id: &str, pin: &str, para_gerente: bool, acao: Option<&str>) -> Option<ValidarPinDto> {
    let (endpoint, key) = crate::db::sync_endpoint_and_key().ok()?;
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(6)).build().ok()?;
    let body = serde_json::json!({
        "usuario_id": usuario_id,
        "pin": pin,
        "finalidade": if para_gerente { "gerente" } else { "operador" },
        "acao": acao,
    })
    .to_string();
    let headers = crate::db::signed_headers_for_request(&key, &body, &crate::db::device_fingerprint_local()).ok()?;
    let resp = client
        .post(crate::db::endpoint_with_op(&endpoint, "validar_operador"))
        .header("Content-Type", "application/json")
        .headers(headers)
        .body(body)
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None; // 4xx de Edge antiga / 5xx ⇒ offline
    }
    let parsed: EdgeValidarResponse = serde_json::from_str(&resp.text().ok()?).ok()?;
    Some(if parsed.ok {
        ValidarPinDto { ok: true, offline: false, usuario_id: parsed.usuario_id, nome: parsed.nome, papel: parsed.papel, erro: None, bloqueado_ate_unix: None, evento_id: parsed.evento_id }
    } else {
        falha(parsed.error.as_deref().unwrap_or("PIN_INCORRETO"), false, None)
    })
}

pub fn enfileirar_evento(
    conn: &Connection,
    tipo: &str,
    usuario_id: Option<&str>,
    detalhe: serde_json::Value,
) -> Result<String, String> {
    let loja = crate::db::loja_id_configurada(conn)?;
    let evento_id = Uuid::new_v4().to_string();
    let payload = serde_json::json!({
        "id": evento_id,
        "loja_id": loja,
        "usuario_id": usuario_id,
        "tipo": tipo,
        "origem": "offline",
        "ocorrido_em": chrono_iso_agora(),
        "detalhe": detalhe,
    });
    conn.execute(
        "INSERT INTO outbox (id, tipo, payload_json) VALUES (?1, 'OPERADOR_EVENTO', ?2)",
        params![Uuid::new_v4().to_string(), payload.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(evento_id)
}

fn chrono_iso_agora() -> String {
    let t = agora_unix();
    let (dias, resto) = (t.div_euclid(86400), t.rem_euclid(86400));
    // inverso do algoritmo civil
    let z = dias + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", resto / 3600, (resto % 3600) / 60, resto % 60)
}

/// `para_gerente`: autorização de ação sensível (não troca o operador do caixa).
pub fn validar_pin(
    app: &tauri::AppHandle,
    usuario_id: String,
    pin: String,
    para_gerente: bool,
    acao: Option<String>,
) -> Result<ValidarPinDto, String> {
    let pin = pin.trim().to_string();
    if !pin_valido_formato(&pin) || Uuid::parse_str(usuario_id.trim()).is_err() {
        return Ok(falha("PIN_INVALIDO", false, None));
    }
    let conn = abrir(app)?;
    let (_, key) = crate::db::sync_endpoint_and_key()?;
    let agora = agora_unix();
    // Bloqueio local vale mesmo online (o servidor também conta).
    if let Some((_, ate)) = bloqueio_local(&conn, &usuario_id, agora)? {
        return Ok(falha(if ate == i64::MAX { "PIN_BLOQUEADO_GERENTE" } else { "PIN_BLOQUEADO" }, false, Some(ate)));
    }
    let r = match validar_online(&usuario_id, &pin, para_gerente, acao.as_deref()) {
        Some(r) => {
            if r.ok {
                let _ = conn.execute("DELETE FROM operador_pin_tentativas WHERE usuario_id = ?1", params![usuario_id]);
            }
            r
        }
        None => {
            let Some((cache, expirado)) = ler_cache(&conn, &key, agora)? else {
                return Ok(falha("SEM_CACHE", true, None));
            };
            if expirado {
                return Ok(falha("SEM_CACHE", true, None));
            }
            let mut r = validar_offline(&conn, &key, &cache, &usuario_id, &pin, para_gerente, agora)?;
            let tipo = if r.ok {
                if para_gerente { "OVERRIDE_GERENTE" } else { "ENTROU" }
            } else if matches!(r.erro.as_deref(), Some("PIN_BLOQUEADO") | Some("PIN_BLOQUEADO_GERENTE")) {
                "BLOQUEADO"
            } else {
                "PIN_ERRADO"
            };
            if r.ok || matches!(r.erro.as_deref(), Some("PIN_INCORRETO") | Some("PIN_BLOQUEADO") | Some("PIN_BLOQUEADO_GERENTE")) {
                let det = match &acao { Some(a) => serde_json::json!({ "acao": a }), None => serde_json::json!({}) };
                if let Ok(id) = enfileirar_evento(&conn, tipo, Some(&usuario_id), det) {
                    if r.ok {
                        r.evento_id = Some(id);
                    }
                }
            }
            r
        }
    };
    if r.ok && !para_gerente {
        definir_operador_atual(Some(OperadorAtual {
            usuario_id: r.usuario_id.clone().unwrap_or(usuario_id),
            nome: r.nome.clone().unwrap_or_default(),
            papel: r.papel.clone().unwrap_or_default(),
        }));
    }
    Ok(r)
}

/// Trocar operador / bloqueio por inatividade: tira o operador do caixa (carrinho fica na tela, intocado).
pub fn sair(app: &tauri::AppHandle, motivo: String) -> Result<(), String> {
    let atual = operador_atual();
    definir_operador_atual(None);
    if let Some(op) = atual {
        let conn = abrir(app)?;
        let tipo = if motivo == "inatividade" { "BLOQUEIO_AUTO" } else { "SAIU" };
        let _ = enfileirar_evento(&conn, tipo, Some(&op.usuario_id), serde_json::json!({}));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "chave-de-teste-do-dispositivo-ficticia-000000000000";
    const UID: &str = "d2000000-0000-4000-8000-000000000003";

    #[test]
    fn pbkdf2_vetor_rfc7914() {
        assert_eq!(
            hex::encode(pbkdf2_sha256(b"passwd", b"salt", 1)),
            "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc"
        );
        // RFC 6070-style (SHA-256): P="password", S="salt", c=2
        assert_eq!(
            hex::encode(pbkdf2_sha256(b"password", b"salt", 2)),
            "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"
        );
    }

    #[test]
    fn cifra_ida_e_volta_e_detecta_adulteracao() {
        let blob = cifrar(KEY, b"{\"a\":1} dados longos o bastante para mais de um bloco de 32 bytes");
        assert_eq!(decifrar(KEY, &blob).unwrap(), b"{\"a\":1} dados longos o bastante para mais de um bloco de 32 bytes");
        assert!(decifrar("outra-chave", &blob).is_err());
        let mut adult = blob.clone();
        adult.replace_range(10..11, if &blob[10..11] == "0" { "1" } else { "0" });
        assert!(decifrar(KEY, &adult).is_err());
        assert!(!blob.contains("dados"));
    }

    #[test]
    fn iso_unix() {
        assert_eq!(iso_para_unix("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(iso_para_unix("2026-10-21T12:00:00.000Z"), Some(1792584000));
    }

    fn cache_com(pin: &str, papel: &str) -> OperadoresCache {
        let salt = "0123456789abcdef0123456789abcdef";
        OperadoresCache {
            loja_id: "d1000000-0000-4000-8000-00000000000a".into(),
            exigir_pin_operador: true,
            bloqueio_inatividade_min: 3,
            emitido_em: "2026-10-21T12:00:00Z".into(),
            expira_em: "2026-10-28T12:00:00Z".into(),
            operadores: vec![OperadorCacheItem {
                usuario_id: UID.into(),
                nome: "Caixa Teste".into(),
                papel: papel.into(),
                idioma: Some("pt".into()),
                tem_pin: true,
                pin_salt: Some(salt.into()),
                pin_iteracoes: Some(1000),
                hash_dispositivo: Some(hash_dispositivo(KEY, UID, pin, salt, 1000).unwrap()),
                bloqueado_ate: None,
            }],
        }
    }

    #[test]
    fn offline_acerta_erra_e_bloqueia() {
        let conn = Connection::open_in_memory().unwrap();
        init_tabelas(&conn).unwrap();
        let c = cache_com("7391", "OPERADOR");
        let t = 1_800_000_000;
        assert!(validar_offline(&conn, KEY, &c, UID, "7391", false, t).unwrap().ok);
        for i in 1..=4 {
            let r = validar_offline(&conn, KEY, &c, UID, "0001", false, t).unwrap();
            assert_eq!(r.erro.as_deref(), Some("PIN_INCORRETO"), "erro {i}");
        }
        let r = validar_offline(&conn, KEY, &c, UID, "0001", false, t).unwrap();
        assert_eq!(r.erro.as_deref(), Some("PIN_BLOQUEADO"));
        // bloqueado até mesmo com o PIN certo
        assert_eq!(validar_offline(&conn, KEY, &c, UID, "7391", false, t + 10).unwrap().erro.as_deref(), Some("PIN_BLOQUEADO"));
        // passou 5 min: mais 5 erros ⇒ só o gerente
        let t2 = t + BLOQUEIO_CURTO_SEG + 1;
        for _ in 0..4 {
            validar_offline(&conn, KEY, &c, UID, "0001", false, t2).unwrap();
        }
        let r = validar_offline(&conn, KEY, &c, UID, "0001", false, t2).unwrap();
        assert_eq!(r.erro.as_deref(), Some("PIN_BLOQUEADO_GERENTE"));
        assert_eq!(validar_offline(&conn, KEY, &c, UID, "7391", false, t2 + 86400).unwrap().erro.as_deref(), Some("PIN_BLOQUEADO_GERENTE"));
    }

    #[test]
    fn offline_gerente_e_cache_de_outro_dispositivo() {
        let conn = Connection::open_in_memory().unwrap();
        init_tabelas(&conn).unwrap();
        let op = cache_com("7391", "OPERADOR");
        assert_eq!(validar_offline(&conn, KEY, &op, UID, "7391", true, 1).unwrap().erro.as_deref(), Some("PIN_SEM_PERMISSAO"));
        let ge = cache_com("7391", "GERENTE");
        assert!(validar_offline(&conn, KEY, &ge, UID, "7391", true, 1).unwrap().ok);
        // mesmo cache, outra chave de dispositivo ⇒ não confere
        assert_eq!(validar_offline(&conn, "outra", &ge, UID, "7391", false, 1).unwrap().erro.as_deref(), Some("PIN_INCORRETO"));
        // salvar/ler com expiração
        salvar_cache(&conn, KEY, &ge).unwrap();
        let exp = iso_para_unix("2026-10-28T12:00:00Z").unwrap();
        assert!(!ler_cache(&conn, KEY, exp - 1).unwrap().unwrap().1);
        assert!(ler_cache(&conn, KEY, exp + 1).unwrap().unwrap().1);
        assert!(ler_cache(&conn, "outra", 0).unwrap().is_none());
    }

    #[test]
    fn formato_pin() {
        assert!(pin_valido_formato("0429"));
        assert!(!pin_valido_formato("123"));
        assert!(!pin_valido_formato("12a4"));
        assert!(!pin_valido_formato("12345"));
    }
}
