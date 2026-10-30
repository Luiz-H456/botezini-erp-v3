import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Janela com campo não fecha sem perguntar (auditoria C3/S1 e a passada de celular e fábrica).
 *
 * A proteção (`useSaidaProtegida`) entrou em 12 janelas na auditoria e, na passada seguinte,
 * ainda faltavam 13 — entre elas a baixa parcial, que é a janela que a fábrica mais usa:
 * digitar a quantidade e tocar fora jogava o número fora. Lembrar de proteger cada janela
 * nova é pedir que ninguém erra; este teste lê o código e reprova a janela que esquecer.
 *
 * "Janela com campo": arquivo com sobreposição (`fixed inset-0`) e campo de digitação.
 * "Fecha sem perguntar": clique, X, Cancelar ou Esc ligados direto ao fechar recebido.
 * Quem não precisa de proteção entra em DISPENSADAS com o motivo escrito.
 */

const RAIZES = ['components', 'pages'].map(d => join(process.cwd(), 'src', d));

function arquivosTsx(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? arquivosTsx(p) : p.endsWith('.tsx') ? [p] : [];
    });
}

/** Tira comentários, para uma menção dentro de explicação não contar. */
function semComentarios(texto: string): string {
    return texto
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
}

const FECHAR = String.raw`(?:props\.)?(?:onClose|onCancelar|onFechar)`;
const SAIDAS_DIRETAS = [
    new RegExp(String.raw`onClick=\{${FECHAR}\}`),
    new RegExp(String.raw`useEscFecha\([^,()]+,\s*${FECHAR}\)`),
    new RegExp(String.raw`'Escape'\)\s*(?:\{\s*e\.preventDefault\(\);\s*)?${FECHAR}\(\)`),
];

export function janelaSemProtecao(fonte: string): boolean {
    const src = semComentarios(fonte);
    const ehJanela = src.includes('fixed inset-0') && /<input|<textarea|<SearchableSelect/.test(src);
    if (!ehJanela || src.includes('useSaidaProtegida')) return false;
    return SAIDAS_DIRETAS.some(r => r.test(src));
}

/** Caminho relativo a src/, com barra normal. Motivo obrigatório. */
const DISPENSADAS: Record<string, string> = {
    'components/finance/PagarEmLoteModal.tsx': 'só escolhe banco e data; refazer custa dois toques',
    'components/pcp/PrazoEmLoteModal.tsx': 'um campo de data; refazer custa um toque',
    'components/modals/GlobalCategoryQuickAdd.tsx': 'um nome de categoria',
    'components/masterdata/SugerirNomeModal.tsx': 'mostra sugestões; o que se digita é só o filtro',
    'components/layout/BuscaGeral.tsx': 'o campo é a busca; perguntar antes de fechar uma busca atrapalha',
};

test('toda janela com campo pergunta antes de descartar o digitado', () => {
    const faltando: string[] = [];
    for (const raiz of RAIZES) {
        for (const p of arquivosTsx(raiz)) {
            const nome = relative(join(process.cwd(), 'src'), p).replace(/\\/g, '/');
            if (nome in DISPENSADAS) continue;
            if (janelaSemProtecao(readFileSync(p, 'utf8'))) faltando.push(nome);
        }
    }
    assert.deepEqual(faltando, [],
        `Janela com campo que fecha sem perguntar: ${faltando.join(', ')}.\n` +
        'Use useSaidaProtegida (src/hooks/useSaidaProtegida.tsx) ou, se perder o digitado não custa nada, ' +
        'ponha em DISPENSADAS com o motivo.');
});

test('dispensa sem motivo, ou de arquivo que não existe mais, não vale', () => {
    for (const [nome, motivo] of Object.entries(DISPENSADAS)) {
        assert.ok(motivo.trim().length >= 10, `motivo curto demais para ${nome}`);
        assert.doesNotThrow(() => statSync(join(process.cwd(), 'src', nome)), `${nome} não existe: tire da lista`);
    }
});

test('o detector sabe reprovar (senão o teste de cima passa sempre)', () => {
    const base = (fechar: string, extra = '') => `${extra}
        export function X({ onClose }) {
            return createPortal(<div className="fixed inset-0" ${fechar}><input value={v} /></div>, document.body);
        }`;
    assert.equal(janelaSemProtecao(base('onClick={onClose}')), true, 'clique fora direto');
    assert.equal(janelaSemProtecao(base('onClick={props.onClose}')), true, 'props.onClose');
    assert.equal(janelaSemProtecao(base('', "useEscFecha(isOpen, onClose);")), true, 'Esc direto');
    assert.equal(janelaSemProtecao(base('', "const f = e => { if (e.key === 'Escape') onCancelar(); };")), true, 'Esc à mão');
    // e não reprova o que está certo
    assert.equal(janelaSemProtecao(base('onClick={saida.pedirParaFechar}', 'const saida = useSaidaProtegida(onClose);')), false);
    assert.equal(janelaSemProtecao(base('onClick={onClose}').replace('<input value={v} />', '<p>só leitura</p>')), false, 'sem campo');
    assert.equal(janelaSemProtecao(base('', '// onClick={onClose} só num comentário')), false);
});
