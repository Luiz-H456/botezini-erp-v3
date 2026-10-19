import { supabase } from '@/services/supabase';
import { ProductionSector, CapacityConfig, ProductionLog, OrderDelay } from '@/types/pcp';

/** PCP — setores configuráveis e configuração de capacidade (Fase 1B). */
export class PcpRepository {
    /** `estrito`: erro na leitura vira exceção em vez de lista vazia — quem mostra
     *  um número (o fichário) não pode confundir "falhou" com "nenhum setor".
     *  ponytail: opt-in; hoje pedem o fichário e o usePcpCapacity. Os demais
     *  chamadores seguem com "vazio na falha" até alguém precisar do contrário. */
    async getSectors(includeInactive = false, { estrito = false } = {}): Promise<ProductionSector[]> {
        if (!supabase) return [];
        let q = supabase.from('production_sectors').select('*').order('sort_order', { ascending: true });
        if (!includeInactive) q = q.eq('is_active', true);
        const { data, error } = await q;
        if (error) {
            if (estrito) throw new Error(`Não consegui ler os setores: ${error.message}`);
            console.error('getSectors:', error.message); return [];
        }
        return (data || []).map((r: any) => ({
            id: r.id, name: r.name, sort_order: r.sort_order,
            weekly_capacity_pieces: Number(r.weekly_capacity_pieces) || 0,
            color: r.color, is_active: r.is_active,
            created_at: r.created_at, updated_at: r.updated_at,
        } as ProductionSector));
    }

    async saveSector(sector: Partial<ProductionSector>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        const payload: any = {
            user_id: user.id,
            name: sector.name,
            sort_order: sector.sort_order ?? 0,
            weekly_capacity_pieces: sector.weekly_capacity_pieces ?? 350,
            color: sector.color || '#8b5cf6',
            is_active: sector.is_active ?? true,
            updated_at: new Date().toISOString(),
        };
        if (sector.id) payload.id = sector.id;
        const { error } = await supabase.from('production_sectors').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteSector(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('production_sectors').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    async getCapacityConfig(): Promise<CapacityConfig> {
        const fallback: CapacityConfig = { id: 1, working_days: 5, holidays: [], overtime_enabled: false };
        if (!supabase) return fallback;
        const { data, error } = await supabase.from('capacity_config').select('*').eq('id', 1).maybeSingle();
        if (error || !data) return fallback;
        return {
            id: 1,
            working_days: Number(data.working_days) || 5,
            holidays: (data.holidays as string[]) || [],
            overtime_enabled: !!data.overtime_enabled,
            notes: data.notes || undefined,
        };
    }

    async saveCapacityConfig(cfg: Partial<CapacityConfig>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        const { error } = await supabase.from('capacity_config').upsert({
            id: 1,
            user_id: user.id,
            working_days: cfg.working_days ?? 5,
            holidays: cfg.holidays ?? [],
            overtime_enabled: cfg.overtime_enabled ?? false,
            notes: cfg.notes ?? null,
            updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
    }

    // -- Controle parcial (Fase 1C) --
    async getProductionLogs(orderId?: string): Promise<ProductionLog[]> {
        if (!supabase) return [];
        let q = supabase.from('production_logs').select('*').order('logged_at', { ascending: false });
        if (orderId) q = q.eq('order_id', orderId);
        const { data, error } = await q;
        if (error) { console.error('getProductionLogs:', error.message); return []; }
        return (data || []).map((r: any) => ({
            id: r.id, order_id: r.order_id, sector_id: r.sector_id,
            size: r.size, operation: r.operation,
            qty_done: Number(r.qty_done) || 0, qty_expedited: Number(r.qty_expedited) || 0,
            notes: r.notes, logged_at: r.logged_at,
            item_key: r.item_key ?? null,
        } as ProductionLog));
    }

    async logProduction(opts: {
        order_id: string; qty_done: number; sector_id?: string | null;
        size?: string; operation?: string; qty_expedited?: number; notes?: string;
        /** Linha do pedido (produto|COR|TAMANHO). Ausente = baixa do pedido inteiro. */
        item_key?: string;
    }): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('log_production', {
            p_order_id: opts.order_id,
            p_qty_done: opts.qty_done,
            p_sector_id: opts.sector_id ?? null,
            p_size: opts.size ?? null,
            p_operation: opts.operation ?? null,
            p_qty_expedited: opts.qty_expedited ?? 0,
            p_notes: opts.notes ?? null,
            p_item_key: opts.item_key ?? null,
        });
        if (error) throw new Error(error.message);
        return data as string;
    }

    // -- Atrasos justificados (Fase 2) --

    /** Histórico completo, do atraso mais recente para o mais antigo. */
    async getDelays(): Promise<OrderDelay[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('order_delays').select('*')
            .order('registrado_em', { ascending: false });
        // A tabela é de uma migração nova. Se ela ainda não foi aplicada, o
        // cronograma continua funcionando sem travas em vez de quebrar a tela.
        if (error) { console.error('getDelays:', error.message); return []; }
        return (data || []).map(mapDelay);
    }

    /**
     * Registra um atraso. `liberado_em` é calculado AQUI, uma vez, e congelado —
     * é o que faz o recálculo do cronograma ser idempotente (ver comentário na
     * migração pcp_phase2_atrasos.sql).
     */
    async registrarDelay(opts: { order_id: string; dias: number; motivo: string }): Promise<OrderDelay> {
        if (!supabase) throw new Error('Supabase não configurado');
        const motivo = opts.motivo.trim();
        if (!motivo) throw new Error('Descreva o motivo do atraso');
        if (!Number.isFinite(opts.dias) || opts.dias < 1) throw new Error('O atraso precisa ser de pelo menos 1 dia');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const liberado = new Date();
        liberado.setHours(0, 0, 0, 0);
        liberado.setDate(liberado.getDate() + Math.round(opts.dias));
        const liberado_em = `${liberado.getFullYear()}-${String(liberado.getMonth() + 1).padStart(2, '0')}-${String(liberado.getDate()).padStart(2, '0')}`;

        const { data, error } = await supabase.from('order_delays').insert({
            user_id: user.id,
            order_id: opts.order_id,
            dias: Math.round(opts.dias),
            motivo,
            liberado_em,
        }).select().single();
        if (error) throw new Error(error.message);
        return mapDelay(data);
    }

    async deleteDelay(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('order_delays').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
}

function mapDelay(r: any): OrderDelay {
    return {
        id: r.id,
        order_id: r.order_id,
        dias: Number(r.dias) || 0,
        motivo: r.motivo || '',
        liberado_em: r.liberado_em,
        registrado_em: r.registrado_em,
    };
}
