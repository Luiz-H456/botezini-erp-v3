# Cadastros v3 — desenho (S2)

Data: 08/10/2026 · Branch: `v3` · Roteiro: `2026-10-08-roteiro-v3-design.md`, S2.
Base: a triagem feita com o Luiz em 08/10 (60 funções, perguntas P1 a P8) e o desenho aprovado no mesmo dia.

## 1. Objetivo e regras

Arrumar a base antes de Vender (S3) e Fábrica (S4). O resultado esperado:
- Cadastros fácil de achar e de manter;
- nenhuma função sumindo sem decisão;
- os números que aparecem em dois lugares batendo entre si.

As regras do roteiro valem aqui também:
- **Adaptar, não refazer.** `MasterData.tsx` e as telas de `pages/masterdata/*` são o esqueleto. Nenhuma tela é
  reescrita do zero.
- **Visual:**
  - classes de `src/components/finance/ui/estilo.ts` e o componente `Indicador`;
  - escala de espaço de 4 a 24;
  - vencido em rosa e ação principal em âmbar.
- **Banco:**
  - só o banco local da v3;
  - o SQL da seção 7 é escrito e testado por mim e rodado pelo Luiz;
  - a tela funciona antes de o SQL rodar.
- **A v2 de referência** (porta 5176) continua de pé.
- **Atalho nunca esconde nuance:** o que sai da vista fica a um clique ou tem um "sai" escrito na seção 4.

## 2. Navegação: o fichário

**Cadastros abre num fichário.** São 8 cartões numa grade de 2 colunas no computador e 1 no celular. Cada cartão
tem o nome, a contagem e o que pede atenção:

| Cartão | Contagem | Pede atenção (em âmbar; rosa se for problema de dinheiro) |
|---|---|---|
| Clientes | nº de clientes | "N sumidos" (dormentes) |
| Produtos | nº de produtos | "N sem ficha técnica" |
| Fornecedores | nº de fornecedores | — |
| Bancos | nº de bancos ativos | "N não batem" (rosa) |
| Setores | nº de setores | "gargalo X pç/semana" (informativo, sem cor) |
| Minha empresa | — | "meta sugerida R$ X" quando houver sugestão diferente da meta gravada |
| Categorias | nº de categorias financeiras | "N não revisadas" |
| Mensagens | nº de modelos | — |

**Cada cartão abre a tela dele.** O topo da tela tem "← Cadastros" e o nome do cartão. Não há barra de passos:
Cadastros é apoio, não um fluxo.

**Código da navegação (`src/utils/navegacao.ts`):**
- **Views novas:**
  - `cadastros`, que é o fichário;
  - `clientes`, `fornecedores`, `produtos`, `bancos`, `setores`, `empresa`, `categorias` e `mensagens`.
  - Ganham rótulo em `ROTULO_DA_VIEW` e ícone em `ICONE_DA_VIEW`.
- **`SECOES.cadastros.views` passa a ser `['cadastros']`.** As 8 views dos cartões ficam numa lista nova,
  `CARTOES_DO_FICHARIO`. `secaoDaView` também devolve `cadastros` para elas, então o menu acende Cadastros.
- **Aliases:** `masterdata` → `cadastros` e `capacidade` → `setores`. Links antigos continuam abrindo.
- **Testes:**
  - "nenhuma seção passa de 3 passos" continua valendo para `SECOES[*].views`; o fichário não entra nessa conta;
  - "toda view tem dono" passa a aceitar as views de `CARTOES_DO_FICHARIO`.
- **O contador do menu em Cadastros** segue a regra do S1: é o número de linhas da fila do Início naquela
  seção (ver seção 6).

**Aberturas** (o mesmo padrão do S1: um objeto simples que a tela consome e limpa):
- `clientes` com `{ clienteId }` abre direto a página do cliente;
- `clientes` com `{ dormentes: true }` abre a lista com os dormentes expandidos;
- `produtos` com `{ completude: true }` abre Produtos rolado até o painel de Completude.

## 3. As telas

`MasterData.tsx` recebe a prop `aba` (como o PCP recebeu `abas` no S1) e perde a barra de abas interna. O `App`
renderiza `<MasterData key={view} aba={…} />` para cada cartão. O fichário é um componente novo, `Fichario.tsx`,
que só lê as contagens e navega.

