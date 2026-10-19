# Fábrica v3: desenho (S4)

- **Data:** 09/10/2026.
- **Branch:** `v3`.
- **Roteiro:** `2026-10-08-roteiro-v3-design.md`, S4.
- **Base:**
  - a triagem feita com o Luiz em 09/10, com 49 funções e as perguntas P1 a P4, em
    `.superpowers/brainstorm/triagem-fabrica.md`;
  - o desenho aprovado no mesmo dia ("ok").

## 1. Objetivo e regras

A Fábrica fica com a cara de Finanças, Cadastros e Vender, e com menos atrito no uso diário. Nenhuma proteção que já
existe se perde:
- as travas do Quadro: falta de estoque e ficha técnica;
- a baixa automática de estoque com aviso;
- o "travado até" do atraso registrado;
- a privacidade da fábrica: o papel `factory` e o modo fábrica não veem valores.

As regras de sempre:
- **Adaptar, não refazer.** Os painéis de hoje são o esqueleto, e nenhuma tela é reescrita do zero.
- **Visual:** só as classes de `src/components/finance/ui/estilo.ts` (CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO,
  BOTAO_*, `pilula()`), na escala de espaço de 4 a 24.
  - Saem `shadow-xl`, `animate-pulse` decorativo, `drop-shadow` e `p-6`/`gap-6` de sobra.
  - Abas e filtros curtos (até 4 opções) viram pílulas.
  - Texto longo de explicação vira ⓘ, com o `InfoTooltip` que já existe.
- **Ações por linha ou cartão:** o mesmo padrão que Vender ganhou em `d012bfb`.
  - As ações do dia a dia ficam à vista, como ícones de 40px com `aria-label` e `title`.
  - No "⋯" fica só o raro e o que apaga. Nenhuma ação some.
- **Nada no banco:** o S4 não tem SQL. Gravações só pelos caminhos que já existem
  (`useSaveInsumoMovement`, `logProduction`, `moveTo` etc.).
- **Fora do S4:**
  - Painel, Desempenho e Rendimento do corte vão para o S5.
  - Setores e capacidade já estão em Cadastros (S2).
  - A Personalização continua como 2ª aba do Estoque (P4) e só ganha o visual.

## 2. Quadro (`KanbanPanel.tsx`)

1. **Quadro vazio:** o texto "Configure na aba Capacidade & Setores" aponta para uma aba que não existe mais. Ele vira
   o botão "Cadastrar setores", que leva a Cadastros › Setores (`onIrPara('setores')`).
2. **Topo:**
   - a instrução "arraste o cartão para trocar de setor, ou o fundo para deslizar o quadro" sai da linha e vai para um
     ⓘ ao lado de "Quadro de produção por setor";
   - a legenda de cores fica;
   - os botões do topo (setas, modo fábrica, recarregar) passam a usar os tokens; o de recarregar ganha
     `aria-label="Recarregar"`.
3. **"Avisar andamento" continua em todo cartão (P1),** como hoje.
4. **Atalho "Baixa parcial" no cartão (P2):**
   - é um ícone `ClipboardCheck` ao lado de "ver pedido";
   - abre **a mesma** janela de baixa do Controle parcial;
   - essa janela sai de dentro de `ProductionControlPanel.tsx` para `components/pcp/BaixaModal.tsx`, sem mudar o que
     ela faz;
   - a janela precisa dos saldos por linha do pedido e dos setores: o Quadro carrega isso só quando o atalho é
     clicado, pelo mesmo caminho de `usePcpProduction` (sem ler tudo de todos os pedidos de antemão);
   - ao confirmar, o Quadro recarrega;
   - vale também no papel fábrica e no modo fábrica, porque a baixa não mostra valores.
