#!/usr/bin/env node
/**
 * STG-01 Option B — build Git(406) × staging history matrix (offline).
 * Inputs (local snapshots only; no remote writes):
 *   tmp/stg-repair-prep/history.json          [{version,name}]
 *   tmp/stg-repair-prep/schema_sets.json      {tables,views,routines,columns}
 *   backend/supabase/migrations/*.sql
 * Outputs under docs/capacity/staging/repair-prep/ and tmp/stg-repair-prep/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PREP = path.join(ROOT, 'tmp/stg-repair-prep');
const OUT = path.join(ROOT, 'docs/capacity/staging/repair-prep');
const MIG = path.join(ROOT, 'backend/supabase/migrations');

/** @typedef {'applied_verified'|'partial'|'not_applied'|'indeterminate'} Class */

/** Synthetic history name → git stems (best-effort, reviewed). */
const SYNTHETIC_MAP = {
  chunk013_medium_batch: {
    confidence: 'low',
    covers: [],
    note: 'Batch MCP genérico; conteúdo não recuperável 1:1 — não usar para register canônico.',
  },
  '045_caixa_movimentacoes_transacionais_p1_registrar': {
    confidence: 'high',
    covers: ['045_caixa_movimentacoes_transacionais'],
    note: 'Parte 1 do arquivo 045 canônico.',
  },
  '045_caixa_movimentacoes_transacionais_p2_aprovar_cancelar': {
    confidence: 'high',
    covers: ['045_caixa_movimentacoes_transacionais'],
    note: 'Parte 2 do arquivo 045 canônico.',
  },
  '045_caixa_movimentacoes_transacionais_p3_estornar_grants': {
    confidence: 'high',
    covers: ['045_caixa_movimentacoes_transacionais'],
    note: 'Parte 3 do arquivo 045 canônico.',
  },
  '066_fiscal_documento_timeline_tail': {
    confidence: 'high',
    covers: ['066_fiscal_documento_timeline'],
    note: 'Cauda do arquivo 066.',
  },
  '075_importar_nfe_transacao_rpc': {
    confidence: 'medium',
    covers: ['075_importacao_nfe_compra'],
    note: 'Possível split do pacote 075; verificar se arquivo 075 único no Git cobre RPC.',
  },
  '117_fix_oc_rls_usuarios_pattern_reapply': {
    confidence: 'high',
    covers: ['117_fix_oc_rls_usuarios_pattern'],
    note: 'Reapply do 117.',
  },
  '209_210_fiscal_campos': {
    confidence: 'high',
    covers: [
      '20260621000500_209_fiscal_campos_loja_pdvconfig',
      '20260621000600_210_fiscal_campos_produto',
    ],
  },
  '20260621005400_256_258_269_batch': {
    confidence: 'high',
    covers: [
      '20260621005400_256_pdv_diagnostico_pre_producao',
      '20260621005500_258_produtos_localizacao_nome_reduzido',
      '20260621005700_269_ajustar_estoque_manual_service_ator',
    ],
  },
  batch_20260707000000_venda_eventos_ledger: {
    confidence: 'high',
    covers: ['20260707000000_venda_eventos_ledger'],
  },
  batch_20260707020000_consistencia_vendas_auditoria: {
    confidence: 'high',
    covers: ['20260707020000_consistencia_vendas_auditoria'],
  },
  batch_20260710163032_255_vendas_em_espera_e_consulta_rapida: {
    confidence: 'medium',
    covers: ['20260621004500_24703_vendas_em_espera_e_consulta_rapida'],
    note: 'Nome batch aponta 255; arquivo Git próximo é 24703/espera.',
  },
  batch_265_266_clientes: {
    confidence: 'high',
    covers: [
      '20260710212349_265_clientes_insert_operador_pdv',
      '20260710212628_266_clientes_unique_documento_loja',
    ],
  },
  '20260717031500_248_devolver_qty_fn': {
    confidence: 'high',
    covers: ['20260717031500_248_devolver_ou_trocar_venda'],
    note: 'Split — stem Git pode diferir; conferir arquivos 248_* no disco.',
  },
  '20260717031500_248_devolver_ou_trocar_venda_fn': {
    confidence: 'high',
    covers: ['20260717031500_248_devolver_ou_trocar_venda'],
  },
  '20260717031500_248_cancelar_venda_transacional': {
    confidence: 'medium',
    covers: ['050_cancelar_venda_transacional'],
    note: 'Reapply 248 sobre cancelar_venda; mapear ao arquivo 248 se existir.',
  },
  '20260718184800_adr_caixa_002_calcular_valor': {
    confidence: 'high',
    covers: ['20260718184800_adr_caixa_002_modelo_alpha_e_cancel'],
  },
  '20260718184800_adr_caixa_002_cancelar_venda': {
    confidence: 'high',
    covers: ['20260718184800_adr_caixa_002_modelo_alpha_e_cancel'],
  },
  '20260731195704_fix_movimentacao_registrar': {
    confidence: 'high',
    covers: ['20260731195704_fix_movimentacao_gerente_id_bypass_seguranca'],
  },
  '20260731195704_fix_movimentacao_aprovar': {
    confidence: 'high',
    covers: ['20260731195704_fix_movimentacao_gerente_id_bypass_seguranca'],
  },
  '20260731200700_bl2_calcular_promocao_aplicavel': {
    confidence: 'high',
    covers: ['20260731200700_bl2_promocao_rpc_e_precedencia'],
  },
  '20260731200700_bl2_trg_limite_desconto': {
    confidence: 'high',
    covers: ['20260731200700_bl2_promocao_rpc_e_precedencia'],
  },
  '20260731202200_314_reafirma_grants_and_estoque_ledger': {
    confidence: 'high',
    covers: ['20260731202200_314_reafirma_grants_pos_venda_apos_248'],
  },
  '291_estoque_baixas_integridade': {
    confidence: 'medium',
    covers: [],
    note: 'Nome curto; localizar stem *291* no disco via fuzzy.',
  },
  '295_registrar_conferencia_ordem_compra': {
    confidence: 'high',
    covers: ['20260805193920_295_ordem_compra_conferencia'],
  },
  '295_receber_ordem_compra_conferencia': {
    confidence: 'high',
    covers: ['20260805193920_295_ordem_compra_conferencia'],
  },
  '296_nfe_conferencia_ddl1': {
    confidence: 'medium',
    covers: [],
    note: 'DDL split NFe; mapear a arquivos 296_* no disco.',
  },
  '296_nfe_conferencia_ddl2': {
    confidence: 'medium',
    covers: [],
    note: 'DDL split NFe parte 2.',
  },
  '296_registrar_conferencia_nfe': {
    confidence: 'medium',
    covers: [],
    note: 'RPC split NFe.',
  },
  '296_confirmar_importacao_nfe': {
    confidence: 'medium',
    covers: [],
    note: 'RPC split NFe.',
  },
  '297_configuracoes_gerais_whitelist': {
    confidence: 'medium',
    covers: [],
    note: 'Localizar stem *297* no disco.',
  },
  '298_pdv_config_modo_limite_credito': {
    confidence: 'high',
    covers: ['20260806002522_298_br01_limite_credito_por_modo_loja'],
  },
  '298_finalizar_venda_v4_br01_func': {
    confidence: 'high',
    covers: ['20260806002522_298_br01_limite_credito_por_modo_loja'],
  },
  '298_br01_grants_verify': {
    confidence: 'high',
    covers: ['20260806002522_298_br01_limite_credito_por_modo_loja'],
  },
  '299_tb07_pagamento_contas_pagar_limite_saldo': {
    confidence: 'medium',
    covers: [],
    note: 'Localizar stem *299* no disco.',
  },
  '300_br03_comment_verify': {
    confidence: 'high',
    covers: ['20260806004637_300_br03_custo_unitario_snap_servidor'],
  },
  '301_revoke_anon_execute_finalizar_venda_v4_pos_br01': {
    confidence: 'medium',
    covers: [],
    note: 'Localizar stem *301* no disco.',
  },
  '302_formas_pagamento_ddl_seed': {
    confidence: 'high',
    covers: ['20260806011719_302_f1_05_formas_pagamento_parametrizavel'],
  },
  '302_f1_05_grants_verify': {
    confidence: 'high',
    covers: ['20260806011719_302_f1_05_formas_pagamento_parametrizavel'],
  },
  '303_cancelar_venda_ssot04_kardex': {
    confidence: 'high',
    covers: ['20260806090414_303_ssot04_kardex_cancelamento_devolucao'],
  },
  '303_devolver_ou_trocar_venda_ssot04': {
    confidence: 'high',
    covers: ['20260806090414_303_ssot04_kardex_cancelamento_devolucao'],
  },
  '303_304_305_308_batch': {
    confidence: 'high',
    covers: [
      '20260806090414_303_ssot04_kardex_cancelamento_devolucao',
      '20260806090531_304_ssot04_drop_baixar_estoque_venda',
      '20260806134834_305_d1_drop_fiscal_reprocessar_documento_overload',
      '20260806140528_308_hardening_tg_documentos_fiscais_estado',
    ],
  },
  '307_d3_reaper_fiscal_reaper_documentos': {
    confidence: 'high',
    covers: ['20260806135429_307_d3_reaper_fiscal_em_processamento'],
  },
  '307_d3_fiscal_claim_documentos': {
    confidence: 'high',
    covers: ['20260806135429_307_d3_reaper_fiscal_em_processamento'],
  },
  '307_d3_fiscal_reprocessar_documento': {
    confidence: 'high',
    covers: ['20260806135429_307_d3_reaper_fiscal_em_processamento'],
  },
  '308_hardening_tg_documentos_fiscais_estado': {
    confidence: 'high',
    covers: ['20260806140528_308_hardening_tg_documentos_fiscais_estado'],
  },
  '309_reaplica_091_fiscal_correlation_id': {
    confidence: 'high',
    covers: ['20260806235913_309_reaplica_091_fiscal_correlation_id'],
  },
  '310_reaplica_288_venda_em_espera_e_caixa_unico': {
    confidence: 'high',
    covers: ['20260807000105_310_reaplica_288_venda_em_espera_e_caixa_unico'],
  },
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listMigrations() {
  return fs
    .readdirSync(MIG)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => f.slice(0, -4));
}

