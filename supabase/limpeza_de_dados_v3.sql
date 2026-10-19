-- =============================================================================
-- LIMPEZA DE DADOS  (v3 — pedido do Luiz em 15/10/2026)
-- Roda DEPOIS dos SQLs da v3 (financeiro_v3_1, financeiro_v3_2, cadastros_v3_1,
-- compras_por_pedido, entrada_vale_antes_da_entrega). Testado sobre o backup de
-- produção de 15/10/2026 01:46. Pode rodar de novo: cada passo confere se já foi
-- feito. Pedidos e orçamentos NÃO são apagados nem têm valores mexidos.
--
-- COMO RODAR NA PRODUÇÃO (o Luiz): SQL Editor do Supabase, o arquivo inteiro de
-- uma vez, DEPOIS do backup do dia e dos 5 SQLs do plano de ida. É uma transação
-- só (BEGIN/COMMIT abaixo): ou tudo, ou nada. O resultado é uma tabela com duas
-- linhas, "antes" e "depois" — guardar o print. Apaga insumos e clientes
-- repetidos: voltar atrás só pelo backup do dia.
--
-- Decisões do Luiz (15/10):
--   ESTOQUE   só tecidos, 1 por tecido; os 5 homologados mantêm as 3 faixas de
--             cor (Branco/Cru, Padrão, Especial). Saem aviamentos, acessórios e
--             duplicados. Referências dos duplicados passam para o tecido certo.
--   FOLHA     a série "Folha de Pagamento" é duplicata da "Folha - Salários":
--             cancelada (não apagada); os pagamentos dela vão para a série certa.
--             Valores dos salários NÃO mudam (vale + salário estão corretos).
--   ZELIA     o pagamento de R$ 209.254,00 (setembro) é estornado; o setembro dela
--             fica cancelado como estava (Luiz, 15/10: "ignore, foi em setembro").
--   SALDO     o saldo atual dos bancos não muda; o Luiz informa o do extrato.
--   VIRADA    pedidos de hoje viram legado das compras por pedido (não entram na
--             Lista de compras nem nas sobras); o estoque antigo é zerado.
--   R$ 1.500  a conta de setembro do meio período da Ana (R$ 925, paga com
--             R$ 1.500) NÃO muda: o pagamento já tem R$ 575 de acréscimo.
--   CATEGORIAS árvore nova de categorias financeiras (pai/filho), unificando
--             nomes repetidos; "Imposto" e "Cartão de crédito" deixam de ser
--             custo do produto; compras de tecido/aviamento passam a ser custo.
--   CLIENTES  cadastros repetidos só por maiúscula viram um só (Granha fica:
--             filiais com CNPJ diferente).
--   STATUS    a coluna status das contas é alinhada ao status calculado.
-- =============================================================================

BEGIN;

-- ANTES (guardado para a tabela do fim)
CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT 'antes'::text AS momento,
       (SELECT count(*) FROM public.insumos) AS insumos,
       (SELECT count(*) FROM public.insumos WHERE coalesce(category, '') <> 'Tecidos') AS insumos_nao_tecido,
       (SELECT count(*) FROM (SELECT 1 FROM public.financial_obligations
                               WHERE cancelled_at IS NULL AND description ~ '^Salário (integral|meio período) — '
                               GROUP BY regexp_replace(description, '\s*\(\d+/\d+\)$', ''), date_trunc('month', due_date)
                              HAVING count(*) > 1) d) AS salarios_em_dobro,
       (SELECT count(*) FROM public.obligation_payments WHERE amount = 209254 AND reversed_at IS NULL AND reversal_of IS NULL) AS pagamento_209254_ativo,
       (SELECT count(*) FROM public.global_categories WHERE domain = 'finance') AS categorias_financeiras,
       (SELECT count(*) FROM public.clients) AS clientes,
       (SELECT count(*) FROM public.orders) AS pedidos,
       (SELECT count(*) FROM public.budgets) AS orcamentos,
       (SELECT count(*) FROM public.financial_obligations f JOIN public.obligation_summary s ON s.id = f.id
         WHERE f.status IS DISTINCT FROM s.derived_status) AS status_defasado,
       (SELECT sum(current_balance) FROM public.bank_accounts) AS saldo_dos_bancos,
       (SELECT count(*) FROM public.insumos WHERE current_stock <> 0) AS insumos_com_saldo;