### 3.1 Clientes

**Lista:**
- dormentes no topo;
- marcar vários e pôr num grupo, com a prévia de matriz e filial;
- selo do grupo na linha;
- as mensagens "Primeiro contato" e "Pedir o que falta".
Tudo como hoje, no visual do `estilo.ts`.

**Janela de edição:**
- sai o campo **limite de crédito**; o dado fica guardado;
- **observações e fotos saem da janela** e ficam só na página do cliente.
- O resto continua: empresa, categoria, CNPJ, telefone, IE, e-mail, contato, endereço, condição de pagamento,
  score, grupo econômico e "mesma empresa cadastrada duas vezes".

**Página do cliente em 5 abas.** Hoje são 9, e nada some:

| Aba | O que tem (vindo das abas de hoje) |
|---|---|
| Visão geral | os 4 números de dinheiro, ticket médio, taxa de fechamento, último pedido, CNPJ/IE/endereço, ritmo de compra (gráfico, intervalo típico, faixa, próximo estimado), contatos, anotações (editáveis aqui) |
| Histórico | Peças, Orçamentos (abrir na tela de Orçamentos e ver sem sair), Pedidos (com o orçamento de origem) e Entregas, um bloco embaixo do outro |
| Dinheiro | recebido, em aberto, vencido; lista das contas; "Lembrete de vencimento" |
| Fotos | fotos do cliente, "Guardar" fotos que vieram nos orçamentos |
| Contrato | o `PainelDoContrato` de hoje, intocado (P5: ele terá sessão própria) |

**A página do grupo** fica igual. Ela já reusa o dossiê; ganha a mesma regra de dinheiro abaixo e as mesmas
abas, com Empresas no lugar de Fotos.

**Regra de dinheiro (P4).** "A receber" e "Vencido" usam a classificação da Finanças, `situacaoDaConta`
(`src/utils/financas/situacao.ts`):
- a parcela de pedido ainda não entregue (`aguardando_entrega`) **não** conta como vencida nem como a receber;
- ela aparece à parte, como "em produção: R$ X", igual à coluna de Clientes que devem.

A conta mora em `montarDossie` (`src/utils/dossieDoCliente.ts`), e um teste garante que o vencido do dossiê é
igual ao vencido de `clientesQueDevem` para o mesmo cliente.

**Granha Ligas (P1):** é matriz + 2 filiais. Fica como três clientes no mesmo grupo econômico. Não há mudança de
código; o caso vira um teste de `membrosClassificados` se ainda não houver um.

### 3.2 Produtos

**Topo: o painel de Completude.** Junta a aba Completude com o painel `FichasPendentesPanel`:
- o placar "X% do faturamento com custo conhecido", com a cor de hoje (abaixo de 30% rosa, acima de 70% verde);
- "Produtos sem ficha técnica", ordenados pelo que vendem (faturamento, peças, pedidos), com o botão
  **"Começar mutirão"**. Ele abre o primeiro produto na ficha; ao salvar, vai para o próximo.
- "Insumos sem custo", com o link para o Estoque já buscando o insumo, como hoje.
- **Recolhido** quando a cobertura passa de 70% e não há produto vendido sem ficha.

**A lista** continua com o preço T1.

**O editor do produto** fica em 4 blocos, nesta ordem:
1. **Dados:** nome com "Sugerir nome", categoria, "mesma peça, nome diferente", SKU, capacidade em peças/dia.
2. **Preços:**
   - T1, T2 e T3;
   - o critério das faixas;
   - o aviso "T1 acima do que alguém já pagou";
   - o preço praticado e a margem nele.
3. **Calcular preço** (recolhido; abre num clique): a calculadora de hoje, inteira, com tecido, mão de obra,
   indireto, tributos, CMV, T1 sugerido, ponto de equilíbrio, markup e "aplicar preço".
4. **Ficha técnica:** como hoje, com o "próxima ficha" do mutirão.

### 3.3 Bancos (vêm da Finanças)

Saem do "⋯" de Bancos em Contas e vêm para cá. Ficam em Contas a lista dos bancos, o saldo, o "a conferir" dos
pagamentos e a janela de conferência; nada disso muda. O "⋯" de Contas passa a ter um item só, **"Gerenciar
bancos"**, que abre este cartão.

