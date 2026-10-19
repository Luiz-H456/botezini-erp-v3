-- =============================================================================
-- FINANCEIRO — custo do produto (CPV) na categoria
-- Rode no SQL Editor do Supabase.
--
-- Por que existe: o Dashboard precisa saber quais gastos entram no Custo dos
-- Produtos Vendidos para calcular lucro bruto e EBITDA. Até aqui ele decidia
-- assim:
--
--     (centro de custo == 'produção')  OU  (nome da categoria contém "materia prima")
--
-- Os dois lados são frágeis. O primeiro obrigava a preencher centro de custo em
-- TODO lançamento para alimentar um único `if` — nenhum relatório somava por
-- centro de custo, e a lista de categorias dentro do centro não era lida por
-- lugar nenhum. O segundo adivinha pelo texto: "Tecido" e "Aviamento" são CPV e
-- não contêm "materia prima", então ficavam de fora e o lucro bruto saía alto.
--
-- Marcar na CATEGORIA resolve os dois: são ~20 categorias classificadas uma vez,
-- e toda conta nova já nasce certa. Mesmo raciocínio da natureza fixo/variável.
--
-- Por que é uma coluna separada de `natureza`: são eixos diferentes e não
-- coincidem. Comissão de vendedor é VARIÁVEL (cresce com a venda) e NÃO é CPV
-- (é despesa comercial, não custo da peça). Tecido é variável E é CPV. Uma
-- coluna só forçaria escolher qual das duas perguntas responder.
--
-- Default false e não nulo: "não marcado" é uma resposta — a maior parte das
-- categorias não é custo de produto. Diferente da natureza, aqui não existe o
-- caso em que a dúvida muda o resultado: se estiver errado, aparece no lucro
-- bruto do mês seguinte e se corrige com um clique.
-- =============================================================================

ALTER TABLE public.global_categories
  ADD COLUMN IF NOT EXISTS custo_do_produto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.global_categories.custo_do_produto IS
  'Gasto desta categoria entra no CPV (custo dos produtos vendidos): matéria-prima, '
  'tecido, aviamento, mão de obra direta. Alimenta o lucro bruto do Dashboard.';

-- Semeadura pelo que o código já adivinhava, para o Dashboard não mudar de
-- número na virada. Só toca em quem ainda está com o default.
--
-- `translate` em vez de `unaccent`: a extensão unaccent não vem habilitada por
-- padrão no Supabase, e ligar uma extensão inteira para resolver um LIKE seria
-- desproporcional — ainda mais porque ela cai num schema próprio e a chamada
-- passaria a exigir `extensions.unaccent`, quebrando de novo em outro ambiente.
-- translate é SQL puro e roda em qualquer instalação.
UPDATE public.global_categories
   SET custo_do_produto = true
 WHERE domain = 'finance'
   AND custo_do_produto = false
   AND (
        translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE '%materia prima%'
     OR translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE '%materia-prima%'
     OR lower(name) LIKE '%tecido%'
     OR lower(name) LIKE '%aviamento%'
     OR lower(name) LIKE '%insumo%'
     OR lower(name) LIKE '%malha%'
   );

NOTIFY pgrst, 'reload schema';