5. **A mensagem "entregue" segue a mesma regra de Pedidos (item 49):**
   - hoje o Quadro lê as contas a receber só por `order_id` e ignora as contas antigas sem esse vínculo, que Pedidos
     acha pela descrição;
   - passa a ler as contas a receber do cliente (`getObligations({ client_id, type: 'receivable' })`) e entregar a
     lista a `resumirPagamentoDoPedido(contas, pedido, total)`, a mesma função e a mesma casada de Pedidos;
   - o resto não muda: falha ou `sem_conta` dá `null` (não cobra nada); fábrica e modo fábrica não leem.
   - **Limite:** uma conta antiga sem `client_id` continua de fora. O erro fica do lado seguro: a mensagem não cobra.
     Ler todas as contas a receber, como Pedidos faz, custaria uma leitura grande a cada entrega.

## 3. Controle parcial e Consumo não apurado

Só visual, com os tokens. A lista, a baixa por peça, o "Avisar entrega parcial", o "Criar ficha" e o "Marcar como
tratada" continuam iguais.

## 4. Cronograma (`CronogramaPanel.tsx`)

1. **Indicadores:** ficam três: semanas planejadas, atrasos previstos e pedidos travados.
   - "Trocas evitadas" e a comparação com o plano sem agrupar vão para o ⓘ do título, junto do texto do motor.
2. **O parágrafo do motor**, sempre aberto no rodapé, vira esse ⓘ.
3. **Aviso condicional (pendência do S1):** o aviso fixo "Plano da semana pronto? → Ver lista de compras" sai.
   - No lugar entra `Faltam N insumos para os pedidos em aberto → Ver compras`, só quando a lista de compras (filtro
     "em aberto") tem insumo em falta.
   - A conta usa o mesmo cálculo da Lista de compras (`usePurchaseList`). Se a leitura falha, o aviso não aparece.
     Nunca aparece com zero.
4. Registrar e remover atraso continuam iguais.

## 5. Lista de compras (`PurchaseListPanel.tsx`)

1. **Período:** o menu suspenso de 3 opções vira três pílulas: Em aberto · Esta semana · Próxima semana.
2. **Avisos com saída:**
   - "custo zerado" ganha o link "Abrir Estoque";
   - "produto sem ficha" ganha o link "Cadastrar ficha", que leva a Produtos.
3. **"Receber compra" (P3).** O aviso fixo "Compras chegaram? → Dar entrada no estoque", que só abria o Estoque, sai.
   No lugar entra o botão **Receber compra** (BOTAO_PRINCIPAL) no topo, ao lado de "Exportar PDF", só quando há
   insumo em falta. Ele abre a janela `components/pcp/ReceberCompraModal.tsx`:
   - **Linhas:** uma por insumo em falta, todas marcadas de início, com:
     - caixa de seleção;
     - nome e unidade;
     - **quantidade que chegou**, preenchida com "comprar" (`to_buy`);
     - **custo unitário**, preenchido com o custo médio de hoje (`unit_cost`).
   - **Edição:** você ajusta o que chegou e desmarca o que não veio.
   - **Rodapé:** "N insumos · R$ total". O botão **Dar entrada em N** fica desabilitado com zero marcados ou com erro.
   - **Validação:** cada linha marcada pede quantidade > 0 e custo > 0, a mesma regra da entrada de hoje, que refaz o
     CMV. Um insumo com custo zerado no cadastro vem com o campo de custo vazio e destacado.
   - **Gravação:** uma entrada por insumo, pelo mesmo `useSaveInsumoMovement` da janela de entrada de hoje, com a
     observação `Recebimento da lista de compras dd/mm/aaaa`. Não cria conta a pagar.
   - **Falha no meio:** as linhas já gravadas saem da janela, as outras ficam com o erro, e "tentar de novo" só regrava
     o que faltou. Nunca entra em dobro.
   - **Fim:** toast `N entradas lançadas`. A lista de compras recarrega.
   - **Conta pura:** fica em `src/utils/fabrica/recebimento.ts`, com testes:
     - `linhasParaReceber(lines)` monta as linhas a partir de `PurchaseLine[]` (só as `is_shortage`);
     - `validarRecebimento(linhas)` devolve o erro por linha e se dá para gravar;
     - `totalDoRecebimento(linhas)` soma só as linhas marcadas.

