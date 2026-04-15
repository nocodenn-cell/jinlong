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
  ],
  missingFileHint: 'Copie .env.example para .env.local e preencha os valores.',
  okMessage: 'variáveis obrigatórias do pdv-importados presentes.',
})