function extractSignatures(sql) {
  const tables = new Set();
  const routines = new Set();
  const columns = new Set();
  const views = new Set();
  const reTable =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:public|internal)\.)?([a-zA-Z_][\w]*)/gi;
  const reView =
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+((?:public|internal)\.)?([a-zA-Z_][\w]*)/gi;
  const reFn =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:public|internal)\.)?([a-zA-Z_][\w]*)/gi;
  const reCol =
    /ALTER\s+TABLE\s+((?:public|internal)\.)?([a-zA-Z_][\w]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)/gi;
  let m;
  while ((m = reTable.exec(sql))) {
    tables.add(`${(m[1] || 'public.').replace(/\.$/, '')}.${m[2]}`);
  }
  while ((m = reView.exec(sql))) {
    views.add(`${(m[1] || 'public.').replace(/\.$/, '')}.${m[2]}`);
  }
  while ((m = reFn.exec(sql))) {
    routines.add(`${(m[1] || 'public.').replace(/\.$/, '')}.${m[2]}`);
  }
  while ((m = reCol.exec(sql))) {
    columns.add(
      `${(m[1] || 'public.').replace(/\.$/, '')}.${m[2]}.${m[3]}`,
    );
  }
  return { tables: [...tables], views: [...views], routines: [...routines], columns: [...columns] };
}

