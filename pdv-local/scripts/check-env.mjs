#!/usr/bin/env node
import { runEnvCheck } from '../../shared/env-check-lib.mjs'

runEnvCheck({
  envFileName: '.env',
  required: ['SYNC_ENDPOINT', 'SYNC_KEY'],
  recommended: ['DEVICE_FINGERPRINT', 'OUTBOX_MAX_SYNC_FAILURES'],
  missingFileHint: 'Copie .env.example para .env e preencha os valores.',
  okMessage: 'variáveis obrigatórias do pdv-local presentes.',
})
