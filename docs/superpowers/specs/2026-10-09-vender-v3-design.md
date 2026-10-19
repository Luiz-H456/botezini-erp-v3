# Vender v3 — desenho (S3)

Data: 09/10/2026 · Branch: `v3` · Roteiro: `2026-10-08-roteiro-v3-design.md`, S3.
Base: a triagem feita com o Luiz em 09/10 (50 funções, perguntas P1 a P6, em
`.superpowers/brainstorm/triagem-vender.md`) e o desenho aprovado no mesmo dia.

## 1. Objetivo e regras

Orçamentos e Pedidos ficam mais fáceis de usar sem perder nenhuma proteção que já existe:
- o plano velho que não converte calado;
- a conferência antes de gravar;
- a trava contra pedido em dobro;
- a cor da cartela que resolve a faixa de preço.

O que muda:
1. **Etiquetas que direcionam:** cada orçamento e cada pedido mostram uma etiqueta só, que diz em que pé está e qual é
   o próximo passo. Esse passo é o único botão à vista; o resto das ações fica no "⋯ Mais".
2. **O editor do orçamento numa tela só, em blocos,** com o total fixo no rodapé.
3. **Condição de pagamento num bloco só** (entrada % e parcelas).
4. **As pendências que vieram do S1 e do S2.**

As regras do roteiro valem aqui também:
- **Adaptar, não refazer.** `Budgets.tsx`, `BudgetEditor.tsx` e `Orders.tsx` são o esqueleto. Nenhuma tela é
  reescrita do zero.
- **Visual:** as classes de `src/components/finance/ui/estilo.ts`, escala de espaço de 4 a 24, vencido em rosa e ação
  principal em âmbar.
- **Banco:** nenhuma coluna nova. Este subprojeto **não tem SQL**.
- **A v2 de referência** (porta 5176) continua de pé.

## 2. Etiquetas que direcionam

### 2.1 Orçamentos

A função pura `etiquetaDoOrcamento(orcamento, hoje)` fica em `src/utils/vendas/etiquetas.ts`. Ela devolve
`{ texto, tom, acao }`. O "Enviado" usa **a mesma classificação** da fila de retomada (`filaDeFollowUp` /
`UrgenciaDoFollowUp` em `src/utils/acompanhamentoComercial.ts`), para a etiqueta e a fila nunca discordarem.

| Situação | Etiqueta (`texto`) | `tom` | Ação à vista (`acao`) |
|---|---|---|---|
| Rascunho | `Rascunho` | neutro | `enviar` → "Enviar ao cliente" |
| Enviado, recente | `Enviado há N dia(s)` (sem `sent_at`: `Enviado`) | âmbar | `retomar` → "Retomar" |
| Enviado, sem resposta (`parado`) | `Parado há N dias` | âmbar | `retomar` |
| Enviado, vence hoje ou nos próximos dias | `Vence hoje` / `Vence em dd/mm` | âmbar | `retomar` |
| Enviado, validade vencida | `Vencido em dd/mm` | rosa | `revalidar` → "Refazer validade" (abre o editor) |
| Aprovado | `Aprovado` | verde | `virar-pedido` → "Virar pedido" |
| Convertido | `Pedido #N` | neutro | `ver-pedido` → "Ver pedido" |

Orçamento "sem validade" (`validity_days = 0`) nunca vence.

**O cartão do orçamento:**
- **Uma etiqueta**, no lugar de quatro elementos de hoje:
  - a situação;
  - o "EXPIRADO" que pisca;
  - o link "Pedido #N";
  - o selo "Specs".
- **O que vira texto:** "Specs" passa a ser `com especificação` na linha de informações, em `ROTULO_PEQUENO`.
- **Um botão à vista:** o da `acao`. "Retomar" abre a mensagem de retomada (`msgRetomarOrcamento`), a mesma da fila. "Virar pedido" e "Ver
  pedido" são os de hoje.
