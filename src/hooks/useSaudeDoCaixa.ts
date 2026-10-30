import { useState, useEffect, useCallback, useMemo } from 'react';
import { storageService } from '../services/storage';
import { getTodayStr } from '../utils/date';
import { useCargaProgressiva } from './useCargaProgressiva';
import { GlobalCategory } from '../types';
import {
    projetarSaldo, resumirFechamento, calcularPontoDeEquilibrio, baseDoEquilibrio, lerSaude,
    MovimentoPrevisto, Natureza,
} from '../utils/saudeDoCaixa';
import { movimentosPrevistos } from '../utils/financas/projecao';
import { montarItensVendidos, LinhaVendida } from '../utils/itensVendidos';

import { mensagemDeErro } from '@/utils/errorHandling';
const hoje = getTodayStr;
const fimDoMes = (iso: string) => {
    const [a, m] = iso.split('-').map(Number);
    return `${a}-${String(m).padStart(2, '0')}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export function useSaudeDoCaixa(mesInicial?: string) {
    const [obrigacoes, setObrigacoes] = useState<any[]>([]);
    const [pagamentos, setPagamentos] = useState<any[]>([]);
    const [categorias, setCategorias] = useState<GlobalCategory[]>([]);
    const [vendas, setVendas] = useState<LinhaVendida[]>([]);
    /** Custo unitário atual por nome de produto — casa com a linha vendida. */
    const [custos, setCustos] = useState<Map<string, number>>(new Map());
    const [saldoAtual, setSaldoAtual] = useState(0);
    const [reservado, setReservado] = useState(0);
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [mes, setMes] = useState(() => mesInicial ?? hoje().slice(0, 7));
    useEffect(() => { if (mesInicial) setMes(mesInicial); }, [mesInicial]);

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [obgs, contas, cats, envelopes, pags, orders, budgets, clients, produtos] = await Promise.all([
                storageService.getObligations(),
                storageService.getBankAccounts(true),
                storageService.getGlobalCategories('finance'),
                storageService.getEnvelopeOverview().catch(() => null),
                // Histórico de pagamentos: alimenta a previsão de quando o
                // dinheiro realmente entra. Sem ele a projeção usaria o
                // vencimento, que é promessa e não previsão.
                storageService.getAllPayments().catch(() => []),
                // A receita do ponto de equilíbrio sai das VENDAS, não das
                // contas a receber — ver o comentário em `equilibrio`.
                storageService.getOrders(),
                storageService.getBudgets(),
                storageService.getClients(),
                storageService.getProducts(),
            ]);
            setObrigacoes(obgs as any[]);
            setCategorias(cats);
            setSaldoAtual((contas || []).reduce((s: number, b: any) => s + (Number(b.current_balance) || 0), 0));
            setReservado(Number((envelopes as any)?.allocated) || 0);
            setPagamentos(pags as any[]);

            const nomeCliente = new Map(clients.map((c: any) => [c.id, c.company_name]));
            setVendas(montarItensVendidos(orders as any, budgets as any,
                (id?: string) => (id && nomeCliente.get(id)) || '—'));
            setCustos(new Map(produtos
                .filter((p: any) => Number(p.average_unit_cost) > 0)
                .map((p: any) => [p.name, Number(p.average_unit_cost)])));
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao carregar a saúde do caixa'));
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const naturezaPorCategoriaId = useMemo(
        () => new Map(categorias.map(c => [c.id, c.natureza || undefined])),
        [categorias],
    );
    const nomePorCategoriaId = useMemo(
        () => new Map(categorias.map(c => [c.id, c.name])),
        [categorias],
    );

    const emAberto = useMemo(
        () => obrigacoes.filter(o =>
            o.derived_status !== 'paid' && o.derived_status !== 'cancelled' && !o.cancelled_at),
        [obrigacoes],
    );

    const periodo = useMemo(() => {
        const fim = fimDoMes(`${mes}-01`);
        const agora = hoje();
        // Começa hoje, não no dia 1: o saldo das contas é o de AGORA, e voltar
        // ao início do mês contaria de novo o que já entrou e saiu.
        const inicio = agora > inicioDoMes(`${mes}-01`) && agora <= fim ? agora : inicioDoMes(`${mes}-01`);
        return { inicio, fim };
    }, [mes]);

    const movimentos = useMemo(
        () => movimentosPrevistos(obrigacoes, pagamentos, periodo.inicio),
        [obrigacoes, pagamentos, periodo],
    );

    const pontos = useMemo(
        () => projetarSaldo(saldoAtual, movimentos, periodo.inicio, periodo.fim),
        [saldoAtual, movimentos, periodo],
    );
    const fechamento = useMemo(() => resumirFechamento(pontos, saldoAtual), [pontos, saldoAtual]);

    /** Mesma projeção usando o vencimento — a diferença é o tamanho do otimismo. */
    const fechamentoPeloVencimento = useMemo(() => {
        const porVenc: MovimentoPrevisto[] = emAberto.map(o => {
            const d = (o.due_date || periodo.inicio).slice(0, 10);
            return {
                data: d < periodo.inicio ? periodo.inicio : d,
                valor: Number(o.remaining_amount ?? o.original_amount) || 0,
                entra: o.type === 'receivable',
            };
        }).filter(m => m.valor > 0);
        return resumirFechamento(projetarSaldo(saldoAtual, porVenc, periodo.inicio, periodo.fim), saldoAtual);
    }, [emAberto, saldoAtual, periodo]);

    /**
     * Ponto de equilíbrio do mês, em REGIME DE COMPETÊNCIA.
     *
     * A receita vem das VENDAS do mês e o custo variável das MESMAS peças
     * vendidas — não das parcelas a receber e a pagar que vencem no período.
     * Aquilo é caixa: uma venda de R$ 10.000 em 3x apareceria como R$ 3.333 de
     * receita, com o tecido dela vencendo em outro mês, e a margem de
     * contribuição compararia uma receita com um custo que não a gerou.
     */
    const equilibrio = useMemo(() => calcularPontoDeEquilibrio(baseDoEquilibrio({
        vendas, custos, obrigacoes, naturezaPorCategoriaId, nomePorCategoriaId,
        de: inicioDoMes(`${mes}-01`), ate: fimDoMes(`${mes}-01`),
    })), [vendas, custos, obrigacoes, mes, naturezaPorCategoriaId, nomePorCategoriaId]);

    const leitura = useMemo(() => lerSaude(fechamento, equilibrio), [fechamento, equilibrio]);

    /**
     * Categorias que nunca foram abertas para dizer se são fixas, com o peso de
     * cada uma no mês.
     *
     * Elas já entram na conta como variáveis — não há mais despesa em limbo. O
     * que esta lista mostra é o tamanho do que ainda não foi olhado: se uma
     * categoria pesada aqui for na verdade fixa, o ponto de equilíbrio está
     * otimista, e é aqui que se corrige com um clique.
     */
    const paraRevisar = useMemo(() => {
        const de = inicioDoMes(`${mes}-01`);
        const ate = fimDoMes(`${mes}-01`);
        const peso = new Map<string, number>();
        for (const o of obrigacoes) {
            if (o.type !== 'payable' || o.cancelled_at || o.derived_status === 'cancelled') continue;
            if (o.due_date < de || o.due_date > ate) continue;
            if (o.natureza_override) continue;
            const id = o.global_category_id;
            if (!id || naturezaPorCategoriaId.get(id)) continue;
            peso.set(id, (peso.get(id) || 0) + (Number(o.original_amount) || 0));
        }
        return categorias
            .filter(c => !c.natureza && peso.has(c.id))
            .map(c => ({ id: c.id, nome: c.name, valor: peso.get(c.id) || 0 }))
            // Maior primeiro: é a que mais muda o resultado se estiver errada.
            .sort((a, b) => b.valor - a.valor);
    }, [obrigacoes, categorias, naturezaPorCategoriaId, mes]);

    const classificar = useCallback(async (categoriaId: string, natureza: Natureza | null) => {
        setSalvando(true);
        try {
            const c = categorias.find(x => x.id === categoriaId);
            if (!c) return;
            await storageService.saveGlobalCategory({ ...c, natureza });
            await load();
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao classificar a categoria'));
        } finally {
            setSalvando(false);
        }
    }, [categorias, load]);

    return {
        mes, setMes, periodo,
        pontos, fechamento, fechamentoPeloVencimento,
        equilibrio, leitura,
        saldoAtual, reservado, livre: saldoAtual - reservado,
        categoriasFinanceiras: categorias, paraRevisar, classificar, salvando,
        loading: carga.carregando, recarregando: carga.recarregando, error, reload: load,
    };
}
