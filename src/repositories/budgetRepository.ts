
import { supabase } from '../services/supabase';
import { Budget } from '../types';
import { isColunaAusente } from '../utils/postgrestErrors';
import { idService } from '../services/idService';
import { getNow } from '../utils';
import { comCache } from '@/services/cacheDeLeitura';

export class BudgetRepository {
    // Local cache for product names
    private static productCache = new Map<string, string>();

    async getAll(): Promise<Budget[]> {
        return comCache('budgets', () => this.getAllSemCache());
    }

    async getAllSemCache(): Promise<Budget[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('budgets').select('*').order('date', { ascending: false });
        if (error) throw new Error(error.message);
        const budgets = data || [];

        // Hydration: Ensure product names exist for all items
        const missingProductIds = new Set<string>();
        budgets.forEach(b => {
            b.items?.forEach((item: any) => {
                if (item.product_id) {
                    if (BudgetRepository.productCache.has(item.product_id)) {
                        item.product_name = BudgetRepository.productCache.get(item.product_id);
                    } else if (!item.product_name) {
                        missingProductIds.add(item.product_id);
                    }
                }
            });
        });

        if (missingProductIds.size > 0) {
            const { data: productsData } = await supabase
                .from('products')
                .select('id, name')
                .in('id', Array.from(missingProductIds));

            if (productsData) {
                productsData.forEach(p => BudgetRepository.productCache.set(p.id, p.name));
                budgets.forEach(b => {
                    b.items?.forEach((item: any) => {
                        if (!item.product_name && item.product_id) {
                            item.product_name = BudgetRepository.productCache.get(item.product_id);
                        }
                    });
                });
            }
        }

        return budgets;
    }

    async save(budget: Budget): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = {
            ...budget,
            id: budget.id || idService.generateUUID(),
            user_id: user.id,
            updated_at: now,
            created_at: budget.created_at || now
        };
        const { error } = await supabase.from('budgets').upsert(payload);
        if (!error) return;

        // Colunas de migrações recentes podem não existir ainda. Impedir o
        // salvamento inteiro por causa de um campo novo deixaria o usuário sem
        // conseguir trabalhar — grava sem ele e avisa onde está a migração.
        const opcionais = [
            { coluna: 'reference_photos', migracao: 'phase11_fotos_referencia.sql', perda: 'as fotos' },
            { coluna: 'factory_notes', migracao: 'observacao_de_fabrica.sql', perda: 'a observação de fábrica' },
        ];
        const ausentes = opcionais.filter(o => isColunaAusente(error, o.coluna));
        if (ausentes.length > 0) {
            const semNovas = { ...(payload as Record<string, any>) };
            for (const o of ausentes) delete semNovas[o.coluna];
            const repetir = await supabase.from('budgets').upsert(semNovas);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                `[budgets] coluna(s) ausente(s): orçamento salvo SEM ${ausentes.map(o => o.perda).join(' e ')}. `
                + `Rode ${[...new Set(ausentes.map(o => 'supabase/' + o.migracao))].join(' e ')} para habilitar.`);
            return;
        }
        throw new Error(error.message);
    }

    /** A migração das fotos já foi aplicada? Usado para não oferecer o que não grava. */
    async supportsReferencePhotos(): Promise<boolean> {
        if (!supabase) return false;
        const { error } = await supabase.from('budgets').select('reference_photos').limit(1);
        return !isColunaAusente(error, 'reference_photos');
    }

    async delete(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('budgets').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
}
