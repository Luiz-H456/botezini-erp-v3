import { useState, useEffect, useCallback, useMemo } from 'react';
import { storageService } from '../services/storage';
import { useCargaProgressiva } from './useCargaProgressiva';
import {
    montarItensVendidos, resumirPorProduto, LinhaVendida,
} from '../utils/itensVendidos';
import { margemPorProduto } from '../utils/lucratividade';

export type OrdenacaoItens = 'data' | 'valor' | 'quantidade' | 'empresa' | 'produto';

export function useItensVendidos() {
    const [linhas, setLinhas] = useState<LinhaVendida[]>([]);
    // Custo médio atual por NOME de produto — é a chave que a linha vendida
    // carrega, já que o pedido guarda o nome e não sempre o id.
    const [custos, setCustos] = useState<Map<string, number>>(new Map());
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');

    // Filtros
    const [busca, setBusca] = useState('');
    const [empresa, setEmpresa] = useState('');
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [ordem, setOrdem] = useState<OrdenacaoItens>('data');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, budgets, clients, produtos] = await Promise.all([
                storageService.getOrders(),
                storageService.getBudgets(),
                storageService.getClients(),
                storageService.getProducts(),
            ]);
            setCustos(new Map(produtos
                .filter(p => Number(p.average_unit_cost) > 0)
                .map(p => [p.name, Number(p.average_unit_cost)])));
            const nomePorId = new Map(clients.map(c => [c.id, c.company_name]));
            setLinhas(montarItensVendidos(
                orders as any, budgets as any,
                (id?: string) => (id && nomePorId.get(id)) || '—',
            ));
        } catch (e: any) {
            setError(e?.message || 'Falha ao carregar os itens vendidos');
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const empresas = useMemo(
        () => [...new Set(linhas.map(l => l.empresa).filter(e => e && e !== '—'))].sort(),
        [linhas],
    );

    const filtradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        const resultado = linhas.filter(l => {
            if (empresa && l.empresa !== empresa) return false;
            // Datas em ISO (aaaa-mm-dd) comparam direto como texto.
            if (de && l.data && l.data < de) return false;
            if (ate && l.data && l.data > ate) return false;
            if (!q) return true;
            return [l.produto, l.cor, l.tecido, l.empresa, l.pedido, l.tamanho, ...l.caracteristicas]
                .some(campo => (campo || '').toLowerCase().includes(q));
        });

        const ordenado = [...resultado];
        switch (ordem) {
            case 'valor': ordenado.sort((a, b) => b.valorTotal - a.valorTotal); break;
            case 'quantidade': ordenado.sort((a, b) => b.quantidade - a.quantidade); break;
            case 'empresa': ordenado.sort((a, b) => a.empresa.localeCompare(b.empresa)); break;
            case 'produto': ordenado.sort((a, b) => a.produto.localeCompare(b.produto)); break;
            // Mais recente primeiro: é o que se quer ver ao abrir a tela.
            default: ordenado.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
        }
        return ordenado;
    }, [linhas, busca, empresa, de, ate, ordem]);

    const totais = useMemo(() => ({
        pecas: filtradas.reduce((s, l) => s + l.quantidade, 0),
        valor: filtradas.reduce((s, l) => s + l.valorTotal, 0),
        linhas: filtradas.length,
        semPreco: filtradas.filter(l => !l.precoConhecido).length,
    }), [filtradas]);

    const porProduto = useMemo(() => resumirPorProduto(filtradas), [filtradas]);
    const margens = useMemo(() => margemPorProduto(filtradas, custos), [filtradas, custos]);

    const limparFiltros = useCallback(() => {
        setBusca(''); setEmpresa(''); setDe(''); setAte('');
    }, []);

    return {
        filtradas, porProduto, margens, totais, empresas,
        busca, setBusca, empresa, setEmpresa, de, setDe, ate, setAte, ordem, setOrdem,
        limparFiltros,
        loading: carga.carregando, recarregando: carga.recarregando, error, reload: load,
    };
}
