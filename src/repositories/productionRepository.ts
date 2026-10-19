
import { supabase } from '@/services/supabase';
import { Order, OrderStatus, ProductionStage } from '@/types';
import { getNow } from '@/utils';
import { getTodayStr } from '@/utils/date';
import { isFuncaoAusente } from '@/utils/postgrestErrors';
import { planejarBaixa } from '@/utils/baixaDeProducao';
import type { PlanoDeBaixa, LinhaDaFicha } from '@/utils/baixaDeProducao';
import { previstoDeTecidos } from '@/utils/rendimentoDoCorte';
import type { InsumoDeTecido } from '@/utils/rendimentoDoCorte';

export type EnrichedOrder = Order & { clientName?: string };

export class ProductionRepository {
    private static productCache = new Map<string, string>();

    async getEnrichedOrders(): Promise<EnrichedOrder[]> {
        if (!supabase) return [];

        const [ordersRes, clientsRes] = await Promise.all([
            supabase.from('orders').select('*').order('created_at', { ascending: false }),
            supabase.from('clients').select('*')
        ]);

        if (ordersRes.error) throw new Error(ordersRes.error.message);
        if (clientsRes.error) throw new Error(clientsRes.error.message);

        const clients = clientsRes.data;
        const orders = ordersRes.data;

        // --- HYDRATION: Ensure product_name exists for all items ---
        const missingProductIds = new Set<string>();
        orders.forEach(o => {
            o.items?.forEach((item: any) => {
                if (item.product_id) {
                    if (ProductionRepository.productCache.has(item.product_id)) {
                        item.product_name = ProductionRepository.productCache.get(item.product_id);
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
                productsData.forEach(p => ProductionRepository.productCache.set(p.id, p.name));
                orders.forEach(o => {
                    o.items?.forEach((item: any) => {
                        if (!item.product_name && item.product_id) {
                            item.product_name = ProductionRepository.productCache.get(item.product_id);
                        }
                    });
                });
            }
        }

        return orders.map(o => ({
            ...o,
            clientName: clients.find(c => c.id === o.client_id)?.company_name || 'Cliente Desconhecido',
            production_stage: o.production_stage || ProductionStage.WAITING
        }));
    }

    async saveOrderStage(order: Partial<Order>): Promise<void> {
        if (!supabase) throw new Error("Supabase não configurado");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        if (!order.id) throw new Error('Pedido sem id para atualizar estágio');

        // ESCREVE SÓ O QUE É DA PRODUÇÃO, e não o pedido inteiro.
        //
        // Era `...order`, o objeto todo — e com ele viajava `total_amount`. O
        // kanban do PCP monta esse objeto a partir da lista que carregou ao
        // abrir a tela, e arrastar um cartão gravava de volta o total daquele
        // instante. Enquanto o total só mudava ao editar o pedido, ninguém
        // notava; com o ADITIVO, o total muda por fora, e a sequência vira:
        // alguém lança 20 peças a mais (total sobe R$ 1.000), outra pessoa
        // arrasta um cartão no PCP, e o total volta ao valor antigo — enquanto
        // o aditivo e a cobrança de R$ 1.000 continuam existindo. Os livros
        // passam a discordar, em silêncio.
        //
        // É o mesmo padrão do saldo inicial da conta bancária, que nesta mesma
        // base já apagou um valor por gravar um formulário com estado velho: o
        // conserto não é lembrar de recarregar antes de salvar, é a gravação
        // não carregar campo que não é dela.
        const entregue = order.status === OrderStatus.DELIVERED;
        const geraRecebivel = entregue;

        // Lido ANTES de gravar: se a leitura falhar, nada foi escrito e o pedido
        // não fica "Entregue" no banco enquanto a tela mostra erro.
        const cobranca = geraRecebivel ? await this.lerCobrancaDoPedido(order.id) : null;

        const { error } = await supabase.from('orders').update({
            production_stage: order.production_stage,
            status: order.status,
            items: order.items,
            user_id: user.id,
            updated_at: getNow().toISOString(),
            // A data da entrega mora no pedido: é por ela que "vendas do mês" conta.
            ...(entregue ? { delivered_at: getTodayStr(getNow()) } : {}),
        }).eq('id', order.id);
        if (error) throw new Error(error.message);

        if (cobranca) {
            try {
                await this.ensureReceivableForDeliveredOrder(order, cobranca);
            } catch (e) {
                // O papel de fábrica entrega o pedido, mas não enxerga nem cria
                // contas (RLS + assert_finance_access). O pedido já está Entregue;
                // a cobrança fica para quem tem acesso financeiro (a janela de
                // entrega do admin/gerente, ou o plano que já existe).
                const msg = e instanceof Error ? e.message : String(e);
                if (!msg.includes('Acesso financeiro negado')) throw e;
                console.warn('Entrega registrada; conta a receber não gerada (sem acesso financeiro):', msg);
            }
        }
    }

    /**
     * O total vem do banco, não do objeto do quadro: o quadro pode estar aberto
     * desde antes de um aditivo, e cobrar o total velho é perder dinheiro.
     */
    private async lerCobrancaDoPedido(orderId: string): Promise<{ total_amount: number | string | null; deadline: string | null }> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase
            .from('orders').select('total_amount, deadline').eq('id', orderId).single();
        if (error) throw new Error(error.message);
        return data;
    }

    private async ensureReceivableForDeliveredOrder(
        order: Partial<Order>,
        atual: { total_amount: number | string | null; deadline: string | null },
    ): Promise<void> {
        if (!supabase || !order.id) return;

        // `cancelled_at is null`: uma conta cancelada não cobra ninguém. Sem este
        // filtro, quem cancelasse as parcelas e depois marcasse o pedido como
        // entregue saía com pedido entregue e nada a receber — e sem aviso, porque
        // esta função devolve em silêncio quando acha que já existe cobrança.
        let existingObs: Array<{ id: string }> | null = null;
        const byOrderId = await supabase
            .from('financial_obligations')
            .select('id')
            .eq('order_id', order.id)
            .eq('type', 'receivable')
            .is('cancelled_at', null);

        if (byOrderId.error) {
            const byNotes = await supabase
                .from('financial_obligations')
                .select('id')
                .eq('notes', order.id)
                .eq('type', 'receivable')
                .is('cancelled_at', null);
            if (byNotes.error) throw new Error(byNotes.error.message);
            existingObs = byNotes.data || [];
        } else {
            existingObs = byOrderId.data || [];
        }

        if (existingObs && existingObs.length > 0) return;

        const { error: finError } = await supabase.rpc('create_recurrence_obligations', {
            p_type: 'receivable',
            p_description: `Pedido #${order.order_number}`,
            p_amount: Number(atual.total_amount) || 0,
            p_first_due: atual.deadline || getNow().toISOString().split('T')[0],
            p_months: 1,
            p_client_id: order.client_id,
            p_notes: order.id,
            p_order_id: order.id
        });
        if (finError) throw new Error(`FINANCE_ERROR: ${finError.message}`);
    }

    /** Total, prazo e cliente lidos agora do banco, para a janela de entrega. */
    async lerPedidoParaEntrega(orderId: string): Promise<{
        total_amount: number; deadline: string | null; client_id: string | null; order_number: string;
    }> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase
            .from('orders').select('total_amount, deadline, client_id, order_number').eq('id', orderId).single();
        if (error) throw new Error(error.message);
        return {
            total_amount: Number(data.total_amount) || 0,
            deadline: data.deadline ?? null,
            client_id: data.client_id ?? null,
            order_number: String(data.order_number),
        };
    }

    // =========================================================================
    // BAIXA AUTOMÁTICA DE ESTOQUE  (2.0 — bloco E1)
    // =========================================================================

    /**
     * O que sairia do estoque deste pedido, e o que ficaria por apurar.
     *
     * Separado da gravação de propósito: é isto que a tela mostra ANTES de
     * confirmar. Mexer em estoque sem dizer o que vai mexer é como o sistema
     * perde a confiança de quem opera.
     */
    async planejarBaixaDoPedido(order: Order): Promise<PlanoDeBaixa> {
        const ficha = new Map<string, LinhaDaFicha[]>();
        if (!supabase) return planejarBaixa(order.items, ficha);

        const produtoIds = [...new Set((order.items || [])
            .map(i => i.product_id).filter(Boolean) as string[])];
        if (produtoIds.length === 0) return planejarBaixa(order.items, ficha);

        const { data, error } = await supabase
            .from('product_insumos')
            .select('product_id, insumo_id, quantity')
            .in('product_id', produtoIds);

        if (error) {
            console.error('planejarBaixaDoPedido:', error.message);
            // Sem a ficha, tudo vira não apurado — que é a resposta correta e
            // conservadora. O que não pode acontecer é baixar por adivinhação.
            return planejarBaixa(order.items, ficha);
        }

        for (const r of (data || []) as { product_id: string; insumo_id: string; quantity: number }[]) {
            const lista = ficha.get(r.product_id) || [];
            lista.push({ insumo_id: r.insumo_id, quantity: r.quantity });
            ficha.set(r.product_id, lista);
        }
        return planejarBaixa(order.items, ficha);
    }

    // =========================================================================
    // RENDIMENTO DO CORTE  (2.0 — bloco E2)
    // =========================================================================

    /**
     * Grava quanto de tecido a ficha previu para este pedido.
     *
     * Roda junto da baixa, com o MESMO plano — se o previsto do rendimento
     * saísse de outra conta, os dois números divergiriam na primeira mudança de
     * ficha, e o rendimento passaria a medir a diferença entre dois cálculos em
     * vez do desempenho do corte.
     *
     * Devolve o número de linhas novas, ou `null` sem a migração.
     */
    async registrarPrevistoDoCorte(
        orderId: string,
        etapa: string,
        plano: PlanoDeBaixa,
    ): Promise<number | null> {
        if (!supabase || plano.baixas.length === 0) return null;

        const ids = plano.baixas.map(b => b.insumo_id);
        const { data: insumos, error: erroInsumos } = await supabase
            .from('insumos')
            .select('id, name, unit, fabric_family, category')
            .in('id', ids);

        if (erroInsumos) {
            console.error('registrarPrevistoDoCorte:', erroInsumos.message);
            return null;
        }

        const previstos = previstoDeTecidos(plano.baixas, (insumos || []) as InsumoDeTecido[]);
        if (previstos.length === 0) return 0;   // pedido sem tecido: nada a medir

        const { data, error } = await supabase.rpc('registrar_previsto_do_corte', {
            p_order_id: orderId,
            p_stage: etapa,
            p_previstos: previstos.map(t => ({
                insumo_id: t.insumo_id,
                insumo_name: t.nome,
                unidade: t.unidade,
                previsto: t.previsto,
            })),
        });

        if (error) {
            if (isFuncaoAusente(error, 'registrar_previsto_do_corte')) {
                console.warn(
                    '[corte] rendimento indisponível: rode supabase/rendimento_do_corte.sql.');
                return null;
            }
            throw new Error(error.message);
        }
        return Number(data) || 0;
    }

    /** Todos os registros de rendimento, do mais recente para o mais antigo. */
    async getRendimentoDoCorte(): Promise<RendimentoDoCorteRow[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('rendimento_do_corte')
            .select('*, orders(order_number)')
            .order('created_at', { ascending: false })
            .limit(500);
        if (error) {
            console.warn('getRendimentoDoCorte:', error.message);
            return [];
        }
        return (data || []).map((r: any) => ({
            ...r,
            order_number: r.orders?.order_number || null,
        })) as RendimentoDoCorteRow[];
    }

    async informarGastoDoCorte(id: string, gasto: number, observacao?: string): Promise<void> {
        if (!supabase) return;
        const { error } = await supabase.rpc('informar_gasto_do_corte', {
            p_id: id,
            p_gasto: gasto,
            p_observacao: observacao || null,
        });
        if (error) throw new Error(error.message);
    }
}

/** Uma linha do rendimento do corte (ver supabase/rendimento_do_corte.sql). */
export interface RendimentoDoCorteRow {
    id: string;
    order_id: string;
    order_number?: string | null;
    insumo_id: string;
    insumo_name?: string | null;
    unidade?: string | null;
    stage?: string | null;
    previsto: number;
    gasto?: number | null;
    observacao?: string | null;
    informado_em?: string | null;
    created_at: string;
}

export const productionRepository = new ProductionRepository();