- **"⋯ Mais"** (o `MenuMais` que já existe) traz todas as ações, sem tirar nenhuma:
  - pré-visualizar;
  - editar;
  - mensagem (enviar / fechamento);
  - duplicar;
  - gerar PDF;
  - PDF sem fotos;
  - marcar aprovado (só em Enviado);
  - excluir.

### 2.2 Pedidos

A função pura `etiquetaDoPedido(pedido, contexto)` fica no mesmo arquivo. A etiqueta mostra **onde o pedido está**,
com a mesma lógica de hoje (`getStatusBadge` em `Orders.tsx`, que já separa setor e prazo), no formato novo:
- **Setor:** `Na Costura`, `Aguardando material`, `Entregue`, sempre em tom neutro.
- **Prazo, numa segunda etiqueta:**
  - `em dia` (neutro);
  - `atrasado N dias` (rosa);
  - entregue não mostra prazo.
- **Fatura, numa terceira**, só para quem vê dinheiro: `falta R$ X`, e `quitado` quando é o caso. O aviso "as contas
  somam X, o pedido é Y" continua como está.

**Ação à vista**, pela fase:
- Pendente → **Confirmar ao cliente**;
- Em produção → **Avisar andamento**;
- no último setor ou entregue → **Ficha de entrega**.

As mensagens são as de hoje (`BotaoMensagem` por fase).

**"⋯ Mais":** visualização rápida, ficha de produção (PDF), PDF sem fotos, reverter para orçamento, orçamento de origem
e excluir.

## 3. O editor em blocos

`BudgetEditor.tsx` continua uma tela só, reorganizada em 4 blocos com título (`ROTULO`). Os campos e as regras de
hoje não mudam, só de lugar:

| Bloco | Conteúdo | Aberto? |
|---|---|---|
| **Cliente** | cliente (busca + criar sem sair), data, validade e "sem validade" | sempre aberto |
| **Itens** | as linhas como hoje: produto, tecido + cor da cartela (faixa sozinha), tamanho, quantidade, preço, especificação recolhida por linha, peças do conjunto, duplicar, arrastar, excluir, os 3 selos, as mensagens (levantamento, cobrar grade, aprovação da arte) | sempre aberto |
| **Acabamento** | personalizações (com importar da tabela), extras, fotos de referência, observações (aba Cliente / aba Fábrica) | recolhível; fechado mostra o resumo "N personalizações · N extras · N fotos" |
| **Condições** | desconto, prazo de entrega em dias úteis, **condição de pagamento** (seção 4) | recolhível; fechado mostra "entrada X% + Nx · prazo N dias" |

**Rodapé fixo** (sticky, `CARTAO`):
- total, entrada e saldo;
- a linha "cabe na semana de dd/mm" (S1);
- os botões Salvar e Fechar.

No celular (390 px) o rodapé continua fixo e quebra em duas linhas.

**Blocos recolhíveis:**
- abrem sozinhos quando o orçamento **novo** é criado;
- num orçamento existente, abrem fechados;
- abrem sozinhos também quando há algo a corrigir dentro, por exemplo o plano que não fecha com o total.

## 4. Condição de pagamento num bloco só

Hoje são dois campos para a mesma coisa: "Entrada mínima %" (`down_payment_percent`) e o plano opcional
(`payment_plan`). O código já resolve o conflito escolhendo o plano quando ele existe. Na v3 eles viram um bloco só:

- **Entrada %** (campo) e **Parcelas do saldo** (a lista de parcelas de hoje, com valor, vencimento e meio).
- **A entrada é a 1ª parcela do plano.** Mudar a entrada % recalcula a 1ª parcela e reescala o saldo nas demais,
  mantendo a proporção entre elas (a regra de "Ajustar ao total" que já existe).
- **Orçamento antigo só com `down_payment_percent`:** o bloco mostra o plano equivalente, entrada X% + saldo em 1x na
  entrega, **sem gravar** até a pessoa salvar.
