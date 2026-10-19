import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageService } from '@/services/storage';
import { comprasRepository } from '@/repositories/comprasRepository';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import { numerosDaVisaoGeral } from '@/utils/financas/numeros';
import { clientesQueDevem } from '@/utils/financas/clientes';
import { situacaoDosBancos } from '@/utils/financas/bancos';
import { movimentosPrevistos, primeiroDiaNegativo } from '@/utils/financas/projecao';
import { projetarSaldo } from '@/utils/saudeDoCaixa';
import { somarDias } from '@/utils/financas/base';
import { conferirSaldos, movimentosDosPagamentos, dadosCompletosDaConferencia } from '@/utils/conferenciaDeSaldo';
import { clientesDormentes } from '@/utils/acompanhamentoComercial';
import { completudeDosDados, produtosSemFichaQueVenderam } from '@/utils/completudeDosDados';
import { montarFila, contadoresDoMenu, pedidosEmProducao, semanaDe } from '@/utils/inicio/fila';
import { computePurchaseList } from '@/utils/purchaseList';
import { entraNasCompras } from '@/utils/fabrica/compras';
import { tecidosSemPrecoUsados } from '@/utils/fabrica/tecidosSemPreco';
import type { PLInsumo, PLOrder } from '@/utils/purchaseList';
import type { BlocoDaFila } from '@/utils/inicio/fila';

const ZERADOS = contadoresDoMenu([]);

const carregarBase = () => Promise.all([
    storageService.getBudgets(),
    storageService.getOrders(),
    storageService.getInsumos(),
    storageService.getSectors(false),
    storageService.getObligations(),
    storageService.getEnvelopeOverview(),
    storageService.getBankAccounts(true),
    storageService.getContasPorObrigacao(),
    storageService.getAllPaymentsComTeto(),
    storageService.getClients(),
    storageService.getProducts(),
    storageService.getFichaPorProduto(),
]);
type Base = Awaited<ReturnType<typeof carregarBase>>;
type Dados = { base: Base; faltaComprarNaSemana: number | null; tecidosSemPreco: number | null };

/**
 * Quantos insumos faltam comprar para os pedidos ativos com prazo nesta semana — a mesma conta da
 * Lista de compras. Qualquer falha na leitura (compras já lançadas ou ficha) devolve null: o Início
 * nunca afirma uma falta que não conseguiu calcular.
 */
async function faltaComprarNaSemana(pedidos: Base[1], insumos: Base[2], hoje: string): Promise<number | null> {
    try {
        const { inicio, fim } = semanaDe(hoje);
        const ativos = pedidos.filter(o => entraNasCompras(o)
            && !!o.deadline && o.deadline.slice(0, 10) >= inicio && o.deadline.slice(0, 10) <= fim);
        if (ativos.length === 0) return 0;
        const [fichas, vinculados] = await Promise.all([
            comprasRepository.fichasDoPedidoEstrito(ativos.flatMap(o => (o.items || []).map(i => i.product_id))),
            comprasRepository.vinculadoPorPedido(ativos.map(o => o.id)),
        ]);
        const bom = new Map([...fichas].map(([pid, l]) => [pid, l.map(b => ({ insumo_id: b.insumo_id, quantity: b.quantity }))]));
        const porId = new Map<string, PLInsumo>(insumos.map(i => [i.id, {
            id: i.id, name: i.name, unit: i.unit, current_stock: Number(i.current_stock) || 0,
            average_unit_cost: Number(i.average_unit_cost) || 0, category: i.category,
        }]));
        const plPedidos: PLOrder[] = ativos.map(o => ({
            id: o.id, order_number: o.order_number, deadline: o.deadline,
            items: (o.items || []).map(it => ({
                product_id: it.product_id, quantity: Number(it.quantity) || 0, fabric_insumo_id: it.fabric_insumo_id,
            })),
        }));
        return computePurchaseList(plPedidos, bom, porId, vinculados).lines.filter(l => l.is_shortage).length;
    } catch (e) {
        console.error('faltaComprarNaSemana:', e);
        return null;
    }
}

