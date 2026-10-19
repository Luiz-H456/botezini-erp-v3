import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { Client, Supplier, CompanyProfile } from '@/types';
import type { ClientContact } from '@/types';
import { getNow } from '@/utils';
import { comCache } from '@/services/cacheDeLeitura';
import { isColunaAusente } from '@/utils/postgrestErrors';
import { colunasOpcionaisDoPerfil } from '@/utils/perfilDaEmpresa';

export class CrmRepository {
    // -- COMPANHIA --
    async getCompanyProfile(): Promise<CompanyProfile | null> {
        if (!supabase) return null;
        try {
            // V3: read from company_profile table (app_settings is removed)
            const { data, error } = await supabase
                .from('company_profile')
                .select('*')
                .maybeSingle();
            if (error || !data) return null;
            const profile = data as CompanyProfile;
            // Banco escolhido para o orçamento: só existe depois do SQL v3_1, e só vale se estiver ativo.
            // Qualquer falha aqui vira "sem banco" (o orçamento cai nos dados antigos) — nunca derruba o perfil.
            let banco_do_orcamento: CompanyProfile['banco_do_orcamento'] = null;
            if (profile.banco_do_orcamento_id) {
                try {
                    const { data: b, error: eb } = await supabase
                        .from('bank_accounts')
                        .select('bank_name, agency, account_number, titular, chave_pix, is_active')
                        .eq('id', profile.banco_do_orcamento_id)
                        .maybeSingle();
                    if (!eb && b && b.is_active) banco_do_orcamento = b;
                } catch { /* fica null */ }
            }
            // Map DB fields to UI aliases
            return {
                ...profile,
                banco_do_orcamento,
                bank_agency: profile.agency || profile.bank_agency,
                bank_account: profile.account_number || profile.bank_account,
            };
        } catch (e) { return null; }
    }


    async saveCompanyProfile(profile: CompanyProfile): Promise<void> {
    if (!supabase) throw new Error("Supabase não configurado");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');
    const now = getNow().toISOString();

        const payload = {
            user_id: user.id,
            name: profile.name || null,
            cnpj: profile.cnpj || null,
            logo_url: profile.logo_url || null,
            phone: profile.phone || null,
            email: profile.email || null,
            address: profile.address || null,
            city: profile.city || null,
            state: profile.state || null,
            zip: profile.zip || null,
            website: profile.website || null,
            primary_color: profile.primary_color || null,
            pix_key: profile.pix_key || null,
            bank_name: profile.bank_name || null,
            // ATENÇÃO à ordem: a leitura preenche `agency` E o alias `bank_agency`.
            // Quando o formulário editava só o alias, `profile.agency` continuava
            // com o valor ANTIGO — truthy — e vencia o `||`, descartando em
            // silêncio o que o usuário tinha digitado. Agora o formulário escreve
            // o campo canônico, e o alias fica como fallback para quem só o tiver.
            account_number: profile.account_number ?? profile.bank_account ?? null,
            agency: profile.agency ?? profile.bank_agency ?? null,
            bank_holder: profile.bank_holder || null,
            bank_info: profile.bank_info || null,
            payment_terms: profile.payment_terms || null,
            default_validity_days: profile.default_validity_days || 15,
            target_margin: profile.target_margin || 40,
            labor_cost_per_hour: profile.labor_cost_per_hour || 0,
            revenue_goal: profile.revenue_goal || null,
            expense_limit: profile.expense_limit || null,
            monthly_capacity: profile.monthly_capacity || null,
            default_tax_rate: profile.default_tax_rate || null,
            default_commission: profile.default_commission || null,
            updated_at: now,
            // banco_do_orcamento (objeto) é derivado da leitura: nunca vai ao banco.
            ...colunasOpcionaisDoPerfil(profile),
        };

        const { error } = await supabase.from('company_profile').upsert(payload, { onConflict: 'user_id' });
        if (error) throw new Error(error.message);
    }

