# Lucro por pedido — plano (17/10/2026)

**Pedido do Luiz:** "uma forma de ver o lucro por pedido, baseado na folha de pagamento mensal/trimestral,
insumos e volume no período". Execução direta, sem nova aprovação ("escreva o plano e siga").

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Rateio da folha por peça** (resposta do Luiz) | Folha do período ÷ peças entregues no período = mão de obra por peça; o pedido leva peças × esse valor. |
| 2 | **Pedidos do período = entregues no período** (`delivered_at`) | É o mesmo critério do "Vendido" do Resultado; a peça entregue é a que consumiu a folha. |
| 3 | **Período: mês ou trimestre** (o mesmo seletor do Resultado) | O trimestre suaviza mês com poucas entregas ou folha concentrada. |
| 4 | **Folha por competência**: contas a pagar não canceladas das categorias Salários, INSS, FGTS e 13º salário (e os nomes antigos `Folha - …`) com vencimento no período, pelo valor da conta | O custo do mês é o que se deve pelo mês, pago ou não. Pagamento atrasado não pode tirar custo de um mês e jogar em outro. |
| 5 | **Pró-labore fica fora** | É retirada dos sócios, não mão de obra da fábrica. |
| 6 | **Material = ficha técnica × peças × custo médio do insumo**; o tecido escolhido no item substitui o da ficha (`previstoDoPedido`) | No modelo de compras por pedido, o que sobra volta ao estoque: o consumido é o da ficha. Vale igual para pedido antigo (legado) e novo. |
| 7 | **Ausência é informação** | Produto sem ficha ou insumo sem custo: o material fica incompleto e o lucro vira um TETO ("no máximo"). Sem folha lançada no período, aviso no topo. Nunca zero fingindo custo. |
| 8 | **Onde:** Como estamos indo › Vendas › Lucratividade, acima da margem por produto | Já é a tela de lucro; não cria aba (regra das 3 abas por seção). |

Fora deste plano (sugestões no fim, se valerem): impostos sobre a venda, demais custos fixos, peso por tempo de costura,
custo real das compras vinculadas para produto sem ficha.

## Tarefas

1. **Regra pura** `src/utils/financas/lucroPorPedido.ts` + `lucroPorPedido.test.ts` (TDD):
   `folhaDoPeriodo`, `lucroPorPedido({ pedidos, contas, fichas, insumos, meses })` → resumo (folha, peças, mão de obra
   por peça, totais) e linhas por pedido (valor, material, mão de obra, lucro, margem, faltas), da pior margem para a melhor.
   Casos: folha em categoria nova e antiga; conta cancelada e pró-labore fora; vencimento fora do período fora; período
   sem peça entregue (mão de obra por peça nula, não divisão por zero); produto sem ficha e insumo sem custo (teto);
   tecido do item substituindo o da ficha; trimestre somando três meses.
2. **Tela** `src/components/vendas/LucroPorPedido.tsx`: seletor Mês/Trimestre e ‹ período ›, quatro números (folha,
   peças, mão de obra por peça, lucro total), tabela por pedido (pedido, cliente, peças, valor, material, mão de obra,
   lucro, margem), faltas marcadas em âmbar, valores pelo `mostrar` (modo oculto). Ligada no topo da aba Lucratividade.
3. **Conferência:** suíte, `tsc`, build; navegador em 1440 e 375 px na v3 local; folha e peças do período batidas com o
   banco por SQL só de leitura.
