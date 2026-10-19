import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storageService } from '../../services/storage';
import { productionRepository } from '../../repositories/productionRepository';
import { OrderStatus, Order, Client } from '../../types';
import { ProductionSector, OrderDelay } from '../../types/pcp';
import { planSchedule, SchedOrder, TravasAtraso } from '../../utils/pcpScheduler';
import { segundaDaSemana } from '../../utils/pcpSemana';
import { getTodayStr } from '../../utils/date';
import { useCargaProgressiva } from '../useCargaProgressiva';
import { apurarSobrasDoPedido } from './apurarSobrasDoPedido';
import { avisoDaEntrega as montarAvisoDaEntrega, avisoDeFalhaNaSobra } from '../../utils/fabrica/avisoDaEntrega';

export interface KanbanCard {
    id: string;
    order_number: string;
    client_name?: string;
    client_contact?: string;
    deadline: string;
    pieces: number;
    stage: string;               // production_stage atual
    /** Segunda da semana em que o cronograma planejou este pedido. Derivado do
     *  mesmo motor da aba Cronograma — nunca é gravado. */
    inicio_planejado?: string;
    /** Atraso registrado ainda em vigor (o pedido está travado até esta data). */
    travado_ate?: string;
    motivo_atraso?: string;
}

/** O que acabou de acontecer no quadro e merece um próximo passo. Guarda o
 *  pedido e o cliente como estavam: depois do reload o pedido já não está
 *  entre os ativos. */
export interface PassoDoQuadro {
    tipo: 'producao-iniciada' | 'entregue';
    order: Order;
    client: Client | null;
}

export interface KanbanColumn {
    sector: ProductionSector;
    cards: KanbanCard[];
}