-- ---------------------------------------------------------------------------
-- 1. ESTOQUE
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _remap_insumo (de uuid PRIMARY KEY, para uuid NOT NULL) ON COMMIT DROP;
-- Duplicados que têm uso → passam para o tecido certo.
INSERT INTO _remap_insumo (de, para)
SELECT d.id, p.id FROM (VALUES
    ('PIQUET',    'Malha Piquet PV (Guimatex 154) — Padrão'),
    ('TRICOLINE', 'Tricoline MNPro — Padrão'),
    ('Brim Leve Cedropac Leve (Sarja 2x1)',    'Brim Leve Cedropac — Padrão'),
    ('Brim Pesado Cedropac Pesado (Sarja 3x1)', 'Brim Pesado Cedropac — Padrão'),
    ('Tricoline MNPro (Paris Span/Viena)',      'Tricoline MNPro — Padrão'),
    ('JEANS 100% ALGODÃO',                      'JEANS CEDRO 100% ALGODÃO'),
    ('BRIM CEDRO',                              'Brim Leve Cedropac — Padrão')   -- Luiz, 15/10: é o mesmo
  ) AS x(de, para)
  JOIN public.insumos d ON d.name = x.de
  JOIN public.insumos p ON p.name = x.para
ON CONFLICT DO NOTHING;
UPDATE public.insumos SET name = btrim(name) WHERE name <> btrim(name);   -- "OXFORD " tinha espaço no fim

