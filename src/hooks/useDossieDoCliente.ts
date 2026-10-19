import { useState, useEffect, useMemo, useCallback } from 'react';
import { storageService } from '@/services/storage';
import { montarDossie } from '@/utils/dossieDoCliente';
import { entregasApuradas } from '@/utils/metricasEntrega';
import { getTodayStr } from '@/utils';
import type { DossieDoCliente } from '@/utils/dossieDoCliente';
import type { EntregaDoPedido } from '@/utils/metricasEntrega';

/**
 * Tudo o que a casa sabe de um cliente, buscado sob demanda.
 *
 * Busca ao ABRIR a página, não junto com a lista de cadastros: orçamentos,
 * pedidos, contas e logs de produção somados dão uma carga pesada, e ninguém
 * abre Cadastros para ver o dossiê de todo mundo — abre para ver o de um.
 *
 * Os logs de produção são a única fonte de data de entrega REAL: o pedido tem
 * `deadline` (o prometido) e `status`, mas nenhum campo que diga em que dia a
 * peça saiu. Ver metricasEntrega.ts.
 */
export function useDossieDoCliente(clientId: string | null) {
    const [dossie, setDossie] = useState<DossieDoCliente | null>(null);
    /** Orçamentos completos deste cliente — o dossiê guarda só o que resume,
     *  mas o preview precisa do objeto inteiro (itens, personalizações, notas). */
    const [orcamentosCompletos, setOrcamentosCompletos] = useState<any[]>([]);
    const [entregas, setEntregas] = useState<EntregaDoPedido[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        if (!clientId) return;
        setCarregando(true);
        setErro('');
        try {
            const [orcamentos, pedidos, contas] = await Promise.all([
                storageService.getBudgets(),
                storageService.getOrders(),
                storageService.getObligations(),
            ]);

            const d = montarDossie(
                clientId,
                orcamentos as any,
                pedidos as any,
                contas as any,
                getTodayStr(),
            );
            setDossie(d);
            setOrcamentosCompletos((orcamentos as any[]).filter(o => o.client_id === clientId));

            // Só os logs dos pedidos DESTE cliente. Puxar o log da fábrica
            // inteira para montar a aba de um cliente seria carregar meses de
            // apontamento de produção para usar meia dúzia de linhas.
            const meusIds = new Set(d.pedidos.map(p => p.id));
            if (meusIds.size > 0) {
                const logs = await storageService.getProductionLogs();
                setEntregas(entregasApuradas(
                    d.pedidos as any,
                    (logs as any[]).filter(l => meusIds.has(l.order_id)),
                ));
            } else {
                setEntregas([]);
            }
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar os dados do cliente');
        } finally {
            setCarregando(false);
        }
    }, [clientId]);

    useEffect(() => { carregar(); }, [carregar]);

    return useMemo(
        () => ({ dossie, entregas, orcamentosCompletos, carregando, erro, recarregar: carregar }),
        [dossie, entregas, orcamentosCompletos, carregando, erro, carregar]);
}
