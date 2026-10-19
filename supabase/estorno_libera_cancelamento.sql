-- =============================================================================
-- Estornar não libera o cancelamento — diagnóstico e correção
--
-- O SINTOMA
-- "Nao e possivel cancelar: existem pagamentos ativos", e continua igual DEPOIS
-- de estornar o pagamento.
--
-- ESTE SCRIPT NÃO APAGA NADA.
-- Não tem DROP, não tem DELETE. A PARTE 1 é só leitura. A PARTE 2 substitui o
-- corpo de uma função (CREATE OR REPLACE FUNCTION), o que não toca em dado
-- nenhum. A view obligation_summary NÃO é mexida de propósito: a versão do
-- repositório tem menos colunas que a sua (falta `planned_method`), e
-- CREATE OR REPLACE VIEW não aceita remover coluna — foi esse o erro 42P16.
-- Como todas as versões da view no repositório já usam o filtro correto, ela
-- muito provavelmente já está certa. A PARTE 1 confirma isso.
--
-- COMO USAR
-- Rode a PARTE 1 primeiro, sozinha, e leia o resultado. Ela diz qual é a causa.
-- Só depois rode a PARTE 2, se a PARTE 1 apontar para ela.
-- =============================================================================


-- =============================================================================
-- PARTE 1 — DIAGNÓSTICO (somente leitura, pode rodar à vontade)
-- =============================================================================

-- 1.a) Qual cancel_obligation está publicada?
--
-- Procure no resultado pela linha do EXISTS. Ela precisa ter as DUAS condições:
--
--     reversed_at IS NULL   AND   reversal_of IS NULL
--
-- Se só aparecer `reversed_at IS NULL`, a causa é essa: o estorno cria uma
-- segunda linha (o contra-lançamento, com reversal_of preenchido) que nasce sem
-- reversed_at. Com o filtro incompleto ela passa por pagamento ativo, e o
-- cancelamento fica travado para sempre. Nesse caso, rode a PARTE 2.
SELECT pg_get_functiondef(p.oid) AS definicao_atual
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'cancel_obligation';


-- 1.b) A view está contando o contra-lançamento como pagamento?
--
-- Espera-se ZERO linhas. Se vier alguma, a view também precisa de correção —
-- me mande o resultado da consulta 1.c junto, porque aí a view tem que ser
-- reescrita coluna por coluna, preservando as suas.
SELECT o.id,
       o.description,
       o.original_amount,
       s.paid_amount,
       s.derived_status
FROM public.financial_obligations o
JOIN public.obligation_summary s ON s.id = o.id
WHERE s.paid_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.obligation_payments p
    WHERE p.obligation_id = o.id
      AND p.reversed_at IS NULL
      AND p.reversal_of IS NULL
  );


-- 1.c) As colunas que a SUA view tem (para reescrevê-la sem perder nenhuma,
--      caso 1.b tenha apontado problema).
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'obligation_summary';


-- 1.d) O extrato completo de uma conta específica.
--
-- Troque o id e rode. É isto que responde "por que ainda diz que tem pagamento
-- ativo depois de eu estornar":
--
--   • ativo = true  →  este pagamento ainda conta. Se aparecer mais de um,
--     você estornou um e sobrou outro — é preciso estornar todos.
--   • estorno = true → é o contra-lançamento; ele nunca deve contar como ativo.
--
-- Se todas as linhas vierem com ativo = false e mesmo assim o cancelamento
-- recusar, a causa é a função (1.a).
--
-- SELECT p.id,
--        p.amount,
--        p.payment_date,
--        p.notes,
--        (p.reversed_at IS NOT NULL)                              AS foi_estornado,
--        (p.reversal_of  IS NOT NULL)                             AS estorno,
--        (p.reversed_at IS NULL AND p.reversal_of IS NULL)        AS ativo
-- FROM public.obligation_payments p
-- WHERE p.obligation_id = 'COLE-O-ID-DA-CONTA-AQUI'
-- ORDER BY p.created_at;


-- 1.e) Não sabe o id? Ache a conta pela descrição:
--
-- SELECT id, description, original_amount, due_date, status
-- FROM public.financial_obligations
-- WHERE description ILIKE '%parte da descricao%'
-- ORDER BY created_at DESC
-- LIMIT 20;


-- =============================================================================
-- PARTE 2 — CORREÇÃO DA FUNÇÃO
--
-- Só substitui o corpo de cancel_obligation. Idempotente: se a sua já estiver
-- correta, o resultado é exatamente a mesma função de novo. Nenhum dado é
-- tocado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_obligation(
  p_obligation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativos int;
BEGIN
  PERFORM public.assert_finance_access();

  -- As DUAS condições. O estorno não apaga nada — carimba reversed_at no
  -- pagamento original E insere o contra-lançamento com reversal_of apontando
  -- para ele. Testar só `reversed_at IS NULL` deixa o contra-lançamento passar
  -- por pagamento ativo, e aí estornar vira uma operação inócua: a conta fica
  -- paga para sempre.
  SELECT COUNT(*) INTO v_ativos
  FROM public.obligation_payments p
  WHERE p.obligation_id = p_obligation_id
    AND p.reversed_at IS NULL
    AND p.reversal_of IS NULL;

  IF v_ativos > 0 THEN
    -- A contagem vai junto na mensagem: quem estornou um pagamento e ainda
    -- esbarra na recusa precisa saber que sobraram outros, senão conclui que o
    -- estorno não funciona e parte para lançar um valor inverso — dois erros no
    -- lugar de nenhum.
    RAISE EXCEPTION
      'Nao e possivel cancelar: % pagamento(s) ativo(s). Estorne antes de cancelar.',
      v_ativos;
  END IF;

  UPDATE public.financial_obligations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = p_reason,
      updated_at = now()
  WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obligation not found: %', p_obligation_id;
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.cancel_obligation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_obligation(uuid, text) TO authenticated;

-- =============================================================================
-- Depois da PARTE 2, a mensagem de recusa passa a dizer QUANTOS pagamentos
-- ainda estão ativos. Se aparecer "1 pagamento(s) ativo(s)" logo depois de você
-- estornar, rode a consulta 1.d nessa conta: ou sobrou um segundo pagamento, ou
-- o estorno não chegou a ser gravado.
--
-- NÃO chame get_client_score nem refresh_client_scores aqui: as duas passam por
-- assert_finance_access(), que exige auth.uid(). No SQL Editor não há sessão de
-- usuário, a chamada morre com "Acesso financeiro negado" e derruba o script
-- inteiro junto — o editor roda tudo numa transação.
-- =============================================================================
