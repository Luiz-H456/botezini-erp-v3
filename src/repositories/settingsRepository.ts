import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { getNow } from '@/utils';

export class SettingsRepository {
    async getCategories(type: string): Promise<string[]> {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', `categories_${type}`)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                console.warn(`Erro ao buscar categorias (${type}):`, error.message);
                return [];
            }
            return data?.value || [];
        } catch (e) {
            console.warn(`getCategories falhou para ${type}:`, e);
            return [];
        }
    }

    async saveCategories(type: string, categories: string[]): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        try {
            await supabase
                .from('app_settings')
                .upsert({
                    key: `categories_${type}`,
                    value: categories,
                    user_id: user.id,
                    updated_at: getNow().toISOString()
                });
        } catch (e) {
            console.warn(`saveCategories falhou para ${type}:`, e);
        }
    }

    async getCategoryMeta(type: string): Promise<Record<string, any>> {
        if (!supabase) return {};
        try {
            const { data } = await supabase.from('app_settings').select('value').eq('key', `meta_cat_${type}`).maybeSingle();
            return data?.value || {};
        } catch { return {}; }
    }

    async saveCategoryMeta(type: string, metaMap: Record<string, any>): Promise<void> {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            await supabase.from('app_settings').upsert({ 
                key: `meta_cat_${type}`, 
                value: metaMap,
                user_id: user.id,
                updated_at: getNow().toISOString()
            });
        } catch { }
    }

    async getLookupValues(category?: string): Promise<Array<{ id: string; category: string; value: string; label: string; sort_order: number; is_active: boolean }>> {
        if (!supabase) return [];
        let query = supabase.from('lookup_values').select('*').eq('is_active', true).order('sort_order').limit(1000);
        if (category) query = query.eq('category', category);
        const { data, error } = await query;
        if (error) return [];
        return data || [];
    }

    async saveLookupValue(lv: any): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { error } = await supabase
            .from('lookup_values')
            .upsert({
                ...lv,
                user_id: user.id,
                id: lv.id || idService.generateUUID(),
                updated_at: getNow().toISOString()
            });
        if (error) throw new Error(error.message);
    }

    async getPricingDefaults(): Promise<any | null> {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'pricing_defaults').maybeSingle();
            if (error || !data) return null;
            return data.value;
        } catch (e) { return null; }
    }

    async savePricingDefaults(defaults: any): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { error } = await supabase.from('app_settings').upsert({ 
            key: 'pricing_defaults', 
            value: defaults,
            user_id: user.id,
            updated_at: getNow().toISOString()
        });
        if (error) throw new Error(error.message);
    }
}
