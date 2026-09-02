'use client'

import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'

export function FiscalSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputMonoClassName, selectClassName } = ctx

  return (
    <section aria-labelledby="produto-secao-fiscal">
      <ProdutoFormSectionHeading title={p.secao_fiscal} />
      <details className="mt-3 rounded-md border border-[var(--color-border-secondary)] p-3">
        <summary className="cursor-pointer text-xs font-medium text-jl-fg-2">
          {p.secao_fiscal_resumo}
        </summary>
        <div id="produto-secao-fiscal" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px]">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_ncm}
              <input
                className={`${inputMonoClassName} mt-1`}
                value={ctx.ncm}
                maxLength={8}
                inputMode="numeric"
                placeholder="00000000"
                onChange={(e) => ctx.setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={disabled}
              />
              <span className="mt-0.5 block text-caption text-jl-fg-3">{p.hint_ncm}</span>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cfop_produto}
              <input
                className={`${inputMonoClassName} mt-1`}
                value={ctx.cfopProduto}
                maxLength={4}
                inputMode="numeric"
                placeholder="5102"
                onChange={(e) => ctx.setCfopProduto(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={disabled}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_csosn}
              <select
                className={`${selectClassName} mt-1 font-mono`}
                value={ctx.csosn}
                onChange={(e) => ctx.setCsosn(e.target.value)}
                disabled={disabled}
              >
                <option value="102">102 – Tributada s/ crédito</option>
                <option value="400">400 – Não tributada (SN)</option>
                <option value="500">500 – ICMS-ST cobrado ant.</option>
                <option value="900">900 – Outros</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cst_pis}
              <select
                className={`${selectClassName} mt-1 font-mono`}
                value={ctx.cstPis}
                onChange={(e) => ctx.setCstPis(e.target.value)}
                disabled={disabled}
              >
                <option value="07">07 – Isenta</option>
                <option value="49">49 – Outras saídas</option>
                <option value="01">01 – Alíq. básica</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cst_cofins}
              <select
                className={`${selectClassName} mt-1 font-mono`}
                value={ctx.cstCofins}
                onChange={(e) => ctx.setCstCofins(e.target.value)}
                disabled={disabled}
              >
                <option value="07">07 – Isenta</option>
                <option value="49">49 – Outras saídas</option>
                <option value="01">01 – Alíq. básica</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.field_cest}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.cest}
              maxLength={7}
              inputMode="numeric"
              placeholder={p.hint_cest}
              onChange={(e) => ctx.setCest(e.target.value.replace(/\D/g, '').slice(0, 7))}
              disabled={disabled}
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.field_icms_origem}
            <select
              className={`${selectClassName} mt-1 font-mono`}
              value={ctx.icmsOrigem}
              onChange={(e) => ctx.setIcmsOrigem(e.target.value)}
              disabled={disabled}
            >
              <option value="">— não classificado —</option>
              <option value="0">0 – Nacional</option>
              <option value="1">1 – Estrangeira, importação direta</option>
              <option value="2">2 – Estrangeira, adquirida no mercado interno</option>
              <option value="3">3 – Nacional, conteúdo importado {'>'} 40%</option>
              <option value="4">4 – Nacional, produção básica</option>
              <option value="5">5 – Nacional, conteúdo importado ≤ 40%</option>
              <option value="6">6 – Estrangeira, importação direta, sem similar nacional</option>
              <option value="7">7 – Estrangeira, mercado interno, sem similar nacional</option>
              <option value="8">8 – Nacional, conteúdo importado {'>'} 70%</option>
            </select>
            <span className="mt-0.5 block text-caption text-jl-fg-3">{p.hint_icms_origem}</span>
          </label>
        </div>
      </details>
    </section>
  )
}
