import { Users, Shirt, Wallet } from 'lucide-react';

export type DominioDeCategoria = 'crm' | 'inventory' | 'finance';

/**
 * Cada setor classifica uma coisa diferente, e "categoria" sozinho obriga quem
 * está na tela a traduzir a palavra para o que ela significa ali. Um título que
 * nomeia o que está sendo classificado, exemplos do vocabulário da casa e a
 * frase do que aquilo alimenta resolvem isso antes da primeira dúvida.
 *
 * Mora fora dos componentes porque o modal de criação rápida e a aba de
 * gerenciamento precisam dizer exatamente a mesma coisa — duas cópias iam
 * divergir na primeira vez que alguém ajustasse só uma.
 */
export const SETOR = {
    crm: {
        titulo: 'Categoria de cliente',
        curto: 'Clientes e fornecedores',
        oQue: 'O ramo de quem compra e de quem fornece',
        paraQue: 'Segmenta a carteira: de que ramo é este cliente e o que ele costuma pedir.',
        exemplos: ['Indústria', 'Hospitalar', 'Frigorífico', 'Agronegócio', 'Corporativo', 'Revenda'],
        placeholder: 'Ex: Frigorífico',
        Icone: Users,
    },
    inventory: {
        titulo: 'Categoria de produto',
        curto: 'Produtos',
        oQue: 'A família da peça dentro do catálogo',
        paraQue: 'Agrupa o catálogo e os relatórios de itens vendidos.',
        exemplos: ['Camisa', 'Calça', 'Jaleco', 'Avental', 'Conjunto', 'Touca'],
        placeholder: 'Ex: Jaleco',
        Icone: Shirt,
    },
    finance: {
        titulo: 'Categoria financeira',
        curto: 'Financeiro',
        oQue: 'Para onde o dinheiro vai e de onde ele vem',
        paraQue: 'Monta o DRE, o ponto de equilíbrio e o lucro bruto do Resultado.',
        exemplos: ['Matéria-prima', 'Salários', 'Aluguel', 'Energia elétrica', 'Comissão', 'Frete'],
        placeholder: 'Ex: Matéria-prima',
        Icone: Wallet,
    },
} as const;

/**
 * Fixo é a exceção, e por isso é ele que se marca.
 *
 * A maior parte do que a fábrica gasta acompanha a produção. O que sai todo mês
 * independente de produzir é uma lista curta e conhecida. Perguntar só pela
 * exceção deixa a resposta certa como padrão e tira a terceira opção ("não sei")
 * de uma pergunta que sempre tem resposta.
 */
export const EXEMPLOS_FIXO = 'aluguel, folha, contador, internet';
export const EXEMPLOS_VARIAVEL = 'tecido, aviamento, frete de entrega, comissão';