export function usePcpKanban() {
    const [columns, setColumns] = useState<KanbanColumn[]>([]);
    const [orphan, setOrphan] = useState<KanbanCard[]>([]); // estágio sem setor correspondente
    const [rawOrders, setRawOrders] = useState<Map<string, Order>>(new Map());
    // Os clientes já são carregados para montar o cartão; guardá-los aqui é o
    // que permite a pré-visualização mostrar contato e endereço sem uma segunda
    // ida ao banco a cada olhada.
    const [clientesPorId, setClientesPorId] = useState<Map<string, Client>>(new Map());
    const [sectors, setSectors] = useState<ProductionSector[]>([]);
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Única trava que sobrou: confirmação de entrega ao sair do último setor.
    // Mover pedido não mexe em estoque nem é barrado por falta de insumo ou de
    // ficha (compras por pedido: o estoque só recebe a sobra, na entrega).
    const [deliveryConfirm, setDeliveryConfirm] = useState<KanbanCard | null>(null);
    const [passo, setPasso] = useState<PassoDoQuadro | null>(null);

    /**
     * O que aconteceu com a sobra ao entregar o último pedido.
     *
     * Aviso, não erro: o pedido JÁ foi entregue quando isto aparece. Fecha no X
     * em vez de sumir sozinho — mexer no estoque sem a pessoa ler é o que não pode.
     */
    const [avisoDaEntrega, setAvisoDaEntrega] = useState<string | null>(null);
    /**
     * Pedidos entregues cuja sobra falhou, por id, para "Tentar de novo" (a RPC é idempotente).
     * Fechar o aviso só esconde a mensagem; entrega nova não apaga os pendentes. Quem recarregar
     * a página os reencontra em Lista de compras > "Entregues sem sobra apurada".
     */
    const [pendentesDeSobra, setPendentesDeSobra] = useState<Map<string, Order>>(new Map());
    /** Conta as entregas: o resultado de uma apuração que já foi superada por outra entrega não mexe no aviso. */
    const entregaSeq = useRef(0);

    const firstSector = useMemo(() => sectors[0]?.name || '', [sectors]);
    const lastSector = useMemo(() => sectors[sectors.length - 1]?.name || '', [sectors]);

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, secs, clients, delays] = await Promise.all([
                storageService.getOrders(),
                storageService.getSectors(false),
                storageService.getClients(),
                storageService.getOrderDelays(),
            ]);
            const clientById = new Map(clients.map(c => [c.id, c]));
            const active = orders.filter(o =>
                o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION);

            setRawOrders(new Map(active.map(o => [o.id, o])));
            setClientesPorId(clientById);
            setSectors(secs);

            const pecas = (o: Order) => (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

            // Semana planejada de cada pedido — mesmo motor da aba Cronograma,
            // para os dois nunca discordarem sobre o que começa esta semana.
            //
            // Não carrega insumos aqui de propósito: o tecido/cor só influencia
            // a ORDEM dentro da semana (agrupamento de regulagem), nunca em QUAL
            // semana o pedido cai — que é a única coisa usada no quadro.
            const capacidades = secs.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
            const capacidade = capacidades.length ? Math.min(...capacidades) : 350;
            const travas: TravasAtraso = {};
            const atrasoPorPedido = new Map<string, OrderDelay>();
            for (const d of delays) {
                if (!travas[d.order_id] || d.liberado_em > travas[d.order_id]) {
                    travas[d.order_id] = d.liberado_em;
                    atrasoPorPedido.set(d.order_id, d);
                }
            }
            const sched: SchedOrder[] = active.map(o => ({
                id: o.id, order_number: o.order_number,
                deadline: o.deadline || '2999-12-31', pieces: pecas(o),
            }));
            const plano = planSchedule(sched, capacidade, segundaDaSemana(getTodayStr()), travas);
            const semanaPlanejada = new Map<string, string>();
            for (const w of plano.weeks) for (const o of w.orders) semanaPlanejada.set(o.id, w.week_start);

            const toCard = (o: Order): KanbanCard => {
                const c = clientById.get(o.client_id);
                const atraso = atrasoPorPedido.get(o.id);
                return {
                    id: o.id, order_number: o.order_number,
                    client_name: c?.company_name, client_contact: c?.contact_person,
                    deadline: o.deadline,
                    pieces: pecas(o),
                    stage: o.production_stage || '',
                    inicio_planejado: semanaPlanejada.get(o.id),
                    travado_ate: atraso?.liberado_em,
                    motivo_atraso: atraso?.motivo,
                };
            };

            const sectorNames = new Set(secs.map(s => s.name));
            const cols: KanbanColumn[] = secs.map(s => ({ sector: s, cards: [] }));
            const colByName = new Map(cols.map(c => [c.sector.name, c]));
            const orphans: KanbanCard[] = [];

            for (const o of active) {
                const card = toCard(o);
                if (card.stage && sectorNames.has(card.stage)) colByName.get(card.stage)!.cards.push(card);
                else if (cols.length > 0 && !card.stage) cols[0].cards.push(card); // sem estágio → 1º setor
                else orphans.push(card);
            }
            setColumns(cols);
            setOrphan(orphans);
        } catch (e: any) {
            setError(e?.message || 'Falha ao carregar o quadro');
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Grava a mudança de setor. Passa pelo productionRepository (e não pelo
    // saveOrder genérico) porque é ele que cria o recebível quando o pedido
    // é entregue — sem isso a entrega não chega no financeiro.
    const commitMove = useCallback(async (order: Order, sectorName: string | null) => {
        const entregue = sectorName === null;
        const updated: Order = {
            ...order,
            production_stage: (entregue ? order.production_stage : sectorName) as Order['production_stage'],
            status: entregue ? OrderStatus.DELIVERED : OrderStatus.IN_PRODUCTION,
            items: entregue
                ? order.items
                : (order.items || []).map(i => ({ ...i, production_stage: sectorName as any })),
        };
        await productionRepository.saveOrderStage(updated);
        await load();
    }, [load]);

    // Move um pedido para outro setor, aplicando as travas.
    const moveTo = useCallback(async (orderId: string, sectorName: string) => {
        const order = rawOrders.get(orderId);
        if (!order) return;
        setBusy(true); setError(''); setPasso(null);
        try {
            const saindoDoPrimeiro = (order.production_stage || firstSector) === firstSector
                && sectorName !== firstSector;
            await commitMove(order, sectorName);
            if (saindoDoPrimeiro) {
                // Só ao SAIR do primeiro setor: é aí que a peça deixa de ser
                // intenção e passa a consumir material. Grava só o previsto do
                // corte (histórico de rendimento); nunca segura o movimento.
                try {
                    const plano = await productionRepository.planejarBaixaDoPedido(order);
                    await productionRepository.registrarPrevistoDoCorte(order.id, sectorName, plano);
                } catch (e) {
                    console.warn('[corte] previsto não registrado:', e);
                }
                setPasso({ tipo: 'producao-iniciada', order, client: clientesPorId.get(order.client_id) || null });
            }
        } catch (e: any) {
            setError((e instanceof Error ? e.message : '') || 'Falha ao mover pedido');
        } finally {
            setBusy(false);
        }
    }, [rawOrders, clientesPorId, firstSector, commitMove]);

    // Trava 3: concluir o pedido a partir do último setor (vira DELIVERED e
    // gera o recebível). Só é oferecido para quem já está no último setor.
    const requestDelivery = useCallback((card: KanbanCard) => setDeliveryConfirm(card), []);

    const confirmDelivery = useCallback(async () => {
        if (!deliveryConfirm) return;
        const order = rawOrders.get(deliveryConfirm.id);
        setDeliveryConfirm(null);
        if (!order) return;
        const minha = ++entregaSeq.current;
        setBusy(true); setError(''); setPasso(null); setAvisoDaEntrega(null);
        try {
            await commitMove(order, null);
            setPasso({ tipo: 'entregue', order, client: clientesPorId.get(order.client_id) || null });
        } catch (e: any) {
            // Não entregou: a apuração só roda depois que o status 'Entregue' foi gravado.
            setError(e?.message || 'Falha ao concluir o pedido');
            return;
        } finally {
            setBusy(false);
        }
        try {
            const texto = montarAvisoDaEntrega(await apurarSobrasDoPedido(order));
            // Resultado de entrega superada, ou "já feita" (null), nunca apaga um aviso que está na tela.
            if (minha === entregaSeq.current && texto) setAvisoDaEntrega(texto);
        } catch (e) {
            setPendentesDeSobra(prev => new Map(prev).set(order.id, order));
            if (minha === entregaSeq.current) setAvisoDaEntrega(avisoDeFalhaNaSobra(e instanceof Error ? e.message : 'erro'));
        }
    }, [deliveryConfirm, rawOrders, clientesPorId, commitMove]);

    /** Repete a apuração de todos os pendentes; os que derem certo saem da lista. */
    const tentarApurarDeNovo = useCallback(async () => {
        if (pendentesDeSobra.size === 0) return;
        setBusy(true);
        const restantes = new Map(pendentesDeSobra);
        const textos: string[] = [];
        let falha = '';
        for (const [id, order] of pendentesDeSobra) {
            try {
                const t = montarAvisoDaEntrega(await apurarSobrasDoPedido(order));
                if (t) textos.push(t);
                restantes.delete(id);
            } catch (e) {
                falha = e instanceof Error ? e.message : 'erro';
            }
        }
        setPendentesDeSobra(restantes);
        setAvisoDaEntrega(falha ? avisoDeFalhaNaSobra(falha) : textos.join(' ') || null);
        setBusy(false);
    }, [pendentesDeSobra]);

    /**
     * Pedido inteiro por trás de um cartão, para a pré-visualização.
     *
     * O cartão carrega o mínimo para caber na coluna — número, cliente, peças,
     * prazo. Quem está no quadro e precisa saber QUE peças são, em que tecido,
     * com qual personalização, tinha de abrir a aba de pedidos e procurar. O
     * dado já está em memória; só faltava um caminho até ele.
     */
    const detalhesDoPedido = useCallback((orderId: string) => {
        const order = rawOrders.get(orderId);
        if (!order) return null;
        return { order, client: clientesPorId.get(order.client_id) || null };
    }, [rawOrders, clientesPorId]);

    return {
        columns, orphan, sectors, error, reload: load, moveTo, detalhesDoPedido,
        loading: carga.carregando, busy: busy || carga.recarregando,
        firstSector, lastSector,
        deliveryConfirm, requestDelivery, confirmDelivery,
        cancelDelivery: () => setDeliveryConfirm(null),
        passo, fecharPasso: () => setPasso(null),
        avisoDaEntrega, sobrasPendentes: pendentesDeSobra.size, tentarApurarDeNovo,
        limparAvisoDaEntrega: () => setAvisoDaEntrega(null),
    };
}
