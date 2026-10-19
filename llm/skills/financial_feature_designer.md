# Skill: Financial Feature Designer

**Description:**
Specialized skill for designing and implementing financial features in the Botezini ERP.

**Instructions:**
1. Acknowledge the ERP's unified financial architecture:
   - There are no separate "Payables" or "Receivables" physical tables.
   - Financial data is a combination of `orders`, `invoices`, and standalone `transactions`.
   - The unified source of truth is the Supabase VIEW `obligation_summary`.
2. When a new financial feature is requested (e.g., Bank Reconciliation, Splitting payments):
   - Do NOT suggest creating a new table unless absolutely necessary.
   - Suggest extending `types/index.ts` and `storageService.ts` to push JSON metadata or extra columns onto the existing transactions.
3. Keep the UI logic in `Finance.tsx` and `FinanceComponents.tsx` aligned with the existing generic filtering and mapping structures.
