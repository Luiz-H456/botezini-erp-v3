
import { supabase } from '@/services/supabase';
import { Order, OrderAddendum } from '@/types';
import type { ItemDoAditivo } from '@/utils/aditivoDePedido';
import { getNow } from '@/utils';
import { idService } from '@/services/idService';
import { isColunaAusente, ehValorDuplicado } from '@/utils/postgrestErrors';

export class OrderRepository {
    private static productCache = new Map<string, string>();

    async getOrders(): Promise<Order[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        const orders = data || [];

        // --- HYDRATION: Ensure product_name exists for all items ---
        const missingProductIds = new Set<string>();
        orders.forEach(o => {
            o.items?.forEach((item: any) => {
                if (item.product_id) {
                    if (OrderRepository.productCache.has(item.product_id)) {
                        item.product_name = OrderRepository.productCache.get(item.product_id);
                    } else if (!item.product_name) {
                        missingProductIds.add(item.product_id);
                    }
                }
            });
        });

        if (missingProductIds.size > 0) {
            const { data: products } = await supabase
                .from('products')
                .select('id, name')
                .in('id', Array.from(missingProductIds));

            if (products) {
                products.forEach(p => OrderRepository.productCache.set(p.id, p.name));
                orders.forEach(o => {
                    o.items?.forEach((item: any) => {
                        if (!item.product_name && item.product_id) {
                            item.product_name = OrderRepository.productCache.get(item.product_id);
                        }
                    });
                });
            }
        }

        return orders;
    }

    async deleteOrderWithCascade(order_id: string): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");

        let linkedObligations: Array<{ id: string }> = [];
        const byOrderId = await supabase
            .from('financial_obligations')
            .select('id')
            .eq('order_id', order_id)
            .in('type', ['receivable']);

        if (byOrderId.error) {
            const byNotes = await supabase
                .from('financial_obligations')
                .select('id')
                .eq('notes', order_id)
                .in('type', ['receivable']);
            if (byNotes.error) throw new Error(byNotes.error.message);
            linkedObligations = byNotes.data || [];
        } else {
            linkedObligations = byOrderId.data || [];
        }

        // ── PRÉ-CHECAGEM, antes de cancelar a primeira conta ────────────────
        //
        // O laço abaixo cancelava uma por uma e lançava no primeiro erro. Se a
        // terceira parcela tivesse pagamento, as duas primeiras já estavam
        // canceladas, o pedido continuava existindo e o orçamento continuava
        // "Convertido" — reversão pela metade, e o estado que sobra é pior que
        // o de antes de tentar. O erro cru ainda por cima não dizia QUAL conta
        // travou, num ponto do fluxo em que a pessoa nem sabia que havia
        // pagamento nenhum.
        //
        // Conferir tudo primeiro custa uma consulta e transforma um estado
        // inconsistente numa recusa limpa: ou reverte inteiro, ou não começa.
        if (linkedObligations.length > 0) {
            const ids = linkedObligations.map(o => o.id);
            const { data: pagamentos, error: erroPag } = await supabase
                .from('obligation_payments')
                .select('obligation_id')
                .in('obligation_id', ids)
                .is('reversed_at', null)
                .is('reversal_of', null);

            if (erroPag) throw new Error(erroPag.message);

            const travadas = new Set((pagamentos || []).map((p: { obligation_id: string }) => p.obligation_id));
            if (travadas.size > 0) {
                const n = travadas.size;
                throw new Error(
                    `FINANCE_ERROR: ${n === 1 ? 'Uma conta deste pedido tem' : `${n} contas deste pedido têm`} `
                    + 'pagamento lançado. Estorne o pagamento no financeiro antes de reverter o pedido — '
                    + 'cancelar por cima deixaria o saldo do banco apontando para um pedido que não existe mais. '
                    + 'Nada foi alterado.');
            }
        }

        for (const obligation of linkedObligations) {
            const { error: cancelError } = await supabase.rpc('cancel_obligation', {
                p_obligation_id: obligation.id,
                p_reason: 'Pedido excluido ou revertido',
            });
            if (cancelError) throw new Error(`FINANCE_ERROR: ${cancelError.message}`);
        }

        // We use a transaction-like approach or parallel deletes if no DB triggers handle it
        // 1. Get linked documents to know what to delete
        const { data: invoices } = await supabase.from('invoices').select('id').eq('order_id', order_id);

        // 2. Delete linked documents from V3 schema (obligation_summary)
        // Note: 'transactions' table is removed/deprecated in V3
        // No explicit manual delete needed here if V3 uses obligation_summary linked by reference_id with cascade
        // But we keep the code clean by removing mentions of 'transactions'
        if (invoices && invoices.length > 0) {
            for (const inv of invoices) {
                await supabase.from('invoices').delete().eq('id', inv.id);
            }
        }

