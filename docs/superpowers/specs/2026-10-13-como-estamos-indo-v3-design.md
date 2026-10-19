# Como estamos indo v3: desenho (S5)

- **Data:** 13/10/2026.
- **Branch:** `v3`.
- **Roteiro:** `2026-10-08-roteiro-v3-design.md`, S5.
- **Base:** a triagem em `.superpowers/brainstorm/triagem-como-estamos-indo.md`, com 23 funções e as respostas do
  Luiz de 13/10 (P1 a P4, D19 e D22).

## 1. Objetivo e regras

O que entra:
1. A Saúde do caixa volta. Hoje ela só existe no `Dashboard.tsx` velho, fora do menu, e não é alcançável.
2. O Resultado ganha:
   - a meta de faturamento (período e ano);
   - o aviso de margem baixa;
   - a vista "DRE".

As regras são as de sempre:
- **Adaptar, não refazer:** `SaudeDoCaixaPanel` e `Resultado.tsx` são o esqueleto.
- **Visual:** `estilo.ts`.
- **Banco:** nada. A meta (`revenue_goal`) e a margem alvo (`target_margin`) já existem em `company_profile`.
- **Contas:** em funções puras, com testes `node --test`.
- **Privacidade:** o papel fábrica não alcança Dinheiro nem Resultado, e nada novo vai para as telas dele.
- **Interface:** nenhuma ação some; ícones e botões seguem o padrão da rodada de 10/10.

## 2. Saúde do caixa em Dinheiro (P1)

- **Onde fica:** nova aba **Saúde do caixa** em Dinheiro.
  - O item é a view `'saude-caixa'`, com o rótulo "Saúde do caixa", logo depois de "Caixinhas".
  - A aba mostra o `SaudeDoCaixaPanel` de hoje, com o visual do `estilo.ts`.
- **Conta extraída:** a previsão de movimentos sai de `useSaudeDoCaixa` para uma função pura,
  `movimentosPrevistos(obrigacoes, pagamentos, inicio)` em `src/utils/financas/projecao.ts`. A conta é a mesma:
  - contas em aberto;
  - recebimento previsto pelo comportamento do cliente (`comportamentoPorCliente` e `preverRecebimentos`);
  - conta vencida move "hoje".
- **Quem usa:** o hook e o Início passam a usar essa função, e a projeção dos dois fica igual.

## 3. Aviso no Início (P1)

- **A linha:** a fila do Início, objetivo Dinheiro, ganha a linha urgente
  `Caixa fica negativo em dd/mm (−R$ X)` → abre a aba Saúde do caixa.
- **A conta:**
  - projeção de hoje até hoje + 30 dias, com `projetarSaldo`;
  - mesmo saldo de partida e mesmos movimentos da aba;
  - `primeiroDiaNegativo(pontos)` devolve o 1º dia com saldo < 0 e esse saldo, ou `null`.
- **Leitura que falha:** sem linha. Nunca aparece com saldo positivo.

## 4. Resultado: meta, margem e DRE (P2, P3, P4)

1. **Meta × realizado**, no topo:
   - **Realizado:** o "Vendido (pela entrega)" do período (`vendasDoPeriodo(...).vendido`), o mesmo número do 4º
     indicador.
   - **Meta do período:** `revenue_goal` × nº de meses do período (mês = 1, trimestre = 3).
   - **Segunda barra, acumulado do ano:** de janeiro até o mês da tela, contra `revenue_goal` × nº de meses.
   - **Texto de cada barra:** `R$ X de R$ meta · N%`, em verde a partir de 100%.
   - **Sem meta cadastrada:** em vez da barra, uma linha "Defina a meta em Cadastros › Minha empresa" com link.
   - A conta fica em `metaDoPeriodo(...)`, pura.
2. **Margem baixa:**
   - aparece quando `caixa.percentualDaProducao < target_margin`, com o que entrou > 0 e a margem alvo > 0;
   - é um aviso âmbar: `Sobrou da produção N% — abaixo da margem alvo de M% (Minha empresa)`.
3. **Vista DRE:**
   - pílulas **Caixa | DRE** no bloco "Caixa do mês";
   - DRE é o mesmo período em formato contábil, por `linhasDoDre(caixa)`:
     - RECEITA BRUTA;
     - (−) Impostos → (=) RECEITA LÍQUIDA;
     - (−) Custo das peças (CPV) → (=) LUCRO BRUTO;
     - (−) Despesas operacionais → (=) RESULTADO OPERACIONAL;
     - (−) Despesas financeiras → (=) LUCRO LÍQUIDO;
     - cada linha com o % da receita;
   - **Exportar PDF** exporta a vista que está na tela.

## 5. Dashboard velho (D19, D22)

"Visão geral" e "Produtos & mercado" saem. Com a Saúde do caixa e o DRE realocados, o `Dashboard.tsx` velho fica
sem nenhuma função própria. O arquivo é removido no S6.

## 6. Testes e conferência

- **Testes novos:**
  - `projecao.ts`: movimentos, vencido move "hoje", 1º dia negativo, nenhum negativo → null;
  - `metaDoPeriodo`: mês, trimestre, ano, sem meta;
  - `linhasDoDre`: totais e %.
- **Testes de hoje:** a suíte e os tipos continuam limpos.
- **Navegador** (1440, 1024 e 390, sem gravar):
  - a aba Saúde do caixa aparece;
  - a linha no Início só aparece com negativo;
  - meta, aviso de margem e DRE aparecem no Resultado.
- **Comparação v2 × v3** publicada.
