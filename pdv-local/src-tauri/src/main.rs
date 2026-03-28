#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{
    abrir_caixa_local, catalogo_local_get, fechar_caixa_local, get_caixa_atual,
    diagnostics, init_db, outbox_pendentes, outbox_reprocessar_dlq, outbox_resumo,
    pdv_config_local_get, registrar_movimento_caixa_local, registrar_venda_local, sync_catalogo_real,
    sync_outbox_real, sync_outbox_simulado, sync_pdv_config_real, Diagnostics, OutboxResumo,
    RegistrarVendaInput,
};

fn load_env_files() {
    // 1) Caminho estável em dev: `pdv-local/.env` relativo ao crate (não depende do cwd do processo).
    let crate_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let pdv_local_root = crate_dir.join("..");
    let _ = dotenvy::from_path(pdv_local_root.join(".env"));
    let _ = dotenvy::from_path(crate_dir.join(".env"));
    // 2) Fallbacks por cwd (scripts antigos / CI).
    let _ = dotenvy::from_path("../.env");
    let _ = dotenvy::from_path(".env");
    // 3) Build empacotado: `.env` ao lado do executável.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let _ = dotenvy::from_path(dir.join(".env"));
        }
    }
}

#[tauri::command]
fn registrar_venda(app: tauri::AppHandle, venda: RegistrarVendaInput) -> Result<String, String> {
    registrar_venda_local(&app, venda)
}

#[tauri::command]
fn outbox_count(app: tauri::AppHandle) -> Result<i64, String> {
    outbox_pendentes(&app)
}

#[tauri::command]
fn sync_outbox(app: tauri::AppHandle, limite: Option<i64>) -> Result<i64, String> {
    sync_outbox_simulado(&app, limite.unwrap_or(50))
}

#[tauri::command]
fn sync_outbox_real_cmd(app: tauri::AppHandle, limite: Option<i64>) -> Result<i64, String> {
    sync_outbox_real(&app, limite.unwrap_or(50))
}

#[tauri::command]
fn get_diagnostics(app: tauri::AppHandle) -> Result<Diagnostics, String> {
    diagnostics(&app)
}

#[tauri::command]
fn outbox_resumo_cmd(app: tauri::AppHandle) -> Result<OutboxResumo, String> {
    outbox_resumo(&app)
}

#[tauri::command]
fn outbox_reprocessar_dlq_cmd(app: tauri::AppHandle) -> Result<i64, String> {
    outbox_reprocessar_dlq(&app)
}

#[tauri::command]
fn load_caixa_atual_cmd(app: tauri::AppHandle) -> Result<Option<db::CaixaSessaoDto>, String> {
    get_caixa_atual(&app)
}

#[tauri::command]
fn abrir_caixa_cmd(
    app: tauri::AppHandle,
    operador_id: Option<String>,
    troco_inicial: f64,
) -> Result<String, String> {
    abrir_caixa_local(&app, operador_id, troco_inicial)
}

#[tauri::command]
fn registrar_movimento_caixa_cmd(
    app: tauri::AppHandle,
    caixa_id: String,
    tipo: String,
    valor: f64,
    observacao: Option<String>,
) -> Result<String, String> {
    registrar_movimento_caixa_local(&app, caixa_id, tipo, valor, observacao)
}

#[tauri::command]
fn fechar_caixa_cmd(app: tauri::AppHandle, caixa_id: String, troco_fechamento: f64) -> Result<(), String> {
    fechar_caixa_local(&app, caixa_id, troco_fechamento)
}

#[tauri::command]
fn catalogo_local_get_cmd(app: tauri::AppHandle) -> Result<db::CatalogoLocalDto, String> {
    catalogo_local_get(&app)
}

#[tauri::command]
fn sync_catalogo_real_cmd(app: tauri::AppHandle) -> Result<db::SyncCatalogoResultDto, String> {
    sync_catalogo_real(&app)
}

#[tauri::command]
fn pdv_config_local_get_cmd(
    app: tauri::AppHandle,
) -> Result<Option<db::PdvConfigCacheDto>, String> {
    pdv_config_local_get(&app)
}

#[tauri::command]
fn sync_pdv_config_real_cmd(app: tauri::AppHandle) -> Result<Option<db::PdvConfigCacheDto>, String> {
    sync_pdv_config_real(&app)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            load_env_files();
            if let Err(e) = init_db(app.handle()) {
                eprintln!("Erro ao inicializar banco local: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            registrar_venda,
            outbox_count,
            sync_outbox,
            sync_outbox_real_cmd,
            get_diagnostics,
            outbox_resumo_cmd,
            outbox_reprocessar_dlq_cmd,

            // Caixa local
            load_caixa_atual_cmd,
            abrir_caixa_cmd,
            registrar_movimento_caixa_cmd,
            fechar_caixa_cmd,

            // Catálogo local + sync
            catalogo_local_get_cmd,
            sync_catalogo_real_cmd,
            pdv_config_local_get_cmd,
            sync_pdv_config_real_cmd
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar aplicação Tauri");
}