/**
 * Quantos tecidos usados em pedidos (ativos ou entregues há até 90 dias) não têm preço nenhum — sem
 * isso o lucro por pedido sai como teto. Falha na leitura (ficha ou compras) devolve null: sem linha.
 */
async function tecidosSemPreco(pedidos: Base[1], insumos: Base[2], hoje: string): Promise<number | null> {
    try {
        const [fichas, ultimoPreco] = await Promise.all([
            comprasRepository.fichasDoPedidoEstrito(pedidos.flatMap(o => (o.items || []).map(i => i.product_id))),
            comprasRepository.ultimoPrecoPorInsumo(),
        ]);
        const porId = new Map<string, PLInsumo>(insumos.map(i => [i.id, {
            id: i.id, name: i.name, unit: i.unit, current_stock: Number(i.current_stock) || 0,
            average_unit_cost: Number(i.average_unit_cost) || 0, category: i.category,
        }]));
        const plPedidos = pedidos.map(o => ({
            id: o.id, order_number: o.order_number, deadline: o.deadline, status: o.status, delivered_at: o.delivered_at,
            items: (o.items || []).map(it => ({ product_id: it.product_id, quantity: Number(it.quantity) || 0, fabric_insumo_id: it.fabric_insumo_id })),
        }));
        return tecidosSemPrecoUsados({ pedidos: plPedidos, fichas, insumos: porId, ultimoPreco, hoje }).length;
    } catch (e) {
        console.error('tecidosSemPreco:', e);
        return null;
    }
}

const carregarTudo = async (): Promise<Dados> => {
    const base = await carregarBase();
    const hoje = getTodayStr();
    const [falta, semPreco] = await Promise.all([
        faltaComprarNaSemana(base[1], base[2], hoje),
        tecidosSemPreco(base[1], base[2], hoje),
    ]);
    return { base, faltaComprarNaSemana: falta, tecidosSemPreco: semPreco };
};

/**
 * A fila do Início e os contadores do menu. Carrega uma vez ao ativar; `recarregar` refaz a carga
 * (quem decide quando é o App). Com `ativo` falso (deslogado ou chão de fábrica) não lê nada.
 * Se qualquer leitura falhar: `erro` preenchido e nunca uma fila parcial — na primeira carga a fila
 * fica vazia; numa recarga fica a última fila boa (zerar os contadores leria como "nada pendente").
 */
