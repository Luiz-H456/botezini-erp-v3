# Financeiro v3 — desenho

Data: 06/10/2026 · Branch: `v3` · Pasta: `Documentos\botezinipvd-v3`
Origem: brainstorm com o Luiz (triagem de 42 funcionalidades em
`.superpowers/brainstorm/triagem-financeiro.md`; telas aprovadas em
`.superpowers/brainstorm/12202-1791290767/content/financeiro-stripe-v2.html` e
`financeiro-paginas.html`).

Primeiro módulo do reajuste total do ERP. Comercial e Fábrica vêm depois, cada um
com o seu desenho.

---

## 1. Objetivo

Um financeiro fácil de usar, em que cada tela responde **uma** pergunta e tudo se
amarra sozinho ao resto do sistema. Não é ter mais funções: é cada função ter lugar
e limite claros.

**Quem usa:** só o Luiz. **Quando:** uma vez por semana, na segunda, para dar baixa,
lançar contas, cobrar clientes e conferir com o banco. No resto da semana o sistema
se alimenta dos pedidos.

**Critérios de sucesso**

1. Ao abrir o Financeiro, sem clicar em nada, estão respondidas: quanto tenho de
   verdade · o que vence (a pagar e a receber) · quem está atrasado · se fecho o mês
   no azul.
2. Parcela de pedido não entregue nunca aparece como "a receber" nem como
   "atrasada". Na base da v3 de 06/10, as 12 parcelas falsamente atrasadas
   (R$ 35.802,05) somem do atraso; o vencido a receber liberado fica em 8 parcelas,
   R$ 28.552,35. **Vencido** = vencimento anterior a hoje e saldo em aberto > 0 —
   inclui a conta paga em parte (o `derived_status` do banco a chama de `partial`, e
   por isso uma contagem só por `overdue` dá 7 parcelas e R$ 28.038,75).
3. Toda função que continua (seção 8) é alcançável em no máximo dois cliques a partir
   da página onde ela mora.
4. Nenhuma tela do Financeiro mostra o mesmo número em dois lugares com nomes
   diferentes.

## 2. Princípios de desenho (das referências)

| Princípio | Referência |
|---|---|
| Menu lateral por **tarefa**, não por tabela do banco; título da página com uma única ação principal | Stripe |
| Cada bloco responde uma pergunta e carrega a própria ação | Xero |
| Cor contida: sem vermelho no painel; vencido em âmbar; cinza para o que é só informativo | Mercury |
| O número principal é o **livre** (saldo − reservado) | YNAB |
| Saldo projetado até o fim do mês como uma linha | Monarch |
| Contas a receber nascem da venda; cobrança a partir delas | Conta Azul |

Regra de corte: a informação só fica numa página se ajuda a responder a pergunta
daquela página.

## 3. Navegação

A seção **Finanças** do menu passa a ter quatro páginas, nesta ordem:

| Página | Pergunta | Substitui |
|---|---|---|
| Visão geral | O que eu preciso fazer com o dinheiro agora? | `Finance.tsx` e a aba de Recebíveis "disparar" |
| Resultado do mês | A empresa deu lucro, quanto vendeu, e para onde foi o dinheiro? | abas "DRE Gerencial" e "Saúde do Caixa" do Início |
| Caixinhas | Quanto do que está no banco já tem destino? | `EnvelopesPanel` |
| Clientes que devem | Quem eu cobro, e quanto cada um ainda vai pagar? | abas de `ReceivablesControlPanel` |

`ReceivablesControlPanel` deixa de existir como tela. As views `receivables`,
`finance` e `envelopes` de `utils/navegacao.ts` dão lugar às quatro acima; a página
inicial da seção é a Visão geral.

Cadastro de bancos e "Sincronizar saldos" vão para **Cadastros > Bancos**.
Score do cliente e o aviso de "peça sem custo na ficha" vão para o **Comercial**
(desenhados no módulo Comercial; até lá, saem do Financeiro sem perder o motor).

## 4. Páginas

### 4.1 Visão geral

De cima para baixo:

1. **Livre para usar** — `Σ saldo dos bancos ativos − Σ saldo das caixinhas`.
   Linha de baixo: "R$ X nos bancos − R$ Y nas caixinhas". Pode ser negativo; aí o
   número fica em âmbar.