**Lista dos bancos.** Para cada banco:
- nome, tipo e saldo;
- e a conferência do saldo (`conferirSaldos`, a mesma conta da linha "Conferir saldo" do Início):
  - **bate** → "✓ bate com os lançamentos";
  - **não bate** → "não bate: guardado R$ X × lançamentos R$ Y", em rosa;
  - **sem saldo de partida** → "falta o saldo de partida", em âmbar, com o botão "Ajustar pelo extrato";
  - **dados incompletos** (teto atingido) → nada. Informação incompleta produz silêncio.
- No pé da lista, "Mostrar inativos".

**O que a lista oferece:**
- **Novo banco e editar:** nome, tipo, nome do banco, agência/conta, saldo inicial, e os dois campos novos,
  **titular** e **chave PIX** (seção 7).
  - A **moeda sai da tela** e grava sempre BRL.
- **Ajustar pelo extrato:** a janela de hoje (`set_bank_balance`). Ela não cria lançamento.
- **Inativar · reativar:** com as confirmações de hoje.
- **Sincronizar saldos:**
  - fica no fim da página, numa área "Manutenção", com o texto: "Sobrescreve o saldo guardado pelo calculado.
    Confira os bancos que não batem antes — sincronizar apaga o saldo guardado.";
  - mantém a confirmação de hoje.

**A linha "Conferir saldo" da fila do Início** (S1, R12) passa a abrir este cartão em vez de Contas, porque é
aqui que se vê qual banco diverge. Isso fecha a pendência que o S1 deixou para o S2.

### 3.4 Minha empresa

- **Dados:**
  - razão social, CNPJ, telefone, endereço e logo;
  - margem alvo, imposto padrão e custo da mão de obra/hora;
  - limite de despesa.
- **Sai da tela:** a comissão base. O dado fica guardado.
- **Capacidade mensal:** sai daqui e vai para Setores, onde é decidida.
- **Banco que sai no orçamento (P2):** um seletor com os bancos ativos.
  - O PDF do orçamento passa a ler banco, agência, conta, titular e PIX **do banco escolhido**.
  - Sem banco escolhido, ou antes de o SQL rodar, o PDF usa os campos de hoje do `company_profile`, que
    continuam guardados. Nenhum orçamento sai sem os dados bancários durante a troca.
- **Meta de faturamento com sugestão (P6).** Mostra:
  - o campo da meta;
  - ao lado, **"Sugestão: R$ X / mês"**, com o botão "Usar sugestão";
  - uma linha "como cheguei nesse número".
  - A conta está na seção 5.2.

### 3.5 Setores

É o `CapacityPanel` de hoje, sem a parte "Ocupação atual por setor":
- criar, editar e excluir setor, com capacidade por semana, ordem e cor;
- dias úteis por semana e hora extra;
- **mais a capacidade mensal**, que vem de Minha empresa e continua calculada pelo gargalo.

A ocupação atual vai para "Como estamos indo › Fábrica" no S5. Até lá ela continua aparecendo no Painel da
fábrica (aba `dashboard` do PCP), que já está em Indicadores.

### 3.6 Fornecedores, Categorias e Mensagens

Ficam como estão, só com o visual do `estilo.ts`:
- **Fornecedores:** lista e cadastro, classificação financeira padrão, meio de pagamento habitual;
- **Categorias:** os 3 setores, os 2 níveis, criar/renomear/mover/excluir, as marcas Fixo e CPV, os avisos de
  grupo vazio e categoria órfã;
- **Mensagens:** o catálogo por etapa, a busca e o copiar.

A página do fornecedor (item 38) aguarda.

## 4. Inventário (a triagem, item por item)

Legenda: **fica** (à vista) · **recolhido** (um clique) · **move** (para outro lugar) · **sai da tela** (o dado
fica) · **aguarda**.

