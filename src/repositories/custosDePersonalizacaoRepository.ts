import { supabase } from '@/services/supabase';
import { getNow } from '@/utils';
import type { LinhaDeSilk } from '@/utils/custosDePersonalizacao';

/**
 * Custos de silk e DTF por estamparia (parte E, 30/10; supabase/custos_personalizacao_v3_e.sql).
 * Só admin e gerente leem (RLS). Sem a migração, a leitura devolve `null` e a tela diz o que rodar.
 */
export interface LinhaDeSilkDb extends LinhaDeSilk { id: string }
export interface CustoDtfDb { fornecedor_id: string; largura_util_cm: number; valor_metro_linear: number; espaco_entre_cm: number; frete: number }

const AUSENTE = /PGRST205|does not exist|schema cache/i;
const ausente = (e: { code?: string; message?: string }) => AUSENTE.test(e.code || '') || AUSENTE.test(e.message || '');

export const custosDePersonalizacaoRepository = {
    async silk(): Promise<LinhaDeSilkDb[] | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.from('custo_silk').select('id, fornecedor_id, tamanho, cores, valor').order('tamanho');
        if (error) { if (ausente(error)) return null; throw new Error(error.message); }
        return (data || []).map(l => ({ ...l, cores: Number(l.cores), valor: Number(l.valor) }));
    },

    /** Uma célula da grade: cria ou troca o valor de (estamparia, tamanho, cores). */
    async gravarSilk(l: { fornecedor_id: string; tamanho: string; cores: number; valor: number }): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('custo_silk').upsert({
            fornecedor_id: l.fornecedor_id, tamanho: l.tamanho.trim().toUpperCase(), cores: l.cores, valor: l.valor,
            user_id: user?.id ?? null, updated_at: getNow().toISOString(),
        }, { onConflict: 'fornecedor_id,tamanho,cores' });
        if (error) throw new Error(error.message);
    },

    async apagarSilk(fornecedorId: string, tamanho: string, cores?: number): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        let q = supabase.from('custo_silk').delete().eq('fornecedor_id', fornecedorId).eq('tamanho', tamanho);
        if (cores !== undefined) q = q.eq('cores', cores);
        const { error } = await q;
        if (error) throw new Error(error.message);
    },

    async dtf(): Promise<CustoDtfDb[] | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.from('custo_dtf').select('fornecedor_id, largura_util_cm, valor_metro_linear, espaco_entre_cm, frete');
        if (error) { if (ausente(error)) return null; throw new Error(error.message); }
        return (data || []).map(d => ({
            fornecedor_id: d.fornecedor_id, largura_util_cm: Number(d.largura_util_cm), valor_metro_linear: Number(d.valor_metro_linear),
            espaco_entre_cm: Number(d.espaco_entre_cm), frete: Number(d.frete),
        }));
    },

    async gravarDtf(d: CustoDtfDb): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('custo_dtf').upsert({
            fornecedor_id: d.fornecedor_id, largura_util_cm: d.largura_util_cm, valor_metro_linear: d.valor_metro_linear,
            espaco_entre_cm: d.espaco_entre_cm, frete: d.frete, user_id: user?.id ?? null, updated_at: getNow().toISOString(),
        }, { onConflict: 'fornecedor_id' });
        if (error) throw new Error(error.message);
    },

    async apagarDtf(fornecedorId: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('custo_dtf').delete().eq('fornecedor_id', fornecedorId);
        if (error) throw new Error(error.message);
    },
};