-- Itens de pedido/orçamento que apontam para tecido que não existe mais:
-- religa pelo nome guardado no item; sem nome reconhecível, tira a referência.
CREATE TEMP TABLE _remap_nome (nome text PRIMARY KEY, para uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _remap_nome (nome, para)
SELECT x.nome, i.id FROM (VALUES ('dry','DRY'), ('jeans','JEANS CEDRO 100% ALGODÃO'), ('jeans industrial','JEANS CEDRO 100% ALGODÃO')) AS x(nome, alvo)
JOIN public.insumos i ON i.name = x.alvo
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.itens_religados(p_items jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN coalesce(e.it->>'fabric_insumo_id','') = '' THEN e.it
      WHEN r.para IS NOT NULL THEN jsonb_set(e.it, '{fabric_insumo_id}', to_jsonb(r.para::text))
      WHEN EXISTS (SELECT 1 FROM public.insumos i WHERE i.id::text = e.it->>'fabric_insumo_id') THEN e.it
      WHEN n.para IS NOT NULL THEN jsonb_set(e.it, '{fabric_insumo_id}', to_jsonb(n.para::text))
      ELSE e.it - 'fabric_insumo_id'
    END ORDER BY e.ord), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS e(it, ord)
  LEFT JOIN _remap_insumo r ON r.de::text = e.it->>'fabric_insumo_id'
  LEFT JOIN _remap_nome n ON n.nome = lower(btrim(coalesce(nullif(e.it->>'fabric_name',''), e.it->>'fabric', '')))
$$;

-- A data "atualizado em" de pedidos e orçamentos não muda por esta limpeza.
ALTER TABLE public.orders  DISABLE TRIGGER trg_orders_updated_at;
ALTER TABLE public.budgets DISABLE TRIGGER trg_budgets_updated_at;

UPDATE public.orders o SET items = pg_temp.itens_religados(o.items)
 WHERE jsonb_typeof(o.items) = 'array' AND pg_temp.itens_religados(o.items) IS DISTINCT FROM o.items;
UPDATE public.budgets b SET items = pg_temp.itens_religados(b.items)
 WHERE jsonb_typeof(b.items) = 'array' AND pg_temp.itens_religados(b.items) IS DISTINCT FROM b.items;

-- O custo médio vai junto quando o destino não tem nenhum: o BRIM CEDRO (R$ 29,00/m) caía
-- num Brim Leve Cedropac sem custo, e o lucro por pedido ficava sem o material (corrigido 17/10).
UPDATE public.insumos p
   SET average_unit_cost = d.custo
  FROM (SELECT r.para, max(i.average_unit_cost) AS custo
          FROM _remap_insumo r JOIN public.insumos i ON i.id = r.de
         WHERE i.average_unit_cost > 0 GROUP BY r.para) d
 WHERE p.id = d.para AND coalesce(p.average_unit_cost, 0) = 0;

-- Tecido padrão de produto e fichas técnicas apontando para duplicado.
UPDATE public.products p SET default_fabric_insumo_id = r.para
  FROM _remap_insumo r WHERE p.default_fabric_insumo_id = r.de;
DELETE FROM public.product_insumos pi USING _remap_insumo r
 WHERE pi.insumo_id = r.de
   AND EXISTS (SELECT 1 FROM public.product_insumos q WHERE q.product_id = pi.product_id AND q.insumo_id = r.para);
UPDATE public.product_insumos pi SET insumo_id = r.para FROM _remap_insumo r WHERE pi.insumo_id = r.de;

-- Saem: os duplicados (já religados) e tudo que não é tecido. As linhas de ficha
-- técnica de aviamento/acessório saem junto (ON DELETE CASCADE).
DELETE FROM public.insumos i
 WHERE i.id IN (SELECT de FROM _remap_insumo)
    OR coalesce(i.category, '') <> 'Tecidos';

-- ---------------------------------------------------------------------------
-- 2. FOLHA EM DOBRO, ZELIA E A CONTA DE R$ 925
-- ---------------------------------------------------------------------------
-- 2a. Em setembro, a conta certa (Folha - Salários) do Felipe e da Zelia foi
--     cancelada à mão e o pagamento foi lançado na duplicata. Cada conta da
--     duplicata com pagamento ATIVO acha a conta da MESMA pessoa e do MESMO mês
--     na série certa; essa volta a valer e recebe os pagamentos. A da Zelia
--     (R$ 209.254,00, estornado no 2b) não tem par: o setembro dela fica cancelado.
CREATE TEMP TABLE _par (dup uuid PRIMARY KEY, alvo uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _par (dup, alvo)
SELECT dup.id, alvo.id
  FROM public.financial_obligations dup
  JOIN public.financial_obligations alvo
    ON alvo.category = 'Folha - Salários'
   AND regexp_replace(alvo.description, '\s*\(\d+/\d+\)$', '') = regexp_replace(dup.description, '\s*\(\d+/\d+\)$', '')
   AND date_trunc('month', alvo.due_date) = date_trunc('month', dup.due_date)
 WHERE dup.category = 'Folha de Pagamento'
   AND EXISTS (SELECT 1 FROM public.obligation_payments p WHERE p.obligation_id = dup.id
                 AND p.reversed_at IS NULL AND p.reversal_of IS NULL AND p.amount <> 209254);
DO $$
BEGIN
  IF (SELECT count(*) FROM _par) <> (SELECT count(DISTINCT alvo) FROM _par)
     OR EXISTS (SELECT 1 FROM public.financial_obligations dup
                 WHERE dup.category = 'Folha de Pagamento'
                   AND EXISTS (SELECT 1 FROM public.obligation_payments p WHERE p.obligation_id = dup.id
                                 AND p.reversed_at IS NULL AND p.reversal_of IS NULL AND p.amount <> 209254)
                   AND dup.id NOT IN (SELECT dup FROM _par)) THEN
    RAISE EXCEPTION 'Folha: pagamento da duplicata sem par único na Folha - Salários';
  END IF;
END $$;
UPDATE public.financial_obligations o SET cancelled_at = NULL, cancelled_reason = NULL
  FROM _par WHERE o.id = _par.alvo AND o.cancelled_at IS NOT NULL;
UPDATE public.obligation_payments p SET obligation_id = _par.alvo
  FROM _par
 WHERE p.obligation_id = _par.dup
   AND p.reversed_at IS NULL AND p.reversal_of IS NULL AND p.amount <> 209254
   AND NOT EXISTS (SELECT 1 FROM public.obligation_payments q
                    WHERE q.obligation_id = _par.alvo AND q.reversed_at IS NULL AND q.reversal_of IS NULL);

-- 2b. Estorno do pagamento digitado errado (como o reverse_payment, com
--     a data do pagamento original para setembro ficar certo).
DO $$
DECLARE v_pay public.obligation_payments%ROWTYPE; v_tipo text; v_estorno uuid;
BEGIN
  SELECT * INTO v_pay FROM public.obligation_payments
   WHERE amount = 209254 AND reversed_at IS NULL AND reversal_of IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;           -- já estornado
  SELECT type INTO v_tipo FROM public.financial_obligations WHERE id = v_pay.obligation_id;
  INSERT INTO public.obligation_payments (obligation_id, amount, payment_date, account_id, method, notes, reversal_of, affects_balance)
  VALUES (v_pay.obligation_id, v_pay.amount, v_pay.payment_date, v_pay.account_id, v_pay.method,
          'Estorno: valor digitado errado (R$ 209.254,00) — limpeza de dados 15/10/2026', v_pay.id,
          coalesce(v_pay.affects_balance, true))
  RETURNING id INTO v_estorno;
  UPDATE public.obligation_payments SET reversed_at = now(), reversed_by = v_estorno WHERE id = v_pay.id;
  -- O saldo ATUAL do banco não muda: o Luiz informa o saldo real do extrato
  -- (Cadastros › Bancos › Saldo atual) e ele vale. Só o ponto de partida é
  -- reancorado, para o "Sincronizar saldos" continuar chegando no mesmo número.
  IF coalesce(v_pay.affects_balance, true) AND v_pay.account_id IS NOT NULL THEN
    UPDATE public.bank_accounts
       SET initial_balance = initial_balance - CASE WHEN v_tipo = 'receivable' THEN -v_pay.amount ELSE v_pay.amount END,
           updated_at = now()
     WHERE id = v_pay.account_id;
  END IF;
END $$;

-- 2c. Cancela (não apaga) a série duplicada que ficou sem pagamento ativo.
UPDATE public.financial_obligations o
   SET cancelled_at = now(),
       cancelled_reason = 'Duplicata da folha (a série certa é Folha - Salários) — limpeza de dados 15/10/2026'
 WHERE o.category = 'Folha de Pagamento' AND o.cancelled_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.obligation_payments p
                    WHERE p.obligation_id = o.id AND p.reversed_at IS NULL AND p.reversal_of IS NULL);

-- ---------------------------------------------------------------------------
-- 3. CATEGORIAS FINANCEIRAS (árvore pai/filho)
-- O Resultado classifica pelo nome: "imposto" → impostos; marca custo_do_produto
-- → custo das peças; "tarifas bancárias"/"juros"/"financeir" → financeiras.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _arvore (pai text, nome text, natureza text, custo boolean) ON COMMIT DROP;
INSERT INTO _arvore VALUES
  ('Pessoal', 'Salários', 'fixo', false), ('Pessoal', 'Pró-labore', 'fixo', false),
  ('Pessoal', 'INSS', 'fixo', false), ('Pessoal', 'FGTS', 'fixo', false), ('Pessoal', '13º salário', 'fixo', false),
  ('Ocupação', 'Energia elétrica', 'fixo', false), ('Ocupação', 'Água e saneamento', 'fixo', false),
  ('Ocupação', 'Telefone e internet', 'fixo', false),
  ('Serviços', 'Contabilidade', 'fixo', false), ('Serviços', 'Sistemas e IA', 'fixo', false),
  ('Produção', 'Tecidos e malhas', 'variavel', true), ('Produção', 'Aviamentos', 'variavel', true),
  ('Produção', 'DTF e estamparia', 'variavel', true), ('Produção', 'Frete de insumos', 'variavel', true),
  ('Produção', 'Outros custos de produção', 'variavel', true),
  ('Impostos', 'Impostos e guias', 'variavel', false),
  ('Financeiro', 'Empréstimos', 'fixo', false), ('Financeiro', 'Consórcio', 'fixo', false),
  ('Financeiro', 'Seguros', 'fixo', false), ('Financeiro', 'Tarifas bancárias', 'variavel', false),
  ('Financeiro', 'Juros e fomento financeiro', 'variavel', false), ('Financeiro', 'Cartão de crédito', 'variavel', false),
  ('Retiradas', 'Saques', 'variavel', false),
  ('Outras despesas', 'Pagamentos avulsos', 'variavel', false),
  ('Vendas', 'Pedidos', 'variavel', false), ('Vendas', 'Outros recebimentos', 'variavel', false);

-- 3a. Texto de categoria das contas → nome novo.
CREATE TEMP TABLE _de_para (de text PRIMARY KEY, para text NOT NULL) ON COMMIT DROP;
INSERT INTO _de_para VALUES
  ('Folha - Salários','Salários'), ('Folha de Pagamento','Salários'), ('Salários','Salários'),
  ('Pró-labore','Pró-labore'), ('Folha - INSS','INSS'), ('Folha - FGTS','FGTS'), ('Folha - 13º','13º salário'),
  ('Energia Elétrica','Energia elétrica'), ('Energia','Energia elétrica'), ('Água/Saneamento','Água e saneamento'),
  ('Telefonia/Internet','Telefone e internet'), ('internet','Telefone e internet'), ('TELEFONE','Telefone e internet'),
  ('Serviços','Telefone e internet'),                -- só tem o provedor Conecta
  ('Serviços Contábeis','Contabilidade'), ('IA','Sistemas e IA'),
  ('Tecido/Malha','Tecidos e malhas'), ('DTF','DTF e estamparia'), ('Frete','Frete de insumos'),
  ('Imposto','Impostos e guias'),
  ('Empréstimo','Empréstimos'), ('Consórcio','Consórcio'), ('Seguro','Seguros'),
  ('Tarifas','Tarifas bancárias'), ('Tarifas Bancárias','Tarifas bancárias'),
  ('Cartão de Crédito','Cartão de crédito'), ('Cartão de crédito','Cartão de crédito'),
  ('Recebimento','Outros recebimentos');

UPDATE public.financial_obligations o SET category = d.para FROM _de_para d WHERE o.category = d.de AND d.de <> d.para;
UPDATE public.financial_obligations SET category = 'Contabilidade'
 WHERE category = 'Salários' AND description = 'contador atrasos';
-- "Fornecedores" pelo fornecedor na descrição.
UPDATE public.financial_obligations SET category = CASE
    WHEN description ~* '(MN TECIDOS|JUMIRIM|TECIDOS SAO GERALDO|TECIDOS SÃO GERALDO)' THEN 'Tecidos e malhas'
    WHEN description ~* 'BOTOES|BOTÕES' THEN 'Aviamentos'
    WHEN description ~* 'FOMENTO' THEN 'Juros e fomento financeiro'
    ELSE 'Outros custos de produção' END
 WHERE category = 'Fornecedores';
-- Sem categoria.
UPDATE public.financial_obligations SET category = CASE
    WHEN description ~* '^\s*saque' THEN 'Saques'
    WHEN description ~* '(juros|fomento)' THEN 'Juros e fomento financeiro'
    WHEN description ~* 'cons[oó]rcio' THEN 'Consórcio'
    WHEN description ~* 'enviar ao cliente' THEN 'Outros custos de produção'
    ELSE 'Pagamentos avulsos' END
 WHERE type = 'payable' AND coalesce(btrim(category), '') = '';
UPDATE public.financial_obligations SET category = CASE WHEN order_id IS NOT NULL THEN 'Pedidos' ELSE 'Outros recebimentos' END
 WHERE type = 'receivable' AND coalesce(btrim(category), '') = '';

-- 3b. Cadastro de categorias financeiras: substitui o antigo pela árvore nova.
-- (Nenhum fornecedor, cliente, insumo ou produto aponta para categoria financeira:
--  conferido no backup de 15/10.)
DO $$
DECLARE v_dono uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.global_categories WHERE domain = 'finance' AND name = 'Tecidos e malhas') THEN
    RETURN;                                    -- já feito
  END IF;
  SELECT user_id INTO v_dono FROM public.global_categories WHERE domain = 'finance' ORDER BY created_at LIMIT 1;
  IF v_dono IS NULL THEN
    SELECT user_id INTO v_dono FROM public.global_categories ORDER BY created_at LIMIT 1;
  END IF;
  DELETE FROM public.global_categories WHERE domain = 'finance';
  INSERT INTO public.global_categories (user_id, name, domain, parent_id, natureza, custo_do_produto, is_active)
  SELECT v_dono, pai, 'finance', NULL, NULL, bool_or(custo), true FROM _arvore GROUP BY pai;
  INSERT INTO public.global_categories (user_id, name, domain, parent_id, natureza, custo_do_produto, is_active)
  SELECT v_dono, a.nome, 'finance', p.id, a.natureza, a.custo, true
    FROM _arvore a JOIN public.global_categories p ON p.name = a.pai AND p.domain = 'finance' AND p.parent_id IS NULL;