function scoreAgainstSchema(sig, sets) {
  const check = (arr, set) => {
    const present = arr.filter((x) => set.has(x));
    return { expected: arr.length, present: present.length, missing: arr.filter((x) => !set.has(x)) };
  };
  const t = check(sig.tables, new Set(sets.tables));
  const v = check(sig.views, new Set(sets.views));
  const r = check(sig.routines, new Set(sets.routines));
  const c = check(sig.columns, new Set(sets.columns));
  const expected = t.expected + v.expected + r.expected + c.expected;
  const present = t.present + v.present + r.present + c.present;
  return { expected, present, tables: t, views: v, routines: r, columns: c };
}

function classify(stem, historyByName, coveredBySynth, sets) {
  const sqlPath = path.join(MIG, `${stem}.sql`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const sig = extractSignatures(sql);
  const score = scoreAgainstSchema(sig, sets);
  const hist = historyByName.get(stem);
  const synth = coveredBySynth.get(stem);

  /** @type {Class} */
  let status;
  let reason;

  if (hist) {
    if (score.expected === 0) {
      status = 'applied_verified';
      reason = 'nome exato no histórico; sem fingerprint DDL (grant/seed/policy) — aceito como aplicado';
    } else if (score.present === score.expected) {
      status = 'applied_verified';
      reason = 'nome exato + fingerprints presentes';
    } else if (score.present === 0) {
      status = 'indeterminate';
      reason = 'nome no histórico mas fingerprints ausentes — possível rename/drop posterior ou apply vazio';
    } else {
      status = 'partial';
      reason = `nome no histórico mas fingerprints ${score.present}/${score.expected}`;
    }
  } else if (synth) {
    if (score.expected === 0) {
      status = 'indeterminate';
      reason = `coberto por sintético ${synth.join(',')} sem fingerprint`;
    } else if (score.present === score.expected) {
      status = 'applied_verified';
      reason = `coberto por sintético ${synth.join(',')} + fingerprints OK`;
    } else if (score.present === 0) {
      status = 'not_applied';
      reason = `sintético ${synth.join(',')} no histórico mas fingerprints 0/${score.expected}`;
    } else {
      status = 'partial';
      reason = `sintético ${synth.join(',')} + fingerprints ${score.present}/${score.expected}`;
    }
  } else if (score.expected === 0) {
    status = 'indeterminate';
    reason = 'sem histórico e sem fingerprint DDL extraível';
  } else if (score.present === score.expected) {
    status = 'partial';
    reason =
      'schema contém fingerprints mas SEM registro no histórico (apply via execute_sql / não registrar)';
  } else if (score.present === 0) {
    status = 'not_applied';
    reason = 'sem histórico e fingerprints ausentes';
  } else {
    status = 'partial';
    reason = `sem histórico; fingerprints ${score.present}/${score.expected}`;
  }

  // Manual override known case: financeiro ledger
  if (stem === '20261005004647_financeiro_loja_contas_ledger') {
    status = 'partial';
    reason =
      'tabelas+internal+policies presentes; RPCs public.financeiro_* ausentes; hist_financeiro vazio';
  }

  return {
    stem,
    file: `${stem}.sql`,
    canonical_version: stem.match(/^\d{14}/)?.[0] || stem.match(/^\d{3}/)?.[0] || null,
    history_name: hist?.name ?? null,
    history_version: hist?.version ?? null,
    synthetic_covers: synth || [],
    status,
    reason,
    fingerprint: score,
  };
}

function fuzzyFillSynthetic(diskStems) {
  const byNum = new Map();
  for (const s of diskStems) {
    const m = s.match(/_(\d{3})_/);
    if (m) {
      const arr = byNum.get(m[1]) || [];
      arr.push(s);
      byNum.set(m[1], arr);
    }
  }
  for (const [name, meta] of Object.entries(SYNTHETIC_MAP)) {
    if (meta.covers.length) continue;
    const nums = [...name.matchAll(/(?:^|_)(\d{3})(?:_|$)/g)].map((x) => x[1]);
    const found = [];
    for (const n of nums) {
      for (const s of byNum.get(n) || []) found.push(s);
    }
    // also prefix match without timestamp
    for (const s of diskStems) {
      if (s === name || s.endsWith(`_${name}`) || name.endsWith(s)) found.push(s);
    }
    meta.covers = [...new Set(found)];
  }
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const history = readJson(path.join(PREP, 'history.json'));
  const sets = readJson(path.join(PREP, 'schema_sets.json'));
  const disk = listMigrations();
  fuzzyFillSynthetic(disk);

  const historyByName = new Map(history.map((h) => [h.name, h]));
  const diskSet = new Set(disk);

  const orphanHistory = history.filter((h) => !diskSet.has(h.name));
  const syntheticReport = orphanHistory.map((h) => {
    const meta = SYNTHETIC_MAP[h.name] || {
      confidence: 'low',
      covers: [],
      note: 'Sem mapa explícito',
    };
    return {
      history_version: h.version,
      history_name: h.name,
      confidence: meta.confidence,
      covers_git: meta.covers,
      note: meta.note || null,
      covers_exist: meta.covers.map((c) => ({ stem: c, exists: diskSet.has(c) })),
    };
  });

  /** @type {Map<string, string[]>} */
  const coveredBySynth = new Map();
  for (const row of syntheticReport) {
    for (const c of row.covers_git) {
      const arr = coveredBySynth.get(c) || [];
      arr.push(row.history_name);
      coveredBySynth.set(c, arr);
    }
  }

  const matrix = disk.map((stem) =>
    classify(stem, historyByName, coveredBySynth, sets),
  );

  const counts = matrix.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  const registerSafe = matrix.filter(
    (r) =>
      r.status === 'applied_verified' &&
      !r.history_name &&
      r.canonical_version &&
      r.fingerprint.expected > 0 &&
      r.fingerprint.present === r.fingerprint.expected,
  );
  // Policy: only register when proven applied AND currently missing from history under canonical name.
  // applied_verified with synthetic cover but no exact name may be candidates if fingerprints OK.
  const normalizeCandidates = matrix.filter((r) => {
    if (r.status !== 'applied_verified') return false;
    if (r.history_name === r.stem) return false; // already canonical name (version may still be wrong)
    if (r.fingerprint.expected === 0 && !r.history_name) return false; // never register without proof
    if (r.history_name === r.stem) return false;
    // Safe to propose canonical INSERT only if fingerprints prove schema OR exact history already exists under wrong version
    if (r.history_name) {
      return true; // rename/version repair of existing proof
    }
    return (
      r.fingerprint.expected > 0 &&
      r.fingerprint.present === r.fingerprint.expected
    );
  });

  const summary = {
    generated_at: new Date().toISOString(),
    disk_count: disk.length,
    history_count: history.length,
    orphan_history_count: orphanHistory.length,
    classification_counts: counts,
    normalize_candidate_count: normalizeCandidates.length,
    register_safe_new_count: registerSafe.length,
    scratch_table_present: sets.tables.includes('public._stg_mig_scratch'),
    policy:
      'Nunca registrar migration sem prova (histórico exato ou fingerprint completo). Partials e indeterminate exigem intervenção manual antes de repair remoto.',
  };

  fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(matrix, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'synthetic-map.json'),
    JSON.stringify(syntheticReport, null, 2),
  );
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'normalize-candidates.json'),
    JSON.stringify(normalizeCandidates, null, 2),
  );

  // CSV matrix
  const csvLines = [
    'stem,status,history_name,history_version,canonical_version,fp_present,fp_expected,synthetic_covers,reason',
  ];
  for (const r of matrix) {
    csvLines.push(
      [
        r.stem,
        r.status,
        r.history_name ?? '',
        r.history_version ?? '',
        r.canonical_version ?? '',
        r.fingerprint.present,
        r.fingerprint.expected,
        r.synthetic_covers.join('|'),
        JSON.stringify(r.reason),
      ].join(','),
    );
  }
  fs.writeFileSync(path.join(OUT, 'matrix.csv'), csvLines.join('\n') + '\n');

  // Copy to tmp
  for (const f of [
    'matrix.json',
    'matrix.csv',
    'synthetic-map.json',
    'summary.json',
    'normalize-candidates.json',
  ]) {
    fs.copyFileSync(path.join(OUT, f), path.join(PREP, f));
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
