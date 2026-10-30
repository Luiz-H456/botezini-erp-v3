import { supabase } from '@/services/supabase';
import { idService } from '@/services/idService';
import { Insumo, InsumoMovement, ProductInsumo, Product, Order, FabricColor } from '@/types';
import { getNow, round2 } from '@/utils';
import { isColunaAusente } from '@/utils/postgrestErrors';
import { comCache } from '@/services/cacheDeLeitura';

/** Recorte "o que ainda não foi classificado" — não é o nome de uma categoria. */
export const SEM_CATEGORIA = '__sem_categoria__';

export class InventoryRepository {
    // -- TESTE DE CONEXÃO E TABELA --
    async verifyTableAccess(): Promise<void> {
        if (!supabase) return;
        const { error } = await supabase.from('insumos').select('id').limit(1);
        if (error) console.error('[Inventory] Table access error:', error.message);
    }

    // -- ESTOQUE (Insumos / Matéria-prima) --
    async getInsumos(): Promise<Insumo[]> {
        return comCache('insumos', () => this.getInsumosSemCache());
    }

    async getInsumosSemCache(): Promise<Insumo[]> {
        if (!supabase) return [];
        
        const { data, error } = await supabase
            .from('insumos')
            .select('*, supplier_id')
            .order('name')
            .limit(1000);
        
        if (error) {
            console.error("Erro ao buscar insumos:", error.message);
            throw new Error(error.message);
        }

        return (data || []).map((item: any) => ({
            ...item,
            current_stock: Number(item.current_stock || 0),
            min_stock: Number(item.min_stock || 0),
            average_unit_cost: Number(item.average_unit_cost || 0),
        } as Insumo));
    }

    async getInsumosPaginated(page: number = 1, pageSize: number = 20, search?: string, category?: string): Promise<{ data: Insumo[], count: number }> {
        if (!supabase) return { data: [], count: 0 };

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('insumos')
            .select('*, supplier_id', { count: 'exact' });

        // O filtro vai no banco, não na página já carregada: filtrar o que
        // voltou daria "3 de 47" numa categoria que tem 200 itens, porque só
        // 15 chegaram até aqui.
        //
        // "Sem categoria" é um recorte legítimo — é justamente a fila do que
        // falta classificar — e no banco isso é NULL ou string vazia, duas
        // formas do mesmo vazio que convivem no cadastro antigo.
        if (category === SEM_CATEGORIA) query = query.or('category.is.null,category.eq.');
        else if (category) query = query.eq('category', category);

        if (search) {
            // PostgREST monta o filtro por string: vírgula e parênteses no termo
            // de busca alterariam a própria query. Removidos antes de interpolar.
            const safe = search.replace(/[,()]/g, ' ').trim();
            if (safe) query = query.or(`name.ilike.%${safe}%,category.ilike.%${safe}%`);
        }

        const { data, count, error } = await query
            .order('name')
            .range(from, to);
        
        if (error) {
            console.error("Erro ao buscar insumos paginados:", error.message);
            throw new Error(error.message);
        }

        const mapped = (data || []).map((item: any) => ({
            ...item,
            current_stock: Number(item.current_stock || 0),
            min_stock: Number(item.min_stock || 0),
            average_unit_cost: Number(item.average_unit_cost || 0),
        } as Insumo));

        return { data: mapped, count: count || 0 };
    }


    async saveInsumo(item: Partial<Insumo>): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const { supplier_name, supplier, rendimento, ...rest } = item as any;
        const payload = {
            ...rest,
            id: item.id || idService.generateUUID(),
            user_id: user.id,
            rendimento: Number(rendimento || 1),
            updated_at: now,
            created_at: item.created_at || now,
        };

        const { error } = await supabase.from('insumos').upsert(payload);
        if (!error) return;

