import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumirPorSpec, gerarMarkdown } from './e2e-resumo-por-spec.mjs'

const relatorio = {
  suites: [
    {
      title: 'caixa-golden-flow-cycle5.spec.ts',
      file: 'e2e/caixa-golden-flow-cycle5.spec.ts',
      specs: [],
      suites: [
        {
          specs: [
            {
              title: 'venda fracionada 0,5',
              file: 'e2e/caixa-golden-flow-cycle5.spec.ts',
              tests: [{ status: 'unexpected', results: [{ error: { message: 'element(s) not found\nmais' } }] }],
            },
            {
              title: 'venda simples',
              file: 'e2e/caixa-golden-flow-cycle5.spec.ts',
              tests: [{ status: 'expected', results: [{}] }],
            },
          ],
        },
      ],
    },
    {
      specs: [
        {
          title: 'tecla 3 cria crédito',
          file: 'e2e/caixa-pagamento-atalhos.spec.ts',
          tests: [{ status: 'flaky', results: [{}, {}] }],
        },
        {
          title: 'pulado',
          file: 'e2e/caixa-pagamento-atalhos.spec.ts',
          tests: [{ status: 'skipped', results: [] }],
        },
      ],
    },
  ],
}

test('agrupa por arquivo e conta status', () => {
  const r = resumirPorSpec(relatorio)
  assert.deepEqual(r['caixa-golden-flow-cycle5.spec.ts'].passed, 1)
  assert.deepEqual(r['caixa-golden-flow-cycle5.spec.ts'].failed, 1)
  assert.deepEqual(r['caixa-golden-flow-cycle5.spec.ts'].falhas, [
    { titulo: 'venda fracionada 0,5', erro: 'element(s) not found' },
  ])
  assert.deepEqual(r['caixa-pagamento-atalhos.spec.ts'].flaky, 1)
  assert.deepEqual(r['caixa-pagamento-atalhos.spec.ts'].skipped, 1)
})

test('markdown marca VAL-01 e lista falhas', () => {
  const md = gerarMarkdown(resumirPorSpec(relatorio))
  assert.match(md, /\| caixa-golden-flow-cycle5\.spec\.ts \| 1 \| 1 \| 0 \| 0 \| sim \|/)
  assert.match(md, /Testes que falharam/)
  assert.doesNotMatch(md, /ausentes do relatório/)
})

test('markdown avisa quando spec da VAL-01 está ausente', () => {
  const md = gerarMarkdown(resumirPorSpec({ suites: [] }))
  assert.match(md, /VAL-01 NÃO VERIFICADA/)
})
