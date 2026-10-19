// Guarda da escala de camadas — o teste que existe por causa de um bug real.
//
// A prévia do orçamento nasceu em z-[70]. Quinze telas depois, havia elementos
// em 80, 85, 100, 110, 120, 130, 140, 150, 200, 210, 9998, 9999 e 99999 — cada
// uma espiando a vizinha e somando dez. A prévia passou a abrir EMBAIXO deles,
// sem botão de fechar alcançável, e o mesmo aconteceu com a prévia do pedido.
//
// Nenhum teste de unidade pega isso: cada componente está certo sozinho. O que
// estava errado era não existir uma ordem. Estes testes vigiam a ordem.

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Caminho a partir do cwd, e nao de import.meta.url: no Windows a URL vem como
// /C:/Users/... e cada tentativa de desmontar isso a mao erra num caso. Os
// testes rodam da raiz do repo, entao 'src' resolve direto.
/** Quebra de linha sem barra invertida no fonte. */
const QUEBRA = String.fromCharCode(10);

const RAIZ = join(process.cwd(), 'src');
const CSS = readFileSync(join(RAIZ, 'index.css'), 'utf8');

/** A ordem em que uma camada cobre a outra. De baixo para cima. */
const ORDEM = [
    'cabecalho', 'veu', 'painel', 'modal',
    'sobreposto', 'balao', 'confirmacao', 'aviso',
] as const;

const valorDaCamada = (nome: string): number | null => {
    const marca = `--z-index-${nome}:`;
    const pos = CSS.indexOf(marca);
    if (pos < 0) return null;
    const valor = parseInt(CSS.slice(pos + marca.length, pos + marca.length + 12), 10);
    return Number.isFinite(valor) ? valor : null;
};

test('toda camada da escala existe no @theme', () => {
    for (const nome of ORDEM) {
        assert.notStrictEqual(valorDaCamada(nome), null, `--z-index-${nome} não está definida`);
    }
});

test('a escala está em ordem crescente — é o que faz uma cobrir a outra', () => {
    const valores = ORDEM.map(n => valorDaCamada(n)!);
    for (let i = 1; i < valores.length; i++) {
        assert.ok(
            valores[i] > valores[i - 1],
            `${ORDEM[i]} (${valores[i]}) precisa ser maior que ${ORDEM[i - 1]} (${valores[i - 1]})`,
        );
    }
});

test('confirmação vence modal e sobreposto — ela pergunta sobre eles', () => {
    assert.ok(valorDaCamada('confirmacao')! > valorDaCamada('modal')!);
    assert.ok(valorDaCamada('confirmacao')! > valorDaCamada('sobreposto')!);
});

test('aviso vence tudo — ele some sozinho e não bloqueia nada', () => {
    const maiorDosOutros = Math.max(
        ...ORDEM.filter(n => n !== 'aviso').map(n => valorDaCamada(n)!));
    assert.ok(valorDaCamada('aviso')! > maiorDosOutros);
});

test('há folga entre as camadas, para ninguém precisar inventar valor no meio', () => {
    const valores = ORDEM.map(n => valorDaCamada(n)!);
    for (let i = 1; i < valores.length; i++) {
        assert.ok(
            valores[i] - valores[i - 1] >= 10,
            `folga curta entre ${ORDEM[i - 1]} e ${ORDEM[i]}: quem precisar de um valor `
            + 'intermediário vai inventar um z-[N] solto, que é como o bug nasceu',
        );
    }
});

// ── A regra que o bug quebrou ───────────────────────────────────────────────

const arquivosTsx = (dir: string): string[] => {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) { saida.push(...arquivosTsx(caminho)); continue; }
        if (nome.endsWith('.tsx')) saida.push(caminho);
    }
    return saida;
};

test('nenhum componente usa z-index avulso — toda sobreposição sai da escala', () => {
    const infratores: string[] = [];

    for (const caminho of arquivosTsx(RAIZ)) {
        const conteudo = readFileSync(caminho, 'utf8');
        const linhas = conteudo.split(QUEBRA);

        /**
         * Uma exceção vale quando está ESCRITA, e só até a linha seguinte.
         *
         * O quadro de notas é o caso real: cada nota guarda o próprio z_index
         * no banco, mexido por "trazer para a frente", então o teto ali é o que
         * o usuário empilhou e não uma camada fixa do app. Isso é legítimo — o
         * que não pode é ser silencioso.
         */
        const temExcecao = (indice: number) =>
            (linhas[indice] || '').includes('camada-local')
            || (linhas[indice - 1] || '').includes('camada-local')
            || (linhas[indice - 2] || '').includes('camada-local');

        const linhaDe = (pos: number) => conteudo.slice(0, pos).split(QUEBRA).length - 1;

        // z-[123] em classe do Tailwind.
        for (const m of conteudo.matchAll(/z-\[(\d+)\]/g)) {
            if (temExcecao(linhaDe(m.index!))) continue;
            infratores.push(`${caminho.replace(RAIZ, 'src')} → z-[${m[1]}]`);
        }
        // zIndex: 123 embutido em style.
        for (const m of conteudo.matchAll(/zIndex:\s*(\d+)/g)) {
            if (temExcecao(linhaDe(m.index!))) continue;
            infratores.push(`${caminho.replace(RAIZ, 'src')} → zIndex: ${m[1]}`);
        }
    }

    assert.deepStrictEqual(
        infratores, [],
        'Use uma camada nomeada (z-modal, z-sobreposto, z-confirmacao, z-aviso...).\n'
        + 'Se nenhuma servir, acrescente uma camada em index.css com nome e motivo —\n'
        + 'nunca um número solto, que é exatamente como a prévia do orçamento foi parar\n'
        + 'embaixo de quinze elementos.\n\nEncontrados:\n  ' + infratores.join('\n  '),
    );
});
