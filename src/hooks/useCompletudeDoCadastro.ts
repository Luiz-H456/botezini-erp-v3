import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageService } from '../services/storage';
import { useCargaProgressiva } from './useCargaProgressiva';
import { completudeDosDados } from '../utils/completudeDosDados';
import type { PedidoVendido, OrcamentoRef } from '../utils/itensVendidos';
import type { Completude } from '../utils/completudeDoCadastro';
import type { Insumo, Product } from '../types';

/**
 * Junta o que a completude precisa: o que foi vendido, o que está cadastrado e
 * a ficha técnica de cada produto.
 *
 * A conta é de `completudeDosDados`, a mesma que o fichário e o Início usam: ela
 * parte de `montarItensVendidos`, a função da tela de Itens Vendidos, inclusive
 * a parte frágil de reencontrar o preço no orçamento de origem. Duplicar essa
 * lógica daria dois números diferentes para a mesma pergunta.
 */
export function useCompletudeDoCadastro() {
    const carga = useCargaProgressiva();
    const [erro, setErro] = useState('');
    // Só vira true numa leitura que deu certo: distingue "falhou na primeira" de "falhou na recarga".
    const [temDados, setTemDados] = useState(false);
    // Sequência: a resposta de uma leitura mais velha nunca sobrescreve a de uma mais nova.
    const sequencia = useRef(0);

    const [pedidos, setPedidos] = useState<PedidoVendido[]>([]);
    const [orcamentos, setOrcamentos] = useState<OrcamentoRef[]>([]);
    const [produtos, setProdutos] = useState<Product[]>([]);
    const [insumos, setInsumos] = useState<Insumo[]>([]);
    const [ficha, setFicha] = useState<Map<string, string[]>>(new Map());

    const carregar = useCallback(async () => {
        const minha = ++sequencia.current;
        carga.iniciar();
        setErro('');
        try {
            const [peds, orcs, prods, insus, fichas] = await Promise.all([
                storageService.getOrders(),
                storageService.getBudgets(),
                storageService.getProducts(),
                storageService.getInsumos(),
                storageService.getFichaPorProduto(),
            ]);
            if (minha !== sequencia.current) return;
            setProdutos(prods);
            setInsumos(insus);
            setFicha(fichas);
            setPedidos(peds);
            setOrcamentos(orcs);
            setTemDados(true);
        } catch (e: any) {
            if (minha !== sequencia.current) return;
            setErro(e?.message || 'Falha ao levantar o cadastro');
        } finally {
            if (minha === sequencia.current) carga.terminar();
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const completude: Completude = useMemo(
        () => completudeDosDados({ pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha }),
        [pedidos, orcamentos, produtos, insumos, ficha]);

    return {
        completude,
        carregando: carga.carregando,
        recarregando: carga.recarregando,
        erro,
        temDados,
        recarregar: carregar,
        totalDeProdutos: produtos.length,
        totalDeInsumos: insumos.length,
    };
}
