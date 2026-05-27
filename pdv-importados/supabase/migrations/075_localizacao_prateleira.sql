-- Localização / prateleira: identificação da posição do produto na loja.
-- Exemplos: "A-12", "ESTANTE 3 B2", "GAVETA 7".
-- Nota: preco_varejo, preco_atacado e quantidade_gatilho_atacado já existem.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS localizacao_prateleira text NULL;
