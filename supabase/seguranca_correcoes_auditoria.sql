-- =============================================================================
-- CORREÇÕES DA AUDITORIA DE SEGURANÇA
-- Rodar no SQL Editor do Supabase.
--
-- Fecha os três achados de severidade crítica e alta do relatório em
-- docs/security-audit/relatorio-auditoria-seguranca.pdf:
--
--   #1 CRÍTICA  qualquer usuário se promove a administrador
--   #2 ALTA     papel de fábrica lê indicadores financeiros por RPC
--   #3 ALTA     papel de fábrica altera qualquer coluna de um pedido
--
-- NENHUMA PARTE APAGA DADO. As três correções mexem em política, função e
-- gatilho — o pior caso de um erro aqui é alguém perder acesso a uma tela, não
-- perder um registro. Por isso este arquivo pode rodar ANTES do backup.
--
-- A parte 1 é somente leitura: rode-a sozinha primeiro e leia a saída.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ANTES DE MEXER — o retrato de como está  (não altera nada)
--
-- A primeira consulta é a que decide se dá para seguir: se as políticas de
-- perfil próprio não existirem, derrubar a `owner` tira das pessoas o acesso
-- ao PRÓPRIO cadastro. Nesse caso, rode perfil_nome_e_foto.sql antes.
-- ---------------------------------------------------------------------------
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'profiles'
 ORDER BY policyname;
-- Espera-se ver: "perfil proprio: ler", "perfil proprio: editar",
-- "single_tenant_admin_manager_all" e a intrusa "owner".

-- O mesmo problema pode estar repetido: a migração de endurecimento só
-- ACRESCENTOU políticas, e as do modelo antigo (por dono) continuam valendo em
-- paralelo, porque políticas de RLS são combinadas por OU.
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND qual LIKE '%user_id%'
 ORDER BY tablename, policyname;
-- Num modelo de uma empresa só, política por user_id é resíduo do modelo
-- anterior. Estas NÃO são derrubadas automaticamente aqui: cada uma precisa de
-- uma decisão, porque em algumas tabelas o efeito é só permissividade extra e
-- em outras pode haver dado antigo com user_id de quem não trabalha mais.


-- ---------------------------------------------------------------------------
-- 2. ACHADO #1 (CRÍTICA) — a política que deixa qualquer um virar admin
--
-- `CREATE POLICY "owner" ON profiles USING (auth.uid() = id) WITH CHECK (...)`
-- não tem cláusula FOR, então vale para UPDATE. A única condição de escrita é
-- a linha ser sua — a coluna `role` fica sem restrição.
--
-- `perfil_nome_e_foto.sql` criou a política certa, que prende o cargo no
-- WITH CHECK. Mas políticas são combinadas por OU: basta UMA permitir.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner" ON public.profiles;


-- ---------------------------------------------------------------------------
-- 2b. Trava no banco, independente de política
--
-- Defesa em profundidade: mesmo que alguém recrie uma política permissiva no
-- futuro — por engano, por script antigo rodado de novo — o cargo continua
-- fora do alcance de quem o carrega.
--
-- A promoção passa a exigir OUTRA pessoa, que é como deveria ser desde sempre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.impedir_autopromocao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Só interessa a mudança de cargo feita pela própria pessoa. Um admin
  -- alterando o cargo de outra passa direto, e o cadastro automático no
  -- signup também (ali auth.uid() ainda é nulo).
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND auth.uid() = NEW.id THEN
    RAISE EXCEPTION
      'Ninguém muda o próprio cargo. Peça a um administrador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_autopromocao ON public.profiles;
CREATE TRIGGER trg_impedir_autopromocao
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.impedir_autopromocao();


