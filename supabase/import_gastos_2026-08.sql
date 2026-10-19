-- =============================================================================
-- IMPORTAÇÃO DE GASTOS — lista repassada em 2026-08-04 (gastos_botezini.json)
--
-- Script ADITIVO (só INSERT, nunca apaga/altera nada existente). Pode rodar
-- direto no SQL Editor do Supabase, no banco de produção.
--
-- Idempotente: cada INSERT tem um WHERE NOT EXISTS checando
-- (categoria + vencimento + valor), então rodar o script duas vezes não
-- duplica nada.
--
-- Rode em 3 blocos, na ordem. Dá pra rodar o script inteiro de uma vez também.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — Fornecedores novos (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.suppliers (company_name, category)
SELECT v.company_name, v.category
FROM (VALUES
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',                'Aviamentos'),
    ('JUMIRIM MALHAS',                                     'Tecidos'),
    ('TECIDOS SAO GERALDO LTDA',                           'Tecidos'),
    ('MAGNO FOMENTO MERCANTIL LTDA',                        'Fomento Mercantil'),
    ('ITEV - INFORMACOES TRIBUTARIAS PARA EMPR',            'Serviços Tributários'),
    ('COLLOCA SERVICOS DE RECRUTAMENTO E SELECAO LTDA',     'Serviços - RH'),
    ('SPEED TECNET',                                        'Serviços - TI/Internet'),
    ('SESNAT NACIONAL',                                     'Encargos/Contribuições')
) AS v(company_name, category)
WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.company_name = v.company_name
);

-- "TEXTIL MN COMERCIO DE TECIDOS E CONFECCOES LTDA" (e suas variações
-- truncadas no boleto) é a mesma empresa do fornecedor "MN Tecidos" já
-- cadastrado (confirmado por você) — por isso NÃO criei fornecedor novo pra
-- ela; o bloco 2 linka direto em "MN Tecidos".


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — Contas a pagar já datadas (boletos com vencimento e valor exatos)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.financial_obligations
    (type, description, original_amount, due_date, category, supplier_id)
SELECT
    'payable', v.description, v.amount, v.due_date, 'Fornecedores',
    -- ORDER BY + LIMIT 1 porque o cadastro tem fornecedor repetido com o mesmo
    -- nome (ver consulta de duplicados no fim do arquivo). Sem isso o subselect
    -- devolve 2 linhas e o INSERT quebra com "more than one row returned".
    -- Pega sempre o registro mais ANTIGO — o original, que já tem histórico.
    (SELECT s.id FROM public.suppliers s
      WHERE s.company_name = v.supplier_name
      ORDER BY s.created_at, s.id LIMIT 1)