END $$;

-- 3c. Categorias de fornecedor/cliente: "Despesas variaveis" (sem acento) junta com
--     "Despesas variáveis"; sai a categoria sem uso com nome de produto.
UPDATE public.global_categories c SET parent_id = alvo.id
  FROM public.global_categories velho, public.global_categories alvo
 WHERE c.parent_id = velho.id AND velho.domain = 'crm' AND velho.name = 'Despesas variaveis'
   AND alvo.domain = 'crm' AND alvo.name = 'Despesas variáveis';
DELETE FROM public.global_categories g WHERE g.domain = 'crm' AND g.name = 'Despesas variaveis'
   AND NOT EXISTS (SELECT 1 FROM public.global_categories f WHERE f.parent_id = g.id);
DELETE FROM public.global_categories g WHERE g.domain = 'crm' AND g.name = 'Conjunto em brim cinza c/faixa cedro'
   AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.global_category_id = g.id)
   AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.global_category_id = g.id OR s.default_global_category_id = g.id);

-- ---------------------------------------------------------------------------
-- 4. CLIENTES REPETIDOS SÓ POR MAIÚSCULA (mesmo nome; CNPJ igual ou vazio)
-- Fica o que tem CNPJ; depois o com mais pedidos+orçamentos; depois o mais antigo.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _junta (velho uuid PRIMARY KEY, fica uuid NOT NULL) ON COMMIT DROP;
WITH base AS (
  SELECT c.id, lower(btrim(regexp_replace(c.company_name, '\s+', ' ', 'g'))) AS nome, nullif(btrim(c.cnpj), '') AS cnpj, c.created_at,
         (SELECT count(*) FROM public.orders o WHERE o.client_id = c.id) + (SELECT count(*) FROM public.budgets b WHERE b.client_id = c.id) AS uso
    FROM public.clients c
), grupos AS (
  SELECT nome FROM base GROUP BY nome
  HAVING count(*) > 1 AND count(DISTINCT cnpj) <= 1        -- CNPJs diferentes = filiais, ficam separados
), ordenado AS (
  SELECT b.*, first_value(b.id) OVER (PARTITION BY b.nome ORDER BY (b.cnpj IS NULL), b.uso DESC, b.created_at) AS fica
    FROM base b JOIN grupos g USING (nome)
)
INSERT INTO _junta (velho, fica) SELECT id, fica FROM ordenado WHERE id <> fica;

