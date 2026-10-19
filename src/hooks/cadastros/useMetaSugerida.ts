import { useEffect, useMemo, useState } from 'react';
import { storageService } from '@/services/storage';
import { calcularMetaSugerida, type DadosDaMeta } from '@/utils/metaDeFaturamento';

/** Carrega uma vez; a sugestão se recalcula quando a margem alvo muda na tela. */
export function useMetaSugerida(margemAlvoPct: number) {
    const [dados, setDados] = useState<DadosDaMeta | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        Promise.all([
            storageService.getObligations(), storageService.getGlobalCategories('finance', { estrito: true }),
            storageService.getOrders(), storageService.getBudgets(),
            storageService.getClients(), storageService.getProducts(),
        ]).then(([obrigacoes, categorias, pedidos, orcamentos, clientes, produtos]) => {
            if (vivo) setDados({ obrigacoes, categorias, pedidos, orcamentos, clientes, produtos });
        }).catch(e => {
            if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui calcular a sugestão.');
        });
        return () => { vivo = false; };
    }, []);

    const meta = useMemo(() => (dados ? calcularMetaSugerida(dados, margemAlvoPct) : null), [dados, margemAlvoPct]);
    return { meta, carregando: !dados && !erro, erro };
}
