# Finanças v3 — adaptação da tela atual

Data: 07/10/2026 · Branch: `v3` · Pasta: `Documentos\botezinipvd-v3`
Revisão 2 (07/10): inventário de nuances (seção 3), gasto por categoria (2.4), abas pela navegação (5).

## 1. A decisão

As telas novas (`src/pages/financas/*`) foram uma Finanças feita do zero. Não seguimos por aí. A v3
passa a ser a **tela atual** (`src/pages/Finance.tsx` e as telas irmãs de Recebíveis e Caixinhas),
com a lógica nova encaixada dentro dela. Nas palavras do Luiz: "nós já temos a lógica de
funcionamento e a finanças atual e o visual e tela montada em finanças. vamos usar o esqueleto atual
e ir adaptando ele".

**Fica da v3, sem mudar:**
- o SQL (`financeiro_v3_1`, `financeiro_v3_2`);
- o `delivered_at` e a janela Confirmar entrega no Quadro;
- as contas puras em `src/utils/financas/*` e os testes delas;
- as janelas `JanelaDeBaixa` e `JanelaConferirBanco`;
- a tela de Resultado.

**Critério de sucesso:**
- uma Finanças só, a de hoje, mais leve, com os números da v3 e a regra da entrega;
- **todas as nuances da seção 3 continuam alcançáveis**, cada uma no lugar que a tabela diz;
- nenhuma decisão da triagem (`.superpowers/brainstorm/triagem-financeiro.md`) é desfeita.

## 2. A aba Contas (`Finance.tsx`), região por região

### 2.1 Topo
| Hoje | Vira | Triagem |
|---|---|---|
| Cartão "Saldo projetado" (+ conciliado, contas ativas) | **Livre para usar** (bancos − caixinhas), e embaixo "R$ X nos bancos − R$ Y nas caixinhas". Conta: `numerosDaVisaoGeral` | 1 |
| "Vence em 7d" e "Em atraso" | **Quatro números** clicáveis: a receber vencido · a receber 7 dias · a pagar vencido · a pagar 7 dias (`RECORTES`). Clicar filtra a lista; clicar de novo desliga. A parcela que aguarda entrega não conta | 2, 3, 26 |
| "Fluxo líquido" | **"Fecha \<mês\> com R$ X"** e a linha fina do saldo dia a dia (`projecaoDoMes`), com "só pedidos já entregues" | 4, 6 |
| Seta "mais indicadores" (aging, gráfico de fluxo, liquidez) | Sai. Aging: aguarda (o código fica, não aparece). Liquidez: excluída | 5, 7 |
| Olho da privacidade no cartão | Sai do cartão: o olho da barra de topo é o mesmo interruptor | — |

### 2.2 Filtros
| Hoje | Vira |
|---|---|
| 6 filtros rápidos (Todas, Hoje, Abertas, Pagas, Não conciliadas, Canceladas) | À vista: **Agora · Abertas · Vencidas · Pagas**. O padrão é **Agora** (vencidas + próximos 7 dias) |
| Tipo inline, período inline com setas, modo de visão | Vão para o painel **Filtros**, que mostra a contagem do que está ligado |
| Gaveta "Filtros avançados" | Vira o painel **Filtros**. Ficam: tipo, **mês com setas ‹ ›** (e "todos os meses"), cliente, categoria, banco, Hoje, Semana, Não conferidas, Canceladas, Todas e "ver em colunas". Saem (triagem 37 e 38): datas livres, faixa de valor, ordenação, presets de auditoria, salvar visão, e trimestre/ano no filtro da lista (o Resultado tem Mês e Trimestre) |
| Etiquetas de filtro ativo, cada uma com ✕ | Ficam |
| ⌘F foca a busca; Esc fecha o painel | Ficam |
| Busca vinda de outra tela (Pedidos → "Pedido #123") | Fica: abre a lista em **Todas** com a busca preenchida |