export function useFilaDoInicio(ativo: boolean) {
    const { mostrar } = useMostrarValor();
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    // Contador de geração: toda recarga (ou desativação) invalida as respostas das anteriores,
    // então uma carga lenta nunca sobrescreve uma mais nova.
    const geracao = useRef(0);
    const ativoRef = useRef(ativo);
    ativoRef.current = ativo;
    // Coalescência: o login dispara duas cargas no mesmo tick (efeito do `ativo` + efeito do App) e
    // uma recarga pode chegar com outra no ar. Com carga rodando, o pedido só marca `pendente` e a
    // carga em curso refaz uma vez ao terminar: nenhum pedido se perde, e nunca há duas em paralelo.
    const rodando = useRef(0);      // geração da carga em curso (0 = nenhuma)
    const pendente = useRef(false);
    // Pedido no mesmo tick em que a carga começou (os dois efeitos do login) já é coberto por ela: não refaz.
    const recemIniciada = useRef(false);

    /** Devolve false quando nada foi iniciado agora (inativo ou coalescido numa carga em curso). */
    const recarregar = useCallback(async (): Promise<boolean> => {
        if (!ativoRef.current) return false;
        if (rodando.current) { if (!recemIniciada.current) pendente.current = true; return false; }
        const minha = ++geracao.current;
        rodando.current = minha;
        recemIniciada.current = true;
        queueMicrotask(() => { recemIniciada.current = false; });
        setCarregando(true);
        let refazer = false;
        try {
            const d = await carregarTudo();
            if (minha !== geracao.current) return true;
            setDados(d);
            setErro('');
        } catch (e) {
            if (minha !== geracao.current) return true;
            setErro(e instanceof Error ? e.message : 'Não consegui carregar o Início.');
        } finally {
            if (rodando.current === minha) {
                rodando.current = 0;
                refazer = pendente.current && minha === geracao.current;
                pendente.current = false;
            }
            if (refazer) void recarregar();
            else if (minha === geracao.current) setCarregando(false);
        }
        return true;
    }, []);

    useEffect(() => {
        if (ativo) void recarregar();
        else { geracao.current++; rodando.current = 0; pendente.current = false; setDados(null); setErro(''); setCarregando(false); }
    }, [ativo, recarregar]);

    const calculo = useMemo(() => {
        if (!dados) return null;
        const [orcamentos, pedidos, insumos, setores, contas, visao, bancos, contasPorObrigacao, pags, clientes, produtos, ficha] = dados.base;
        const hoje = getTodayStr();
        // Conferência do saldo bancário pelos helpers de conferenciaDeSaldo.ts (os mesmos de Bancos e
        // do fichário): com qualquer teto atingido (pagamentos ou obrigações) o mapa de tipos fica
        // incompleto e ela se cala.
        const conferencia = conferirSaldos(
            bancos,
            movimentosDosPagamentos(pags.pagamentos, contas),
            { dadosCompletos: dadosCompletosDaConferencia(pags.truncado, contas.length) },
        );
        const numeros = numerosDaVisaoGeral({ contas, nosBancos: visao.total_real, nasCaixinhas: visao.allocated, hoje });
        // Mesma conta da aba Saúde do caixa (useSaudeDoCaixa): saldo = soma dos bancos ativos,
        // movimentos e projeção de financas/projecao.ts. Pagamentos truncados (teto ou erro de
        // leitura) = histórico incompleto: sem projeção, sem aviso.
        const saldoDosBancos = bancos.reduce((soma, b) => soma + (Number(b.current_balance) || 0), 0);
        const caixaNegativoEm = pags.truncado ? null : primeiroDiaNegativo(projetarSaldo(
            saldoDosBancos, movimentosPrevistos(contas, pags.pagamentos, hoje), hoje, somarDias(hoje, 30)));
        const blocos: BlocoDaFila[] = montarFila({
            hoje, orcamentos, pedidos,
            ultimoSetor: setores[setores.length - 1]?.name ?? null,
            faltaComprarNaSemana: dados.faltaComprarNaSemana,
            tecidosSemPreco: dados.tecidosSemPreco,
            clientesComVencido: clientesQueDevem(contas, hoje).filter(l => l.vencido > 0).length,
            pagarVencido: { quantidade: numeros.recortes.pagar_vencido.quantidade, total: numeros.recortes.pagar_vencido.total },
            bancosAConferir: situacaoDosBancos({ bancos, contas, contasPorObrigacao })
                .map(b => ({ id: b.id, nome: b.nome, quantidade: b.aConferir.length })),
            saldosDivergentes: conferencia.divergencias.length,
            saldosSemLinhaDeBase: conferencia.semLinhaDeBase.length,
            clientesSumidos: clientesDormentes(clientes,
                pedidos.map(o => ({ client_id: o.client_id, data: o.created_at, valor: Number(o.total_amount) || 0 })),
                hoje).length,
            produtosSemFicha: produtosSemFichaQueVenderam(completudeDosDados({
                pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha,
            } as any)),
            caixaNegativoEm,
            dinheiro: mostrar,
        });
        return {
            blocos,
            resumo: { livre: numeros.livre, receberVencido: numeros.recortes.receber_vencido.total, emProducao: pedidosEmProducao(pedidos) },
            contadores: contadoresDoMenu(blocos),
        };
    }, [dados, mostrar]);

    return {
        blocos: calculo?.blocos ?? ([] as BlocoDaFila[]),
        resumo: calculo?.resumo ?? null,
        contadores: calculo?.contadores ?? ZERADOS,
        // Ativo, sem dados nem erro = ainda não leu: conta como carregando, nunca um "tudo certo" falso.
        carregando: carregando || (ativo && dados === null && !erro),
        erro, recarregar,
    };
}
