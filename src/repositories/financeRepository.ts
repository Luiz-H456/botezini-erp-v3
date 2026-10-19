import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { getNow } from '@/utils';
import { camposDaConta } from '@/utils/contaBancaria';
import { indexarContasPorObrigacao } from '@/utils/filtroPorContaBancaria';
import { lerEmPaginas } from '@/utils/financas/paginas';
import {
    CostCenter,
    BankAccount,
    BudgetLine,
    CashSnapshot,
    ObligationSummary,
    ObligationPayment,
    FinancialObligation
} from '@/types';



export class FinanceRepository {

    // -- FINANCIAL CATEGORIES (legado retirado) --
    // O sistema `financial_categories` foi aposentado (Front 4): estava vazio de
    // dados reais e duplicava `global_categories(domain='finance')`, que é a
    // fonte oficial. Use getGlobalCategories('finance').

    // -- COST CENTERS --
    async getCostCenters(): Promise<CostCenter[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('cost_centers')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error("Erro ao buscar centros de custo:", error.message);
            return [];
        }
        return data || [];
    }

    async saveCostCenter(costCenter: CostCenter): Promise<CostCenter> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = {
            id: costCenter.id || idService.generateUUID(),
            user_id: user.id,
            name: costCenter.name,
            type: costCenter.type || 'administrative',
            color: costCenter.color || '#8b5cf6',
            budget_limit: costCenter.budget_limit ?? 0,
            is_active: costCenter.is_active !== false,
            categories: costCenter.categories || [],
            updated_at: now,
            created_at: costCenter.created_at || now
        };

        const { error } = await supabase.from('cost_centers').upsert(payload);
        if (error) throw new Error(error.message);
        return payload as CostCenter;
    }

    async deleteCostCenter(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('cost_centers').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }


    async getBankAccounts(onlyActive = true): Promise<BankAccount[]> {
        if (!supabase) return [];
        let query = supabase.from('bank_accounts').select('*');
        if (onlyActive) query = query.eq('is_active', true);
        const { data, error } = await query.order('name', { ascending: true });
        if (error) throw new Error(error.message);
        return (data || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            bank_name: r.bank_name,
            account_number: r.account_number,
            agency: r.agency,
            type: r.type,
            initial_balance: Number(r.initial_balance),
            current_balance: Number(r.current_balance),
            currency: r.currency || 'BRL',
            is_active: r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
            // A chave só existe quando a coluna existe: é assim que a tela sabe se o SQL rodou.
            ...('titular' in r ? { titular: r.titular ?? null, chave_pix: r.chave_pix ?? null } : {}),
        } as BankAccount));
    }

    async saveBankAccount(ba: BankAccount): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const ehNova = !ba.id;
        const campos = camposDaConta(ba, ehNova);

        // Criar e editar deixaram de ser o mesmo upsert, e a diferenca e o
        // ponto: o UPDATE nao carrega campo de saldo nenhum. Enquanto os dois
        // eram a mesma gravacao, abrir a tela e salvar devolvia o
        // `initial_balance` que estava em memoria e desfazia, em silencio, a
        // ancora que `set_bank_balance` tinha acabado de calcular.
        // Ver utils/contaBancaria.ts.
        if (ehNova) {
            const { error } = await supabase.from('bank_accounts').insert({
                ...campos,
                id: idService.generateUUID(),
                user_id: user.id,
                created_at: now,
                updated_at: now,
            });
            if (error) throw new Error(error.message);
            return;
        }

        const { error } = await supabase
            .from('bank_accounts')
            .update({ ...campos, updated_at: now })
            .eq('id', ba.id);
        if (error) throw new Error(error.message);
    }

    // NOTE: update_bank_balance is intentionally NOT exposed to the client.
    // Bank balances are mutated only by the SECURITY DEFINER RPCs
    // (pay_obligation / reverse_payment). For corrective rebuilds use
    // recalculateAllBankBalances(). See supabase/fix_security_audit_2026_07.sql (#5).

    async deleteBankAccount(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        // Soft delete (inactivate)
        const { error } = await supabase
            .from('bank_accounts')
            .update({ "is_active": false, "updated_at": getNow().toISOString() })
            .eq('id', id);
        if (error) throw new Error(error.message);
    }

    async reactivateBankAccount(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase
            .from('bank_accounts')
            .update({ "is_active": true, "updated_at": getNow().toISOString() })
            .eq('id', id);
        if (error) throw new Error(error.message);
    }

    // -- CASH SNAPSHOTS --
    async getCashSnapshots(limit = 30): Promise<CashSnapshot[]> {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase
                .from('cash_snapshots')
                .select('*')
                .order('snapshot_date', { ascending: false })
                .limit(limit);
            if (error) throw new Error(error.message);
            return (data || []).map((r: any) => ({
                id: r.id,
                snapshot_date: r.snapshot_date,
                calculated_balance: Number(r.calculated_balance),
                confirmed_balance: r.confirmed_balance != null ? Number(r.confirmed_balance) : undefined,
                discrepancy: r.discrepancy != null ? Number(r.discrepancy) : undefined,
                closed_by: r.closed_by,
                notes: r.notes,
                created_at: r.created_at,
            } as CashSnapshot));
        } catch (e) {
            console.warn("Cash snapshots table deprecated or missing");
            return [];
        }
    }

    async saveCashSnapshot(snap: CashSnapshot): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = {
            id: snap.id || idService.generateUUID(),
            user_id: user.id,
            snapshot_date: snap.snapshot_date,
            calculated_balance: snap.calculated_balance,
            confirmed_balance: snap.confirmed_balance ?? null,
            closed_by: snap.closed_by || null,
            notes: snap.notes || null,
            "created_at": now,
        };
        const { error } = await supabase.from('cash_snapshots').upsert(payload, { onConflict: 'user_id,snapshot_date' });
        if (error) throw new Error(error.message);
    }

    // =============================================================================
    // FINANCIAL V2 — Modelo Contábil Profissional
    // =============================================================================

    /**
     * Retorna todas as obrigações com saldo calculado (via VIEW obligation_summary).
     * Suporta filtros por tipo, status e intervalo de datas.
     */
    async getObligations(opts?: {
        type?: 'receivable' | 'payable';
        status?: string[];
        from?: string;   // ISO date
        to?: string;
        client_id?: string;
        supplier_id?: string;
        order_id?: string;
    }) {
        const client = supabase;
        if (!client) return [] as ObligationSummary[];
        // O servidor corta cada resposta em 1.000 linhas (max_rows): lê em páginas,
        // com id de desempate para elas não se sobreporem.
        const { linhas, truncado, erro } = await lerEmPaginas<any>((de, ate) => {
            let query = client
                .from('obligation_summary')
                .select('*')
                .order('due_date', { ascending: true })
                .order('id', { ascending: true });

            if (opts?.type) query = query.eq('type', opts.type);
            if (opts?.status?.length) query = query.in('derived_status', opts.status);
            if (opts?.from) query = query.gte('due_date', opts.from);
            if (opts?.to) query = query.lte('due_date', opts.to);
            if (opts?.client_id) query = query.eq('client_id', opts.client_id);
            if (opts?.supplier_id) query = query.eq('supplier_id', opts.supplier_id);
            if (opts?.order_id) query = query.eq('order_id', opts.order_id);
            return query.range(de, ate);
        }, 50000);
        if (erro) throw new Error(erro);
        if (truncado) console.warn('getObligations: teto de 50.000 contas atingido; a lista está incompleta.');
        return linhas.map((r: any) => ({
            ...r,
            original_amount: Number(r.original_amount),
            paid_amount: Number(r.paid_amount),
            remaining_amount: Number(r.remaining_amount),
            paid_pct: Number(r.paid_pct),
            payment_count: Number(r.payment_count),
            is_recurring: Boolean(r.is_recurring),
            awaiting_delivery: Boolean(r.awaiting_delivery),
            // Antes de rodar entrada_vale_antes_da_entrega.sql a coluna não existe: vale o sentido antigo.
            pedido_em_aberto: r.pedido_em_aberto == null ? Boolean(r.awaiting_delivery) : Boolean(r.pedido_em_aberto),
        } as ObligationSummary));
    }

    /** Retorna os pagamentos de uma obrigação específica */
    async getObligationPayments(obligationId: string) {
        if (!supabase) return [] as ObligationPayment[];
        const { data, error } = await supabase
            .from('obligation_payments')
            .select('*')
            .eq('obligation_id', obligationId)
            .order('payment_date', { ascending: true });
        if (error) throw new Error(error.message);
        return (data || []).map((r: any) => ({
            ...r,
            amount: Number(r.amount),
        } as ObligationPayment));
    }

    /**
     * Todos os pagamentos já registrados.
     *
     * A previsão de recebimento precisa do histórico inteiro para medir o
     * desvio típico de cada cliente — pedir obrigação por obrigação seria uma
     * requisição por conta.
     */
    /**
     * As contas bancárias que cada obrigação tocou, para o filtro do financeiro.
     *
     * Traz só quatro colunas em vez de `select('*')`: o índice não precisa de
     * valor, data, método nem anexo, e essa tabela cresce a cada baixa. Uma
     * consulta magra aqui é a diferença entre um filtro que abre junto com a
     * página e um que faz a tela esperar.
     */
    async getContasPorObrigacao(limite = 20000): Promise<Record<string, string[]>> {
        if (!supabase) return {};
        const client = supabase;
        const { linhas, erro } = await lerEmPaginas<any>((de, ate) => client
            .from('obligation_payments')
            .select('obligation_id, account_id, reversed_at, reversal_of')
            .order('id', { ascending: true })
            .range(de, ate), limite);
        if (erro) {
            console.error('getContasPorObrigacao:', erro);
            // Índice vazio degrada para "o filtro só acha pela conta prevista",
            // que é pior mas honesto. Melhor que a tela inteira não carregar.
            return {};
        }
        return indexarContasPorObrigacao(linhas);
    }

    async getAllPayments(limite = 5000) {
        return (await this.getAllPaymentsComTeto(limite)).pagamentos;
    }

    /**
     * O mesmo que getAllPayments, mas dizendo se o teto foi atingido.
     *
     * `.limit(n)` devolve exatamente `n` linhas quando existe mais que isso, e
     * não avisa. Para uma LISTA isso só significa "mostrando os mais recentes";
     * para uma SOMA significa um total errado com cara de certo — e a
     * conferência de saldo é uma soma.
     *
     * Quem soma precisa saber que parou no teto. Por isso o retorno carrega o
     * aviso em vez de deixar quem chama adivinhar comparando tamanhos.
     */
    async getAllPaymentsComTeto(limite = 5000): Promise<{
        pagamentos: ObligationPayment[];
        truncado: boolean;
    }> {
        if (!supabase) return { pagamentos: [], truncado: false };
        const client = supabase;
        const { linhas, truncado, erro } = await lerEmPaginas<any>((de, ate) => client
            .from('obligation_payments')
            .select('*')
            .order('payment_date', { ascending: false })
            .order('id', { ascending: false })
            .range(de, ate), limite);
        if (erro) {
            console.error('getAllPayments:', erro);
            // Erro não é lista vazia: devolver [] com truncado=false diria que
            // a conta fecha em zero, que é a mentira mais cara possível aqui.
            return { pagamentos: [], truncado: true };
        }
        return {
            pagamentos: linhas.map((r: any) => ({ ...r, amount: Number(r.amount) } as ObligationPayment)),
            truncado,
        };
    }

    /** Cria uma obrigação simples (não recorrente) */
    async createObligation(o: {
        type: 'receivable' | 'payable';
        description: string;
        original_amount: number;
        due_date: string;
        category?: string;
        cost_center_id?: string;
        client_id?: string;
        supplier_id?: string;
        default_account_id?: string;
        order_id?: string;
        notes?: string;
        split_group_id?: string;
        attachments?: string[];
    }) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Strip 'status' or other view-only fields if they leak from UI
        const { status, derived_status, ...rest } = o as any;

        const { data, error } = await supabase
            .from('financial_obligations')
            .insert({
                ...rest,
                user_id: user.id,
                issue_date: new Date().toISOString().split('T')[0],
                is_recurring: false,
            })
            .select()
            .single();
        if (error) {
            console.error("DEBUG RLS ERROR:", { payload: rest, error });
            throw new Error(`Erro ao salvar obrigação (DB): ${error.message} - Detalhes no console`);
        }
        return data as FinancialObligation;
    }

    /**
     * Cria o recebível de um pedido (entrada pendente + saldo) de forma atômica
     * e idempotente por order_id. Retorna os ids das obrigações criadas (ou as
     * já existentes, se o pedido já tiver recebível ativo).
     * A entrada é PREVISÃO (nasce pendente) — não registra pagamento.
     */
    async createOrderReceivable(opts: {
        order_id: string;
        client_id?: string;
        description: string;
        total: number;
        entrada?: number;        // valor previsto do sinal (pendente)
        entrada_due?: string;    // ISO date
        saldo_due?: string;      // ISO date
    }): Promise<string[]> {
        if (!supabase) throw new Error('Supabase não configurado');
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('create_order_receivable', {
            p_order_id: opts.order_id,
            p_client_id: opts.client_id || null,
            p_description: opts.description,
            p_total: opts.total,
            p_entrada: opts.entrada ?? 0,
            p_entrada_due: opts.entrada_due || today,
            p_saldo_due: opts.saldo_due || opts.entrada_due || today,
        });
        if (error) throw new Error(error.message);
        return (data as string[]) || [];
    }

    /**
     * Status financeiro derivado por pedido (total / recebido / a receber),
     * fonte única = obligation_summary. Passe um orderId para filtrar.
     */
    async getOrderFinancialStatus(orderId?: string): Promise<import('../types/finance').OrderFinancialStatus[]> {
        if (!supabase) return [];
        let query = supabase.from('order_financial_status').select('*');
        if (orderId) query = query.eq('order_id', orderId);
        const { data, error } = await query;
        if (error) { console.error('getOrderFinancialStatus:', error); return []; }
        return (data || []).map((r: any) => ({
            order_id: r.order_id,
            total: Number(r.total),
            received: Number(r.received),
            to_receive: Number(r.to_receive),
            received_pct: Number(r.received_pct),
            next_due_date: r.next_due_date,
            has_overdue: Boolean(r.has_overdue),
            payment_status: r.payment_status,
        }));
    }

    // =========================================================================
    // FASE 2 — Controles de recebíveis (entregues × recebidos)
    // =========================================================================

    /** Pedidos entregues/concluídos com saldo em aberto (lista de cobrança). */
    async getDeliveredUnpaid(): Promise<import('../types/finance').DeliveredUnpaidRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_delivered_unpaid');
        if (error) { console.error('getDeliveredUnpaid:', error); return []; }
        return (data || []) as import('../types/finance').DeliveredUnpaidRow[];
    }

    /** Adiantamentos: recebido em pedidos ainda não entregues. */
    async getAdvanceReceived(): Promise<import('../types/finance').AdvanceReceivedRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_advance_received');
        if (error) { console.error('getAdvanceReceived:', error); return []; }
        return (data || []) as import('../types/finance').AdvanceReceivedRow[];
    }

    /** Recebíveis agregados por cliente (aberto/vencido/a vencer). */
    async getClientReceivables(): Promise<import('../types/finance').ClientReceivablesRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_client_receivables');
        if (error) { console.error('getClientReceivables:', error); return []; }
        return (data || []) as import('../types/finance').ClientReceivablesRow[];
    }

    /** Quebra de pagamentos por meio de pagamento no período. */
    async getPaymentMethodBreakdown(start: string, end: string): Promise<import('../types/finance').PaymentMethodBreakdownRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_payment_method_breakdown', { p_start: start, p_end: end });
        if (error) { console.error('getPaymentMethodBreakdown:', error); return []; }
        return (data || []) as import('../types/finance').PaymentMethodBreakdownRow[];
    }

    // =========================================================================
    // FASE 3 — Score do cliente e plano de pagamento
    // =========================================================================

    /** Score derivado (0–100) de um cliente; null = sem histórico. */
    async getClientScore(clientId: string): Promise<import('../types/finance').ClientScore | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.rpc('get_client_score', { p_client_id: clientId }).single();
        if (error) { console.error('getClientScore:', error); return null; }
        return (data ?? null) as import('../types/finance').ClientScore | null;
    }

    /** Materializa o score no cache de todos os clientes. Retorna a contagem. */
    async refreshClientScores(): Promise<number> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('refresh_client_scores');
        if (error) throw new Error(error.message);
        return Number(data) || 0;
    }

    /** Aplica um plano de pagamento (N parcelas) a um pedido. Idempotente por order_id. */
    async applyOrderPaymentPlan(opts: {
        order_id: string;
        client_id?: string;
        description: string;
        /**
         * `method` viaja no JSONB e a função SQL o grava em `planned_method`.
         * O tipo o omitia — passava em runtime por tipagem estrutural, mas
         * quem lesse a assinatura concluiria que o meio de pagamento se perde
         * na conversão, e acabaria reimplementando o que já funciona.
         */
        plan: Array<{ label: string; amount: number; due: string; method?: string }>;
    }): Promise<string[]> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('apply_order_payment_plan', {
            p_order_id: opts.order_id,
            p_client_id: opts.client_id || null,
            p_description: opts.description,
            p_plan: opts.plan,
        });
        if (error) throw new Error(error.message);
        return (data as string[]) || [];
    }

    /** Parcelas a DISPARAR: pendentes de pedidos concluídos/entregues (Fase 7). */
    async getPendingInstallments(): Promise<import('../types/finance').PendingInstallmentRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_pending_installments');
        if (error) { console.error('getPendingInstallments:', error); return []; }
        return (data || []) as import('../types/finance').PendingInstallmentRow[];
    }

    /**
     * Revisa a parte EM ABERTO do plano de um pedido (Fase 5). Parcelas com
     * pagamento ativo são preservadas; as em aberto são canceladas e recriadas.
     */
    async reviseOrderPlan(opts: {
        order_id: string;
        client_id?: string;
        description: string;
        plan: Array<{ label: string; amount: number; due: string; method?: string }>;
    }): Promise<string[]> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('revise_order_plan', {
            p_order_id: opts.order_id,
            p_client_id: opts.client_id || null,
            p_description: opts.description,
            p_plan: opts.plan,
        });
        if (error) throw new Error(error.message);
        return (data as string[]) || [];
    }

    // =========================================================================
    // FASE 4 — Reconciliação de pedido revisado
    // =========================================================================

    /** Compara total do pedido × soma das obrigações; retorna delta + sugestão. */
    async getOrderReconciliation(orderId: string): Promise<import('../types/finance').OrderReconciliation | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.rpc('get_order_reconciliation', { p_order_id: orderId }).single();
        if (error) { console.error('getOrderReconciliation:', error); return null; }
        return (data ?? null) as import('../types/finance').OrderReconciliation | null;
    }

    /** Lista pedidos cujo total diverge da soma das obrigações (recotados). */
    async getOrdersNeedingReconciliation(): Promise<import('../types/finance').OrderReconciliationRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.rpc('get_orders_needing_reconciliation');
        if (error) { console.error('getOrdersNeedingReconciliation:', error); return []; }
        return (data || []) as import('../types/finance').OrderReconciliationRow[];
    }

    /** Cria lançamento de ajuste auditável (não muta o original). Retorna o id. */
    async applyOrderAdjustment(orderId: string, delta: number, reason?: string, dueDate?: string): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('apply_order_adjustment', {
            p_order_id: orderId,
            p_delta: delta,
            p_reason: reason || null,
            p_due_date: dueDate || new Date().toISOString().split('T')[0],
        });
        if (error) throw new Error(error.message);
        return data as string;
    }

    /** Cria N obrigações recorrentes via RPC atômica */
    async createRecurrenceObligations(opts: {
        type: 'receivable' | 'payable';
        description: string;
        amount: number;
        first_due: string;
        months: number;
        category?: string;
        global_category_id?: string;
        cost_center?: string;
        client_id?: string;
        supplier_id?: string;
        account_id?: string;
        order_id?: string;
        notes?: string;
    }) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('create_recurrence_obligations', {
            p_type: opts.type,
            p_description: opts.description,
            p_amount: opts.amount,
            p_first_due: opts.first_due,
            p_months: opts.months,
            p_category: opts.category || null,
            p_global_category_id: opts.global_category_id || null,
            p_cost_center: opts.cost_center || null,
            p_client_id: opts.client_id || null,
            p_supplier_id: opts.supplier_id || null,
            p_account_id: opts.account_id || null,
            p_order_id: opts.order_id || null,
            p_notes: opts.notes || null,
        });
        if (error) throw new Error(error.message);
        return data as string[]; // array of obligation ids
    }

    /**
     * Registra um pagamento e atualiza o saldo bancário atomicamente via RPC.
     * Retorna o id do pagamento criado.
     */
    async payObligation(opts: {
        obligation_id: string;
        amount: number;
        account_id: string;
        method?: string;
        payment_date?: string;
        notes?: string;
        attachments?: string[];
        /** Abatido sem entrada de caixa: liquida a dívida, não mexe no banco. */
        desconto?: number;
        /** Juros/multa: entra no caixa, mas não amortiza a dívida. */
        acrescimo?: number;
        ajuste_motivo?: string;
    }) {
        if (!supabase) throw new Error('Supabase não configurado');
        const args: any = {
            p_obligation_id: opts.obligation_id,
            p_amount: opts.amount,
            p_account_id: opts.account_id,
            p_method: opts.method || 'PIX',
            p_payment_date: opts.payment_date || new Date().toISOString().split('T')[0],
            p_desconto: opts.desconto ?? 0,
            p_acrescimo: opts.acrescimo ?? 0,
        };
        if (opts.ajuste_motivo) args.p_ajuste_motivo = opts.ajuste_motivo;
        if (opts.notes) args.p_notes = opts.notes;
        if (opts.attachments && opts.attachments.length > 0) args.p_attachments = opts.attachments;

        const { data, error } = await supabase.rpc('pay_obligation', args);
        if (error) {
            console.error("DEBUG RPC ERROR pay_obligation:", error);
            throw new Error(error.message);
        }
        return data as string; // payment id
    }

    /**
     * Lançamento informativo: registra um recebimento/pagamento que aconteceu
     * ANTES do ERP. Baixa a conta e entra no histórico, mas NÃO mexe no saldo
     * bancário — o dinheiro já está no extrato, contá-lo de novo dobraria o caixa.
     */
    async registerInformationalPayment(opts: {
        obligation_id: string;
        amount: number;
        payment_date?: string;
        account_id?: string;
        notes?: string;
    }) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('register_informational_payment', {
            p_obligation_id: opts.obligation_id,
            p_amount: opts.amount,
            p_payment_date: opts.payment_date || new Date().toISOString().split('T')[0],
            p_account_id: opts.account_id || null,
            p_notes: opts.notes || null,
        });
        if (error) throw new Error(error.message);
        return data as string; // payment id
    }

    /**
     * Define o saldo real da conta. Ajusta também o initial_balance para que o
     * botão "Recalcular saldos" chegue no mesmo número. Retorna o saldo anterior.
     */
    async setBankBalance(account_id: string, new_balance: number, reason?: string) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('set_bank_balance', {
            p_account_id: account_id,
            p_new_balance: new_balance,
            p_reason: reason || null,
        });
        if (error) throw new Error(error.message);

        // A conta é RELIDA do banco depois de gravar, e devolvida junto.
        //
        // Sem isto, a tela continuava mostrando o `initial_balance` que carregou
        // quando abriu — zero — mesmo depois de a RPC tê-lo reancorado. Quem
        // ajustava o saldo via o número velho e concluía, com razão, que o
        // ajuste não tinha funcionado. O único jeito de a tela contar a verdade
        // sobre um valor DERIVADO é perguntar de novo a quem o derivou.
        const { data: linha } = await supabase
            .from('bank_accounts').select('*').eq('id', account_id).single();

        return {
            anterior: Number(data ?? 0),
            conta: (linha as BankAccount) || null,
        };
    }

    /** Estorna um pagamento existente via RPC (imutável — não edita, cria estorno) */
    async reversePayment(payment_id: string, reason?: string) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('reverse_payment', {
            p_payment_id: payment_id,
            p_reason: reason || null,
        });
        if (error) throw new Error(error.message);
    }

    /** Cancela uma obrigação (somente se sem pagamentos ativos) */
    /**
     * Cancela a recorrência ou o parcelamento inteiro, numa transação só.
     *
     * Quem decide o que entra é o banco, não a tela: a mesma regra que trava o
     * cancelamento individual — parcela com pagamento ativo não cai — vale
     * aqui, e vale no servidor. A prévia da tela é uma cortesia para a pessoa
     * saber o que vai acontecer; ela não é a autoridade.
     */
    async cancelObligationSeries(obligation_id: string, reason?: string, apenasFuturas = false): Promise<{
        canceladas: number;
        mantidas_por_pagamento: number;
        ja_estavam_canceladas: number;
        valor_cancelado: number;
    }> {
        if (!supabase) throw new Error('Sem conexão com o banco');
        const { data, error } = await supabase.rpc('cancel_obligation_series', {
            p_obligation_id: obligation_id,
            p_reason: reason || null,
            p_apenas_futuras: apenasFuturas,
        });
        if (error) throw error;
        // A função devolve TABLE, então vem um array de uma linha só.
        const l = Array.isArray(data) ? data[0] : data;
        return {
            canceladas: Number(l?.canceladas || 0),
            mantidas_por_pagamento: Number(l?.mantidas_por_pagamento || 0),
            ja_estavam_canceladas: Number(l?.ja_estavam_canceladas || 0),
            valor_cancelado: Number(l?.valor_cancelado || 0),
        };
    }

    async cancelObligation(obligation_id: string, reason?: string) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('cancel_obligation', {
            p_obligation_id: obligation_id,
            p_reason: reason || null,
        });
        if (error) throw new Error(error.message);
    }

    /** Edita metadados de uma obrigação sem mutar o valor original auditavel. */
    async updateObligation(id: string, updates: Partial<{
        description: string;
        due_date: string;
        category: string;
        cost_center_id: string;
        client_id: string;
        supplier_id: string;
        default_account_id: string;
        notes: string;
        attachments: string[];
        /** Meio previsto. Faltava aqui, então trocar a forma combinada com o
         *  cliente era impossível pela tela — só apagando e refazendo a conta. */
        planned_method: string;
    }>) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Strip view-only fields
        const { status, derived_status, original_amount, ...rest } = updates as any;

        const { error } = await supabase
            .from('financial_obligations')
            .update({ 
                ...rest, 
                user_id: user.id,
                updated_at: new Date().toISOString() 
            })
            .eq('id', id);
        if (error) throw new Error(error.message);
    }

    /**
     * Ids que já receberam pagamento ativo — e por isso têm o valor trancado.
     *
     * Conferido no servidor, não na tela: a tela trabalha com dados que podem
     * ter minutos de idade, e o pagamento pode ter entrado por outra aba nesse
     * meio-tempo. Estorno não conta (reversed_at preenchido), porque conta
     * estornada volta a ser conta em aberto.
     */
    private async idsComPagamento(ids: string[]): Promise<Set<string>> {
        if (!supabase || ids.length === 0) return new Set();
        const { data, error } = await supabase
            .from('obligation_payments')
            .select('obligation_id')
            .in('obligation_id', ids)
            .is('reversed_at', null);
        if (error) throw new Error(error.message);
        return new Set((data || []).map((p: any) => p.obligation_id));
    }

    /**
     * Corrige valor e/ou vencimento de contas SEM pagamento.
     *
     * `original_amount` é imutável no modelo — mas a imutabilidade só protege
     * alguma coisa depois que existe um pagamento conferido contra ele. Antes
     * disso, a conta é uma previsão, e previsão de conta fixa (energia, água)
     * chega diferente todo mês. Sem esta porta a saída era cancelar e relançar,
     * trocando o id e sujando o mês com uma conta cancelada.
     *
     * Recebe uma lista para que o reajuste da recorrência inteira seja uma
     * gravação só, e não doze idas ao banco que podem falhar pela metade.
     */
    async corrigirContasEmAberto(
        updates: Array<{ id: string; original_amount?: number; due_date?: string; description?: string }>,
    ): Promise<{ alteradas: number; travadas: string[] }> {
        if (!supabase) throw new Error('Supabase não configurado');
        if (!updates?.length) return { alteradas: 0, travadas: [] };
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const ids = updates.map(u => u.id).filter(Boolean);
        if (ids.length !== updates.length) {
            throw new Error('corrigirContasEmAberto: cada item exige um id');
        }

        const comPagamento = await this.idsComPagamento(ids);
        const liberadas = updates.filter(u => !comPagamento.has(u.id));
        if (liberadas.length === 0) {
            return { alteradas: 0, travadas: [...comPagamento] };
        }

        const now = new Date().toISOString();
        for (const u of liberadas) {
            const patch: Record<string, any> = { updated_at: now };
            if (u.original_amount !== undefined) {
                const v = Number(u.original_amount);
                if (!(v > 0)) throw new Error('Valor da conta precisa ser maior que zero');
                patch.original_amount = v;
            }
            if (u.due_date) patch.due_date = u.due_date;
            if (u.description !== undefined) patch.description = u.description;

            // Update, não upsert: upsert com payload parcial apagaria as colunas
            // que não vieram. E o filtro por conta sem pagamento é a mesma trava
            // de novo, agora dentro da própria escrita.
            const { error } = await supabase
                .from('financial_obligations')
                .update(patch)
                .eq('id', u.id)
                .is('cancelled_at', null);
            if (error) throw new Error(error.message);
        }

        return { alteradas: liberadas.length, travadas: [...comPagamento] };
    }

    /**
     * Atualiza múltiplas obrigações em lote.
     * Usa uma allowlist explícita de colunas — igual ao updateObligation — para
     * impedir tampering de campos imutáveis/auditáveis (original_amount, type,
     * status, is_reconciled, cancelled_at, ...) via mass assignment.
     */
    async updateObligationsBatch(updates: Array<any>) {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Campos que o cliente pode alterar. original_amount e type ficam de fora
        // por serem imutáveis no modelo contábil V2.
        const ALLOWED = [
            'description', 'due_date', 'category', 'cost_center_id',
            'client_id', 'supplier_id', 'default_account_id', 'notes',
            'attachments', 'global_category_id', 'planned_method',
        ] as const;

        const now = new Date().toISOString();
        const payload = updates.map(u => {
            if (!u?.id) throw new Error('updateObligationsBatch: cada item exige um id');
            const clean: Record<string, any> = {
                id: u.id,
                user_id: user.id,
                updated_at: now,
            };
            for (const key of ALLOWED) {
                if (key in u) clean[key] = u[key];
            }
            return clean;
        });

        const { error } = await supabase
            .from('financial_obligations')
            .upsert(payload);

        if (error) throw new Error(error.message);
    }


    /** Recalcula todos os saldos bancários do zero a partir dos pagamentos */
    async recalculateAllBankBalances() {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('recalculate_all_bank_balances');
        if (error) throw new Error(error.message);
    }

    /** Phase 3: Conciliação */
    async toggleReconciliation(obligationId: string): Promise<boolean> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('toggle_reconciliation', { p_obligation_id: obligationId });
        if (error) throw new Error(error.message);
        return data as boolean;
    }

    /** Só MARCA como conferida (nunca desmarca; idempotente), ao contrário do toggle. */
    async marcarConferida(obligationId: string): Promise<boolean> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('marcar_conferida', { p_obligation_id: obligationId });
        if (error) throw new Error(error.message);
        return data as boolean;
    }

    async undoReconciliation(obligationId: string, reason: string): Promise<boolean> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('undo_reconciliation', {
            p_obligation_id: obligationId,
            p_reason: reason
        });
        if (error) {
            console.error("DEBUG RPC ERROR undo_reconciliation:", error);
            throw new Error(error.message);
        }
        return data as boolean;
    }

    async getCashPosition(start?: string | null, end?: string | null): Promise<import('../types/finance').CashPosition> {
        if (!supabase) return { projected_balance: 0, reconciled_balance: 0, net_flow: 0, total_receivable: 0, total_payable: 0 };
        const { data, error } = await supabase
            .rpc('get_cash_position', { p_start: start || null, p_end: end || null })
            .single();
        if (error) { console.error('getCashPosition:', error); return { projected_balance: 0, reconciled_balance: 0, net_flow: 0, total_receivable: 0, total_payable: 0 }; }
        return (data ?? {}) as import('../types/finance').CashPosition;
    }

    async getAgingBuckets(referenceDate?: string): Promise<import('../types/finance').AgingRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .rpc('get_aging_buckets', { p_reference_date: referenceDate || new Date().toISOString().split('T')[0] });
        if (error) { console.error('getAgingBuckets:', error); return []; }
        return (data ?? []) as import('../types/finance').AgingRow[];
    }

    async getCashflowSeries(start: string, end: string): Promise<import('../types/finance').CashflowPoint[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .rpc('get_cashflow_series', { p_start: start, p_end: end });
        if (error) { console.error('getCashflowSeries:', error); return []; }
        return (data ?? []) as import('../types/finance').CashflowPoint[];
    }

    async getLiquidityKPIs(start: string, end: string): Promise<import('../types/finance').LiquidityKPIs | null> {
        if (!supabase) return null;
        const { data, error } = await supabase
            .rpc('get_liquidity_kpis', { p_start: start, p_end: end })
            .single();
        if (error) { console.error('getLiquidityKPIs:', error); return null; }
        return (data ?? null) as import('../types/finance').LiquidityKPIs | null;
    }

    // -- ORÇAMENTO (budget_lines) --
    async getBudgetLines(yearMonth?: string): Promise<BudgetLine[]> {
        if (!supabase) return [];
        try {
            let query = supabase.from('budget_lines').select('*').limit(1000);
            if (yearMonth) query = query.eq('year_month', yearMonth);
            const { data, error } = await query.order('year_month', { ascending: false });
            if (error) throw new Error(error.message);
            return (data || []).map((r: any) => ({
                id: r.id,
                cost_center_id: r.cost_center_id,
                category: r.category,
                year_month: r.year_month,
                budgeted_amount: Number(r.budgeted_amount),
                notes: r.notes,
                created_at: r.created_at,
                updated_at: r.updated_at,
            } as BudgetLine));
        } catch (e) {
            console.warn("Budget lines table deprecated or missing");
            return [];
        }
    }

    async saveBudgetLine(bl: BudgetLine): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = new Date().toISOString();
        const payload = {
            id: bl.id || idService.generateUUID(),
            user_id: user.id,
            cost_center_id: bl.cost_center_id || null,
            category: bl.category || null,
            year_month: bl.year_month,
            budgeted_amount: bl.budgeted_amount,
            notes: bl.notes || null,
            updated_at: now,
            created_at: bl.created_at || now,
        };
        const { error } = await supabase.from('budget_lines').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteBudgetLine(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('budget_lines').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
}