- **O aviso "o plano não fecha com o total" e o botão "Ajustar ao total" continuam.**
- **Gravação:** `payment_plan` sempre preenchido e `down_payment_percent` / `down_payment_value` derivados da 1ª parcela,
  para o PDF, a conversão e a fila (que leem esses campos) continuarem iguais.
- **As contas** ficam numa função pura, `condicaoDePagamento`, em `src/utils/paymentPlan.ts`, com testes:
  - montar o plano a partir da entrada %;
  - reescalar;
  - derivar os campos;
  - converter o orçamento antigo.

## 5. Pendências de S1 e S2

1. **"Ver o que receber" abre o cliente.**
   - O botão do próximo passo "Pedido entregue" (Quadro) leva a Dinheiro › Clientes que devem **com a linha do cliente
     aberta**.
   - É uma abertura nova no `App` (`aberturaReceber: { clienteId }`), que o `ReceivablesControlPanel` consome e limpa,
     no mesmo padrão das outras.
2. **Retomar ganha "Marcar aprovado".** No próximo passo e na fila de retomada, o segundo botão de "Retomar" é
   **Marcar aprovado**: relê o orçamento (`abertoAgora`), muda para Approved e oferece o próximo passo "Virar pedido".
3. **Mensagem de entrega com o saldo real.**
   - `msgEntregue` passa a receber o saldo calculado das contas a receber do pedido (`order_id`), e não de
     `total_amount − amount_paid` (campo antigo, sempre 0).
   - A parcela "aguardando entrega" conta, porque com a entrega ela passa a valer.
   - No papel fábrica e no Modo fábrica continua sem valor nenhum (R8/R10 do S1).
   - Se a leitura das contas falhar, a mensagem sai **sem** a linha do saldo. Nunca sai com um número inventado.
4. **O banco do orçamento aparece logo.** O `App` recarrega o perfil da empresa (`loadCompanyProfile`) ao entrar em
   Orçamentos e em Pedidos. Escolher o banco em Cadastros passa a valer no próximo orçamento aberto, sem recarregar a
   página.
5. **Ficha de entrega a partir do Quadro.**
   - A janela "Confirmar entrega" do Quadro ganha o atalho **Ficha de entrega**, que abre o mesmo `FichaDeEntrega` de
     Pedidos para aquele pedido.
   - No papel fábrica e no Modo fábrica o atalho não aparece, porque a ficha mostra quanto falta receber.

## 5A. Atalhos para orçar mais rápido (pedido do Luiz, 09/10)

1. **Grade numa linha só.**
   - Na linha do produto, o botão **Grade** abre um campo onde se digita `P 10, M 20, G 15, GG 5` (aceita vírgula,
     ponto e vírgula ou quebra de linha; `P10`, `P:10` e `P=10`; tamanhos numéricos com separador: `36 4`, `38: 6`).
   - **Aplicar** troca aquela linha por uma linha por tamanho, com o mesmo produto, tecido, cor, preço e especificação.
     Por baixo, cada tamanho continua sendo uma linha, então nada muda no banco.
   - Tamanho repetido, quantidade zero ou texto que não se entende dão erro em português, e nada muda.
2. **Usar o preço sugerido.** No balão do selo "histórico da casa", quando há sugestão, aparece o botão **Usar R$ X**,
   que preenche o preço da linha.
3. **Ctrl+S salva** o orçamento aberto (Cmd+S no Mac), com a mesma validação do botão Salvar.

## 5B. Opcionais em um clique e "Copiar especificação" (pedido do Luiz, 09/10)

**O problema:** hoje cada linha abre um painel com 3 menus suspensos (manga, gênero, modelagem), mais a faixa e os
detalhes. Mudar 6 itens pede umas 24 aberturas de menu.