| # | Função | Onde fica na v3 |
|---|---|---|
| 1 | Dados da empresa e logo | Minha empresa · fica |
| 2 | Dados bancários do orçamento | Minha empresa › seletor de banco; os campos antigos viram reserva (3.4) |
| 3 | Capacidade mensal (calculada) | move → Setores |
| 4 | Margem alvo, imposto padrão, mão de obra/hora | Minha empresa · fica |
| 5 | Comissão base | sai da tela |
| 6 | Meta de faturamento e limite de despesa | Minha empresa · fica, a meta com sugestão (5.2); o uso vai para o S5 |
| 7 | Lista de clientes agrupada, busca, paginação | Clientes · fica |
| 8 | Novo · editar · excluir cliente | Clientes · fica |
| 9 | Selo do grupo na linha | Clientes · fica |
| 10 | Marcar vários e pôr num grupo | Clientes · fica |
| 11 | Clientes dormentes + "Retomar" | Clientes (topo) · fica + linha na fila do Início (6) |
| 12 | Mensagem "Primeiro contato" | Clientes · fica |
| 13 | Mensagem "Pedir o que falta" | Clientes · fica |
| 14 | Campos do cadastro do cliente | janela de edição · fica |
| 15 | Condição de pagamento padrão | janela de edição · fica |
| 16 | Limite de crédito | sai da tela |
| 17 | Score de crédito | janela e página · fica |
| 18 | Grupo econômico | janela de edição · fica |
| 19 | Mesma empresa cadastrada duas vezes | janela de edição · fica |
| 20 | Observações e fotos na janela de edição | move → só na página do cliente |
| 21 | Números de dinheiro da visão geral | Visão geral · fica, com a regra da entrega (3.1) |
| 22 | Ticket médio, taxa de fechamento, último pedido | Visão geral · fica |
| 23 | Ritmo de compra | Visão geral · fica |
| 24 | Contatos | Visão geral · fica |
| 25 | Peças do cliente | Histórico · fica |
| 26 | Orçamentos do cliente | Histórico · fica |
| 27 | Pedidos do cliente | Histórico · fica |
| 28 | Financeiro do cliente + lembrete | Dinheiro · fica, com a regra da entrega |
| 29 | Entregas | Histórico · fica |
| 30 | Contrato recorrente | Contrato · aguarda (sessão própria); intocado |
| 31 | Fotos do cliente e importação dos orçamentos | Fotos · fica |
| 32 | Anotações | Visão geral · fica (editáveis ali) |
| 33 | As 9 abas | 5 abas (3.1) |
| 34 | Grupo como um cliente só | página do grupo · fica |
| 35 | Aba Empresas do grupo | página do grupo · fica |
| 36 | Fornecedores: lista e cadastro | Fornecedores · fica |
| 37 | Classificação padrão e meio habitual | Fornecedores · fica |
| 38 | Página do fornecedor | aguarda |
| 39 | Lista de produtos com T1 | Produtos · fica |
| 40 | Sugerir nome e SKU | editor › Dados · fica |
| 41 | Mesma peça, nome diferente | editor › Dados · fica |
| 42 | SKU, capacidade, custo | editor › Dados · fica |
| 43 | Tabela T1/T2/T3, critério, aviso de T1 alto | editor › Preços · fica |
| 44 | Preço praticado e margem | editor › Preços · fica |
| 45 | Calculadora de custo | editor › Calcular preço · recolhido |
| 46 | Ficha técnica | editor › Ficha técnica · fica |
| 47 | Painel de fichas pendentes + mutirão | move → painel de Completude no topo de Produtos |
| 48 | Completude (placar, sem ficha, insumos sem custo) | topo de Produtos · fica (recolhe quando está bom) + linha na fila (6) |
| 49 | Categorias: setores, níveis, criar/renomear/mover/excluir, avisos | Categorias · fica |
| 50 | Marcas Fixo e CPV | Categorias · fica |
| 51 | Atalhos de categoria | onde já aparecem · fica |
| 52 | Catálogo de mensagens | Mensagens · fica |
| 53 | Bancos: cadastrar e editar | move → Bancos |
| 54 | Ajustar saldo pelo extrato | move → Bancos |
| 55 | Inativar · reativar banco | move → Bancos |
| 56 | Sincronizar saldos | move → Bancos › Manutenção, depois da lista do que diverge |
| 57 | Moeda do banco | sai da tela (grava BRL) |
| 58 | Setores: criar, editar, excluir, capacidade, ordem, cor | Setores · fica |
| 59 | Dias úteis e hora extra | Setores · fica |
| 60 | Ocupação atual por setor | move → S5 (até lá, Painel da fábrica em Indicadores) |

