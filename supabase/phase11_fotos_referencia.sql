-- =============================================================================
-- Fotos de referência no orçamento
--
-- O QUE É
-- Fotos que o cliente manda ("quero parecido com esta", a arte do logo, uma peça
-- antiga). Ficam anexadas ao ORÇAMENTO e viajam para o pedido na conversão.
--
-- ONDE APARECEM
-- - Ficha de corte: só a contagem ("4 fotos de ref."), como instrução de consulta.
-- - PDF do orçamento: NÃO sai por padrão; é opcional na hora de gerar.
-- Isso é de propósito — foto de referência é material interno de produção, não
-- peça comercial, e imagem embutida infla o PDF que vai para o cliente.
--
-- ARMAZENAMENTO
-- Os arquivos vão para o bucket já existente `financial-attachments`, o mesmo
-- que os comprovantes do financeiro. Reaproveitar evita criar bucket novo com
-- políticas próprias; o nome do bucket é herança e não descreve mais só finanças.
-- Aqui guardamos apenas os CAMINHOS, nunca o binário.
--
-- Rode no banco onde o app roda.
-- =============================================================================

-- jsonb (e não text[]) porque o repositório faz upsert do objeto inteiro vindo
-- do JS: um array JS serializa direto para jsonb, sem conversão manual.
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS reference_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reference_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.budgets.reference_photos IS
  'Caminhos das fotos de referência no bucket financial-attachments. Array JSON de strings.';
COMMENT ON COLUMN public.orders.reference_photos IS
  'Copiado do orçamento na conversão. Ver budgets.reference_photos.';

-- Trava de formato: tem de ser array JSON, não objeto nem escalar. Sem isto um
-- bug no cliente poderia gravar {"a":1} e a tela quebraria ao chamar .length.
ALTER TABLE public.budgets  DROP CONSTRAINT IF EXISTS budgets_reference_photos_array;
ALTER TABLE public.budgets  ADD  CONSTRAINT budgets_reference_photos_array
  CHECK (jsonb_typeof(reference_photos) = 'array');

ALTER TABLE public.orders   DROP CONSTRAINT IF EXISTS orders_reference_photos_array;
ALTER TABLE public.orders   ADD  CONSTRAINT orders_reference_photos_array
  CHECK (jsonb_typeof(reference_photos) = 'array');


-- =============================================================================
-- Verificação:
--   SELECT serial_number, jsonb_array_length(reference_photos) AS fotos
--   FROM budgets ORDER BY date DESC LIMIT 5;
--
--   -- deve falhar (prova que a trava funciona):
--   -- UPDATE budgets SET reference_photos = '{"x":1}'::jsonb WHERE true;
-- =============================================================================
