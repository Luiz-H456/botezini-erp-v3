import type { Option } from '@/components/common/SearchableSelect';

/** Tira acento e caixa para comparar. */
export const semAcento = (s: string) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtra as opções de um dropdown pela busca e nunca devolve cabeçalho de grupo vazio.
 *
 * Cada termo precisa aparecer, em qualquer ordem, no rótulo ou no grupo. Cabeçalho só
 * fica se algum item dele sobreviveu; o cabeçalho de setor ("__setor__...") abraça os
 * grupos que vêm depois dele, então fica se sobrar item até o próximo setor.
 */
export function filtrarOpcoes(options: Option[], busca: string): Option[] {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    const casa = (opt: Option) => {
        if (termos.length === 0) return true;
        const alvo = semAcento(`${opt.label || ''} ${opt.group || ''}`);
        return termos.every(t => alvo.includes(t));
    };
    const passou = options.map(opt => !opt.isHeader && casa(opt));
    const ehSetor = (o: Option) => o.isHeader && String(o.value).startsWith('__setor__');

    return options.filter((opt, i) => {
        if (!opt.isHeader) return passou[i];
        const setor = ehSetor(opt);
        for (let k = i + 1; k < options.length; k++) {
            if (options[k].isHeader && (!setor || ehSetor(options[k]))) break;
            if (passou[k]) return true;
        }
        return false;
    });
}
