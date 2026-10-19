# Navegação por objetivos — desenho

Data: 06/10/2026 · **Revisão 2: 08/10/2026** · Branch: `v3` · Pasta: `Documentos\botezinipvd-v3`
Origem: brainstorm com o Luiz. As decisões estão em `.superpowers/brainstorm/navegacao-decisoes.md`
e as telas aprovadas em `.superpowers/brainstorm/13576-1791315782/content/` (`cadeia-de-passos.html`
e `inicio-e-menu.html`, opção B).
Roteiro: subprojeto **S1** de `docs/superpowers/specs/2026-10-08-roteiro-v3-design.md`.

Este desenho decide onde cada tela mora e como uma leva à outra.

## 0. O que mudou desde 06/10

| # | Mudança | Por quê |
|---|---|---|
| 1 | "Dinheiro" usa as telas da Finanças adaptada: **Contas · Clientes que devem · Caixinhas** (views `finance`, `receivables`, `envelopes`) | As páginas `pages/financas/*` foram apagadas na adaptação de 07/10 |
| 2 | A barra de passos é a `AbasDaSecao` que já existe (pílula âmbar como no PCP), ganha numeração quando há ordem e passa a servir a **todas** as seções | Já está pronta, testada e no padrão do app |
| 3 | **Cada passo é uma view.** Os passos que hoje são abas internas do PCP (Quadro, Controle parcial…) viram views próprias, e o `PCP` passa a desenhar só as abas que cada view pede | Uma barra só por tela. Sem isso, o passo "Como está a produção" teria a barra de passos e, embaixo, a barra de abas do PCP |
| 4 | O modo fábrica (papel `factory`) continua vendo **Quadro, Controle parcial e Rendimento do corte** | É o que o código faz hoje (`FACTORY_TABS`); a versão de 06/10 dizia "só o Quadro" por engano |
| 5 | A fila do Início usa as contas puras da Finanças (`numeros.ts`, `clientes.ts`, `bancos.ts`, `projecao.ts`) | Os números da fila são os mesmos da aba Contas |
| 6 | O portão I4 (desfazer conferência com motivo) já está resolvido | Continua no cartão da conta |
| 7 | O teto do teste "lista longa" volta a 3: o Resultado sai de Finanças e vai para "Como estamos indo" | Fica como previsto |

## 1. Objetivo

O ERP é organizado pelo que o Luiz **veio fazer**, e não por área da empresa. Cada passo termina
oferecendo o próximo, há poucas bifurcações, e o Início diz o que precisa dele.

**Quem usa:** só o Luiz.

**Ritmo:**
- todo dia: orçamento;
- toda semana, sem dia fixo: produção, estoque, planejar a semana, pagamentos e caixa;
- no mês e no trimestre: vendas, lucro e resultado.

**Critérios de sucesso:**
1. O Início mostra o que precisa dele, agrupado por objetivo. Cada linha leva, num clique, ao passo
   certo, já filtrado.
2. De qualquer tela, qualquer objetivo fica a um clique, porque o menu está sempre à vista.
3. Todo passo das cadeias da seção 5 termina com um botão principal para o próximo passo, já
   preenchido.
4. Nenhum atalho esconde uma nuance que já existe:
   - baixa parcial;
   - desconto ou acréscimo;
   - anotação;
   - anexo;
   - lançamento informativo;
   - escolha de meio e de banco.

   Todo atalho tem "mais opções", a um clique, que abre a janela completa. É regra do Luiz.
5. Nenhuma tela de hoje some sem ter um lugar novo ou um "sai" escrito na seção 3.
6. O visual segue o padrão do app (`src/components/finance/ui/estilo.ts`).

## 2. Menu

A lateral esquerda vira o **menu do app inteiro**. Em telas largas fica sempre visível; no celular,
abre por um botão de menu. Sai a lateral por seção de hoje (`LateralDaSecao` com as telas de uma
seção).

| Entrada | Tipo | Contador |
|---|---|---|
| Início | — | — |
| Vender | objetivo | linhas de Vender na fila |
| Como está a produção | objetivo | linhas de Produção na fila |
| Planejar a semana | objetivo | linhas de Planejar na fila |
| Dinheiro | objetivo | linhas de Dinheiro na fila |
| Como estamos indo | objetivo | — (só consulta) |
| *separador* | | |
| Cadastros | apoio | — |
| Quadro de notas | apoio | — |

