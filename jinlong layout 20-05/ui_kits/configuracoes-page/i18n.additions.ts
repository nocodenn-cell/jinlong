/**
 * Adicione no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * (raiz: `configuracoes`)
 */

export const ptConfiguracoes = {
  titulo: 'Configurações',
  subtitulo: 'Dados da loja, impostos, integrações fiscais e preferências do PDV.',

  tabs_aria: 'Configurações',
  aba_loja: 'Loja',
  aba_fiscal: 'Impostos e fiscal',
  aba_preferencias: 'Preferências',

  // Loja
  field_nome_loja: 'Nome da loja',
  field_cnpj: 'CNPJ',
  field_ie: 'Inscrição estadual',
  field_telefone: 'Telefone',
  field_email: 'E-mail',
  field_logo: 'Logo da loja',
  btn_upload_logo: 'Enviar logo',
  remover_logo: 'Remover',
  logo_preview_alt: 'Pré-visualização do logo',
  hint_logo: 'PNG, JPG ou SVG · até 2 MB · idealmente 512×512 px com fundo transparente.',

  section_endereco: 'Endereço',
  field_cep: 'CEP',
  field_logradouro: 'Logradouro',
  field_numero: 'Número',
  field_complemento: 'Complemento',
  field_bairro: 'Bairro',
  field_cidade: 'Cidade',
  field_uf: 'UF',

  // Fiscal
  field_regime: 'Regime tributário',
  regime_simples: 'Simples Nacional',
  regime_presumido: 'Lucro Presumido',
  regime_real: 'Lucro Real',
  field_cfop: 'CFOP padrão (venda)',
  hint_cfop: 'Ex.: 5102 (venda dentro do estado), 6102 (interestadual).',
  field_cst: 'CST padrão',
  hint_cst: 'Código de Situação Tributária aplicado por padrão nos itens.',
  field_auto_fiscal: 'Enfileiramento fiscal',
  hint_auto_fiscal: 'Enfileirar NFC-e automaticamente após cada venda finalizada.',
  aviso_salve_loja_primeiro: 'Salve os dados da loja antes de gravar as configurações fiscais.',

  // Preferências
  field_idioma: 'Idioma padrão',
  field_tema: 'Tema padrão',
  tema_noturno: 'Noturno · 夜',
  tema_novem: 'Diurno · novem · 昼',
  field_imprimir_auto: 'Impressão automática do cupom',
  hint_imprimir_auto: 'Imprimir cupom assim que a venda for finalizada.',
  field_formato: 'Formato de impressão',
  formato_termica: 'Térmica (80 mm)',

  // Ações + toasts
  btn_salvar: 'Salvar alterações',
  toast_loja_salva: 'Dados da loja atualizados.',
  toast_pdv_salvo: 'Configurações do PDV atualizadas.',
  toast_logo_enviado: 'Logo enviado com sucesso.',
}

export const zhConfiguracoes: typeof ptConfiguracoes = {
  titulo: '设置',
  subtitulo: '门店资料、税务、财政集成与 PDV 偏好。',

  tabs_aria: '设置',
  aba_loja: '门店',
  aba_fiscal: '税务',
  aba_preferencias: '偏好',

  field_nome_loja: '门店名称',
  field_cnpj: 'CNPJ',
  field_ie: '州税务登记号',
  field_telefone: '电话',
  field_email: '邮箱',
  field_logo: '门店 logo',
  btn_upload_logo: '上传 logo',
  remover_logo: '移除',
  logo_preview_alt: 'Logo 预览',
  hint_logo: 'PNG / JPG / SVG · 最大 2 MB · 建议 512×512 透明背景。',

  section_endereco: '地址',
  field_cep: '邮编',
  field_logradouro: '街道',
  field_numero: '门牌号',
  field_complemento: '附加',
  field_bairro: '街区',
  field_cidade: '城市',
  field_uf: '州',

  field_regime: '税务类型',
  regime_simples: 'Simples Nacional',
  regime_presumido: 'Lucro Presumido',
  regime_real: 'Lucro Real',
  field_cfop: '默认 CFOP(销售)',
  hint_cfop: '例如:5102(州内销售)、6102(州际)。',
  field_cst: '默认 CST',
  hint_cst: '商品默认税务情况代码。',
  field_auto_fiscal: '财政队列',
  hint_auto_fiscal: '销售完成后自动入队 NFC-e。',
  aviso_salve_loja_primeiro: '请先保存门店数据,再保存税务配置。',

  field_idioma: '默认语言',
  field_tema: '默认主题',
  tema_noturno: '夜间 · noturno',
  tema_novem: '日间 · novem',
  field_imprimir_auto: '自动打印小票',
  hint_imprimir_auto: '销售完成后立即打印小票。',
  field_formato: '打印格式',
  formato_termica: '热敏(80 mm)',

  btn_salvar: '保存修改',
  toast_loja_salva: '门店数据已更新。',
  toast_pdv_salvo: 'PDV 设置已更新。',
  toast_logo_enviado: 'Logo 上传成功。',
}
