#!/usr/bin/env node
import { runEnvCheck } from '../../shared/env-check-lib.mjs'

runEnvCheck({
  envFileName: '.env.local',
  required: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  recommended: [
    'NEXT_PUBLIC_ADMIN_CHINESE_UI',
    'RELATORIO_TIMEZONE',
    'USE_UNIFIED_SALES_FLOW',
    'STRICT_MANAGER_DISCOUNT_AUTH',
    'FISCAL_DEFAULT_DOC_TYPE',
  ],
  conditionalRequired: [
    {
      description: 'fila fiscal pós-venda (caixa web)',
      whenKey: 'AUTO_ENQUEUE_FISCAL_ON_SALE',
      whenValueEquals: 'true',
      keys: ['FISCAL_WORKER_ENDPOINT', 'FISCAL_WORKER_KEY'],
    },
  ],
  validators: [
    (parsed) => {
      if ((parsed.get('AUTO_ENQUEUE_FISCAL_ON_SALE') ?? '').trim().toLowerCase() !== 'true') {
        return null
      }
      const ep = (parsed.get('FISCAL_WORKER_ENDPOINT') ?? '').trim()
      if (!ep.includes('fiscal-worker')) {
        return 'FISCAL_WORKER_ENDPOINT deve ser a URL da Edge fiscal-worker (…/functions/v1/fiscal-worker).'
      }
      const key = (parsed.get('FISCAL_WORKER_KEY') ?? '').trim()
      if (!key || /^COLE_/i.test(key)) {
        return 'FISCAL_WORKER_KEY ausente ou ainda placeholder; alinhe com o secret FISCAL_WORKER_KEY da Edge (ver docs/CHECKLIST_DEPLOY_SUPABASE.md).'
      }
      return null
    },
  ],
  missingFileHint: 'Copie .env.example para .env.local e preencha os valores.',
  okMessage: 'variáveis obrigatórias do pdv-importados presentes.',
})