2. **Fecha <mês> com** — livre para usar hoje
   `+ Σ a receber com vencimento até o último dia do mês`
   `− Σ a pagar com vencimento até o último dia do mês`.
   Só entram parcelas **liberadas** (seção 5.1). Ao lado, a linha do saldo dia a dia
   até o fim do mês. Legenda fixa: "só pedidos já entregues".
3. **Quatro números numa faixa** — a receber vencido · a receber nos próximos 7
   dias · a pagar vencido · a pagar nos próximos 7 dias. "Próximos 7 dias" = de hoje
   até hoje + 6, sem contar o vencido. Clicar num número **filtra a lista** (item 6);
   clicar de novo limpa. Nenhum dos quatro repete itens da lista.
4. **Bancos numa linha** — nome, saldo do sistema e situação: "✓" quando não há
   pagamento por conferir naquele banco; "N a conferir" caso contrário. Clicar abre a
   janela **Conferir banco** (5.6).
5. **Barra de filtro** — os filtros básicos de hoje continuam (período com setas,
   pagar/receber, filtros rápidos, busca), mais cliente, categoria e banco vindos da
   gaveta avançada. Uma linha diz o que está filtrado ("Mostrando a receber vencido ·
   4 contas · limpar").
6. **Lista de contas** — uma lista única por data (agrupada por dia; no filtro de
   vencidos, por "venceu há N dias"). Cada linha: descrição, parcela, origem (pedido
   ou categoria), valor com sinal (+ verde para entrar, − neutro para sair) e a ação
   **Recebi** ou **Paguei**. Clicar na linha abre a **Conta** (5.5). O modo em duas
   colunas (receber | pagar) continua disponível num botão discreto: a lista por data
   é o padrão.
7. **Nota de pedidos em produção** — "R$ X de pedidos em produção não aparecem aqui ·
   entram quando o pedido for entregue". Só aparece quando X > 0.

Ação principal do título: **+ Nova conta** (5.4).

### 4.2 Resultado do mês

Seletor de período **Mês | Trimestre** (pedido do Luiz em 06/10: "quero ver lucro e
resultado trimestral também"), com as setas andando um mês ou um trimestre civil
(jan–mar, abr–jun, jul–set, out–dez), e botão **Exportar PDF** no título. Tudo o que
segue vale para o período escolhido, e a comparação é com o período anterior do mesmo
tamanho.

Duas métricas, cada uma com o seu regime (decisão do Luiz):

**a) Caixa do mês — o dinheiro que entrou e saiu.** Regime de caixa: conta cada
pagamento pela `payment_date`, estornos descontados, lançamentos informativos
(`affects_balance = false`) fora.

| Linha | Conta |
|---|---|
| Entrou | Σ recebimentos no mês |
| − impostos | pagamentos cuja categoria contém "impostos" |
| − custo das peças | pagamentos de categoria global marcada `custo_do_produto`, ou cujo nome contém "matéria-prima" |
| = Sobrou da produção | e o % sobre "Entrou" |
| − despesas da empresa | demais pagamentos, exceto os financeiros |
| − juros e tarifas | categoria contém "tarifas bancárias", "juros" ou "financeir" |
| **= Lucro de caixa** | com a comparação com o mês anterior (valor e %) |

É o mesmo mapeamento do DRE de hoje (`Dashboard.tsx`, `dreData`: `normalizeCategoryName`
+ `custo_do_produto`), extraído para uma função pura (seção 7). O que muda é a data:
hoje o DRE soma por `due_date` da conta (o pago pelo valor pago, o aberto pelo valor
original); o caixa do mês soma **pagamentos** por `payment_date`.

**b) Vendas do mês — o que foi entregue.** Conta pelo mês da entrega
(`orders.delivered_at`, seção 6): número de pedidos entregues, peças, valor total
vendido e, abaixo, "recebido antecipado de pedidos ainda não entregues" (os
adiantamentos, informativo).

**c) Para onde foi o dinheiro** — barras horizontais por categoria de saída no
regime de caixa, maior para menor, até 6 categorias + "Outros". Clicar numa barra
abre a Visão geral filtrada por aquela categoria e pelo mês.

