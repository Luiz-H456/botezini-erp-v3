import { supabase } from '@/services/supabase';
import { isFuncaoAusente } from '@/utils/postgrestErrors';
import type { Lead, EtapaDoLead } from '@/utils/funilDeLeads';
import type { LeadImportado } from '@/utils/importacaoDeLeads';

/**
 * Prospecção — a aba anterior ao orçamento.
 *
 * Tudo aqui degrada em silêncio se `supabase/leads_prospeccao.sql` ainda não
 * rodou: lista vazia em vez de tela quebrada. É funcionalidade nova e nenhuma
 * outra parte do sistema depende dela, então uma migração pendente não pode
 * derrubar nada.
 */
export class LeadRepository {
    /** Verdadeiro quando a migração já foi aplicada. */
    private disponivel: boolean | null = null;

    async getAll(): Promise<Lead[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (error) {
            this.disponivel = false;
            console.warn('[leads] indisponível: rode supabase/leads_prospeccao.sql —', error.message);
            return [];
        }
        this.disponivel = true;
        return (data || []) as Lead[];
    }

    /**
     * A migração já rodou?
     *
     * `null` enquanto ninguém perguntou. A tela usa isto para dizer "rode a
     * migração" em vez de "nenhum lead cadastrado" — que seria verdade e
     * inútil, porque mandaria procurar leads que não têm onde existir.
     */
    get migrado(): boolean | null { return this.disponivel; }

    async salvar(lead: Partial<Lead> & { id?: string }): Promise<Lead | null> {
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();

        const payload = { ...lead, user_id: lead.user_id || user?.id };
        // `cnpj_raiz` é coluna GERADA: mandá-la de volta num update é erro do
        // Postgres, e ela chega de carona em todo lead lido da tela.
        delete (payload as Record<string, unknown>).cnpj_raiz;

        const { data, error } = await supabase
            .from('leads').upsert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as Lead;
    }

    /**
     * Move o lead de etapa.
     *
     * A próxima ação viaja junto de propósito: mover sem dizer o que fazer
     * depois é como o lead cai no esquecimento — ele sai da fila de hoje e não
     * entra na de nenhum outro dia.
     */
    async moverEtapa(
        id: string,
        status: EtapaDoLead,
        extras: {
            proxima_acao?: string | null;
            proxima_acao_em?: string | null;
            motivo_perda?: string | null;
            client_id?: string | null;
        } = {},
    ): Promise<void> {
        if (!supabase) return;

        const patch: Record<string, unknown> = { status, ...extras };
        // Sair de 'novo' é, por definição, ter falado com alguém.
        if (status !== 'novo') patch.ultimo_contato_em = new Date().toISOString().slice(0, 10);

        const { error } = await supabase.from('leads').update(patch).eq('id', id);
        if (error) throw new Error(error.message);
    }

    async excluir(id: string): Promise<void> {
        if (!supabase) return;
        const { error } = await supabase.from('leads').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    /**
     * Importa em lote, pela RPC.
     *
     * A classificação (novo / já é cliente / filial / já é lead) acontece ANTES,
     * no cliente, e é mostrada para conferência. Aqui chega só o confirmado.
     */
    async importar(linhas: LeadImportado[]): Promise<{ criados: number; completados: number } | null> {
        if (!supabase || linhas.length === 0) return null;

        const { data, error } = await supabase.rpc('importar_leads', { p_linhas: linhas });
        if (error) {
            if (isFuncaoAusente(error, 'importar_leads')) {
                console.warn('[leads] importação indisponível: rode supabase/leads_prospeccao.sql.');
                return null;
            }
            throw new Error(error.message);
        }
        const r = (data || {}) as Record<string, unknown>;
        return { criados: Number(r.criados) || 0, completados: Number(r.completados) || 0 };
    }

    /** O lead de onde este cliente veio, se veio de um. */
    async porCliente(clientId: string): Promise<Lead | null> {
        if (!supabase || !clientId) return null;
        const { data, error } = await supabase
            .from('leads').select('*').eq('client_id', clientId).limit(1);
        if (error) return null;
        return (data || [])[0] as Lead || null;
    }
}

export const leadRepository = new LeadRepository();
