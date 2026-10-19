-- =============================================================================
-- ADITIVO DE PEDIDO
--
-- Rodar no SQL Editor do Supabase. Cria tabela e função; não altera nada do que
-- já existe, exceto somar o valor do aditivo ao total do pedido — e só quando
-- alguém gravar um aditivo.
--
-- O PEDIDO: "depois de convertido o orçamento, pode ser que na entrega sejam
-- entregues uma quantidade maior ou aumentado o pedido, isso deve anexar as
-- peças, e adicionar no valor total".
--
-- O que acontece na vida real: o pedido saiu com 100 camisas, na entrega vão
-- 120. Hoje o sistema entrega 120 e cobra 100 — a diferença mora na memória de
-- quem atendeu, e some quando essa pessoa entra de férias.
--
-- POR QUE UMA TABELA, E NÃO SÓ SOMAR NO PEDIDO
-- Somar direto em orders.total_amount resolveria a cobrança e apagaria a
-- história: seis meses depois ninguém sabe se o pedido sempre foi 6.000 ou se
-- virou 6.000 por causa de vinte peças acrescentadas em maio. O aditivo guarda
-- o quê, quanto, quando e por quê — e o total do pedido continua sendo somado,
-- porque é dele que saem o status de pagamento, os recebíveis e os indicadores.
-- Os dois: o número certo na frente, a história atrás dele.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. A TABELA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_addendums (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- [{product_id, product_name, size, quantity, unit_price}]
  --
  -- jsonb e não uma tabela de linhas porque o aditivo é um documento fechado:
  -- ninguém edita a linha 3 de um aditivo de março. Se um dia precisar mudar,
  -- o certo é outro aditivo — como já vale para pagamento e estorno.
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,

  amount      numeric(15,2) NOT NULL CHECK (amount > 0),
  reason      text,

  -- A cobrança gerada, quando gerada. Nulo quer dizer "acrescentou peça e não
  -- cobrou à parte" — o que é legítimo quando o cliente vai pagar tudo junto no
  -- ato, e o total do pedido já subiu.
  obligation_id uuid REFERENCES public.financial_obligations(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_addendums_order ON public.order_addendums(order_id);

ALTER TABLE public.order_addendums ENABLE ROW LEVEL SECURITY;

-- Uma política só, no modelo de empresa única. Sem a política "owner" por
-- user_id: é justamente o resíduo do modelo antigo que a auditoria mandou
-- derrubar das outras 26 tabelas, e não faria sentido criar a 27ª.
DROP POLICY IF EXISTS single_tenant_admin_manager_all ON public.order_addendums;
CREATE POLICY single_tenant_admin_manager_all ON public.order_addendums
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- A fábrica LÊ o aditivo — ela precisa saber que são 120 peças e não 100 — mas
-- não grava: quantidade a mais vira dinheiro, e dinheiro é do comercial.
DROP POLICY IF EXISTS single_tenant_factory_select ON public.order_addendums;
CREATE POLICY single_tenant_factory_select ON public.order_addendums
  FOR SELECT TO authenticated
  USING (public.is_factory());

-- SÓ LEITURA para o aplicativo. Escrever é através das duas funções abaixo, e
-- não direto na tabela.
--
-- Com INSERT/UPDATE/DELETE liberados, um DELETE direto pelo PostgREST apagaria
-- o aditivo e deixaria `orders.total_amount` inflado, sem registro do porquê —
-- justamente o buraco que este arquivo existe para não abrir. As funções são
-- SECURITY DEFINER e rodam como dono, então continuam gravando normalmente.
GRANT SELECT ON public.order_addendums TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. GRAVAR UM ADITIVO
--
-- Tudo numa transação: o aditivo, o novo total do pedido e a cobrança nascem
-- juntos ou não nascem. Meio aditivo — peça registrada e total não somado, ou
-- o contrário — seria uma divergência silenciosa entre o que se entregou e o
-- que se cobrou, que é exatamente o problema que esta função existe para
-- resolver.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_order_addendum(
  p_order_id       uuid,
  p_items          jsonb,
  p_reason         text DEFAULT NULL,
  -- Nulo não gera cobrança à parte: o total do pedido sobe e pronto.
  p_due_date       date DEFAULT NULL,
  p_planned_method text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_order    public.orders%ROWTYPE;
  v_total    numeric(15,2);
  v_add_id   uuid := gen_random_uuid();
  v_oblig_id uuid;
  v_desc     text;
BEGIN
  PERFORM public.assert_finance_access();
  -- Avisa o gatilho de que a mudança de total vem daqui. Vale só nesta
  -- transação: `is_local = true`.
  PERFORM set_config('app.aditivo_em_curso', '1', true);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'O aditivo precisa de pelo menos uma peça.';
  END IF;

  -- O valor é somado AQUI, a partir das linhas, e não recebido pronto de fora.
  -- Um total vindo da tela poderia discordar das peças que a tela mandou junto,
  -- e o registro ficaria dizendo duas coisas diferentes sobre o mesmo aditivo.
  SELECT COALESCE(SUM(ROUND((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2)), 0)
    INTO v_total
    FROM jsonb_array_elements(p_items) i;

  IF v_total <= 0 THEN
    RAISE EXCEPTION
      'O aditivo soma R$ %. Peça sem cobrança é desconto, e desconto se registra na baixa.',
      v_total;
  END IF;

  INSERT INTO public.order_addendums (id, user_id, order_id, items, amount, reason)
  VALUES (v_add_id, v_uid, p_order_id, p_items, v_total, NULLIF(btrim(COALESCE(p_reason, '')), ''));

  -- O total do pedido sobe: é dele que saem o status de pagamento, os
  -- recebíveis e os indicadores. Deixá-lo parado faria o pedido nascer quitado
  -- com peça a mais entregue de graça.
  UPDATE public.orders
     SET total_amount = COALESCE(total_amount, 0) + v_total,
         updated_at   = now()
   WHERE id = p_order_id;

  IF p_due_date IS NOT NULL THEN
    v_desc := 'Aditivo do pedido ' || COALESCE(v_order.order_number, '') ||
              CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
                   THEN ' — ' || btrim(p_reason) ELSE '' END;

    INSERT INTO public.financial_obligations (
      user_id, type, status, description, original_amount,
      due_date, issue_date, client_id, order_id, planned_method
    ) VALUES (
      v_uid, 'receivable', 'open', v_desc, v_total,
      p_due_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      v_order.client_id, p_order_id, p_planned_method
    ) RETURNING id INTO v_oblig_id;

    UPDATE public.order_addendums SET obligation_id = v_oblig_id WHERE id = v_add_id;
  END IF;

  RETURN v_add_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_addendum(uuid, jsonb, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_order_addendum(uuid, jsonb, text, date, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. DESFAZER UM ADITIVO
--
-- Existe porque errar a quantidade na correria da entrega é comum, e sem um
-- caminho de volta a saída de quem errou seria lançar um aditivo negativo —
-- que o CHECK (amount > 0) recusa, e ainda bem.
--
-- Recusa se a cobrança gerada já recebeu pagamento: aí o caminho é estornar o
-- pagamento primeiro, como em todo o resto do sistema.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_order_addendum(p_addendum_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_add    public.order_addendums%ROWTYPE;
  v_pagos  integer;
BEGIN
  PERFORM public.assert_finance_access();
  -- Avisa o gatilho de que a mudança de total vem daqui. Vale só nesta
  -- transação: `is_local = true`.
  PERFORM set_config('app.aditivo_em_curso', '1', true);

  SELECT * INTO v_add FROM public.order_addendums WHERE id = p_addendum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aditivo não encontrado: %', p_addendum_id;
  END IF;

  IF v_add.obligation_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pagos
      FROM public.obligation_payments p
     WHERE p.obligation_id = v_add.obligation_id
       AND p.reversed_at IS NULL AND p.reversal_of IS NULL;

    IF v_pagos > 0 THEN
      RAISE EXCEPTION
        'A cobrança deste aditivo já tem % pagamento(s). Estorne antes de removê-lo.', v_pagos;
    END IF;

    -- Cancela em vez de apagar, como toda obrigação neste sistema.
    UPDATE public.financial_obligations
       SET status = 'cancelled', cancelled_at = now(),
           cancelled_reason = 'Aditivo removido', updated_at = now()
     WHERE id = v_add.obligation_id;
  END IF;

  UPDATE public.orders
     SET total_amount = COALESCE(total_amount, 0) - v_add.amount,
         updated_at   = now()
   WHERE id = v_add.order_id;

  DELETE FROM public.order_addendums WHERE id = p_addendum_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_order_addendum(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_order_addendum(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3b. O GUARDA — o total do pedido não pode cair abaixo dos aditivos
--
-- Encontrado revisando este arquivo ANTES de rodá-lo, e é o motivo pelo qual
-- ele cresceu.
--
-- `saveOrderStage`, no PCP, gravava o pedido INTEIRO a cada arrastada de
-- cartão — `total_amount` junto. O objeto vinha da lista carregada ao abrir a
-- tela. Enquanto o total só mudava ao editar o pedido, ninguém notava. Com o
-- aditivo, o total passa a mudar por fora, e a sequência vira:
--
--   1. alguém lança 20 peças a mais         → total 5.000 vira 6.000
--   2. outra pessoa arrasta um cartão no PCP → total volta para 5.000
--   3. o aditivo e a cobrança de 1.000 continuam lá
--
-- Os livros passam a discordar, sem erro na tela e sem ninguém saber.
--
-- O caminho que causava isso foi corrigido no aplicativo. Este gatilho existe
-- para o PRÓXIMO: qualquer gravação futura que arraste o pedido inteiro esbarra
-- aqui em vez de apagar dinheiro em silêncio.
--
-- A PRIMEIRA VERSÃO DESTE GUARDA NÃO PEGAVA NADA. Ela comparava o total com a
-- SOMA dos aditivos — e num pedido de R$ 4.080 com R$ 1.000 de aditivo, voltar
-- para R$ 3.080 passava tranquilo, porque 3.080 é maior que 1.000. Guarda que
-- não dispara é pior que guarda nenhum: dá a sensação de estar protegido. O que
-- interessa não é o patamar, é a QUEDA.
--
-- Agora ele recusa qualquer redução do total num pedido que tenha aditivo —
-- exceto quando quem reduz é o próprio `remove_order_addendum`, que avisa por
-- uma marca de transação.
--
-- Isso é estrito, e dá para ser: conferido no código, nenhuma tela baixa o
-- total de um pedido existente. `saveOrder` só é chamado ao converter orçamento
-- (criação), e o PCP passou a gravar apenas os campos de produção. Se um dia
-- existir edição de valor, ela precisará passar pelo aditivo — que é onde a
-- mudança fica registrada, e o motivo deste arquivo existir.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_total_com_aditivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_aditivos numeric(15,2);
BEGIN
  -- Só interessa quem BAIXA o total. Subir é o que o aditivo faz, e editar
  -- para o mesmo valor não é mudança.
  IF COALESCE(NEW.total_amount, 0) >= COALESCE(OLD.total_amount, 0) THEN
    RETURN NEW;
  END IF;

  -- As duas funções de aditivo avisam que a queda é delas. `set_config` com
  -- `is_local = true` vale só até o fim da transação, então o aviso não vaza
  -- para a próxima operação da mesma conexão.
  IF current_setting('app.aditivo_em_curso', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_aditivos
    FROM public.order_addendums WHERE order_id = NEW.id;

  IF v_aditivos > 0 THEN
    RAISE EXCEPTION
      'Este pedido tem R$ % em aditivos, e algo tentou baixar o total de R$ % para R$ %. Se o aditivo está errado, remova-o pela ficha de entrega — baixar o total deixaria a cobrança dele órfã.',
      round(v_aditivos, 2), round(COALESCE(OLD.total_amount, 0), 2), round(COALESCE(NEW.total_amount, 0), 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_total_com_aditivo ON public.orders;
CREATE TRIGGER trg_proteger_total_com_aditivo
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.proteger_total_com_aditivo();


-- ---------------------------------------------------------------------------
-- 4. CONFERÊNCIA — as duas funções existem e exigem acesso financeiro?
-- ---------------------------------------------------------------------------
SELECT p.proname,
       p.prosecdef AS security_definer,
       (pg_get_functiondef(p.oid) LIKE '%assert_finance_access%') AS confere_acesso
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('add_order_addendum', 'remove_order_addendum')
 ORDER BY p.proname;
-- confere_acesso precisa vir `t` nas duas.

SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'order_addendums'
 ORDER BY policyname;
-- Espera-se duas: a de admin/gerente (ALL) e a da fábrica (SELECT).