Sai: estrutura de custos, ponto de equilíbrio, EBITDA e as 9 linhas contábeis.

### 4.3 Caixinhas

No topo: **Livre para usar** (o mesmo número da Visão geral, mesmo nome), **Nas
caixinhas** e **Nos bancos**. Ação do título: **+ Nova caixinha**.

Uma linha por caixinha: nome · regra ("guarda N% de cada recebimento" quando
`auto_fund_pct` > 0, senão "manual") · saldo · barra de meta quando `target_amount`
existe ("40% de 12.000") · ações **guardar**, **tirar**, **extrato**. Transferir entre
caixinhas mora dentro do extrato.

O formulário da caixinha fica com: nome, finalidade, regra de % e meta. **Prazo da
meta** (`target_date`) e **saldo mínimo** (`min_balance`) saem da tela; as colunas
ficam no banco.

O provisionamento manual por "valor-base" sai: vira a sugestão dentro do Recebi
(5.2).

### 4.4 Clientes que devem

Tabela, um cliente por linha, só clientes com algo em aberto:

| Coluna | Conta |
|---|---|
| Cliente | e "mais antigo: N dias" (ou "nada vencido") |
| Vencido | Σ parcelas liberadas vencidas, em âmbar |
| A vencer | Σ parcelas liberadas a vencer |
| Em produção | Σ parcelas de pedidos não entregues, em cinza — informativo |
| Ação | **Cobrar** quando há vencido: monta a mensagem de WhatsApp com o que está vencido (texto que já existe em `mensagensCliente`) |

Ordem: maior atraso primeiro; depois maior valor a vencer. Clicar no cliente abre a
Visão geral filtrada por ele. Não guarda registro de cobrança (decisão do Luiz).

## 5. Janelas

### 5.1 Confirmar entrega (nova regra das parcelas)

**Regra:** uma parcela a receber ligada a pedido fica **aguardando entrega**
enquanto o pedido não estiver `Entregue`. Aguardando entrega não é "a receber", não é
"atrasada", não entra na projeção do mês nem no vencido de ninguém. Ela continua
aceitando baixa a qualquer momento (entrada, sinal): o dinheiro entra no banco e
aparece em "recebido antecipado" (4.2 b).

**Quando abre:** em todo caminho que leva o pedido a `Entregue`. Hoje o único é o
kanban do PCP (`usePcpKanban.requestDelivery` / `confirmDelivery`); a janela substitui
a confirmação simples que existe ali.

**Conteúdo:** as parcelas do pedido — as já pagas com "✓ recebida"; as em aberto com
valor, vencimento e meio editáveis, já preenchidos com o plano atual. Embaixo, a soma
contra o total do pedido.

**Trava:** se as parcelas não fecham com o total do pedido (diferença ≥ R$ 0,01), o
botão **Confirmar entrega** fica desabilitado e mostra a diferença ("faltam R$ 300").
Isso substitui o aviso de "pedido que não bate" (item 31) para pedidos novos.

**Modo fábrica:** o quadro do PCP também roda no monitor do chão de fábrica (papel
`factory`, e a tela cheia do kanban), onde valores não aparecem e as funções do
financeiro recusam acesso (`assert_finance_access`). Ali a janela é só a confirmação
simples de hoje, sem valores e sem editar parcelas: o pedido vira `Entregue` com o
plano que já existe, e as parcelas são liberadas como estão.

**Parcelas que travam:** `revise_order_plan` cancela e recria só as parcelas **sem
pagamento ativo**; a que tem qualquer pagamento (inteira ou parcial) é preservada com
o valor original. Por isso a janela mostra essas como fixas, e a soma que precisa
fechar é `Σ original das preservadas + Σ parcelas editáveis = total do pedido`
(total relido do banco na hora de abrir).

**Ao confirmar, em ordem:**
1. se as parcelas editáveis mudaram em relação às abertas de hoje (valor, vencimento
   ou meio), grava com `revise_order_plan`; se não mudaram, não regrava;
2. se o pedido não tem nenhuma conta a receber, cria pelo plano informado (assume o
   papel de `ensureReceivableForDeliveredOrder`, agora com o total relido do banco);
