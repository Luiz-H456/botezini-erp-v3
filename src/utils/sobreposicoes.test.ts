// Guarda das sobreposições — toda camada de tela cheia precisa sair em portal.
//
// POR QUE
// `position: fixed` deixa de ser relativo à JANELA assim que qualquer ancestral
// tem `transform`, `filter`, `backdrop-filter`, `contain` ou `will-change`. O
// modal é montado lá no fundo da árvore da página, e quem escreve o modal não
// tem como saber o que os pais fazem — nem hoje, nem depois que alguém
// acrescentar um efeito num wrapper três níveis acima.
//
// Quando isso acontece o modal encolhe para dentro da área de conteúdo e o
// botão de fechar sai da tela. Foi o que aconteceu com a prévia do orçamento e
// a do pedido.
//
// `createPortal(..., document.body)` torna o componente imune: ele passa a ser
// filho do body, e nenhum ancestral da página o alcança.

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'src');

/**
 * Dívida conhecida, herdada — não é permissão para crescer.
 *
 * Estas telas já existiam com `fixed inset-0` sem portal quando a regra foi
 * escrita. Não foram migradas em massa de propósito: são 17 arquivos que
 * ninguém conseguiria conferir visualmente de uma vez, e a sessão em que a
 * regra nasceu já tinha causado um incidente em produção.
 *
 * A lista só encolhe. Cada uma que for portada some daqui; nenhuma entra.
 */
const DIVIDA_CONHECIDA = new Set([
    'pages/Login.tsx',
]);

const arquivosTsx = (dir: string): string[] => {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) { saida.push(...arquivosTsx(caminho)); continue; }
        if (nome.endsWith('.tsx')) saida.push(caminho);
    }
    return saida;
};

const relativo = (caminho: string) =>
    caminho.slice(RAIZ.length + 1).split(String.fromCharCode(92)).join('/');

const semPortal = (): string[] => {
    const achados: string[] = [];
    for (const caminho of arquivosTsx(RAIZ)) {
        const conteudo = readFileSync(caminho, 'utf8');
        if (!conteudo.includes('fixed inset-0')) continue;
        if (conteudo.includes('createPortal')) continue;
        achados.push(relativo(caminho));
    }
    return achados;
};

test('nenhuma sobreposição NOVA sem portal', () => {
    const novas = semPortal().filter(f => !DIVIDA_CONHECIDA.has(f));
    assert.deepStrictEqual(
        novas, [],
        'Componente com `fixed inset-0` precisa sair em createPortal(..., document.body).\n'
        + 'Sem isso, basta um ancestral ganhar transform/filter/backdrop-filter para o\n'
        + 'modal encolher para dentro da área de conteúdo e o X sair da tela.\n\nNovos:\n  '
        + novas.join('\n  '),
    );
});

test('a lista de dívida só encolhe — nome que já foi portado sai dela', () => {
    const aindaDevendo = new Set(semPortal());
    const jaResolvidos = [...DIVIDA_CONHECIDA].filter(f => !aindaDevendo.has(f));
    assert.deepStrictEqual(
        jaResolvidos, [],
        'Estes já usam portal e podem sair de DIVIDA_CONHECIDA:\n  ' + jaResolvidos.join('\n  '),
    );
});

test('as duas prévias saíram da dívida — foi o bug que criou esta regra', () => {
    for (const f of ['components/budgets/BudgetPreviewModal.tsx',
                     'components/orders/OrderPreviewModal.tsx']) {
        const conteudo = readFileSync(join(RAIZ, f), 'utf8');
        assert.ok(conteudo.includes('createPortal'), `${f} voltou a montar sem portal`);
        assert.ok(!DIVIDA_CONHECIDA.has(f), `${f} não deveria estar na dívida`);
    }
});