- **Contador:**
  - mostra o número de linhas daquele objetivo na fila do Início (seção 4);
  - fica em rosa quando alguma linha é urgente e em cinza nos outros casos;
  - some quando é zero.
- **Carga do contador:** a fila carrega uma vez ao entrar no app. Ela recarrega ao voltar ao Início
  e depois de qualquer gravação que mude uma das contagens: baixa, entrega, orçamento enviado ou
  aprovado, entrada de estoque.
- **Barra de cima:** saem dela os botões de seção. Ficam o nome do app, o modo privacidade e o menu
  do usuário.
- **Prospecção:** sai do menu, e o código fica. Está em espera: o Luiz usa o Explee, e ela volta
  como projeto futuro.
- **Visual:** item ativo em pílula âmbar (`pilula(true)`), ícone de 14px, rótulo em caixa alta
  pequena. O separador é uma linha `border-zinc-800`.

## 3. Onde cada tela mora

Cada objetivo tem uma **barra de passos** no topo, que é a `AbasDaSecao` atual. Onde há ordem
natural, os passos são numerados (1 → 2 → 3). Clicar num passo vai até ele, sem obrigar a seguir em
sequência.

**Cada passo é uma view**, para que link, atalho da fila e botão "voltar" funcionem. As views que
desenham parte do PCP usam o componente `PCP` com a lista de abas daquela view (seção 6).

| Objetivo | Passos (barra) | View de cada passo | De onde vem |
|---|---|---|---|
| **Vender** | 1. Orçamentos · 2. Pedidos | `budgets` · `orders` | páginas de hoje |
| **Como está a produção** | 1. Quadro · 2. Controle parcial · 3. Consumo não apurado | `quadro` · `controle-parcial` · `consumo` (novas) | abas Kanban, Controle Parcial e Consumo Não Apurado do PCP |
| **Planejar a semana** | 1. Cronograma · 2. Lista de compras · 3. Estoque | `cronograma` · `compras` (novas) · `inventory` | abas do PCP e página Estoque |
| **Dinheiro** | Contas · Clientes que devem · Caixinhas (sem número: são consultas irmãs) | `finance` · `receivables` · `envelopes` | Finanças adaptada |
| **Como estamos indo** | Resultado · Vendas · Fábrica | `resultado` · `itens-vendidos` · `indicadores` (nova) | ver abaixo |
| **Cadastros** | Cadastros · Setores e capacidade | `masterdata` · `capacidade` (nova) | Cadastros e aba Capacidade & Setores do PCP |
| **Quadro de notas** | — | `board` | página Board, como está |

- **Como estamos indo, passo Vendas:** a página Itens vendidos ganha embaixo o bloco Produtos &
  mercado, que sai do `Dashboard`.
- **Como estamos indo, passo Fábrica (`indicadores`):** o PCP com as abas Painel, Desempenho e
  Rendimento do corte. É o único passo com abas internas, por ser consulta de três indicadores
  irmãos.
- **Cadastros:** as abas internas da página Cadastros ficam como estão até o S2. A triagem de
  Cadastros decide o formato final.

**O que sai:**
- a aba **Simulador** do PCP vira o indicador "cabe na semana?" dentro do orçamento (5.1);
- o **painel de números do Início** dá lugar à fila. O `Dashboard` velho tem quatro abas, e cada
  uma tem destino:
  - Visão geral: substituída pela fila e pelo resumo;
  - Saúde do caixa: já coberta pela aba Contas;
  - DRE gerencial: substituído pelo Resultado;
  - Produtos & mercado: vai para "Como estamos indo".
- a view `production` (rota antiga) passa a abrir `quadro`;
- a view `pcp` deixa o menu. Passa a ser só um alias que abre `quadro` (link antigo).

## 4. Início: resumo e fila de próximos passos

**Topo:** três indicadores em cartão (`Indicador`). Cada um leva ao seu objetivo:
- **Livre para usar**: o mesmo número da aba Contas;
- **A receber vencido**: em rosa quando > 0;
- **Pedidos em produção**: a contagem de pedidos `Pendente` ou `Em Produção`.

**Fila:**
- um cartão por objetivo, na ordem do menu, e cada linha é um item com o botão de ação à direita
  (`BOTAO_SUAVE`);
- dentro do bloco, as urgentes vêm primeiro, com a faixa rosa;
- linha com contagem zero não aparece, e bloco sem linhas também não;
- sem nada pendente, aparece "Nada pendente — bom trabalho".

