/**
 * O fichário de Cadastros: um cartão por cadastro, com a contagem e o que pede atenção.
 * Pura — os números chegam prontos (ver useFichario). Spec do S2, seção 2.
 */
import type { View } from './navegacao.ts';

export interface DadosDoFichario {
    clientes: number; sumidos: number;
    produtos: number; semFicha: number;
    fornecedores: number;
    bancos: number; naoBatem: number;
    setores: number;
    /** Menor capacidade semanal entre os setores; 0 = nenhum setor com capacidade. */
    gargaloSemanal: number;
    categorias: number; naoRevisadas: number;
    mensagens: number;
    /** Meta sugerida quando difere da gravada (Task 8). null = nada a dizer. */
    metaSugerida: number | null;
}

export type TomDoCartao = 'ambar' | 'rosa' | 'neutro';

export interface CartaoDoFichario {
    view: View;
    titulo: string;
    contagem: string | null;
    atencao: string | null;
    tom: TomDoCartao;
}

const s = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** `d` nulo = a carga falhou: cartões sem número, para não dizer "0 pendências" sem saber. */
export function montarFichario(d: DadosDoFichario | null, dinheiro: (v: number) => string): CartaoDoFichario[] {
    const cartao = (view: View, titulo: string, contagem: string | null, atencao: string | null, tom: TomDoCartao = 'ambar'): CartaoDoFichario => ({
        view, titulo,
        contagem: d ? contagem : null,
        atencao: d ? atencao : null,
        tom: d && atencao ? tom : 'neutro',
    });
    if (!d) {
        return [
            cartao('clientes', 'Clientes', null, null), cartao('produtos', 'Produtos', null, null),
            cartao('fornecedores', 'Fornecedores', null, null), cartao('bancos', 'Bancos', null, null),
            cartao('setores', 'Setores e capacidade', null, null), cartao('empresa', 'Minha empresa', null, null),
            cartao('categorias', 'Categorias', null, null), cartao('mensagens', 'Mensagens', null, null),
        ];
    }
    return [
        cartao('clientes', 'Clientes', s(d.clientes, 'cliente', 'clientes'),
            d.sumidos > 0 ? s(d.sumidos, 'sumido', 'sumidos') : null),
        cartao('produtos', 'Produtos', s(d.produtos, 'produto', 'produtos'),
            d.semFicha > 0 ? `${d.semFicha} sem ficha técnica` : null),
        cartao('fornecedores', 'Fornecedores', s(d.fornecedores, 'fornecedor', 'fornecedores'), null),
        cartao('bancos', 'Bancos', s(d.bancos, 'banco ativo', 'bancos ativos'),
            d.naoBatem > 0 ? `${d.naoBatem} não ${d.naoBatem === 1 ? 'bate' : 'batem'}` : null, 'rosa'),
        cartao('setores', 'Setores e capacidade', s(d.setores, 'setor', 'setores'),
            d.gargaloSemanal > 0 ? `gargalo ${d.gargaloSemanal} pç/semana` : null, 'neutro'),
        cartao('empresa', 'Minha empresa', null,
            d.metaSugerida !== null ? `meta sugerida ${dinheiro(d.metaSugerida)}` : null),
        cartao('categorias', 'Categorias', s(d.categorias, 'categoria', 'categorias'),
            d.naoRevisadas > 0 ? `${d.naoRevisadas} não ${d.naoRevisadas === 1 ? 'revisada' : 'revisadas'}` : null),
        cartao('mensagens', 'Mensagens', s(d.mensagens, 'modelo', 'modelos'), null),
    ];
}