-- O que fica herda o que só o outro tinha preenchido.
UPDATE public.clients f SET
  cnpj = coalesce(nullif(f.cnpj,''), nullif(v.cnpj,'')),
  phone = coalesce(nullif(f.phone,''), nullif(v.phone,'')),
  email = coalesce(nullif(f.email,''), nullif(v.email,'')),
  contact_person = coalesce(nullif(f.contact_person,''), nullif(v.contact_person,'')),
  address = coalesce(nullif(f.address,''), nullif(v.address,'')),
  global_category_id = coalesce(f.global_category_id, v.global_category_id)
  FROM _junta j JOIN public.clients v ON v.id = j.velho
 WHERE f.id = j.fica;

UPDATE public.orders t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.budgets t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.financial_obligations t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.invoices t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.client_contacts t SET principal = false FROM _junta j      -- só um contato principal por cliente
 WHERE t.client_id = j.velho AND t.principal
   AND EXISTS (SELECT 1 FROM public.client_contacts f WHERE f.client_id = j.fica AND f.principal);
UPDATE public.client_contacts t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.artes_bordado t SET cliente_id = j.fica FROM _junta j WHERE t.cliente_id = j.velho;
UPDATE public.leads t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.personalizacao_historico t SET cliente_id = j.fica FROM _junta j WHERE t.cliente_id = j.velho;
UPDATE public.transactions_table t SET client_id = j.fica FROM _junta j WHERE t.client_id = j.velho;
UPDATE public.clients t SET canonical_client_id = j.fica FROM _junta j WHERE t.canonical_client_id = j.velho;
DELETE FROM public.clients c USING _junta j WHERE c.id = j.velho;