O filtro usa `filtrarContas`, e o agrupamento usa `agruparParaLista`. O `useFinanceFilters` vira uma casca fina sobre os dois.

### 2.3 Lista
| Hoje | Vira |
|---|---|
| Linha do tempo (Atrasados, Vence hoje, Esta semana…) ou duas colunas A Receber \| A Pagar | **Lista por data** como padrão, com os grupos de `agruparParaLista` ("3 dias de atraso", "Hoje", "qua 09/10"…). Colunas viram opção dentro de Filtros (triagem 39a: não apagar) |
| Subtotal por coluna e "N urgente" | O subtotal fica, em letra normal. O "urgente" piscando sai: o âmbar do vencido já diz isso |
| Parcela de pedido não entregue misturada com as vencidas | Some por padrão. Aparece quando há busca ou cliente, com a etiqueta "aguardando entrega". Embaixo da lista, uma linha diz "R$ X de pedidos em produção não aparecem aqui" |

### 2.4 Lateral direita
| Hoje | Vira | Triagem |
|---|---|---|
| Contas bancárias | **Bancos**: nome, saldo, e "✓" ou "N a conferir". Clicar abre a `JanelaConferirBanco`. O "⋯" do bloco guarda: nova conta bancária, editar, inativar e reativar, mostrar inativas, e Sinc saldos (com o aviso de hoje) | 23, 24, 25 |
| Pizza de categorias | **Gastos por categoria** (fica, como pedido em 07/10): barras horizontais, as 6 maiores mais "Outros". Mostra o que **saiu** no mês por data de pagamento, a mesma conta do Resultado (`caixaDoPeriodo().porCategoria`), então os números batem entre as duas telas. Tem setas ‹ › de mês. Clicar numa barra filtra a lista naquela categoria, em Pagas. O "+ categoria" de hoje vai para o "⋯" | 9, 11 |
| Gráfico de fluxo, Simulador | Saem. O fluxo virou o "fecha com"; o simulador foi excluído | 6, 40 |
| (novo) | **Caixinhas**: "R$ X reservado em N caixinhas", que leva à aba Caixinhas | 33 |

## 3. Inventário de nuances

Cada subfunção que existe hoje e onde ela fica. **À vista** = na tela sem clicar em nada.
**⋯** = menu do bloco. **Mais opções** = a janela completa, a um clique do atalho (regra do Luiz).

### 3.1 A conta (linha da lista)
| Subfunção | Onde fica |
|---|---|
| Ver detalhe (clicar na linha) | À vista. Abre o **PaymentModal**: histórico, anexos, estorno e baixa completa |
| Recebi / Paguei | À vista, botão de 40px. Abre a **JanelaDeBaixa** já preenchida |
| Corrigir valor ou vencimento (só sem pagamento) | Ícone na linha (no celular sempre visível, no computador ao passar o mouse). Abre o `EditarContaModal` |
| Cancelar (bloqueado se tiver pagamento ativo, com o motivo) | Ícone na linha |
| Conferir (conta quitada) | Ícone na linha e pela janela Conferir banco |
| **Desfazer conferência com motivo** | Ícone na linha (conta conferida). Abre a janela de motivo. **Fecha o portão I4** |
| Recorrente (↻), parcela N/M, anexo (📎), barra de % pago, "R$ X restante" | À vista, na segunda linha, só quando existem |
| Motivo de "não conferida" | À vista, na segunda linha, em âmbar |
| Categoria | À vista só quando existe (nunca "Sem categoria") |
| Atraso ("3 dias de atraso", "hoje", "em 4 dias") | À vista, no lugar da data |

### 3.2 Baixa rápida (`JanelaDeBaixa`)
| Subfunção | Onde fica |
|---|---|
| Valor = o restante, data = hoje, banco sugerido pelo costume (`bancoSugerido`) | À vista, editáveis |
| Sugestão de guardar nas caixinhas (% de cada uma), sim/não por caixinha | À vista, só em recebimento |
| **Mais opções** | À vista. Fecha a rápida e abre o PaymentModal da mesma conta |