## 5. Regras de negócio novas

### 5.1 Clientes dormentes na fila

Usa `clientesDormentes` (`src/utils/acompanhamentoComercial.ts`), a mesma função da lista. Um cliente está
dormente quando passou do **próprio** ritmo de compra, e não por um prazo fixo.

### 5.2 Meta de faturamento sugerida

É uma função pura nova, `metaSugerida`, em `src/utils/metaDeFaturamento.ts`, com testes. Ela reusa
`calcularPontoDeEquilibrio` (`src/utils/saudeDoCaixa.ts`) e a montagem da base que hoje vive em
`useSaudeDoCaixa`. Essa montagem sai do hook para uma função pura (`baseDoEquilibrio`), para as duas telas
usarem a mesma conta.

- **Período:** os 3 últimos meses **fechados**, por competência, como a conta de equilíbrio já faz:
  - a receita das peças vendidas;
  - o custo variável das mesmas peças;
  - as despesas fixas do mês.
- **Índice de margem de contribuição:** é calculado **só sobre as vendas com custo conhecido**:
  `(receita com custo − custo variável) ÷ receita com custo`. A venda sem ficha não entra no índice com custo
  zero, porque isso inflaria a margem.
- **Custo fixo:** a média mensal das despesas fixas dos 3 meses.
- **Sugestão:** `custo fixo médio ÷ (índice de MC − margem alvo)`, arredondada para cima em R$ 1.000.
- **Sem sugestão** (a tela diz o motivo):
  - se não houve venda com custo conhecido nos 3 meses: "cadastre o custo das peças (Produtos › Calcular preço) para a sugestão aparecer" (R11: o custo vem do campo Custo do produto, não da ficha);
  - se `índice de MC ≤ margem alvo`: "a margem das peças (X%) não chega à margem alvo (Y%) — nenhum faturamento
    resolve; revise preço ou margem alvo".
- **"Como cheguei nesse número"** mostra:
  - o custo fixo médio, o índice de MC e a margem alvo;
  - **a cobertura**: "a margem foi medida em Z% do faturamento (as peças com custo cadastrado no produto)". Abaixo de 30% a
    linha fica em âmbar e acrescenta "estimativa fraca — complete o custo das peças".
- **A sugestão não grava nada sozinha.** Só "Usar sugestão" grava, e a pessoa ainda salva.

### 5.3 Banco no orçamento

`pdfService` lê de `company_profile.banco_do_orcamento_id → bank_accounts`. Quando a coluna não existe, ou não
há banco escolhido, ou o banco foi inativado, o PDF usa os campos antigos do `company_profile`.

## 6. Fila do Início e menu

Duas linhas novas em `montarFila` (`src/utils/inicio/fila.ts`, pura, com testes):

| Seção | Linha | Destino | Urgente |
|---|---|---|---|
| Vender | "Retomar N cliente(s) sumido(s)" | `clientes` com `{ dormentes: true }` | não |
| Cadastros | "Cadastrar ficha técnica: N produto(s)" | `produtos` com `{ completude: true }` | não |

- **N da ficha técnica** conta os produtos sem ficha **que já venderam** (giro maior que zero). O produto que
  nunca vendeu não trava nada e não entra na fila; ele continua listado no painel.
  - A conta é a mesma do painel: `apurarCompletude` (`src/utils/completudeDoCadastro.ts`), com os apelidos de
    produto resolvidos.
  - Um teste garante que o N da fila é igual ao número de linhas com giro do painel.
- **Leituras novas** em `useFilaDoInicio`: os clientes, os produtos e o mapa de fichas (`getFichaPorProduto`).
  Pedidos, orçamentos e insumos ela já lê. A regra do S1 continua: uma carga, e se uma leitura falha, nenhuma
  fila parcial.
- **"Conferir saldo" e "sem saldo de partida"** (S1) passam a abrir `bancos`.
- **O contador do menu em Cadastros** é o número de linhas da fila em Cadastros.

## 7. Dados (SQL)

Um arquivo, `supabase/cadastros_v3_1.sql`, idempotente (`add column if not exists`):
- `bank_accounts.titular text` e `bank_accounts.chave_pix text`;
- `company_profile.banco_do_orcamento_id uuid references bank_accounts(id) on delete set null`.