| Bloco | Linha | Conta | Urgente quando | Leva para |
|---|---|---|---|---|
| Vender | **Retomar** N orçamentos parados | `filaDeFollowUp` sem os `recente` — a mesma lista que a fila de follow-up mostra no destino (R13) | — | Orçamentos filtrado nesses |
| Vender | **Virar pedido**: N orçamentos aprovados | orçamentos com status `Approved` | — | Orçamentos filtrado em aprovados |
| Produção | **Destravar** N pedidos com prazo estourado | `pedidosAtrasados` (já existe) | sempre | Quadro, com os atrasados destacados |
| Produção | **Confirmar entrega** de N pedidos no último setor | pedidos ativos cujo setor é o último da sequência | — | Quadro, coluna do último setor |
| Produção | **Completar** consumo não apurado de N itens | a mesma leitura da tela Consumo não apurado (`productionRepository`) | — | Consumo não apurado |
| Planejar | **Comprar** N insumos abaixo do mínimo | `insumosAbaixoDoMinimo` (já existe), na regra do Estoque: saldo <= mínimo, mínimo > 0 | — | Estoque |
| Dinheiro | **Cobrar** N clientes com vencido | `clientesQueDevem` com vencido > 0 | sempre | Clientes que devem |
| Dinheiro | **Pagar** N contas vencidas | recorte `pagar_vencido` (`numerosDaVisaoGeral`) | sempre | Contas, filtrada em "A pagar · vencido" |
| Dinheiro | **Conferir** \<banco\>: N pagamentos | `situacaoDosBancos`, uma linha por banco com N > 0 | — | Contas, com a janela Conferir banco aberta |
| Dinheiro | **Conferir** saldo: N contas não batem | `conferirSaldos().divergencias`, com o mesmo teto do Dashboard (dado incompleto = silêncio) | sempre | Contas |
| Dinheiro | N contas sem saldo de partida (**Ajustar**) | `conferirSaldos().semLinhaDeBase` | — | Contas |
| Dinheiro | **Atenção**: \<mês\> fecha em −R$ X | `projecaoDoMes().fechaCom < 0` | sempre | Contas |

- **Comprar vai ao Estoque (R11):** a Lista de compras é a falta dos pedidos abertos e não lê o
  mínimo, então não mostraria os insumos que a linha contou; o Estoque marca esses mesmos em rosa.
- **Saldo bancário (R12):** os dois alertas de saldo do antigo Dashboard ganham linha aqui. O texto
  diz o que conferir e nunca empurra para "sincronizar", que apaga o saldo guardado.
- **As contas** são funções puras em `src/utils/inicio/fila.ts`, testadas com `node --test`. Elas
  reaproveitam `alertasOperacionais.ts` e `src/utils/financas/*`.
- **O alerta "margem bruta baixa"** não entra na fila, porque é informação e não tarefa. Ele aparece
  em "Como estamos indo".
- **Abrir um passo já filtrado:**
  - **Contas:** já existe, pelo estado `filtrosParaContas` no `App`;
  - **os outros destinos** (Orçamentos, Quadro, Consumo): passam a receber um `pedido` de
    abertura do mesmo jeito. É um objeto simples, que a tela consome e limpa.
  - **Estoque** abre sem filtro (R11): o número da linha é o mesmo do indicador "Estoque crítico"
    da tela.

## 5. A cadeia de próximos passos

Um passo termina oferecendo **um** botão principal, preenchido, e no máximo um secundário. Seguir o
botão nunca é obrigatório. Toda ação rápida tem "mais opções", que abre a janela completa
(critério 4).

| Ao terminar | Botão principal | Secundário | Mensagem (já existe) |
|---|---|---|---|
| Salvar orçamento | **Enviar ao cliente** (abre o WhatsApp e marca `Sent`) | — | `msgOrcamentoEnviado` |
| Orçamento enviado há 7+ dias (pela fila) | **Retomar** (WhatsApp) | Marcar aprovado | `msgRetomarOrcamento` |
| Marcar aprovado | **Virar pedido** (a conversão de hoje, com o plano de pagamento) | — | — |
| Pedido criado | **Cobrar entrada** (só se o plano tem entrada) | Confirmar ao cliente | `msgCobrarEntrada`, `msgPedidoConfirmado` |
| Pedido sai do 1º setor no Quadro | **Avisar o cliente** | — | `msgProducaoIniciada` |
| Confirmar entrega | **Avisar o cliente** | Ver o que receber (Clientes que devem, no cliente) | `msgEntregue` |
| Cronograma | **Ver lista de compras** | — | — |
| Lista de compras | **Dar entrada no estoque** | — | — |
| Recebi (baixa) | guardar nas caixinhas (já existe na `JanelaDeBaixa`) | — | — |
| Barra de categoria no Resultado | **Ver as contas** (já existe: abre Contas filtrada) | — | — |

