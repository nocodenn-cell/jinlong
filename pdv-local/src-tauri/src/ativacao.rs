//! Ativação do PDV desktop por código (substitui a SYNC_KEY global no `.env` do cliente).
//!
//! Fluxo: o painel admin gera um código de uso único (24h) para uma loja → o operador digita o código
//! na primeira abertura → o PDV chama `sync-outbox?op=ativar` → o servidor devolve um segredo HMAC
//! EXCLUSIVO deste computador, amarrado à loja no servidor → gravado em `ativacao.json` no diretório de
//! dados do app. A partir daí o `.env` não é mais necessário (continua aceito como fallback legado).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Ativacao {
    pub endpoint: String,
    pub dispositivo_id: String,
    pub loja_id: String,
    pub empresa_id: String,
    pub device_fingerprint: String,
    pub sync_key: String,
}

#[derive(Serialize)]
pub struct AtivacaoStatusDto {
    pub ativado: bool,
    pub loja_id: Option<String>,
    pub dispositivo_id: Option<String>,
    pub endpoint: Option<String>,
    /// true quando o PDV ainda depende de SYNC_KEY no `.env` (modo legado).
    pub usando_env_legado: bool,
}

static ATIVACAO: Mutex<Option<Ativacao>> = Mutex::new(None);

fn arquivo(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ativacao.json"))
}

pub fn carregar(app: &tauri::AppHandle) {
    let Ok(path) = arquivo(app) else { return };
    let Ok(raw) = std::fs::read_to_string(&path) else { return };
    match serde_json::from_str::<Ativacao>(&raw) {
        Ok(a) => *ATIVACAO.lock().unwrap() = Some(a),
        Err(e) => eprintln!("ativacao.json inválido ({e}); PDV precisa ser reativado"),
    }
}

pub fn atual() -> Option<Ativacao> {
    ATIVACAO.lock().unwrap().clone()
}

/// Endpoint padrão embutido no build do instalador (`PDV_SYNC_ENDPOINT_DEFAULT`) ou `.env` (legado).
pub fn endpoint_padrao() -> Option<String> {
    option_env!("PDV_SYNC_ENDPOINT_DEFAULT")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("SYNC_ENDPOINT").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Forma canônica igual à do servidor: só [A-Z0-9] maiúsculo (hífens/espaços ignorados).
pub fn normalizar_codigo(raw: &str) -> Option<String> {
    let t = raw.trim().to_uppercase();
    if !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c.is_whitespace()) {
        return None;
    }
    let c: String = t.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if c.len() < 8 || c.len() > 32 {
        return None;
    }
    Some(c)
}

#[derive(Deserialize)]
struct AtivarResponse {
    ok: bool,
    error: Option<String>,
    dispositivo_id: Option<String>,
    loja_id: Option<String>,
    empresa_id: Option<String>,
    device_fingerprint: Option<String>,
    sync_key: Option<String>,
}

fn mensagem_erro(code: &str) -> String {
    match code {
        "ATIVACAO_PDV_CODIGO_INVALIDO" => {
            "Código inválido, já usado ou expirado. Peça um novo código no painel.".to_string()
        }
        "EMPRESA_NAO_OPERACIONAL" => "Empresa suspensa ou fora da vigência.".to_string(),
        "ATIVACAO_PDV_FINGERPRINT_INVALIDO" => "Identificação do computador inválida.".to_string(),
        other => format!("Falha na ativação: {other}"),
    }
}

fn parse_resposta(endpoint: &str, body: &str) -> Result<Ativacao, String> {
    let r: AtivarResponse =
        serde_json::from_str(body).map_err(|e| format!("Resposta inválida do servidor: {e}"))?;
    if !r.ok {
        return Err(mensagem_erro(r.error.as_deref().unwrap_or("DESCONHECIDO")));
    }
    let get = |v: Option<String>, campo: &str| v.ok_or_else(|| format!("Resposta sem {campo}"));
    let sync_key = get(r.sync_key, "sync_key")?;
    if sync_key.len() < 48 {
        return Err("Segredo de sincronização inválido".to_string());
    }
    Ok(Ativacao {
        endpoint: endpoint.to_string(),
        dispositivo_id: get(r.dispositivo_id, "dispositivo_id")?,
        loja_id: get(r.loja_id, "loja_id")?,
        empresa_id: get(r.empresa_id, "empresa_id")?,
        device_fingerprint: get(r.device_fingerprint, "device_fingerprint")?,
        sync_key,
    })
}

pub fn ativar(
    app: &tauri::AppHandle,
    endpoint: Option<String>,
    codigo: String,
    nome: Option<String>,
    device_fingerprint: String,
) -> Result<AtivacaoStatusDto, String> {
    let endpoint = endpoint
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(endpoint_padrao)
        .ok_or_else(|| "Informe o endereço do servidor de sincronização.".to_string())?;
    if !endpoint.starts_with("https://") && !endpoint.starts_with("http://localhost") && !endpoint.starts_with("http://127.0.0.1") {
        return Err("O servidor precisa usar HTTPS.".to_string());
    }
    let codigo = normalizar_codigo(&codigo).ok_or_else(|| "Código em formato inválido.".to_string())?;
    let url = if endpoint.contains('?') { format!("{endpoint}&op=ativar") } else { format!("{endpoint}?op=ativar") };
    let body = serde_json::json!({ "codigo": codigo, "device_fingerprint": device_fingerprint, "nome": nome }).to_string();
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .map_err(|e| format!("Sem conexão com o servidor: {e}"))?;
    let text = res.text().map_err(|e| e.to_string())?;
    let a = parse_resposta(&endpoint, &text)?;
    let path = arquivo(app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&a).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    *ATIVACAO.lock().unwrap() = Some(a);
    Ok(status())
}

pub fn status() -> AtivacaoStatusDto {
    let a = atual();
    AtivacaoStatusDto {
        ativado: a.is_some(),
        loja_id: a.as_ref().map(|x| x.loja_id.clone()),
        dispositivo_id: a.as_ref().map(|x| x.dispositivo_id.clone()),
        endpoint: a.as_ref().map(|x| x.endpoint.clone()),
        usando_env_legado: a.is_none() && std::env::var("SYNC_KEY").is_ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normaliza_codigo_como_o_servidor() {
        assert_eq!(normalizar_codigo(" k7qx-m2pa-9d "), Some("K7QXM2PA9D".to_string()));
        assert_eq!(normalizar_codigo("curto"), None);
        assert_eq!(normalizar_codigo("drop;table--x"), None);
    }

    #[test]
    fn resposta_ok_vira_ativacao() {
        let body = format!(
            r#"{{"ok":true,"dispositivo_id":"d","loja_id":"l","empresa_id":"e","device_fingerprint":"pc","sync_key":"{}"}}"#,
            "a".repeat(64)
        );
        let a = parse_resposta("https://x/functions/v1/sync-outbox", &body).unwrap();
        assert_eq!(a.loja_id, "l");
        assert_eq!(a.device_fingerprint, "pc");
    }

    #[test]
    fn resposta_erro_vira_mensagem_amigavel() {
        let e = parse_resposta("https://x", r#"{"ok":false,"error":"ATIVACAO_PDV_CODIGO_INVALIDO"}"#).unwrap_err();
        assert!(e.contains("Código inválido"));
        assert!(parse_resposta("https://x", r#"{"ok":true,"sync_key":"curta"}"#).is_err());
    }
}