1. **Botões de um clique, sem subpágina.**
   - **Fechada**, a linha mostra uma linha fina de resumo (`Manga curta · Masc · Regular · Faixa`, ou `sem
     especificação`) com um lápis.
   - **Aberta**, mostra os botões das opções mais usadas: **Manga** [Curta][Longa][Sem] · **Gênero** [Masc][Fem][Uni] ·
     **Modelagem** [Regular][Slim][Babylook] · [Faixa].
   - Clicar marca, e clicar de novo desmarca (volta a "não definido").
   - **"+ mais"** mostra as raras: Outro padrão, Infantil, Oversized, Plus size e o campo Detalhes.
   - Os valores gravados são os de hoje (`sleeve_type`, `gender`, `fit`, `has_band`, `prod_notes`).
2. **Copiar especificação.**
   - No item, o botão **Copiar** abre, no topo do bloco Itens, a barra "Copiando de: <produto> (linha N)".
   - **O que copiar:** a barra traz os grupos, todos marcados de início:
     - **Opcionais** (manga, gênero, modelagem, faixa);
     - **Detalhes**;
     - **Tecido e cor** (a faixa de preço vem junto);
     - **Preço**.
   - **Para onde:** cada outra linha ganha uma caixa de seleção, e há um atalho "todas".
   - **Aplicar em N itens:** copia só os grupos marcados, recalcula o total da linha quando o preço muda e mostra
     `N itens atualizados`.
   - **Cancelar** (ou Esc) fecha sem mudar nada.
   - Copiar "não definido" também vale: limpa o destino. É o que se espera de "copiar como está na origem".
   - A conta fica numa função pura, `copiarEspecificacao(origem, destino, grupos)`, em
     `src/utils/vendas/especificacao.ts`, com testes.

## 6. Inventário (a triagem, item por item)

Legenda: **fica** · **⋯** (no menu Mais) · **move** · **muda**.

| # | Função | Onde fica |
|---|---|---|
| 1 | Busca, filtro de cliente e de status | lista de orçamentos · fica |
| 2 | Período (tudo, hoje, 7, 30, expirados, novos) | fica, como `pilula()` |
| 3 | Cartão: nº, cliente, data, itens, total | fica; situação + expirado + pedido + specs viram **uma etiqueta** (2.1) |
| 4 | Fila de retomada | fica; ganha "Marcar aprovado" (5.2) |
| 5 | Ações do cartão | 1 à vista (a da etiqueta) + todas no ⋯ |
| 6 | PDF com e sem fotos; aviso do plano que não fecha | ⋯ |
| 7 | Excluir com o aviso do histórico | ⋯ |
| 8 | Cliente + criar cliente | bloco Cliente · fica |
| 9 | Data, validade, sem validade | bloco Cliente · fica |
| 10 | Produto (oficiais, por categoria) + criar produto | bloco Itens · fica |
| 11 | Tecido + cor da cartela → faixa; selo da faixa; tecido/cor livres | bloco Itens · fica |
| 12 | Tecido puxado da ficha técnica | bloco Itens · fica |
| 13 | Tamanho, quantidade, preço | bloco Itens · fica |
| 14 | Especificação por linha (manga, gênero, modelagem, faixa, detalhes) | bloco Itens · **muda:** botões de um clique + resumo + Copiar especificação (5B) |
| 15 | Peças do conjunto | bloco Itens · fica |
| 16 | Duplicar, arrastar, excluir linha | bloco Itens · fica |
| 17–19 | Selos: histórico da casa, do grupo, custo da peça | bloco Itens · ficam os três |
| 20 | Personalizações | bloco Acabamento |
| 21 | Importar personalização | bloco Acabamento |
| 22 | Extras | bloco Acabamento |
| 23 | Observações Cliente / Fábrica | bloco Acabamento |
| 24 | Fotos de referência | bloco Acabamento |
| 25 | Desconto | bloco Condições |
| 26 | Entrada mínima % | **muda:** vira a entrada do bloco "Condição de pagamento" (4) |
| 27 | Plano de pagamento + aviso + Ajustar ao total | **muda:** é o mesmo bloco (4) |
| 28 | Prazo + cabe na semana | bloco Condições + rodapé fixo |
| 29 | Mensagens do editor | bloco Itens · fica |
| 30 | Totais | rodapé fixo |
| 31 | Organização do editor | uma tela em 4 blocos (3) |
| 32–36 | Conversão (plano velho, conferência, trava, o que atravessa, próximo passo) | ficam como estão |
| 37 | Busca, filtros e ordem de pedidos | fica |
| 38 | Etiqueta de setor + prazo | fica, no formato novo (2.2) |
| 39 | Fatura e aviso de divergência | fica |
| 40 | Link ao orçamento de origem | ⋯ |
| 41 | Mensagem por fase | é a ação à vista (2.2) |
| 42 | Ações do pedido | 1 à vista + todas no ⋯ |
| 43 | Ficha de entrega | Pedidos + atalho no Quadro (5.5) |
| 44 | Reverter para orçamento | ⋯ |
| 45 | Excluir pedido | ⋯ |
| 46 | Pedidos lista própria | fica (passo 2 de Vender) |
| 47–50 | Pendências de S1 e S2 | seção 5 |