**Dar entrada no estoque NÃO cria conta a pagar** (decisão do Luiz). O Planejar termina na entrada
de estoque.

**Componente:** `ProximoPasso`, um cartão pequeno no padrão do app com:
- o botão principal (`BOTAO_PRINCIPAL`);
- o secundário opcional (`BOTAO_SECUNDARIO`);
- o link "mais opções" quando existe janela completa.

Ele aparece no lugar onde a ação acabou: na própria janela depois de salvar, ou no topo da tela de
destino.

### 5.1 "Cabe na semana?" dentro do orçamento

O editor de orçamento mostra uma linha com a resposta do motor do Simulador de hoje
(`simulateInsertion` em `src/utils/pcpScheduler.ts`), usando as peças do orçamento e o prazo pedido:
- "cabe na semana de 13/10";
- ou "só cabe na semana de 27/10 — o prazo de 20/10 estoura", em rosa.

É informação e não trava nada. A aba Simulador sai do PCP.

## 6. Código

- **`src/utils/navegacao.ts`:**
  - `SecaoId` passa a ser `inicio | vender | producao | planejar | dinheiro | resultados | cadastros | quadro`;
  - `SECOES` ganha `tipo: 'objetivo' | 'apoio'`, a lista ordenada de passos (as views) e
    `numerado: boolean` (Dinheiro e Como estamos indo não são numerados);
  - `View` ganha `quadro`, `controle-parcial`, `consumo`, `cronograma`, `compras`, `indicadores`
    e `capacidade`;
  - `pcp` e `production` viram aliases (`ALIAS_DE_VIEW`) que abrem `quadro`;
  - `leads` sai do menu;
  - `temAbas` passa a valer para toda seção com mais de um passo, e `temLateral` deixa de existir.
- **Layout:**
  - `LateralDaSecao` vira `MenuDoApp` (menu global com contadores, recolhível, gaveta no celular);
  - `BarraDeTopo` perde os botões de seção;
  - `AbasDaSecao` vira `BarraDePassos`, com a numeração opcional.
- **`PCP`:** recebe `abas: PcpTab[]` no lugar de `factoryMode`. Com uma aba só, não desenha barra
  interna. O papel `factory` monta `['kanban', 'control', 'rendimento']` e o restante do app
  continua bloqueado para ele, como hoje.
- **Início:**
  - **telas:** `pages/Inicio.tsx` (resumo e fila) substitui o `Dashboard`; o bloco Produtos &
    mercado vai para a página Itens vendidos, e o `Dashboard` velho só sai no S6, depois da
    conferência;
  - **dados:** um gancho `useFilaDoInicio` carrega os dados da fila uma vez e também alimenta os
    contadores do menu.
- **Cadeia:** o componente `ProximoPasso` (seção 5).

## 7. Testes e verificação

- **`fila.ts`** com testes, no padrão dos utilitários da Finanças. Casos mínimos:
  - linha com zero some;
  - bloco vazio some;
  - urgente primeiro dentro do bloco;
  - "fecha em −R$ X" só quando negativo;
  - um banco por linha.
- **`navegacao.ts`:**
  - toda view de hoje tem dono, ou uma decisão de "sai" registrada no código;
  - os aliases abrem a view certa;
  - o papel `factory` só alcança as três abas dele;
  - nenhuma seção passa de 3 passos.
- **Suíte e tipos:** a suíte inteira passa e os tipos ficam limpos.
- **Conferência no navegador** da v3, com o usuário de teste, em 1440, 1024 e 390 px, sem rolagem
  para o lado:
  - cada linha da fila leva ao passo certo;
  - cada botão de próximo passo funciona;
  - "mais opções" abre a janela completa;
  - os contadores do menu batem com a fila.
- **Comparação:** v2 × v3 publicada (menu e Início), como na Finanças.

## 8. Fora deste desenho

- O conteúdo interno de Orçamentos, Pedidos, Estoque, Cadastros e das abas do PCP. Eles só mudam de
  lugar, exceto o "cabe na semana?" e os botões de próximo passo. A triagem deles é do S2, do S3 e do
  S4.
- A Prospecção, que está em espera.
- O módulo Dinheiro (pronto no S0).
- A produção (roteiro, seção 4).
