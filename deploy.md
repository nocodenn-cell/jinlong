# Deploy Operacional (Piloto)

Este documento define a ordem de deploy para o piloto com foco em baixo risco.

## 1) Pre-requisitos locais

```bash
node -v
npm -v
git --version
```

## 2) Validacao local antes de publicar

### 2.1 `pdv-importados`

```bash
cd pdv-importados
npm ci
npm run test
npm run build
```

### 2.2 `pdv-local`

```bash
cd ../pdv-local
npm ci
npm run test
npm run build
```

## 3) Publicacao de backend no Supabase

```bash
cd ../backend
npx supabase --version
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
npx supabase functions deploy fiscal-worker
```

## 4) Segredos da function fiscal-worker

```bash
npx supabase secrets set \
FISCAL_WORKER_KEY="<CHAVE_FORTE>" \
FISCAL_PROVIDER_TYPE="mock" \
FISCAL_PROVIDER_TIMEOUT_MS="10000"
```

Notas:
- Para piloto controlado, `FISCAL_PROVIDER_TYPE="mock"` e aceitavel.
- Para emissao real, trocar para `http` e configurar `FISCAL_PROVIDER_URL` e `FISCAL_PROVIDER_TOKEN`.

## 5) Smoke e gate final

1. Rodar o smoke de homologacao no SQL Editor.
2. Confirmar consultas de gate (GO/NO_GO).
3. Registrar evidencias no PR/ticket antes do Go-Live.

## 6) Criterio de Go

- Testes `pdv-importados` e `pdv-local` sem falhas.
- Build do `pdv-local` sem erro.
- Smoke operacional concluido.
- Gate final em `GO`.
