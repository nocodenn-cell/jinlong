/**
 * Validação Aut#1 — upgrade SQLite (banco novo + legado → sync).
 * Usa node:sqlite (Node 22+). Não toca app de produção.
 */
import { DatabaseSync } from 'node:sqlite'
import assert from 'node:assert/strict'

function applyLegacySchema(db) {
  db.exec(`
    CREATE TABLE produtos_cache (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      codigo_barras TEXT,
      preco_varejo REAL NOT NULL,
      categoria_id TEXT,
      ativo INTEGER NOT NULL,
      origem TEXT,
      tem_nf INTEGER,
      imagem_url TEXT,
      status_publicacao TEXT
    );
    CREATE TABLE regras_preco_cache (
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
    CREATE TABLE pdv_config_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      gerente_id TEXT NOT NULL,
      gerente_senha_sha256 TEXT NOT NULL,
      max_desconto_gerente_percentual REAL NOT NULL
    );
  `)
}

function applyAut1Upgrade(db) {
  // Espelha ALTER/CREATE de pdv-local/src-tauri/src/db.rs (init_db upgrades).
  try { db.exec('ALTER TABLE produtos_cache ADD COLUMN preco_atacado REAL') } catch { /* already */ }
  try { db.exec('ALTER TABLE pdv_config_cache ADD COLUMN quantidade_minima_atacado_padrao REAL') } catch { /* already */ }
  try { db.exec('ALTER TABLE pdv_config_cache ADD COLUMN loja_id TEXT') } catch { /* already */ }
  db.exec(`
    CREATE TABLE IF NOT EXISTS precos_atacado_cache (
      id TEXT PRIMARY KEY,
      produto_id TEXT NOT NULL,
      loja_id TEXT,
      quantidade_minima REAL NOT NULL,
      preco_unitario REAL NOT NULL,
      ativo INTEGER NOT NULL
    );
  `)
}

function simulateSync(db) {
  db.exec('DELETE FROM produtos_cache')
  db.exec('DELETE FROM regras_preco_cache')
  db.exec('DELETE FROM precos_atacado_cache')
  db.prepare(
    `INSERT INTO produtos_cache
     (id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id, ativo, status_publicacao, origem, tem_nf, imagem_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('p1', 'Prod', null, 100, 85, null, 1, 'PUBLICADO', 'MANUAL', 0, null)
  db.prepare(
    `INSERT INTO precos_atacado_cache
     (id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('t10', 'p1', null, 10, 80, 1)
  db.prepare(
    `INSERT INTO precos_atacado_cache
     (id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('t50', 'p1', 'loja-1', 50, 70, 1)
  db.prepare(
    `INSERT OR REPLACE INTO pdv_config_cache
     (id, gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual, quantidade_minima_atacado_padrao, loja_id)
     VALUES (1, ?, '', ?, ?, ?)`,
  ).run('g1', 30, 6, 'loja-1')
}

function assertPayloadShape(db) {
  const produto = db.prepare(
    'SELECT id, preco_varejo, preco_atacado FROM produtos_cache WHERE id = ?',
  ).get('p1')
  assert.equal(produto.preco_varejo, 100)
  assert.equal(produto.preco_atacado, 85)

  const tiers = db.prepare(
    'SELECT id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo FROM precos_atacado_cache ORDER BY quantidade_minima',
  ).all()
  assert.equal(tiers.length, 2)
  assert.equal(tiers[0].quantidade_minima, 10)
  assert.equal(tiers[0].preco_unitario, 80)
  assert.equal(tiers[1].loja_id, 'loja-1')
  assert.equal(tiers[1].quantidade_minima, 50)

  const cfg = db.prepare(
    'SELECT quantidade_minima_atacado_padrao, loja_id FROM pdv_config_cache WHERE id = 1',
  ).get()
  assert.equal(cfg.quantidade_minima_atacado_padrao, 6)
  assert.equal(cfg.loja_id, 'loja-1')
}

console.log('== Aut#1 SQLite: banco legado + upgrade + sync ==')
{
  const db = new DatabaseSync(':memory:')
  applyLegacySchema(db)
  applyAut1Upgrade(db)
  simulateSync(db)
  assertPayloadShape(db)
  console.log('OK legado→upgrade→sync')
}

console.log('== Aut#1 SQLite: banco novo (já com colunas) ==')
{
  const db = new DatabaseSync(':memory:')
  applyLegacySchema(db)
  applyAut1Upgrade(db)
  applyAut1Upgrade(db) // idempotente
  simulateSync(db)
  assertPayloadShape(db)
  console.log('OK novo/idempotente')
}

console.log('✅ validate-aut1-sqlite-upgrade OK')
