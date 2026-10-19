import { useState, useEffect, useCallback, useMemo } from 'react';
import { storageService } from '../../services/storage';
import { useCargaProgressiva } from '../useCargaProgressiva';
import { ProductionLog } from '../../types/pcp';
import {
    resumirPontualidade, pontualidadePorMes, ritmoDeProducao, tempoPorTipoDePeca,
    entregasApuradas,
} from '../../utils/metricasEntrega';

export function usePcpDesempenho() {
    const [pedidos, setPedidos] = useState<any[]>([]);
    const [logs, setLogs] = useState<ProductionLog[]>([]);
    const [produtos, setProdutos] = useState<Map<string, string>>(new Map());
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, prodLogs, prods] = await Promise.all([
                storageService.getOrders(),
                storageService.getProductionLogs(),
                storageService.getProducts(),
            ]);
            setPedidos(orders);
            setLogs(prodLogs as ProductionLog[]);
            setProdutos(new Map(prods.map(p => [p.id, p.name])));
        } catch (e: any) {
            setError(e?.message || 'Falha ao carregar o desempenho');
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const pontualidade = useMemo(() => resumirPontualidade(pedidos, logs), [pedidos, logs]);
    const porMes = useMemo(() => pontualidadePorMes(pedidos, logs), [pedidos, logs]);
    const ritmo = useMemo(() => ritmoDeProducao(logs), [logs]);

    // A chave da baixa guarda o ID do produto; a tela precisa do nome.
    const porTipoDePeca = useMemo(
        () => tempoPorTipoDePeca(logs).map(t => {
            const [id, cor, tam] = t.chave.split('|');
            const nome = produtos.get(id) || id;
            return { ...t, rotulo: [nome, cor, tam].filter(Boolean).join(' · ') };
        }),
        [logs, produtos],
    );

    /** Os que mais atrasaram, para saber onde olhar. */
    const pioresEntregas = useMemo(
        () => entregasApuradas(pedidos, logs)
            .filter(e => (e.diasDeAtraso ?? 0) > 0)
            .sort((a, b) => (b.diasDeAtraso as number) - (a.diasDeAtraso as number))
            .slice(0, 8),
        [pedidos, logs],
    );

    return {
        pontualidade, porMes, ritmo, porTipoDePeca, pioresEntregas,
        totalDePedidos: pedidos.length,
        loading: carga.carregando, recarregando: carga.recarregando, error, reload: load,
    };
}
