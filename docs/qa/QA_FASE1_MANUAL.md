# QA Manual — Fase 1 (verdade única) + correções de segurança

> **Pré-condição para todos os casos:** os dois SQLs aplicados no Supabase
> (`fix_security_audit_2026_07.sql` e `finance_phase1_single_source_of_truth.sql`),
> e o dev server rodando (`npm run dev` → http://localhost:5174).
>
> Legenda: ✅ = passou, ❌ = falhou. Registre evidência (print/valor) em cada caso.

---

## Bloco A — Segurança (fazer primeiro)

### A1. Operador não enxerga o financeiro (RLS #1)
**Objetivo:** confirmar que o papel `factory` não lê AR/AP.
1. Login como usuário **factory** (operador).
2. Confirme que o app leva direto à Produção e não deixa navegar ao Financeiro.
3. (Prova de API) No console do navegador logado como factory, rode:
   ```js
   const { data } = await window.supabase
     .from('obligation_summary').select('id').limit(5);
   console.log(data);
   ```
   **Esperado:** `[]` (vazio). ❌ se retornar qualquer linha → SQL de segurança não aplicado.
4. Repita com `.from('order_financial_status')` → **esperado `[]`**.

### A2. Admin/manager continua vendo o financeiro
1. Login como **admin**. Abra o módulo Financeiro.
2. **Esperado:** obrigações e KPIs carregam normalmente. ✅

### A3. Saldo bancário não é manipulável direto (#5)
1. Logado como admin, no console:
   ```js
   await window.supabase.rpc('update_bank_balance',
     { p_account_id: crypto.randomUUID(), p_delta: 0 });
   ```
   **Esperado:** erro (permissão negada / função não encontrada para o papel). ❌ se retornar sucesso.

---

## Bloco B — Conversão de orçamento (entrada pendente + saldo)

### B1. Conversão COM entrada (sinal parcial)
**Pré:** um orçamento com `total = 1000` e `down_payment_value = 300`, status ≠ Convertido.
1. Em Orçamentos, clique **Gerar Pedido** e confirme.
2. Vá ao Financeiro → Recebíveis.
**Esperado:**
- Duas obrigações do pedido: **"… — Entrada" = R$ 300** e **"… — Saldo" = R$ 700**.
- Ambas **pendentes** (nada pago). "Recebido" do pedido = **R$ 0**.
- Total a receber do pedido = **R$ 1.000**. ✅

### B2. Conversão SEM entrada
**Pré:** orçamento com `down_payment_value = 0`.
1. Gerar Pedido.
**Esperado:** **uma** obrigação única pelo total; nenhuma "Entrada/Saldo" separada. ✅

### B3. Entrada não é marcada como paga
1. Após B1, verifique o pedido gerado (Pedidos) e o Financeiro.
**Esperado:** o pedido **não** mostra a entrada como recebida; "recebido" só sobe após lançar pagamento real. (Correção do bug: antes marcava `amount_paid = 300` sem pagamento.) ✅

### B4. Sem duplicidade ao concluir/entregar
1. Mova o pedido de B1 até **Concluído** e depois **Entregue**.
2. Volte ao Financeiro.
**Esperado:** continuam **as mesmas 2 obrigações** (nenhuma terceira criada na entrega). ✅

### B5. Rollback de conversão
**Pré:** força um erro (ex.: cliente inexistente / desconectar rede no meio) — opcional.
**Esperado:** se a conversão falhar, o pedido e quaisquer obrigações criadas são desfeitos (nada órfão). ✅

---

## Bloco C — Recebimento e status derivado

### C1. Pagar a entrada → recebido sobe
1. No recebível "… — Entrada" (R$ 300), registre um pagamento de R$ 300 numa conta ativa.
**Esperado:**
- "Recebido" do pedido = **R$ 300**, a receber = **R$ 700**.
- Status do pedido/obrigação = **parcial**.
- Saldo da conta bancária **aumenta R$ 300** (receivable). ✅

### C2. Pagar o saldo → quitado
1. Pague os R$ 700 do "… — Saldo".
**Esperado:** pedido **quitado** (recebido = 1000, a receber = 0). ✅

### C3. Estorno reverte corretamente
1. Estorne o pagamento da entrada (C1).
**Esperado:** "recebido" volta a R$ 0 daquela parcela; saldo bancário reduz R$ 300; cria registro de estorno (imutável, não apaga). ✅

### C4. Vencimentos independentes e editáveis
1. Abra a obrigação "… — Saldo" e altere a data de vencimento.
**Esperado:** o vencimento do saldo é editável e independe do prazo de produção. ✅

---

## Bloco D — Consistência da view

### D1. Invariante total = recebido + a_receber
1. Para qualquer pedido com recebível, compare no Financeiro (ou via SQL):
   ```sql
   SELECT * FROM order_financial_status WHERE order_id = '<id>';
   ```
**Esperado:** `total = received + to_receive` sempre. ✅

### D2. Pedidos legados
1. Abra um pedido antigo (criado antes da Fase 1).
**Esperado:** aparece com sua obrigação-lump única; a view soma corretamente por `order_id`; sem erro. ✅

---

## Checklist de regressão rápida
- [ ] Login admin abre Financeiro; login factory não.
- [ ] Converter orçamento gera Entrada+Saldo (ou único sem sinal).
- [ ] "Recebido" só muda com pagamento real.
- [ ] Concluir/Entregar não duplica recebível.
- [ ] Pagar/estornar mexe no saldo bancário coerentemente.
- [ ] `total = recebido + a receber` em todo pedido.