        // 4. Devolve o orçamento ao estado de antes da conversão.
        //
        // `generated_order_number` volta a nulo junto do status: deixá-lo
        // preenchido apontando para um pedido apagado faria a conferência da
        // próxima conversão avisar "este orçamento já gerou o pedido #N" sobre
        // um pedido que não existe mais.
        const { data: order } = await supabase.from('orders').select('budget_id').eq('id', order_id).single();
        if (order?.budget_id) {
            const { error: erroOrcamento } = await supabase.from('budgets')
                .update({
                    status: 'Approved',
                    generated_order_number: null
                })
                .eq('id', order.budget_id);
            // Antes o erro era engolido: o pedido sumia e o orçamento ficava
            // preso em "Convertido", sem pedido e sem botão para converter de
            // novo — órfão silencioso.
            if (erroOrcamento) {
                throw new Error(
                    `O pedido foi revertido, mas o orçamento não voltou para "Aprovado": `
                    + `${erroOrcamento.message}. Reabra o orçamento e confira o status.`);
            }
        }

        // 5. Delete order
        const { error } = await supabase.from('orders').delete().eq('id', order_id);
        if (error) throw new Error(error.message);
    }

    // ── Aditivos ────────────────────────────────────────────────────────
    //
    // O pedido saiu com 100 camisas e na entrega vão 120. O aditivo é o
    // registro dessas 20: o quê, quanto, quando e por quê. O total do pedido
    // sobe junto — é dele que saem status de pagamento, recebíveis e
    // indicadores —, mas quem guarda a história é o aditivo.

    async getOrderAddendums(order_id: string): Promise<OrderAddendum[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('order_addendums')
            .select('*')
            .eq('order_id', order_id)
            .order('created_at', { ascending: true });
        if (error) {
            console.error('getOrderAddendums:', error.message);
            return [];
        }
        return (data || []).map(r => ({ ...r, amount: Number(r.amount) || 0 })) as OrderAddendum[];
    }

    /**
     * Grava o aditivo, soma no total do pedido e — se houver vencimento — cria
     * a cobrança. Os três numa transação só, do lado do banco.
     *
     * O VALOR NÃO VIAJA DAQUI. A função soma as linhas lá dentro. Mandar o
     * total pronto abriria a porta para ele discordar das peças enviadas
     * junto, e o registro passaria a dizer duas coisas sobre o mesmo aditivo.
     */
    async addOrderAddendum(entrada: {
        order_id: string;
        items: ItemDoAditivo[];
        reason?: string;
        /** Sem data não gera cobrança à parte: só sobe o total do pedido. */
        due_date?: string | null;
        planned_method?: string | null;
    }): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('add_order_addendum', {
            p_order_id: entrada.order_id,
            p_items: entrada.items,
            p_reason: entrada.reason || null,
            p_due_date: entrada.due_date || null,
            p_planned_method: entrada.planned_method || null,
        });
        if (error) throw error;
        return data as string;
    }

    async removeOrderAddendum(addendum_id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('remove_order_addendum', {
            p_addendum_id: addendum_id,
        });
        if (error) throw error;
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
        if (error) {
            // Mesmo caso do budgetRepository: a coluna reference_photos pode não
            // existir ainda. A conversão do orçamento não pode falhar por causa
            // de um campo acessório.
            if (isColunaAusente(error, 'reference_photos')) {
                const { reference_photos, ...semFotos } = payload as typeof payload & { reference_photos?: unknown };
                const repetir = await supabase.from('orders').upsert(semFotos);
                if (repetir.error) throw new Error(repetir.error.message);
                console.warn(
                    '[orders] coluna reference_photos ausente: pedido salvo SEM as fotos. ' +
                    'Rode supabase/phase11_fotos_referencia.sql para habilitar.');
            } else if (ehValorDuplicado(error, 'order_number')) {
                // Duas conversões simultâneas pedem o próximo número, leem o mesmo
                // maior existente e tentam gravar os dois. O índice único barra o
                // segundo — que é exatamente o certo, e é por isso que ele existe.
                // O que estava errado era o que chegava à tela: um texto em inglês
                // sobre violação de constraint, para uma situação cuja saída é
                // simplesmente tentar de novo.
                throw new Error(
                    'NUMERO_EM_USO: O número deste pedido acabou de ser usado por ' +
                    'outra conversão. Nada foi gravado — tente de novo e o pedido ' +
                    'receberá o número seguinte.');
            } else {
                throw new Error(error.message);
            }
        }

        // NOTE (Fase 1): a criação do recebível NÃO acontece mais aqui.
        // O recebível (entrada pendente + saldo) é criado uma única vez, de forma
        // atômica e idempotente por order_id, na conversão do orçamento via
        // financeRepository.createOrderReceivable / RPC create_order_receivable.
        // Isso elimina a dupla criação (conversão + entrega) e o dedup frágil por `notes`.
    }
}
