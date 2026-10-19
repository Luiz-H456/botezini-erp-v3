import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { getNow } from '@/utils';
import {
    PersonalizacaoPreco,
    PersonalizacaoHistorico,
    PersonalizacaoNotas,
    ArteBordado,
    TecnicaPersonalizacao,
} from '@/types';

/**
 * Personalização: tabela de preços, artes de bordado, histórico e notas.
 *
 * As quatro tabelas nascem em `supabase/personalizacao_precos_e_artes.sql`.
 * Enquanto a migração não for rodada, o PostgREST responde 404/PGRST205 —
 * tratado aqui como lista vazia em vez de erro, para a aba abrir e explicar
 * o que falta em vez de quebrar o Estoque inteiro.
 */
const TABELA_AUSENTE = /PGRST205|does not exist|schema cache/i;

function vazioSeTabelaAusente(erro: { message?: string; code?: string } | null): boolean {
    if (!erro) return false;
    return TABELA_AUSENTE.test(erro.code || '') || TABELA_AUSENTE.test(erro.message || '');
}

export class PersonalizacaoRepository {
    /** True quando a migração ainda não foi rodada — a tela avisa em vez de mentir. */
    async migracaoAplicada(): Promise<boolean> {
        if (!supabase) return false;
        const { error } = await supabase.from('personalizacao_notas').select('tecnica').limit(1);
        return !vazioSeTabelaAusente(error);
    }

    // -- TABELA DE PREÇOS -----------------------------------------------------
    async getPrecos(): Promise<PersonalizacaoPreco[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('personalizacao_precos')
            .select('*')
            .order('tecnica')
            .order('descricao');
        if (error) {
            if (vazioSeTabelaAusente(error)) return [];
            throw new Error(error.message);
        }
        return (data || []).map(normalizarPreco);
    }

    async savePreco(preco: Partial<PersonalizacaoPreco>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = {
            ...preco,
            id: preco.id || idService.generateUUID(),
            user_id: user.id,
            valor: Number(preco.valor || 0),
            // Faixa em branco é "vale sempre", e string vazia viraria 0 —
            // que significaria "a partir de zero peças" e mudaria a regra.
            faixa_min: inteiroOuNulo(preco.faixa_min),
            faixa_max: inteiroOuNulo(preco.faixa_max),
            updated_at: now,
            created_at: preco.created_at || now,
        };
        const { error } = await supabase.from('personalizacao_precos').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deletePreco(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('personalizacao_precos').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // -- ARTES DE BORDADO -----------------------------------------------------
    async getArtes(): Promise<ArteBordado[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('artes_bordado')
            .select('*, clients(company_name)')
            .order('nome');
        if (error) {
            if (vazioSeTabelaAusente(error)) return [];
            throw new Error(error.message);
        }
        return (data || []).map((a: any) => ({
            ...a,
            cliente_nome: a.clients?.company_name,
            pontos: a.pontos === null ? null : Number(a.pontos),
            tempo_minutos: a.tempo_minutos === null ? null : Number(a.tempo_minutos),
            clients: undefined,
        })) as ArteBordado[];
    }

    async saveArte(arte: Partial<ArteBordado>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const { cliente_nome, clients, ...rest } = arte as any;
        const payload = {
            ...rest,
            id: arte.id || idService.generateUUID(),
            user_id: user.id,
            cliente_id: arte.cliente_id || null,
            pontos: inteiroOuNulo(arte.pontos),
            tempo_minutos: inteiroOuNulo(arte.tempo_minutos),
            largura_mm: inteiroOuNulo(arte.largura_mm),
            altura_mm: inteiroOuNulo(arte.altura_mm),
            feita_em: arte.feita_em || null,
            updated_at: now,
            created_at: arte.created_at || now,
        };
        const { error } = await supabase.from('artes_bordado').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteArte(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('artes_bordado').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // -- HISTÓRICO ------------------------------------------------------------
    async getHistorico(): Promise<PersonalizacaoHistorico[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('personalizacao_historico')
            .select('*')
            .order('data', { ascending: false })
            .limit(1000);
        if (error) {
            if (vazioSeTabelaAusente(error)) return [];
            throw new Error(error.message);
        }
        return (data || []).map((h: any) => ({
            ...h,
            quantidade: Number(h.quantidade || 0),
            valor_unitario: Number(h.valor_unitario || 0),
        })) as PersonalizacaoHistorico[];
    }

    async saveHistorico(linha: Partial<PersonalizacaoHistorico>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const payload = {
            ...linha,
            id: linha.id || idService.generateUUID(),
            user_id: user.id,
            arte_id: linha.arte_id || null,
            cliente_id: linha.cliente_id || null,
            quantidade: Number(linha.quantidade || 0),
            valor_unitario: Number(linha.valor_unitario || 0),
            data: linha.data || getNow().toISOString().slice(0, 10),
        };
        const { error } = await supabase.from('personalizacao_historico').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteHistorico(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('personalizacao_historico').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // -- NOTAS POR TÉCNICA ----------------------------------------------------
    async getNotas(): Promise<PersonalizacaoNotas[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('personalizacao_notas').select('*');
        if (error) {
            if (vazioSeTabelaAusente(error)) return [];
            throw new Error(error.message);
        }
        return (data || []).map((n: any) => ({
            ...n,
            preco_por_mil_pontos: numeroOuNulo(n.preco_por_mil_pontos),
            valor_minimo: numeroOuNulo(n.valor_minimo),
            valor_da_arte: numeroOuNulo(n.valor_da_arte),
        })) as PersonalizacaoNotas[];
    }

    /** A PK é a própria técnica: salvar é sempre upsert de uma linha só. */
    async saveNotas(notas: Partial<PersonalizacaoNotas> & { tecnica: TecnicaPersonalizacao }): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const payload = {
            tecnica: notas.tecnica,
            user_id: user.id,
            notas: notas.notas ?? null,
            preco_por_mil_pontos: numeroOuNulo(notas.preco_por_mil_pontos),
            valor_minimo: numeroOuNulo(notas.valor_minimo),
            valor_da_arte: numeroOuNulo(notas.valor_da_arte),
            updated_at: getNow().toISOString(),
        };
        const { error } = await supabase
            .from('personalizacao_notas')
            .upsert(payload, { onConflict: 'tecnica' });
        if (error) throw new Error(error.message);
    }
}

function inteiroOuNulo(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : null;
}

function numeroOuNulo(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function normalizarPreco(p: any): PersonalizacaoPreco {
    return {
        ...p,
        valor: Number(p.valor || 0),
        faixa_min: p.faixa_min === null ? null : Number(p.faixa_min),
        faixa_max: p.faixa_max === null ? null : Number(p.faixa_max),
    } as PersonalizacaoPreco;
}

export const personalizacaoRepository = new PersonalizacaoRepository();