## 6. Estoque (`Inventory.tsx` e `components/inventory/*`)

1. **Abas** Insumos e Personalização: viram pílulas. As subabas da Personalização também.
2. **Indicadores:**
   - "Estoque crítico" deixa de piscar;
   - clicar nele filtra só os insumos no mínimo ou abaixo, e clicar de novo tira o filtro;
   - o filtro aparece como pílula ativa ao lado das categorias.
3. **Barra:** a busca usa CAMPO, e "Novo insumo" e "Novo tecido" usam os botões dos tokens.
4. **Ações por linha:**
   - **Entrada** e **Saída** ficam à vista, como ícones de 40px com `aria-label`;
   - **Editar** e **Excluir** vão para o "⋯";
   - **Mesclar** continua dentro de Editar, onde está hoje.
5. A linha expandida (observações, histórico de compras e preço no tempo), o novo tecido e a janela de entrada e saída
   continuam iguais, só com os tokens.
6. A Personalização (tabela de preços, artes, histórico, notas, "a minha tabela ainda vale?") só ganha o visual.

## 7. Testes e conferência

- **Testes novos (`node --test`):**
  - `recebimento.ts`: linhas a partir da lista, validação por linha (zero, vazio, custo zerado), total só dos
    marcados;
  - a regra do aviso condicional do Cronograma: mostra com falta, não mostra com zero nem com leitura falha.
- A suíte (1416) e `tsc` continuam limpos.
- **Conferência no navegador** com o usuário de teste, em 1440, 1024 e 390, sem gravar nada que não seja pedido:
  - Quadro: o atalho de baixa abre a janela certa; o quadro vazio leva a Setores; o modo fábrica não mostra valor;
  - Cronograma: aviso só com falta;
  - Lista de compras: pílulas; Receber compra preenchido (a gravação fica para o Luiz confirmar);
  - Estoque: "crítico" filtra; Entrada e Saída à vista; "⋯" com Editar e Excluir;
  - nenhuma tela rola para o lado.
- **Comparação v2 × v3 publicada:** Quadro, Lista de compras e Estoque.

## 8. Inventário (a triagem, item por item)

| Itens da triagem | Destino |
|---|---|
| 1–3, 6–11, 13 (Quadro) | continuam |
| 4 Avisar andamento no cartão | continua (P1) |
| 5 Instrução no topo | vira ⓘ (§2.2) |
| 12 Quadro vazio | leva a Cadastros › Setores (§2.1) |
| 14–17 Controle parcial | continuam, e o Quadro ganha o atalho (P2, §2.4) |
| 18–19 Consumo não apurado | continuam (só visual) |
| 20, 22–24 Cronograma | continuam |
| 21 Indicadores | três à vista, "trocas evitadas" no ⓘ (§4.1) |
| 25 Parágrafo do motor | vira ⓘ (§4.2) |
| 26 Aviso fixo | vira aviso condicional (§4.3) |
| 27 Período em menu suspenso | vira pílulas (§5.1) |
| 28–31 Lista de compras | continuam, avisos com saída (§5.2) |
| 32 "Dar entrada no estoque" | vira Receber compra (P3, §5.3) |
| 33 Indicadores do Estoque | sem piscar; "crítico" vira filtro (§6.2) |
| 34–37, 39–41 Estoque | continuam |
| 38 Quatro ícones por linha | Entrada e Saída à vista, Editar e Excluir no ⋯ (§6.4) |
| 42–46 Personalização | continua no Estoque, só visual (P4) |
| 47–48 Pendências do S1 | §4.3 e §5.3 |
| 49 Pendência do S3 | §2.5 |
