# Cliente novo é confiável? — o que o sistema responde e o que ele não responde

## O sistema já pontua clientes. Só que não os novos.

Existe no banco a função `get_client_score`, que calcula uma nota de 0 a 100 por
cliente. Ela pesa:

| Peso | O que mede |
|---|---|
| 40% | % de pagamentos feitos no prazo |
| 25% | atraso médio em dias |
| 20% | quanto do que ele deve está vencido agora |
| 10% | volume histórico comprado |
| 5% | número de pedidos |

Para atualizar todos de uma vez, no SQL Editor do Supabase:

```sql
SELECT public.refresh_client_scores();
```

Depois, os piores primeiro:

```sql
SELECT company_name, score_cached, credit_limit, default_payment_terms
  FROM public.clients
 WHERE score_cached IS NOT NULL
 ORDER BY score_cached ASC
 LIMIT 20;
```

**Vale rodar antes de fechar qualquer pedido grande com cliente antigo.**

## Para cliente novo, a nota volta vazia — e isso está certo

A função devolve `NULL` quando não há histórico. Não é falha: é a resposta
honesta. Nenhum cálculo em cima de zero pedidos diz se alguém paga.

Um sistema que inventasse uma nota para cliente novo seria pior que não ter
nota, porque você confiaria nela.

**Então confiabilidade de cliente novo não é problema de software — é de
processo.** O que segue é o processo.

---

## Verificação externa (5 minutos, antes do primeiro pedido)

Nada disso o ERP consegue fazer sozinho: são consultas fora dele.

**1. O CNPJ existe e está ativo?**
Consulte em `receita.fazenda.gov.br` ou em qualquer consulta pública de CNPJ.
Confira três coisas:
- **Situação cadastral** — precisa estar ATIVA. "Baixada" ou "inapta" é recusa.
- **Data de abertura** — empresa aberta há menos de 6 meses pede cautela extra.
- **Razão social bate** com o que ele te passou? Divergência é sinal de alerta.

**2. Tem protesto ou restrição?**
Consulta de protesto pelo CNPJ (cartórios/CENPROT) é gratuita e leva 1 minuto.
Serviços pagos (Serasa, Boa Vista) dão mais, mas para o primeiro pedido o
protesto costuma bastar.

**3. A empresa é encontrável?**
Site, Instagram, Google Maps no endereço informado, telefone fixo. Empresa
real deixa rastro. Nenhum rastro + pedido grande + pressa é a combinação
clássica do calote.

**4. Referência comercial.**
A pergunta mais eficaz e a menos feita:

> "Você já comprou uniforme de alguém antes? Consegue me passar o contato do
> fornecedor anterior?"

Quem paga bem responde na hora e sem desconforto. Hesitação aqui diz mais que
qualquer consulta.

---

## Política para o primeiro pedido

Verificação reduz risco, não elimina. O que **elimina** é não expor caixa:

**Sinal maior.** No primeiro pedido, 50% na confirmação — não 30%. O sinal
precisa cobrir pelo menos o custo do material, para que um calote custe seu
trabalho, nunca seu dinheiro.

**Nada sai sem quitação.** Primeiro pedido: saldo pago antes da entrega, não
depois. A partir do segundo, com o pagamento em dia, você libera prazo.

**Limite de crédito baixo.** Preencha o campo *Limite de crédito* no cadastro
com algo que você aceitaria perder. Aumente conforme ele paga.

**Personalização é o ponto sem volta.** Peça bordada com o nome de outra empresa
não se revende — vira prejuízo total. Se for personalizada, o sinal precisa
cobrir material **e** a personalização antes de bordar.

**Prazo apertado + volume alto + cliente novo = pare e confira.** É o padrão de
quem não pretende pagar: a pressa existe para atropelar a checagem.

---

## Depois do primeiro pedido, o sistema assume

Quando houver histórico, dois lugares passam a responder por você:

- **`score_cached`** no cadastro — a nota consolidada.
- **A previsão de recebimento** — mede o desvio típico daquele cliente pelo
  histórico real. É ela que diz "o Hospital paga 12 dias depois, sempre", e é
  isso que a projeção de caixa usa em vez do vencimento prometido.

Ou seja: a desconfiança é necessária uma vez só. Depois vira dado.
