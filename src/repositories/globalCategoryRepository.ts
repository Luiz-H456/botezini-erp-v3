import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { getNow } from '@/utils';
import { isColunaAusente } from '@/utils/postgrestErrors';
import { GlobalCategory } from '@/types';

export class GlobalCategoryRepository {
    /** `estrito`: erro na leitura vira exceção em vez de lista vazia — quem mostra
     *  um número (o fichário) não pode confundir "falhou" com "nenhuma categoria".
     *  ponytail: opt-in; hoje pedem o fichário e o useMetaSugerida. Os demais
     *  chamadores seguem com "vazio na falha" até alguém precisar do contrário. */
    async getByDomain(domain: 'finance' | 'inventory' | 'crm', { estrito = false } = {}): Promise<GlobalCategory[]> {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase
                .from('global_categories')
                .select('*')
                .eq('domain', domain)
                .order('name', { ascending: true });

            if (error) throw new Error(error.message);
            return data || [];
        } catch (e) {
            if (estrito) throw new Error(`Não consegui ler as categorias: ${e instanceof Error ? e.message : e}`);
            console.warn(`getByDomain falhou para ${domain}:`, e);
            return [];
        }
    }

    async save(category: Partial<GlobalCategory>): Promise<GlobalCategory> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = {
            ...category,
            id: category.id || idService.generateUUID(),
            user_id: user.id,
            updated_at: now,
            created_at: category.created_at || now
        };

        const { data, error } = await supabase
            .from('global_categories')
            .upsert(payload)
            .select()
            .single();

        if (!error) return data;

        // Colunas de migrações recentes podem não existir ainda. Barrar a
        // criação da categoria por causa de um campo novo deixaria o usuário sem
        // conseguir cadastrar nada — grava sem ele e avisa onde está a migração.
        // O indicador afetado segue mostrando o estado real, que é o correto.
        const opcionais = [
            { coluna: 'natureza', migracao: 'financeiro_natureza_de_custo.sql', perda: 'a marca de custo fixo' },
            { coluna: 'custo_do_produto', migracao: 'financeiro_custo_do_produto.sql', perda: 'a marca de CPV' },
        ];
        const ausentes = opcionais.filter(o => isColunaAusente(error, o.coluna));
        if (ausentes.length > 0) {
            const semNovas = { ...(payload as Record<string, any>) };
            for (const o of ausentes) delete semNovas[o.coluna];
            const repetir = await supabase
                .from('global_categories')
                .upsert(semNovas)
                .select()
                .single();
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                `[global_categories] coluna(s) ausente(s): categoria salva SEM ${ausentes.map(o => o.perda).join(' e ')}. `
                + `Rode ${ausentes.map(o => 'supabase/' + o.migracao).join(' e ')} para habilitar.`);
            return repetir.data;
        }

        throw new Error(error.message);
    }

    async delete(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('global_categories').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
}

export const globalCategoryRepository = new GlobalCategoryRepository();
