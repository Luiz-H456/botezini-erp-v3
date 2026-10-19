import React from 'react';
import type { Option } from '@/components/common/SearchableSelect';
import { LinhaDeChips } from '@/components/common/LinhaDeChips';

/** Acima disto os atalhos deixam de ser atalho e viram uma segunda lista. */
export const MAXIMO_DE_ATALHOS = 8;

interface Props {
    /** As mesmas opções do menu — inclusive os cabeçalhos, que são filtrados. */
    opcoes: Option[];
    valor?: string;
    onEscolher: (id: string) => void;
    limite?: number;
}

/**
 * Escolha em um clique, para quando a lista é curta.
 *
 * Abrir um menu para escolher entre quatro opções é trabalho que não precisa
 * existir. Passando do limite eles somem: aí deixariam de ser atalho e virariam
 * uma segunda lista competindo com a primeira — e sem o campo de busca que a
 * primeira tem.
 *
 * Sai da MESMA lista de opções do menu, e não de uma consulta paralela: duas
 * fontes divergiriam, e o atalho passaria a oferecer o que o menu não tem.
 */
export const AtalhosDeCategoria: React.FC<Props> = ({
    opcoes, valor, onEscolher, limite = MAXIMO_DE_ATALHOS,
}) => {
    const selecionaveis = opcoes.filter(o => !o.isHeader);
    if (selecionaveis.length === 0 || selecionaveis.length > limite) return null;

    return (
        <LinhaDeChips
            itens={selecionaveis.map(o => ({
                chave: o.value,
                rotulo: o.label,
                ativo: o.value === valor,
                titulo: o.group ? `${o.group} › ${o.label}` : o.label,
            }))}
            onEscolher={onEscolher}
        />
    );
};