Nenhuma coluna sai. Os dados que somem da tela (comissão base, limite de crédito, moeda, campos bancários
antigos) ficam guardados.

**Antes de o SQL rodar**, a tela detecta a coluna ausente e se comporta assim:
- esconde titular, PIX e o seletor de banco;
- mostra "rode `supabase/cadastros_v3_1.sql` para escolher o banco do orçamento";
- o PDF usa os campos antigos.

**Quem roda:** eu escrevo e testo contra o banco **local da v3** só com leitura (`information_schema`). O Luiz
roda.

## 8. Código (onde cada coisa mexe)

- **Navegação e App:**
  - `src/utils/navegacao.ts` e o teste: as views, `CARTOES_DO_FICHARIO`, os aliases e os testes de 2;
  - `src/App.tsx`: as rotas dos cartões e as aberturas.
- **Fichário:** `src/components/cadastros/Fichario.tsx`, novo.
- **Clientes:**
  - `src/pages/MasterData.tsx`: a prop `aba`, sem a barra de abas interna, e a aba nova `bancos`;
  - `src/pages/masterdata/PaginaDoCliente.tsx` e `PaginaDoGrupo.tsx`: as 5 abas;
  - `src/utils/dossieDoCliente.ts` e o teste: a regra da entrega;
  - `src/components/masterdata/ClientForm.tsx`: sem limite de crédito, observações e fotos.
- **Produtos:**
  - `src/components/masterdata/ProductForm.tsx`: os blocos e a calculadora recolhida;
  - o painel de Completude no topo de Produtos, que funde `FichasPendentesPanel` e `CompletudeTab`.
- **Bancos:**
  - `src/components/cadastros/BancosPanel.tsx`, novo, montado com as peças de Finance: `BankAccountModal`, as
    confirmações de inativar/reativar e a janela de sincronizar;
  - `src/pages/Finance.tsx`: o "⋯" de Bancos vira só "Gerenciar bancos".
- **Minha empresa:**
  - `src/pages/masterdata/CompanyTab.tsx`: o seletor de banco, a meta sugerida, sem comissão e sem capacidade;
  - `src/utils/metaDeFaturamento.ts` e o teste, novos; `src/utils/saudeDoCaixa.ts` ganha `baseDoEquilibrio`.
- **Setores:** `src/components/pcp/CapacityPanel.tsx`, sem a ocupação atual e com a capacidade mensal.
- **Fila:** `src/utils/inicio/fila.ts`, o teste e `src/hooks/inicio/useFilaDoInicio.ts`.
- **Orçamento:** `src/services/pdfService.ts`, o banco do orçamento com reserva.

## 9. Testes e conferência

- `node --test` e `tsc --noEmit` limpos.
- **Testes novos:**
  - `metaSugerida`: o caso normal, sem venda com custo, MC ≤ alvo, a cobertura e o arredondamento;
  - a regra da entrega no dossiê, com o vencido igual ao de `clientesQueDevem`;
  - as linhas novas da fila (singular e plural, ausentes em zero);
  - a navegação (cartões, aliases, dono de toda view).
- **Conferência no navegador**, com o usuário de teste, em 1440, 1024 e 390 px:
  - cada cartão abre e volta;
  - os números do fichário batem com as telas;
  - o vencido do cliente bate com Clientes que devem;
  - o mutirão percorre a fila;
  - Bancos mostra o que diverge;
  - o PDF do orçamento sai com os dados bancários antes e depois do SQL;
  - o papel `factory` não alcança Cadastros, e não há rolagem para o lado.
- **Comparação v2 × v3 publicada:** o fichário, a página do cliente, Produtos e Bancos.

## 10. Fora deste desenho

- **Contrato recorrente:** terá sessão própria (P5).
- **Página do fornecedor:** aguarda.
- **Uso da meta:** meta × realizado, lucro e saúde do caixa vão para o S5.
- **Insumos e tecidos** (Novo tecido, Mesclar insumo, preços de personalização, artes de bordado): S4, Estoque.
- **Produção:** rodar o SQL fora do banco local da v3 e os achados nos dados de produção, como diz o roteiro, §4.
