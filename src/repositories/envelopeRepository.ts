import { supabase } from '@/services/supabase';
import { CashEnvelope, EnvelopeOverview, EnvelopeMovement } from '@/types/finance';

/** Fase 6 — Caixinhas (envelopes virtuais sobre o saldo real). */
export class EnvelopeRepository {
    async getEnvelopes(includeArchived = false): Promise<CashEnvelope[]> {
        if (!supabase) return [];
        let query = supabase.from('cash_envelopes').select('*').order('sort_order', { ascending: true });
        if (!includeArchived) query = query.eq('is_archived', false);
        const { data, error } = await query;
        if (error) { console.error('getEnvelopes:', error); return []; }
        return (data || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            target_amount: Number(r.target_amount),
            balance: Number(r.balance),
            notes: r.notes,
            sort_order: r.sort_order,
            is_archived: r.is_archived,
            purpose: r.purpose,
            target_date: r.target_date,
            min_balance: r.min_balance != null ? Number(r.min_balance) : 0,
            auto_fund_pct: r.auto_fund_pct != null ? Number(r.auto_fund_pct) : 0,
            created_at: r.created_at,
            updated_at: r.updated_at,
        } as CashEnvelope));
    }

    async getMovements(envelopeId: string): Promise<EnvelopeMovement[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('cash_envelope_movements')
            .select('*')
            .eq('envelope_id', envelopeId)
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) { console.error('getMovements:', error); return []; }
        return (data || []).map((r: any) => ({
            id: r.id, envelope_id: r.envelope_id, delta: Number(r.delta),
            kind: r.kind, notes: r.notes, created_at: r.created_at,
        } as EnvelopeMovement));
    }

    /** Provisionamento automático: aloca auto_fund_pct de um valor-base. */
    async fund(base: number): Promise<number> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('fund_envelopes', { p_base: base });
        if (error) throw new Error(error.message);
        return Number(data) || 0;
    }

    async getOverview(): Promise<EnvelopeOverview> {
        if (!supabase) return { total_real: 0, allocated: 0, free: 0 };
        const { data, error } = await supabase.rpc('get_envelope_overview').single();
        if (error) { console.error('getEnvelopeOverview:', error); return { total_real: 0, allocated: 0, free: 0 }; }
        const r = (data ?? {}) as any;
        return { total_real: Number(r.total_real || 0), allocated: Number(r.allocated || 0), free: Number(r.free || 0) };
    }

    async saveEnvelope(env: Partial<CashEnvelope>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        // Allowlist: nunca deixar o cliente escrever `balance` direto (só via move/transfer).
        const payload: any = {
            user_id: user.id,
            name: env.name,
            color: env.color || '#8b5cf6',
            target_amount: env.target_amount ?? 0,
            notes: env.notes ?? null,
            sort_order: env.sort_order ?? 0,
            is_archived: env.is_archived ?? false,
            purpose: env.purpose ?? null,
            target_date: env.target_date ?? null,
            min_balance: env.min_balance ?? 0,
            auto_fund_pct: env.auto_fund_pct ?? 0,
            updated_at: new Date().toISOString(),
        };
        if (env.id) payload.id = env.id;
        const { error } = await supabase.from('cash_envelopes').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteEnvelope(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('cash_envelopes').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    /** Aloca (delta>0, livre→caixinha) ou libera (delta<0, caixinha→livre). */
    async move(envelopeId: string, delta: number, notes?: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('move_envelope', {
            p_envelope_id: envelopeId, p_delta: delta, p_notes: notes || null,
        });
        if (error) throw new Error(error.message);
    }

    /** Transfere valor entre duas caixinhas. */
    async transfer(from: string, to: string, amount: number, notes?: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('transfer_envelope', {
            p_from: from, p_to: to, p_amount: amount, p_notes: notes || null,
        });
        if (error) throw new Error(error.message);
    }
}