## 7. Código (onde cada coisa mexe)

- **Etiquetas:**
  - `src/utils/vendas/etiquetas.ts` e o teste, novos;
  - `src/pages/Budgets.tsx` (cartão, ⋯, ação à vista);
  - `src/pages/Orders.tsx` (cartão, ⋯, ação à vista).
- **Editor:** `src/components/budgets/BudgetEditor.tsx` (blocos, rodapé fixo).
- **Pagamento:**
  - `src/utils/paymentPlan.ts` e o teste (`condicaoDePagamento`);
  - o bloco no editor;
  - `PaymentPlanModal` continua sendo o editor das parcelas.
- **Retomar e aprovar:** `src/components/budgets/FilaDeFollowUp.tsx` e `Budgets.tsx` ("Marcar aprovado").
- **Ver o que receber:** `src/App.tsx` (abertura), `ReceivablesControlPanel.tsx` (consome) e `KanbanPanel.tsx`.
- **Mensagem de entrega:** `src/utils/mensagensCliente.ts` (`msgEntregue` recebe o saldo), `usePcpKanban` e
  `KanbanPanel` (lêem as contas do pedido).
- **Perfil da empresa:** `src/App.tsx` (recarrega ao entrar em Orçamentos e Pedidos).
- **Ficha de entrega no Quadro:** `JanelaConfirmarEntrega` (atalho) e `FichaDeEntrega`, reusado.

## 8. Testes e conferência

- `node --test` e `tsc --noEmit` limpos.
- **Testes novos:**
  - `etiquetaDoOrcamento`, uma situação por linha da tabela 2.1, mais "sem validade" e "sem `sent_at`";
  - um teste de que a etiqueta e a fila de retomada classificam o mesmo orçamento igual;
  - `etiquetaDoPedido`: setor, prazo, entregue e fatura escondida para quem não vê dinheiro;
  - `condicaoDePagamento`: entrada % → plano, reescala, orçamento antigo e derivados;
  - `msgEntregue` com o saldo real, com parcela aguardando entrega e sem saldo quando a leitura falha.
- **Conferência no navegador**, com o usuário de teste, em 1440, 1024 e 390 px:
  - cada situação mostra a etiqueta e o botão certos;
  - o ⋯ tem todas as ações;
  - os blocos abrem e fecham com resumo;
  - o rodapé fica fixo;
  - o plano antigo aparece certo;
  - a conversão continua igual;
  - "Marcar aprovado" funciona;
  - "Ver o que receber" abre o cliente;
  - a ficha de entrega abre pelo Quadro;
  - o papel fábrica não vê valor;
  - não há rolagem para o lado.
- **Comparação v2 × v3 publicada:** lista de orçamentos, editor e lista de pedidos.

## 9. Fora deste desenho

- **Contrato recorrente:** sessão própria, que já estava fora.
- **Prospecção:** em espera.
- **Os 17 pedidos com parcelas que não fecham com o total:** dado de produção, fica fora do roteiro.
- **Produção:** nada roda fora do banco local da v3.
