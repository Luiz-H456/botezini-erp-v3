-- =============================================================================
-- Security audit remediation — Finance module (2026-07)
-- Run this whole block in the Supabase SQL Editor (single transaction is fine).
--
-- Covers:
--   #1  obligation_summary view bypassed RLS (view owned by postgres, no
--       security_invoker) → any authenticated user, incl. the `factory` role,
--       could read ALL accounts payable/receivable through the view.
--   #5  update_bank_balance was EXECUTE-granted to `authenticated`, allowing a
--       direct arbitrary balance mutation outside the payment flow.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- #1 — Recreate obligation_summary with security_invoker so the caller's RLS
--      is enforced. Admin/manager keep access via the existing
--      single_tenant_admin_manager_all policy on the base tables; the factory
--      role (no SELECT policy on financial_obligations/obligation_payments)
--      now sees nothing through the view, matching the intended access model.
--
--      NOTE: security_invoker=on evaluates RLS as the *current* role. Inside the
--      SECURITY DEFINER RPCs (pay_obligation / reverse_payment) the current role
--      is the function owner (postgres, BYPASSRLS), so the internal status
--      recompute keeps working with no regression.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.obligation_summary
WITH (security_invoker = on) AS
SELECT
  o.id,
  o.user_id,
  o.type,
  o.status,
  o.description,
  o.original_amount,
  o.due_date,
  o.issue_date,
  o.category,
  o.cost_center_id,
  o.notes,
  o.client_id,
  o.supplier_id,
  o.default_account_id,
  o.is_recurring,
  o.recurrence_id,
  o.installment_no,
  o.total_installments,
  o.split_group_id,
  o.cancelled_at,
  o.cancelled_reason,
  o.is_reconciled,
  o.unreconciled_reason,
  o.unreconciled_at,
  o.attachments,
  o.created_at,
  o.updated_at,
  COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS paid_amount,
  o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS remaining_amount,
  COUNT(p.id) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL) AS payment_count,
  ROUND(
    CASE
      WHEN o.original_amount > 0 THEN
        COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) / o.original_amount * 100
      ELSE 0
    END,
    2
  ) AS paid_pct,
  CASE
    WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) <= 0 THEN 'paid'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) > 0 THEN 'partial'
    WHEN o.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS derived_status,
  o.global_category_id,
  o.order_id
FROM public.financial_obligations o
LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
GROUP BY o.id;

-- Keep the grant, but access is now gated by the base-table RLS at query time.
GRANT SELECT ON public.obligation_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- #5 — update_bank_balance must never be callable directly by clients. It stays
--      usable only from the SECURITY DEFINER finance RPCs (they run as the
--      function owner, which does not depend on this grant).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_bank_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- Post-apply verification (run manually, expect the noted results):
--
--   -- obligation_summary must report security_invoker=true
--   SELECT relname, reloptions
--   FROM pg_class
--   WHERE relname = 'obligation_summary';
--
--   -- authenticated must NOT have EXECUTE on update_bank_balance
--   SELECT has_function_privilege('authenticated',
--          'public.update_bank_balance(uuid, numeric)', 'EXECUTE');  -- expect: false
--
-- Related follow-up (out of this patch's scope, same class as #1): the
-- `transactions` and `payable_accounts` views should also be recreated
-- WITH (security_invoker = on) if they read finance tables.
-- =============================================================================