3. marca o pedido como `Entregue` e grava `delivered_at` = hoje.

Se qualquer passo falhar, nada é marcado como entregue e a janela mostra o erro.

### 5.2 Recebi / Paguei (baixa)

Abre já preenchida: valor = restante da parcela, data = hoje, banco = o banco do
pagamento mais recente do mesmo tipo (recebimento ou pagamento); sem histórico, o
primeiro banco ativo. Confirmar é um clique.

No Recebi, se existem caixinhas com `auto_fund_pct` > 0, aparece **uma** linha por
caixinha: "Guardar R$ X em Impostos (15%)? sim · não". "Sim" grava o movimento na
caixinha junto com a baixa.

"+ mais opções" abre, no mesmo lugar: valor diferente (baixa parcial) · quitar com
desconto · anexar comprovante · já recebido antes do ERP (não mexe no saldo) ·
anotação · método.

Saem: os atalhos "pagar 50%" e "pagar o restante" (o restante é o padrão).

### 5.3 Conferir banco

Para um banco: saldo do sistema; campo para digitar o saldo do extrato; se bate,
"✓ bate com o extrato". Abaixo, os pagamentos daquele banco ainda não conferidos,
cada um com **conferido** e **desfazer** (desfazer pede o motivo, como hoje).

### 5.4 Nova conta

Visível: pagar ou receber · descrição · valor · vencimento · fornecedor/cliente ·
categoria. Em "mais opções": parcelas · repetir todo mês por N meses · observações.
Continua criando cliente, fornecedor ou categoria sem sair do formulário.
**Divisão entre centros de custo** fica fora (aguarda).

### 5.5 Conta (detalhe de uma conta)

Dados da conta, histórico de pagamentos e anexos. Ações: **Recebi/Paguei** ·
**Corrigir** (valor em % ou R$, vencimento por dia do mês ou deslocamento, nesta e
nas seguintes — o `EditarContaModal` de hoje) · **Cancelar conta** · **Estornar** um
pagamento · anexar, ver e remover comprovante.

## 6. Mudanças no banco

Todas escritas em `supabase/`, testadas primeiro no banco local da v3, entregues ao
Luiz para rodar em produção na ordem. Regra pétrea: eu não rodo nada em produção.

1. **`orders.delivered_at date`** (nova coluna, nula). Preenchimento das 22 entregues
   de hoje: `updated_at::date`, **aproximação** — não há registro de quando cada uma
   foi entregue (`audit_logs` está vazio). O arquivo lista as 22 para o Luiz corrigir
   à mão, se quiser.
2. **`obligation_summary`** ganha a coluna **`awaiting_delivery boolean`**: verdadeira
   para conta a receber com `order_id` cujo pedido não está `Entregue`. O
   `derived_status` **não muda**.
   *Por que coluna e não status novo:* `reverse_payment` e
   `register_informational_payment` copiam `derived_status` da view para
   `financial_obligations.status` (`SET status = (SELECT derived_status …)`). Um status
   novo seria gravado na tabela — não há CHECK que o barre — e passaria a existir para
   todo código que lê `status`. A coluna à parte não vaza.
3. Funções que somam o que falta receber passam a ignorar `awaiting_delivery`
   (varredura no banco da v3, 06/10, de toda função que lê `derived_status` ou soma
   receber em `obligation_summary`):
   - `get_cash_position` — `total_receivable`;
   - `get_client_receivables` — vencido e a vencer por cliente passam a ignorar as
     `awaiting_delivery` (a coluna "em produção" da página 4.4 é calculada no
     aplicativo, a partir de `obligation_summary`; mudar o tipo de retorno da função
     exigiria derrubá-la e recriar as permissões, sem ganho);
   - `get_aging_buckets` — aguarda na tela, mas não pode contar errado enquanto
     existir.
   Não mudam: `get_cashflow_series` (soma pagamentos realizados, não parcelas),
   `get_client_score` (já filtra pedido entregue), `reverse_payment` e
   `register_informational_payment` (não somam).
4. Remoção de `'Concluído'` de `get_pending_installments` e `get_delivered_unpaid`
   (`o.status IN ('Concluído', 'Entregue')`) — nenhum pedido está nesse status na base
   de 06/10.