### 3.3 Baixa completa e detalhe (`PaymentModal`) — tudo fica
| Subfunção | Onde fica |
|---|---|
| Valor parcial | Campo valor |
| **Quitar com desconto** (valor menor + "baixa com desconto" + motivo) | Caixa de marcar e campo de motivo |
| **Acréscimo** (valor maior que o saldo, juros ou multa, com motivo) | Automático quando o valor passa do saldo, com o motivo |
| Data, conta bancária (agrupada por tipo), método | Campos |
| **Anotação do pagamento** | Campo |
| **Lançamento informativo** ("já entrou antes do ERP", não mexe no banco) | Caixa de marcar, com a explicação |
| **Anexos**: escolher arquivo, confirmar envio, ver (prévia de PDF e imagem), remover com confirmação | Bloco Anexos |
| **Histórico**: cada pagamento com valor, data, método e nome do banco (inclusive banco inativo) | Bloco Histórico |
| **Estornar pagamento** (registro de estorno, o original fica) | Botão em cada pagamento, com confirmação |
| Resumo da operação e "Quitado" | Rodapé |

### 3.4 Corrigir conta (`EditarContaModal`) — tudo fica
- descrição, valor, vencimento;
- **aplicar na série**:
  - valor: % sobre o atual, valor fixo ou somar R$;
  - vencimento: dia do mês ou adiar/antecipar;
  - a partir de qual parcela, com prévia;
- **cancelar a série** (só as parcelas em aberto).

### 3.5 Nova conta (`ObligationForm`, modo enxuto)
| Subfunção | Onde fica |
|---|---|
| Tipo (a pagar ou a receber), descrição, valor, vencimento, cliente ou fornecedor, categoria | À vista |
| Categoria sugerida pelo histórico do fornecedor ou cliente | À vista (preenche sozinha, com a origem) |
| Cadastro rápido de cliente, fornecedor e categoria sem sair | À vista, botão "+" ao lado do campo |
| Única, **recorrente** (meses) ou **parcelada** (nº, prévia das parcelas) | Mais opções |
| Conta bancária padrão, observações | Mais opções |
| **Já foi pago/recebido?** + método → revisar e liquidar (`ConfirmarLiquidacao`) | Mais opções |
| Divisão de custos | Escondida (triagem 13: aguarda) |

### 3.6 Bancos e conferência
| Subfunção | Onde fica |
|---|---|
| Saldo de cada banco, "✓" ou "N a conferir" | À vista (lateral) |
| Conferir banco: saldo do sistema × saldo do extrato digitado, diferença, marcar conferido um a um | Janela Conferir banco (clicar no banco) |
| Nova conta bancária; editar (nome, banco, agência e conta, tipo, moeda, saldo inicial, ajuste de saldo, ativa) | ⋯ dos Bancos → `BankAccountModal` |
| Inativar e reativar conta, mostrar inativas | ⋯ dos Bancos |
| Sinc saldos (sobrescreve, com o aviso) | ⋯ dos Bancos, com confirmação |
| Filtro "só deste banco" na lista | Painel Filtros |

### 3.7 Clientes que devem (aba)
| Subfunção | Onde fica |
|---|---|
| Por cliente: em aberto, vencido, a vencer, qtd | À vista (tabela; no celular, cartões) |
| "Em produção" por cliente (informativo, não é cobrança) | À vista, coluna cinza |
| **Cobrar** (WhatsApp com a mensagem pronta; "sem telefone" quando falta) | À vista, por cliente |
| Ordenado por quem está há mais tempo vencido | À vista |
| Abrir o cliente → **pedidos entregues com saldo** (entrou, falta, vencida?) | Clicar no cliente expande |
| **Plano** (renegociar as parcelas em aberto de um pedido, `PaymentPlanModal`) | Em cada pedido expandido |
| Ver as contas do cliente | Em cada cliente → abre Contas com o filtro do cliente |
| **Divergências** (pedido cujo total ≠ soma das parcelas) + **Ajustar** (complementar ou crédito, auditável) | Aviso no topo, só quando existe; expande a lista com o botão Ajustar |
| Recalcular scores | ⋯ da aba (até o recálculo automático, triagem 32) |
| A disparar | **Sai**: a baixa é o Recebi da aba Contas e a entrega é o Confirmar entrega do Quadro (26) |
| Adiantamentos (lista) | **Sai como aba**: o total vira "recebido antecipado" no Resultado (28) e cada cliente mostra a coluna Em produção |
| Por meio de pagamento | **Sai** (triagem 30) |