FROM (VALUES
    ('ITEV - INFORMACOES TRIBUTARIAS PARA EMPR',         'ITEV - INFORMACOES TRIBUTARIAS PARA EMPR',           719.80, DATE '2026-07-31'),
    ('COLLOCA SERVICOS DE RECRUTAMENTO E SELECAO LTDA',  'COLLOCA SERVICOS DE RECRUTAMENTO E SELECAO LTDA',   1287.69, DATE '2026-08-03'),
    ('SPEED TECNET',                                     'SPEED TECNET',                                        783.60, DATE '2026-08-07'),
    ('SESNAT NACIONAL',                                  'SESNAT NACIONAL',                                     747.93, DATE '2026-08-07'),
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',              'DIVINOPOLIS COMERCIO DE BOTOES LTDA',                1194.55, DATE '2026-08-12'),
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',              'DIVINOPOLIS COMERCIO DE BOTOES LTDA',                 303.75, DATE '2026-08-14'),
    ('MN Tecidos',                                       'MN Tecidos',                                         2528.30, DATE '2026-08-15'),
    ('MN Tecidos',                                       'MN Tecidos',                                         2432.38, DATE '2026-08-17'),
    ('JUMIRIM MALHAS',                                   'JUMIRIM MALHAS',                                       760.17, DATE '2026-08-23'),
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',              'DIVINOPOLIS COMERCIO DE BOTOES LTDA',                 438.41, DATE '2026-08-23'),
    ('TECIDOS SAO GERALDO LTDA',                         'TECIDOS SAO GERALDO LTDA',                           1187.64, DATE '2026-08-24'),
    ('MAGNO FOMENTO MERCANTIL LTDA',                     'MAGNO FOMENTO MERCANTIL LTDA',                        360.00, DATE '2026-08-26'),
    ('JUMIRIM MALHAS',                                   'JUMIRIM MALHAS',                                       360.95, DATE '2026-08-31'),
    ('JUMIRIM MALHAS',                                   'JUMIRIM MALHAS',                                       739.99, DATE '2026-09-01'),
    ('MN Tecidos',                                       'MN Tecidos',                                         1835.65, DATE '2026-09-06'),
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',              'DIVINOPOLIS COMERCIO DE BOTOES LTDA',                1194.55, DATE '2026-09-12'),
    ('MN Tecidos',                                       'MN Tecidos',                                         2432.38, DATE '2026-09-16'),
    ('JUMIRIM MALHAS',                                   'JUMIRIM MALHAS',                                       760.17, DATE '2026-09-22'),
    ('MAGNO FOMENTO MERCANTIL LTDA',                     'MAGNO FOMENTO MERCANTIL LTDA',                        360.00, DATE '2026-09-25'),
    ('MN Tecidos',                                       'MN Tecidos',                                         1835.65, DATE '2026-10-06'),
    ('DIVINOPOLIS COMERCIO DE BOTOES LTDA',              'DIVINOPOLIS COMERCIO DE BOTOES LTDA',                1194.55, DATE '2026-10-12'),
    ('MN Tecidos',                                       'MN Tecidos',                                         2432.37, DATE '2026-10-16'),
    ('MAGNO FOMENTO MERCANTIL LTDA',                     'MAGNO FOMENTO MERCANTIL LTDA',                        360.00, DATE '2026-10-25'),
    ('MN Tecidos',                                       'MN Tecidos',                                         1835.67, DATE '2026-11-05')
) AS v(supplier_name, description, amount, due_date)
WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_obligations fo
    WHERE fo.description = v.description AND fo.due_date = v.due_date AND fo.original_amount = v.amount
);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — Contas fixas mensais, todas recorrentes (12 parcelas cada)
--
-- Consórcio Santander e Contador têm valor fixo; as outras 5 (Nubank, Vivo,
-- Conecta, Cemig, Água) variam de fatura pra fatura — mas a pedido seu, lanço
-- as 12 parcelas já com o valor aproximado, marcado em "notes". Depois é só
-- abrir cada parcela e corrigir o valor quando a fatura chegar — não precisa
-- recriar o lançamento todo mês.
-- ─────────────────────────────────────────────────────────────────────────────
WITH contas AS (
    SELECT v.nome, v.categoria, v.valor, v.primeiro_vencimento, v.observacao, gen_random_uuid() AS recorrencia_id
    FROM (VALUES
        ('Consórcio Santander', 'Consórcio',          516.72,  DATE '2026-08-30', NULL),
        ('Nubank',               'Cartão de Crédito',  2000.00, DATE '2026-08-20', 'Valor aproximado — ajustar ao fechar a fatura de cada mês.'),
        ('Vivo',                 'Telefonia/Internet', 90.00,   DATE '2026-08-10', 'Valor aproximado — ajustar ao valor real de cada mês.'),
        ('Conecta',              'Serviços',           100.00,  DATE '2026-08-31', 'Dia de vencimento não informado (usei fim do mês) — ajustar data e valor.'),
        ('Cemig',                'Energia Elétrica',   350.00,  DATE '2026-08-14', 'Valor aproximado — ajustar ao valor real de cada mês.'),
        ('Água',                 'Água/Saneamento',    82.00,   DATE '2026-08-07', 'Valor aproximado — ajustar ao valor real de cada mês.'),
        ('Contador',             'Serviços Contábeis', 450.00,  DATE '2026-08-10', 'Dia de vencimento não informado (usei dia 10) — ajustar se for outro.')
    ) AS v(nome, categoria, valor, primeiro_vencimento, observacao)
)
INSERT INTO public.financial_obligations
    (type, description, original_amount, due_date, category, notes, is_recurring, recurrence_id, installment_no, total_installments)
SELECT
    'payable',
    c.nome || ' (' || (i + 1) || '/12)',
    c.valor,
    (c.primeiro_vencimento + (i || ' months')::interval)::date,
    c.categoria,
    c.observacao,
    true,
    c.recorrencia_id,
    i + 1,
    12
FROM contas c, generate_series(0, 11) AS i
WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_obligations fo
    WHERE fo.category = c.categoria
      AND fo.due_date = (c.primeiro_vencimento + (i || ' months')::interval)::date
      AND fo.original_amount = c.valor
);


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — rode depois pra conferir
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT description, original_amount, due_date, category, is_recurring, status
-- FROM public.financial_obligations
-- WHERE created_at > now() - interval '10 minutes'
-- ORDER BY due_date;


-- ─────────────────────────────────────────────────────────────────────────────
-- FORNECEDORES DUPLICADOS — só leitura, roda quando quiser
--
-- O cadastro tem mais de um fornecedor com o mesmo nome. Isso não impede este
-- script de rodar (ele pega o mais antigo), mas espalha o histórico de compras
-- entre dois registros da mesma empresa. Vale limpar pela tela de Fornecedores.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT company_name, COUNT(*) AS quantidade,
--        array_agg(id ORDER BY created_at) AS ids,
--        array_agg(created_at ORDER BY created_at) AS criados_em
-- FROM public.suppliers
-- GROUP BY company_name
-- HAVING COUNT(*) > 1
-- ORDER BY quantidade DESC, company_name;