ALTER TABLE public.orders  ENABLE TRIGGER trg_orders_updated_at;
ALTER TABLE public.budgets ENABLE TRIGGER trg_budgets_updated_at;

-- ---------------------------------------------------------------------------
-- 5. STATUS GRAVADO = STATUS CALCULADO
-- ---------------------------------------------------------------------------
UPDATE public.financial_obligations f SET status = s.derived_status
  FROM public.obligation_summary s
 WHERE s.id = f.id AND f.status IS DISTINCT FROM s.derived_status;

-- ---------------------------------------------------------------------------
-- 6. VIRADA DAS COMPRAS POR PEDIDO (Luiz, 15/10: "apenas novos")
-- Todo pedido que já existe vira legado: não entra na Lista de compras, no "Comprar"
-- do Início nem nos destinos de uma compra. O estoque antigo (nunca foi lançado de
-- verdade) é zerado com um movimento de ajuste. Só na primeira vez: rodar de novo
-- não marca pedidos novos como legado.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'compras_legado') THEN
    RETURN;                                    -- já feito
  END IF;
  -- Os pedidos de hoje nascem com true; os próximos, com false. Sem UPDATE: nada de gatilho.
  ALTER TABLE public.orders ADD COLUMN compras_legado boolean NOT NULL DEFAULT true;
  ALTER TABLE public.orders ALTER COLUMN compras_legado SET DEFAULT false;
  COMMENT ON COLUMN public.orders.compras_legado IS
    'Pedido de antes da virada das compras por pedido (15/10/2026): fica fora da Lista de compras e das sobras.';
  INSERT INTO public.insumo_movements (insumo_id, type, quantity, source, notes)
  SELECT id, 'OUT', current_stock, 'ajuste', 'Virada das compras por pedido: estoque antigo zerado (legado)'
    FROM public.insumos WHERE current_stock > 0;