### 3.8 Caixinhas (aba)
| Subfunção | Onde fica |
|---|---|
| Livre para usar, nos bancos, nas caixinhas | À vista, no topo |
| Cada caixinha: nome, cor, saldo, barra da meta | À vista |
| **Guardar** (livre → caixinha) e **Tirar** (caixinha → livre) | À vista em cada caixinha |
| **Extrato** (movimentos) e **transferir** para outra caixinha | ⋯ da caixinha |
| Editar (nome, cor, finalidade, meta, notas, **% automático**) e excluir | ⋯ da caixinha |
| **Distribuir um valor** (provisionar % a partir de um valor-base, com prévia e aviso de livre insuficiente) | ⋯ do topo. O dia a dia é a sugestão na baixa (34) |
| Nova caixinha | À vista |
| Prazo da meta e saldo mínimo | **Saem da tela** (triagem 35). As colunas ficam no banco |

### 3.9 Resultado (aba)
- **Período:** Mês ou Trimestre, com setas.
- **Caixa:**
  - entrou;
  - − impostos;
  - − custo das peças;
  - sobrou da produção (%);
  - − despesas;
  - − juros e tarifas;
  - lucro de caixa;
  - comparação com o período anterior.
- **Vendas pela entrega:** pedidos, peças, vendido, recebido antecipado.
- **Para onde foi o dinheiro:** clicar na barra abre Contas filtrada.
- **Exportar PDF.**
- **Aviso** quando os pagamentos passam de 5.000.

### 3.10 Fora da tela de Finanças, mas parte do fluxo
**Confirmar entrega** no Quadro: confere as parcelas, permite revisar o plano, e só então a parcela vira "a receber". Não muda.

## 4. Visual (aprovado em 07/10)

1. **Abas no topo** no lugar de uma segunda coluna de menu (seção 5).
2. **Espaçamento:**
   - 40px entre seções, sem linhas divisórias;
   - 16px dentro de cada seção;
   - conteúdo com até 1080px mais a lateral de 280px, centralizado.
3. **Filtros recolhidos**, como em 2.2.
4. **Linha da lista:**
   - mais alta: descrição em 14px e, embaixo, só o cliente ou fornecedor;
   - categoria só quando existe;
   - valor à direita;
   - Recebi/Paguei com área de toque de 40px.
5. **Números do topo** sem borda, sem brilho e sem sombra, com rótulo em letra normal. O número escolhido ganha um sublinhado.
6. **Rótulos e cor:**
   - **rótulos** em cinza, 12px, letra normal;
   - **saem** `uppercase tracking-*`, `font-black`, os ícones decorativos nos rótulos e textos de 8 a 10px;
   - **sem vermelho**: vencido é âmbar; o vermelho fica só para erro e ação destrutiva;
   - receber e pagar se distinguem por sinal (+ e −) e texto, não por verde e vermelho.
7. **Resultado:** mais espaço entre as linhas e barras mais finas. **Caixinhas:** como em 3.8.
8. **Clientes que devem no celular:** cartões em vez de tabela.
9. **Janelas:** margem interna de 24px, campos de 40px e um botão principal. Abrem por `createPortal(…, document.body)`.

As outras telas do app ficam como estão até o plano da navegação.

## 5. Navegação

A seção Finanças passa a ter quatro views, mostradas como **abas no topo** e não na lateral:

