import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoAviso, aplicarIgnorados, podarIgnorados } from './ignorados.ts';
import type { BlocoDaFila, LinhaDaFila } from './fila.ts';

const linha = (id: string, quantidade: number, extra: Partial<LinhaDaFila> = {}): LinhaDaFila => ({
    id, objetivo: 'vender', acao: 'Retomar', texto: `${id} ${quantidade}`, quantidade, urgente: false,
    destino: { view: 'clientes', dormentes: true }, ...extra,
});
const blocos = (...linhas: LinhaDaFila[]): BlocoDaFila[] => [{ objetivo: 'vender', rotulo: 'Vender', linhas }];

test('ignorado some da fila e vai para a lista de ignorados; bloco vazio sai', () => {
    const a = linha('a', 4), b = linha('b', 2);
    const r = aplicarIgnorados(blocos(a, b), new Set([chaveDoAviso(a)]));
    assert.deepEqual(r.visiveis[0].linhas.map(l => l.id), ['b']);
    assert.deepEqual(r.ignoradas.map(l => l.id), ['a']);
    assert.deepEqual(aplicarIgnorados(blocos(a), new Set([chaveDoAviso(a)])).visiveis, []);
});

test('a situação mudou (4 → 5 clientes): o aviso volta sozinho', () => {
    const ignorado = chaveDoAviso(linha('a', 4));
    const r = aplicarIgnorados(blocos(linha('a', 5)), new Set([ignorado]));
    assert.deepEqual(r.visiveis[0].linhas.map(l => l.id), ['a']);
    assert.deepEqual(r.ignoradas, []);
});

test('caixa negativo: mudar a data é outra situação, mesmo com a mesma quantidade', () => {
    const antes = linha('caixa', 1, { assinatura: '2026-11-12' });
    const depois = linha('caixa', 1, { assinatura: '2026-11-05' });
    assert.notEqual(chaveDoAviso(antes), chaveDoAviso(depois));
});

test('poda: some da lista o que não existe mais (resolvido não fica ignorado para sempre)', () => {
    const a = linha('a', 4);
    const r = podarIgnorados(new Set([chaveDoAviso(a), 'velho|3|']), blocos(a));
    assert.deepEqual([...r], [chaveDoAviso(a)]);
});