    // -- FINANCE PRESETS (persistidos no company_profile) --
    async getFinancePresets(): Promise<Array<{ name: string; config: any }>> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('company_profile').select('finance_presets').maybeSingle();
        if (error || !data) return [];
        return (data.finance_presets as any[]) || [];
    }

    async saveFinancePresets(presets: Array<{ name: string; config: any }>): Promise<void> {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // Update direcionado (não reescreve o perfil inteiro). Best-effort.
        const { error } = await supabase
            .from('company_profile')
            .update({ finance_presets: presets, updated_at: getNow().toISOString() })
            .eq('user_id', user.id);
        if (error) console.warn('saveFinancePresets:', error.message);
    }

    // -- CLIENTES --
    async getClients(): Promise<Client[]> {
        return comCache('clients', () => this.getClientsSemCache());
    }

    async getClientsSemCache(): Promise<Client[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('clients').select('*').limit(1000);
        if (error) throw new Error(error.message);
        return data || [];
    }

    async saveClient(client: Client): Promise<Client> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        
        const now = getNow().toISOString();
        const payload = { 
            ...client, 
            id: client.id || idService.generateUUID(), 
            user_id: user.id,
            updated_at: now, 
            created_at: client.created_at || now 
        };
        const { error } = await supabase.from('clients').upsert(payload);
        if (!error) return payload as Client;

        // Colunas de migrações recentes podem não existir ainda. Barrar o
        // cadastro inteiro por causa de um campo novo deixaria o usuário sem
        // conseguir salvar nada — grava sem ele e avisa onde está a migração.
        const opcionais = [
            { coluna: 'notes', migracao: 'clientes_fotos_e_notas.sql', perda: 'as observações' },
            { coluna: 'reference_photos', migracao: 'clientes_fotos_e_notas.sql', perda: 'as fotos' },
            { coluna: 'canonical_client_id', migracao: 'clientes_mesclagem_e_grupo.sql', perda: 'a mesclagem' },
            { coluna: 'grupo_economico', migracao: 'clientes_mesclagem_e_grupo.sql', perda: 'o grupo' },
        ];
        const ausentes = opcionais.filter(o => isColunaAusente(error, o.coluna));
        if (ausentes.length > 0) {
            const semNovas = { ...(payload as Record<string, any>) };
            for (const o of ausentes) delete semNovas[o.coluna];
            const repetir = await supabase.from('clients').upsert(semNovas);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                `[clients] coluna(s) ausente(s): cliente salvo SEM ${ausentes.map(o => o.perda).join(' e ')}. `
                + `Rode ${[...new Set(ausentes.map(o => 'supabase/' + o.migracao))].join(' e ')} para habilitar.`);
            return payload as Client;
        }

        throw new Error(error.message);
    }

    /** A coluna reference_photos existe? Governa se a galeria de fotos do
     *  cliente pode gravar, ou se ainda depende da migração. */
    async supportsClientPhotos(): Promise<boolean> {
        if (!supabase) return false;
        const { error } = await supabase.from('clients').select('reference_photos').limit(1);
        return !isColunaAusente(error, 'reference_photos');
    }

    async deleteClient(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // -- FORNECEDORES --
    async getSuppliers(): Promise<Supplier[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('suppliers').select('*').limit(1000);
        if (error) throw new Error(error.message);
        return data || [];
    }

    async saveSupplier(supplier: Supplier): Promise<Supplier> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = { 
            ...supplier, 
            id: supplier.id || idService.generateUUID(), 
            user_id: user.id,
            updated_at: now, 
            created_at: supplier.created_at || now 
        };
        const { error } = await supabase.from('suppliers').upsert(payload);
        if (error) throw new Error(error.message);
        return payload as Supplier;
    }

    async deleteSupplier(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // =========================================================================
    // CONTATOS DO CLIENTE  (2.0 — bloco C2)
    // =========================================================================

    /**
     * Todos os contatos, de todos os clientes, numa consulta.
     *
     * A alternativa — pedir por cliente ao abrir cada página — seria uma ida ao
     * banco por clique. São poucas centenas de linhas no total.
     *
     * Lista vazia quando a migração não rodou: o campo antigo
     * (clients.contact_person) continua funcionando sozinho, e nada quebra.
     */
    async getClientContacts(clientId?: string): Promise<ClientContact[]> {
        if (!supabase) return [];
        let q = supabase.from('client_contacts').select('*').order('principal', { ascending: false });
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        if (error) {
            console.warn('[contatos] indisponível: rode supabase/comercial_acompanhamento.sql —', error.message);
            return [];
        }
        return (data || []) as ClientContact[];
    }

    async saveClientContact(contato: Partial<ClientContact>): Promise<ClientContact | null> {
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();

        const payload = {
            ...contato,
            id: contato.id || idService.generateUUID(),
            user_id: contato.user_id || user?.id,
        };

        // Um principal por cliente é índice único no banco. Rebaixar os outros
        // ANTES evita que a gravação esbarre nele — e é o comportamento que se
        // espera: marcar um como principal desmarca o anterior, em vez de
        // devolver um erro de constraint para o usuário resolver.
        if (payload.principal && payload.client_id) {
            await supabase.from('client_contacts')
                .update({ principal: false })
                .eq('client_id', payload.client_id)
                .neq('id', payload.id);
        }

        const { data, error } = await supabase
            .from('client_contacts').upsert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as ClientContact;
    }

    async deleteClientContact(id: string): Promise<void> {
        if (!supabase) return;
        const { error } = await supabase.from('client_contacts').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

}