        // A coluna do apelido so existe depois de insumos_apelidos.sql. Barrar
        // o cadastro por causa dela deixaria o usuario sem conseguir salvar
        // insumo nenhum — grava sem o vinculo e avisa onde esta a migracao.
        if (isColunaAusente(error, 'canonical_insumo_id')) {
            const { canonical_insumo_id, ...semVinculo } = payload as Record<string, any>;
            const repetir = await supabase.from('insumos').upsert(semVinculo);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                '[insumos] coluna canonical_insumo_id ausente: insumo salvo SEM o vinculo de '
                + "mesmo material. Rode supabase/insumos_apelidos.sql para habilitar.");
            return;
        }
        throw new Error(error.message);
    }

    async deleteInsumo(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('insumos').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    /**
     * Preço de referência de um insumo SEM saldo (sugestões do lucro, 17/10). Grava só o custo médio,
     * listado — nunca a linha inteira, que é o padrão que já custou dinheiro duas vezes. Com saldo, o
     * custo médio é do estoque e muda pelo Ajustar contagem; a trava fica no próprio UPDATE
     * (current_stock = 0), não na tela, e nenhuma linha atualizada vira erro explicado.
     */
    async definirPrecoDeReferencia(id: string, preco: number): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        if (!(preco > 0)) throw new Error('Informe um preço maior que zero.');
        const { data, error } = await supabase.from('insumos')
            .update({ average_unit_cost: preco })
            .eq('id', id).eq('current_stock', 0)
            .select('id');
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
            throw new Error('Este insumo tem sobra registrada de compras: o preço é o custo médio delas e muda com a próxima compra.');
        }
    }

    // -- CARTELA DE CORES HOMOLOGADA --
    async getFabricColors(): Promise<FabricColor[]> {
        if (!supabase) return [];

        const { data, error } = await supabase
            .from('fabric_colors')
            .select('*')
            .eq('is_active', true)
            .order('fabric_family')
            .order('sort_order');

        if (error) {
            console.error('Erro ao buscar cartela de cores:', error.message);
            throw new Error(error.message);
        }
        return (data || []) as FabricColor[];
    }

    /**
     * Grava a cartela inteira de uma família de tecido de uma vez.
     *
     * A cartela é um conjunto, não uma coleção de linhas soltas: quem edita
     * mexe na cartela do tecido, não numa cor isolada. Gravar em lote e apagar
     * o que saiu deixa o banco igual à tela, sem estado intermediário onde uma
     * cor removida ainda aparece no orçamento.
     *
     * Desativa em vez de apagar (`is_active = false`): orçamento antigo guarda
     * o nome da cor em texto, mas relatório que cruza com a cartela precisa
     * continuar encontrando a linha.
     */
    async saveFabricColors(family: string, cores: Partial<FabricColor>[]): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const familia = (family || '').trim();
        if (!familia) throw new Error('Família de tecido sem nome');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = cores
            .filter(c => (c.color_name || '').trim())
            .map((c, i) => ({
                id: c.id || idService.generateUUID(),
                fabric_family: familia,
                color_name: (c.color_name || '').trim().toUpperCase(),
                hex: c.hex || '#CCCCCC',
                color_tier: c.color_tier || 'Padrão',
                // A ordem da tela é a ordem da cartela impressa do fornecedor;
                // preservá-la é o que faz o vendedor achar a cor onde espera.
                sort_order: i,
                is_active: true,
                user_id: user.id,
                updated_at: now,
            }));

        if (payload.length > 0) {
            const { error } = await supabase.from('fabric_colors').upsert(payload);
            if (error) throw new Error(error.message);
        }

        const mantidos = payload.map(p => p.id);
        let fora = supabase.from('fabric_colors')
            .update({ is_active: false, updated_at: now })
            .eq('fabric_family', familia);
        if (mantidos.length > 0) fora = fora.not('id', 'in', `(${mantidos.join(',')})`);
        const { error: erroFora } = await fora;
        if (erroFora) throw new Error(erroFora.message);
    }

    // -- MOVIMENTAÇÕES DE INSUMO --
    async getInsumoMovements(insumoId?: string): Promise<InsumoMovement[]> {
        if (!supabase) return [];

        let query = supabase.from('insumo_movements').select('*').order('created_at', { ascending: false }).limit(2000);
        if (insumoId) query = query.eq('insumo_id', insumoId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return (data || []) as InsumoMovement[];
    }

    // -- PRODUTO INSUMOS (Ficha Técnica / BOM) --
    async getProductInsumos(productId: string): Promise<ProductInsumo[]> {
        if (!supabase) return [];

        const { data, error } = await supabase.from('product_insumos').select('*').eq('product_id', productId);
        if (error) throw new Error(error.message);
        return (data || []) as ProductInsumo[];
    }

    async saveProductInsumo(mat: Partial<ProductInsumo>): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const payload = {
            ...mat,
            id: mat.id || idService.generateUUID(),
            user_id: user.id,
        };
        const { error } = await supabase.from('product_insumos').upsert(payload);
        if (error) throw new Error(error.message);
    }

    async deleteProductInsumo(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('product_insumos').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    /**
     * Fichas técnicas de vários produtos de uma vez.
     *
     * Existe para matar um N+1: a lista de compras pedia a ficha produto por
     * produto, então um lote com 60 produtos distintos virava 60 idas ao banco
     * em sequência de rede — o que fazia a tela ficar segundos em "carregando".
     *
     * Os ids vão em blocos porque o `.in()` viaja na URL, e uma lista muito
     * longa estoura o limite de tamanho da requisição.
     */
    /**
     * Grava só os valores padrão que a planilha de produtos edita (Tabelas de custo). Lista os campos
     * em vez de espalhar o produto: o produto inteiro carrega custo calculado pelo banco, e regravar o
     * objeto de quando a planilha abriu é o padrão que já custou dinheiro duas vezes (CLAUDE.md).
     */
    async atualizarValoresDoProduto(id: string, campos: {
        default_fabric_insumo_id?: string | null; fabric_consumption_m?: number | null;
        price_tier1?: number; price_tier2?: number; price_tier3?: number;
    }): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const PERMITIDOS = ['default_fabric_insumo_id', 'fabric_consumption_m', 'price_tier1', 'price_tier2', 'price_tier3'] as const;
        const patch: Record<string, unknown> = { updated_at: getNow().toISOString() };
        for (const k of PERMITIDOS) {
            if (!(k in campos)) continue;
            const v = campos[k];
            patch[k] = k.startsWith('price_tier') ? round2(Number(v) || 0) : v;
        }
        const { data, error } = await supabase.from('products').update(patch).eq('id', id).select('id');
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Produto não encontrado (ou sem permissão para editar).');
    }

    async getProductInsumosByProducts(productIds: string[], { estrito = false } = {}): Promise<Map<string, ProductInsumo[]>> {
        const porProduto = new Map<string, ProductInsumo[]>();
        if (!supabase || productIds.length === 0) return porProduto;

        const unicos = [...new Set(productIds.filter(Boolean))];
        const TAMANHO_BLOCO = 200;
        for (let i = 0; i < unicos.length; i += TAMANHO_BLOCO) {
            const bloco = unicos.slice(i, i + TAMANHO_BLOCO);
            const { data, error } = await supabase
                .from('product_insumos').select('*').in('product_id', bloco);
            // Estrito: quem decide o que gravar não pode tomar falha de leitura por "sem ficha" (criaria linha repetida).
            if (error) { if (estrito) throw new Error(error.message); console.error('getProductInsumosByProducts:', error.message); continue; }
            for (const r of (data || []) as ProductInsumo[]) {
                const lista = porProduto.get(r.product_id) || [];
                lista.push(r);
                porProduto.set(r.product_id, lista);
            }
        }
        // Produto sem ficha entra com lista vazia: quem chama distingue "sem
        // ficha" de "não perguntei por ele".
        for (const id of unicos) if (!porProduto.has(id)) porProduto.set(id, []);
        return porProduto;
    }

    /**
     * A ficha técnica inteira: produto -> insumos que ele consome.
     *
     * Uma consulta para todas as fichas. A alternativa — pedir por produto —
     * era uma ida ao banco por produto, e quem precisa disto (a completude do
     * cadastro, o custo do orçamento) precisa de TODAS ao mesmo tempo.
     *
     * Produto sem ficha simplesmente não aparece no mapa. Leitura que falha
     * rejeita (nunca devolve o mapa vazio): vazio leria como "nenhum produto
     * tem ficha" e inventaria pendência de cadastro.
     */
    async getFichaPorProduto(): Promise<Map<string, string[]>> {
        const mapa = new Map<string, string[]>();
        if (!supabase) return mapa;

        const { data, error } = await supabase
            .from('product_insumos').select('product_id, insumo_id');
        if (error) throw new Error(`getFichaPorProduto: ${error.message}`);

        for (const r of (data || []) as { product_id?: string; insumo_id?: string }[]) {
            if (!r.product_id || !r.insumo_id) continue;
            const lista = mapa.get(r.product_id) || [];
            lista.push(r.insumo_id);
            mapa.set(r.product_id, lista);
        }
        return mapa;
    }

    // -- PRODUTOS --
    async getProducts(): Promise<Product[]> {
        return comCache('products', () => this.getProductsSemCache());
    }

    async getProductsSemCache(): Promise<Product[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('products').select('*').limit(1000);
        if (error) throw new Error(error.message);
        const products = data || [];
        return products.map((p: any) => ({
            ...p,
            price_tier1: p.price_tier1 ? round2(p.price_tier1) : (p.priceTier1 ? round2(p.priceTier1) : 0),
            price_tier2: p.price_tier2 ? round2(p.price_tier2) : (p.priceTier2 ? round2(p.priceTier2) : 0),
            price_tier3: p.price_tier3 ? round2(p.price_tier3) : (p.priceTier3 ? round2(p.priceTier3) : 0),
        }));
    }

    async saveProduct(product: Product): Promise<Product> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();

        // Garantir arredondamento exato de 2 casas
        const formattedProduct = {
            ...product,
            price_tier1: product.price_tier1 ? round2(product.price_tier1) : 0,
            price_tier2: product.price_tier2 ? round2(product.price_tier2) : 0,
            price_tier3: product.price_tier3 ? round2(product.price_tier3) : 0,
        };

        const payload = { 
            ...formattedProduct, 
            id: formattedProduct.id || idService.generateUUID(), 
            user_id: user.id,
            updated_at: now, 
            created_at: formattedProduct.created_at || now 
        };

        const { supplier_name, supplier, insumos, ...cleanPayload } = payload as any;
        const { error } = await supabase.from('products').upsert(cleanPayload);
        if (!error) return payload as Product;

        // Colunas de migrações recentes podem não existir ainda. Barrar o
        // cadastro inteiro por causa de um campo novo deixaria o usuário sem
        // conseguir salvar nada — grava sem ele e avisa onde está a migração.
        const opcionais: { coluna: string; migracao: string; perda: string }[] = [
            { coluna: 'price_notes', migracao: 'produtos_notas_de_preco.sql', perda: 'as notas de preço' },
            { coluna: 'canonical_product_id', migracao: 'produtos_apelidos.sql', perda: 'o vínculo de "mesma peça"' },
        ];
        const ausentes = opcionais.filter(o => isColunaAusente(error, o.coluna));
        if (ausentes.length > 0) {
            const semNovas = { ...cleanPayload };
            for (const o of ausentes) delete semNovas[o.coluna];
            const repetir = await supabase.from('products').upsert(semNovas);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                `[products] coluna(s) ausente(s): produto salvo SEM ${ausentes.map(o => o.perda).join(' e ')}. `
                + `Rode ${ausentes.map(o => 'supabase/' + o.migracao).join(' e ')} para habilitar.`);
            return payload as Product;
        }
        throw new Error(error.message);
    }

    async deleteProduct(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // Local cache to avoid redundant fetches across getOrders calls
    private static productCache = new Map<string, string>();

    async getOrders(): Promise<Order[]> {
        return comCache('orders', () => this.getOrdersSemCache());
    }

    async getOrdersSemCache(): Promise<Order[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(1000);
        if (error) throw new Error(error.message);
        const orders = data || [];

        // --- HYDRATION: Ensure product_name exists for all items ---
        const missingProductIds = new Set<string>();
        orders.forEach(o => {
            o.items?.forEach((item: any) => {
                if (item.product_id) {
                    if (InventoryRepository.productCache.has(item.product_id)) {
                        item.product_name = InventoryRepository.productCache.get(item.product_id);
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
                productsData.forEach(p => InventoryRepository.productCache.set(p.id, p.name));
                orders.forEach(o => {
                    o.items?.forEach((item: any) => {
                        if (!item.product_name && item.product_id) {
                            item.product_name = InventoryRepository.productCache.get(item.product_id);
                        }
                    });
                });
            }
        }

        return orders;
    }

    async saveOrder(order: Order): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const now = getNow().toISOString();
        const payload = { 
            ...order, 
            id: order.id || idService.generateUUID(), 
            user_id: user.id,
            updated_at: now, 
            created_at: order.created_at || now 
        };
        const { error } = await supabase.from('orders').upsert(payload);
        if (!error) return;

        // Mesma degradação do orçamento: coluna de migração não aplicada não
        // pode impedir o pedido de ser salvo. A observação de fábrica se perde,
        // o pedido não.
        const opcionais = [
            { coluna: 'factory_notes', migracao: 'observacao_de_fabrica.sql', perda: 'a observação de fábrica' },
        ];
        const ausentes = opcionais.filter(o => isColunaAusente(error, o.coluna));
        if (ausentes.length > 0) {
            const semNovas = { ...(payload as Record<string, any>) };
            for (const o of ausentes) delete semNovas[o.coluna];
            const repetir = await supabase.from('orders').upsert(semNovas);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                `[orders] coluna(s) ausente(s): pedido salvo SEM ${ausentes.map(o => o.perda).join(' e ')}. `
                + `Rode ${[...new Set(ausentes.map(o => 'supabase/' + o.migracao))].join(' e ')} para habilitar.`);
            return;
        }
        throw new Error(error.message);
    }

    async deleteOrder(id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
}