| View | Aba | Tela |
|---|---|---|
| `finance` | Contas | `Finance.tsx` adaptada |
| `receivables` | Clientes que devem | `ReceivablesControlPanel` adaptado |
| `envelopes` | Caixinhas | `EnvelopesPanel` adaptado |
| `resultado` (nova) | Resultado | `ResultadoDoMes` (sai de `pages/financas`) |

- **Sai:** a view `financas` (Finanças v3).
- **Ficam:** os atalhos de hoje, que continuam funcionando:
  - o alerta "Cobrar" leva a `receivables`;
  - Pedidos leva a `finance` com a busca.
- **Novo em `navegacao.ts`:** `SECOES_COM_ABAS = ['financas']`. `temLateral` devolve `false` para elas, e um componente novo, `AbasDaSecao`, desenha as abas. Esse componente é o embrião da `BarraDePassos` do desenho da navegação.
- **Teto do teste "lista longa":** fica em 4 enquanto o Resultado morar aqui. Volta a 3 quando o plano da navegação levar o Resultado para "Como estamos indo".
- **Clique numa barra do Resultado ou em "ver as contas do cliente":** leva a `finance` com filtros prontos. Isso é feito por um estado `filtrosParaContas` no `App`.

## 6. Dados

- **`useFinanceData`** passa a carregar também o que a aba Contas precisa: os pagamentos (`getAllPaymentsComTeto`), as caixinhas e a visão das caixinhas. Assim são uma carga só e um recarregar só.
- **A aba Resultado** usa o `useDadosDasFinancas`, que já existe e só carrega quando a aba é aberta.
- **As RPCs de hoje que saem da tela:** `getCashPosition`, `getAgingBuckets`, `getCashflowSeries` e `getLiquidityKPIs`. Deixam de ser chamadas, mas as funções do banco ficam.

## 7. O que sai do código no fim

- **Páginas da v3:** `src/pages/financas/Financas.tsx`, `VisaoGeral.tsx`, `Caixinhas.tsx` e `ClientesQueDevem.tsx`. `ResultadoDoMes.tsx` vai para `src/pages/Resultado.tsx`.
- **Componentes da v3:** `src/components/financas/JanelaDaConta.tsx` e `src/components/financas/caixinhas/*`.
- **Componentes antigos sem uso:** `CashSimulator`, `CategoryPieChart`, `CashflowChart`, `SkeletonCard`, se nada mais os usar.
- **Em `Finance.tsx`:** o estado de presets, liquidez, aging, "mais indicadores" e o modo linha do tempo antigo.
- **Em `ReceivablesControlPanel.tsx`:** as tabelas `Pending`, `ByMethod` e `Advances`, e as abas.
- **Em `EnvelopesPanel.tsx`:** os campos de prazo e de saldo mínimo.
- **Ficam:**
  - **contas e janelas:** `src/utils/financas/*`, `JanelaDeBaixa`, `JanelaConferirBanco`, `JanelaConfirmarEntrega`, `PaymentPlanModal`;
  - **ganchos:** `useMostrarValor` e `useDadosDasFinancas`.

## 8. Testes e conferência

- A suíte inteira passa e os tipos ficam limpos.
- Conta nova vira função pura testada com `node --test`:
  - contagem do painel Filtros;
  - linhas do gasto por categoria;
  - navegação com abas.
- No navegador, com o usuário de teste, os números batem com a conferência SQL:
  - receber vencido 28.552,35;
  - receber 7 dias 1.927,60;
  - pagar vencido 15.926,16;
  - pagar 7 dias 2.724,55;
  - livre 56.804,85.
- Em 1440, 1024 e 390 px, sem rolagem para o lado.
- **Cada linha das tabelas da seção 3 é aberta e usada uma vez.** Esse é o roteiro da conferência final.

## 9. Fora deste desenho

- O plano da navegação por objetivos.
- Mudar o cadastro de bancos para Cadastros.
- Os achados nos dados de produção.