`get_client_score` já ignora pedido não entregue; não muda.

## 7. Código

- **Páginas novas** em `src/pages/financas/`: `VisaoGeral.tsx`, `ResultadoDoMes.tsx`,
  `Caixinhas.tsx`, `ClientesQueDevem.tsx`. Nenhuma passa de ~300 linhas; o que for
  conta vai para `utils/`.
- **Funções puras com teste** (`node --test`), sem React nem Supabase:
  - `numerosDaVisaoGeral.ts` — livre, os quatro números, a nota de produção;
  - `projecaoDoMes.ts` — série dia a dia e o "fecha o mês com";
  - `caixaDoMes.ts` — as linhas de 4.2 a), a partir de pagamentos e categorias
    (extrai e substitui o `dreData` de `Dashboard.tsx`);
  - `vendasDoMes.ts` — 4.2 b);
  - `sugestaoDeCaixinha.ts` — o que sugerir no Recebi;
  - `parcelasDaEntrega.ts` — soma, diferença e trava da Confirmar entrega.
- **Reaproveita** os repositórios e hooks de hoje (`financeRepository`,
  `useEnvelopes`, `usePaymentModal`, `EditarContaModal`, `PaymentModal` enxuto,
  `ObligationForm` enxuto).
- **Sai**: `pages/Finance.tsx`, `ReceivablesControlPanel.tsx`, `CashSimulator.tsx`,
  `SaudeDoCaixaPanel.tsx`, o painel de liquidez, presets e visões salvas
  (`finance_filter_state` no localStorage).
- `OrderStatus.COMPLETED` sai do enum, dos filtros, das cores e de `finance.ts`.

## 8. O que continua, mescla, sai e aguarda

A tabela completa, com os 42 itens, é `triagem-financeiro.md`. Resumo:

- **Continua (16):** DRE (em palavras simples), gráfico por categoria, nova conta,
  criar sem sair, corrigir em série, cancelar, anexos, dar baixa, lançamento
  informativo, estorno, recebíveis por cliente, caixinhas, meta da caixinha, filtros
  básicos, PDF, vencendo em 7 dias.
- **Mescla (16):** caixa hoje → livre; atrasados → os quatro números; fluxo líquido e
  gráfico de fluxo → projeção; saúde do caixa → projeção e Comercial; cartões do
  Início → categorias; baixa com desconto → baixa; conciliar → Conferir banco; bancos
  e sincronizar → Cadastros; entregues em aberto → a receber; adiantamentos → vendas
  do mês; pedido que não bate → trava da entrega; score → Comercial; provisionar % →
  sugestão no Recebi; filtros avançados → filtros básicos.
- **Sai (6):** painel de liquidez, recebíveis por meio de pagamento, atalhos de
  50%, presets e visões salvas, simulador, status "Concluído".
- **Aguarda (3):** faixas de atraso 30/60/90, divisão de custo, decisão final entre
  lista e colunas (a lista é o padrão; colunas continua como opção).
- **Regra nova (1):** "disparar parcelas de pedidos entregues" vira a janela
  Confirmar entrega (5.1).

## 9. Testes e verificação

- Teste unitário para cada função da seção 7, com os casos: pedido não entregue com
  parcela vencida (não conta), entrada paga antes da entrega (conta no caixa, não em
  vendas), estorno (desconta), lançamento informativo (fora do caixa), mês sem
  movimento, caixinhas maiores que o saldo (livre negativo).
- Verificação na v3: os números da Visão geral batem com a consulta SQL de
  conferência do plano, rodada no mesmo dia (eles mudam com a data). Em 06/10:
  vencido a receber R$ 28.552,35 (8 parcelas); em produção R$ 51.038,40 (20
  parcelas, das quais 12 vencidas somam R$ 35.802,05); o livre bate com
  `get_envelope_overview().free`.
- A suíte atual (1.310 testes) continua passando.
- Conferência visual no navegador em 1440, 1024 e 390 px de largura, sem rolagem
  horizontal.

## 10. Fora deste desenho

Início (será redesenhado com os outros módulos), Comercial (recebe score e aviso de
margem), PCP (recebe só a janela Confirmar entrega), cadastro de bancos em Cadastros
(só muda de lugar).