END $$;

-- ANTES × DEPOIS (o SQL Editor mostra só este resultado)
SELECT * FROM _antes
UNION ALL
SELECT 'depois' AS momento,
       (SELECT count(*) FROM public.insumos) AS insumos,
       (SELECT count(*) FROM public.insumos WHERE coalesce(category, '') <> 'Tecidos') AS insumos_nao_tecido,
       (SELECT count(*) FROM (SELECT 1 FROM public.financial_obligations
                               WHERE cancelled_at IS NULL AND description ~ '^Salário (integral|meio período) — '
                               GROUP BY regexp_replace(description, '\s*\(\d+/\d+\)$', ''), date_trunc('month', due_date)
                              HAVING count(*) > 1) d) AS salarios_em_dobro,
       (SELECT count(*) FROM public.obligation_payments WHERE amount = 209254 AND reversed_at IS NULL AND reversal_of IS NULL) AS pagamento_209254_ativo,
       (SELECT count(*) FROM public.global_categories WHERE domain = 'finance') AS categorias_financeiras,
       (SELECT count(*) FROM public.clients) AS clientes,
       (SELECT count(*) FROM public.orders) AS pedidos,
       (SELECT count(*) FROM public.budgets) AS orcamentos,
       (SELECT count(*) FROM public.financial_obligations f JOIN public.obligation_summary s ON s.id = f.id
         WHERE f.status IS DISTINCT FROM s.derived_status) AS status_defasado,
       (SELECT sum(current_balance) FROM public.bank_accounts) AS saldo_dos_bancos,
       (SELECT count(*) FROM public.insumos WHERE current_stock <> 0) AS insumos_com_saldo;

COMMIT;
