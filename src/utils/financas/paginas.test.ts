import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerEmPaginas } from './paginas.ts';

/** Um "banco" de n linhas que responde como o PostgREST: no máximo 1000 por chamada. */
const servidor = (n: number, chamadas: Array<[number, number]> = []) =>
    async (de: number, ate: number) => {
        chamadas.push([de, ate]);
        const fim = Math.min(ate, n - 1, de + 999);
        return { data: de > fim ? [] : Array.from({ length: fim - de + 1 }, (_, i) => de + i), error: null };
    };

test('junta as páginas até vir uma curta, sem marcar truncado', async () => {
    const chamadas: Array<[number, number]> = [];
    const r = await lerEmPaginas(servidor(2350, chamadas), 5000);
    assert.equal(r.linhas.length, 2350);
    assert.equal(r.truncado, false);
    assert.equal(r.erro, null);
    assert.deepEqual(chamadas, [[0, 999], [1000, 1999], [2000, 2999]]);
    assert.deepEqual(r.linhas.slice(995, 1005), [995, 996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004]);
});

test('para no teto e avisa que há mais', async () => {
    const r = await lerEmPaginas(servidor(9000), 3000);
    assert.equal(r.linhas.length, 3000);
    assert.equal(r.truncado, true);
});

test('página cheia seguida de vazia (múltiplo exato de 1000) termina sem truncar', async () => {
    const r = await lerEmPaginas(servidor(2000), 5000);
    assert.equal(r.linhas.length, 2000);
    assert.equal(r.truncado, false);
});

test('erro numa página devolve o erro e nenhuma linha', async () => {
    let n = 0;
    const r = await lerEmPaginas(async () => (++n === 1
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null }
        : { data: null, error: { message: 'boom' } }), 5000);
    assert.equal(r.erro, 'boom');
    assert.deepEqual(r.linhas, []);
});

test('tabela vazia', async () => {
    const r = await lerEmPaginas(servidor(0), 5000);
    assert.deepEqual(r, { linhas: [], truncado: false, erro: null });
});