-- ---------------------------------------------------------------------------
-- 3. ACHADO #2 (ALTA) — indicadores financeiros sem verificação
--
-- `get_liquidity_kpis` é a única das 55 funções SECURITY DEFINER sem
-- `assert_finance_access()`. E SECURITY DEFINER ignora RLS por definição, então
-- ela lê `financial_obligations` e `obligation_payments` passando por cima da
-- proteção que existe justamente para o papel de fábrica.
--
-- O corpo abaixo é o de fix_liquidez_dias_e_ciclo.sql, sem uma vírgula de
-- diferença no cálculo — a única mudança é a primeira instrução.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_liquidity_kpis(
  p_start date,
  p_end date
) RETURNS TABLE(pmr_days numeric, pmp_days numeric, cce_days numeric, coverage_days numeric, avg_daily_outflow numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pmr numeric; v_pmp numeric; v_coverage numeric; v_avg_out numeric;
  v_dias integer;
BEGIN
  -- A LINHA QUE FALTAVA, e a unica coisa alterada nesta funcao.
  -- Todo o resto abaixo e copia exata de fix_liquidez_dias_e_ciclo.sql:
  -- o calculo nao muda em nada, so passa a exigir acesso financeiro.
  PERFORM public.assert_finance_access();

  -- CORREÇÃO 1 — contagem de dias do período.
  --
  -- Era `p_end - p_start`, que dá a distância ENTRE as datas: de 01/03 a 31/03
  -- resulta 30, não 31. Dividir a saída total por 30 em vez de 31 inflava a
  -- saída média diária em ~3%, e a cobertura em dias saía menor do que a real.
  -- Errava para o lado conservador, mas errava.
  v_dias := GREATEST(p_end - p_start + 1, 1);

  -- Prazo médio de recebimento. Lançamento informativo entra: ele representa
  -- recebimento real, só não mexeu no saldo.
  --
  -- LIMITAÇÃO CONHECIDA: só entram obrigações que JÁ FORAM PAGAS (o JOIN com
  -- obligation_payments exige pagamento). O cliente que está há 90 dias sem
  -- pagar não conta — e passa a contar, piorando o número, só no dia em que
  -- paga. Ou seja: quanto pior a inadimplência, melhor o PMR parece, porque os
  -- atrasados ficam de fora. Ler sempre junto com o total vencido em aberto.
  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmr
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'receivable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmp
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  -- Saída média diária: aqui SÓ pagamento que mexeu no caixa de verdade,
  -- senão a cobertura ficaria distorcida por lançamento informativo.
  SELECT COALESCE(SUM(op.amount) / v_dias, 0) INTO v_avg_out
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND COALESCE(op.affects_balance, true) = true
    AND op.payment_date BETWEEN p_start AND p_end;

  SELECT CASE WHEN v_avg_out > 0
    THEN (SELECT SUM(current_balance) FROM public.bank_accounts WHERE is_active) / v_avg_out
    ELSE NULL END
  INTO v_coverage;

  RETURN QUERY SELECT
    ROUND(v_pmr, 1),
    ROUND(v_pmp, 1),
    -- CORREÇÃO 2 — o que este número É, e o que ele NÃO é.
    --
    -- O Ciclo de Conversão de Caixa da bibliografia é PME + PMR − PMP, onde PME
    -- é o prazo médio de estocagem. Aqui só existe PMR − PMP: falta o PME, que
    -- exigiria giro de estoque (estoque médio ÷ CMV × dias) — dado que o app
    -- ainda não acumula.
    --
    -- Numa confecção, que compra tecido e mantém material em processo, omitir o
    -- PME SUBESTIMA o ciclo: o dinheiro fica preso mais dias do que este número
    -- diz. Ele continua útil para acompanhar a tendência (piorou ou melhorou o
    -- descompasso entre receber e pagar), mas não deve ser lido como o ciclo de
    -- caixa completo, e sim como o ciclo financeiro parcial.
    CASE WHEN v_pmr IS NULL OR v_pmp IS NULL THEN NULL
         ELSE ROUND(v_pmr - v_pmp, 1) END,
    ROUND(v_coverage, 1),
    ROUND(v_avg_out, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_liquidity_kpis(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_liquidity_kpis(date, date) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. ACHADO #3 (ALTA) — fábrica altera qualquer coluna de um pedido
--
-- A política `single_tenant_factory_update_orders` autoriza UPDATE na tabela
-- inteira, sem recortar colunas. A intenção é deixar a fábrica mover o pedido
-- de setor — e é só isso que a tela oferece. Mas `orders` guarda, nas mesmas
-- linhas, total_amount, amount_paid, discount, status e client_id.
--
-- PostgreSQL não recorta colunas dentro de uma política. A política CONTINUA
-- existindo (é ela que permite o UPDATE), e um gatilho passa a recusar tudo o
-- que não for avanço de etapa.
--
-- Optei pelo gatilho em vez de trocar por uma RPC porque a RPC exigiria mudar
-- o app junto, e esta migração precisa poder rodar sozinha, hoje, sem deploy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restringir_update_da_fabrica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Admin e gerente passam direto: a restrição é sobre o papel de chão.
  IF NOT public.is_factory() THEN
    RETURN NEW;
  END IF;

  -- O que a fábrica PODE mexer: a etapa, os itens (a baixa por item grava
  -- neles) e o carimbo de atualização. Todo o resto tem de sair igual.
  IF NEW.total_amount   IS DISTINCT FROM OLD.total_amount
  OR NEW.amount_paid    IS DISTINCT FROM OLD.amount_paid
  OR NEW.discount       IS DISTINCT FROM OLD.discount
  OR NEW.client_id      IS DISTINCT FROM OLD.client_id
  OR NEW.order_number   IS DISTINCT FROM OLD.order_number
  OR NEW.budget_id      IS DISTINCT FROM OLD.budget_id
  OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION
      'O papel de fábrica só altera a etapa de produção do pedido.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restringir_update_da_fabrica ON public.orders;
CREATE TRIGGER trg_restringir_update_da_fabrica
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restringir_update_da_fabrica();


-- =============================================================================
-- 5. DEPOIS DE RODAR — as três checagens
--
-- (a) A intrusa sumiu e as boas ficaram:
--       SELECT policyname FROM pg_policies
--        WHERE tablename='profiles' ORDER BY policyname;
--     Não pode aparecer "owner".
--
-- (b) Com uma conta de FÁBRICA, no console do navegador:
--       await supabase.from('profiles').update({role:'admin'}).eq('id', <o seu id>)
--         -> precisa dar erro
--       await supabase.rpc('get_liquidity_kpis',{p_start:'2020-01-01',p_end:'2030-01-01'})
--         -> precisa dar "Acesso financeiro negado"
--       await supabase.from('orders').update({total_amount:0}).eq('id', <um pedido>)
--         -> precisa dar erro
--
-- (c) O que NÃO pode ter quebrado, com a mesma conta de fábrica:
--       - editar o próprio nome e a própria foto
--       - mover um cartão de setor no kanban do PCP
--     E, com uma conta de admin:
--       - o painel financeiro continua carregando os indicadores
--       - alterar o cargo de OUTRA pessoa continua funcionando
--
-- SE ALGO QUEBRAR, o desfazer é curto — nenhuma das três correções apaga dado:
--       DROP TRIGGER trg_impedir_autopromocao ON public.profiles;
--       DROP TRIGGER trg_restringir_update_da_fabrica ON public.orders;
--       -- e, se realmente precisar, recriar a política antiga:
--       -- CREATE POLICY "owner" ON public.profiles
--       --   USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--       -- (mas isso reabre a escalada de privilégio — prefira me chamar)
-- =============================================================================


-- =============================================================================
-- 5. ACHADO #4 (ALTA) — as 26 políticas "owner" do modelo antigo
--
-- Descoberto ao rodar a consulta 2 da parte 1. Não estava no relatório: eu havia
-- previsto o resíduo, mas não a extensão dele.
--
-- 26 tabelas ainda carregam `USING (auth.uid() = user_id)` FOR ALL, do tempo em
-- que o sistema era multiempresa. Entre elas: bank_accounts,
-- financial_obligations, obligation_payments, invoices, transactions_table,
-- cash_snapshots, payable_accounts_table, orders, budgets, clients, products.
--
-- POR QUE IMPORTA. Políticas de RLS são combinadas por OU: basta UMA permitir.
-- `single_tenant_admin_manager_all` restringe a admin e gerente, mas a `owner`
-- ao lado dela diz "ou então a linha é sua". Sem cláusula FOR, ela vale também
-- para INSERT, e sem WITH CHECK próprio o PostgreSQL usa a mesma expressão como
-- verificação de escrita.
--
-- O EFEITO PRÁTICO: uma conta de FÁBRICA pode inserir linha em qualquer uma
-- dessas 26 tabelas carimbando o próprio user_id — e depois ler, alterar e
-- apagar essa linha à vontade. Inclusive conta bancária, título a pagar,
-- pagamento e nota. É mais amplo que o achado #3, que só tratava de quais
-- COLUNAS de um pedido a fábrica altera: aqui ela cria registro financeiro do
-- zero. Linhas já existentes só vazam se tiverem o user_id dela, o que é
-- improvável — o risco real é de escrita, não de leitura.
--
-- POR QUE DÁ PARA DERRUBAR. O laço de security_hardening_single_tenant.sql
-- criou `single_tenant_admin_manager_all` em TODAS as tabelas do schema
-- public, não numa lista escolhida a dedo. Então admin e gerente continuam com
-- acesso total por ela, e a fábrica continua com o que lhe cabe pelas
-- `single_tenant_factory_select` e `single_tenant_factory_update_orders`.
-- Derrubar a `owner` não tira acesso de ninguém que deva ter — devolve o
-- modelo pretendido.
--
-- MAS CONFIRA ANTES, em vez de acreditar em mim: a consulta abaixo é somente
-- leitura e lista, por tabela, se a política nova está mesmo lá.
-- ---------------------------------------------------------------------------
SELECT p.tablename,
       count(*) FILTER (WHERE p.policyname = 'single_tenant_admin_manager_all') AS tem_a_nova,
       string_agg(p.policyname, ', ' ORDER BY p.policyname) AS todas_as_politicas
  FROM pg_policies p
 WHERE p.schemaname = 'public'
   AND p.tablename IN (
         SELECT tablename FROM pg_policies
          WHERE schemaname = 'public' AND qual LIKE '%user_id%')
 GROUP BY p.tablename
 ORDER BY tem_a_nova, p.tablename;
-- LEIA A COLUNA `tem_a_nova`. Se vier 1 em todas as linhas, o bloco 5b abaixo é
-- seguro. Se QUALQUER linha vier 0, PARE: naquela tabela a `owner` é a única
-- coisa que dá acesso, e derrubá-la tranca todo mundo para fora dela.


-- ---------------------------------------------------------------------------
-- 5b. A derrubada — só rode depois de ler a saída acima
--
-- Não escrevi os 26 DROP na mão: a lista sai do próprio catálogo, então não tem
-- como eu errar um nome de tabela ou esquecer uma. O bloco se recusa a agir em
-- qualquer tabela que não tenha a política nova.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND qual LIKE '%user_id%'
       -- AS TRES TABELAS DO QUADRO DE NOTAS FICAM DE FORA.
       --
       -- Conferido em producao em 09/09/2026: board_notes, board_drawings e
       -- board_connections sao as UNICAS em que a politica por dono e a unica
       -- que existe — nelas nao ha single_tenant_admin_manager_all. Derruba-la
       -- trancaria todo mundo para fora do quadro.
       --
       -- E o achado #4 nao e sobre elas de qualquer forma: o risco era conta de
       -- fabrica escrevendo registro FINANCEIRO. Rascunho de quadro nao e isso.
       --
       -- Fica uma pergunta em aberto, que nao e deste arquivo: o menu descreve
       -- o quadro como "livre da equipe", e politica por user_id faz cada
       -- pessoa ver so os proprios cartoes. Ou a descricao esta errada, ou a
       -- politica esta. Vale decidir antes de mexer.
       AND tablename NOT LIKE 'board_%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = r.tablename
         AND policyname = 'single_tenant_admin_manager_all'
    ) THEN
      RAISE EXCEPTION
        'PAREI EM %: nao tem single_tenant_admin_manager_all. Derrubar a "%" ali trancaria todo mundo para fora. Rode security_hardening_single_tenant.sql antes.',
        r.tablename, r.policyname;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Politicas do modelo antigo removidas: %', n;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5c. Conferência depois — precisa vir VAZIO
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND qual LIKE '%user_id%'
   AND tablename NOT LIKE 'board_%'
 ORDER BY tablename;
-- As tres do quadro de notas continuam aparecendo numa consulta sem o filtro,
-- e e assim que tem de ser: elas nao foram esquecidas, foram poupadas.
