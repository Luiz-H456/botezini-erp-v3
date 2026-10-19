import test from 'node:test';
import assert from 'node:assert';
import {
    comCache, invalidarCacheDeLeitura, limparCacheDeLeitura,
    versaoAtualDosDados, comInvalidacaoAutomatica,
} from './cacheDeLeitura.ts';

test.beforeEach(() => limparCacheDeLeitura());

// ── Cache ───────────────────────────────────────────────────────────────────

test('a mesma chave reaproveita a busca — não vai ao banco de novo', async () => {
    let idas = 0;
    const buscar = async () => { idas++; return 'pedidos'; };

    assert.strictEqual(await comCache('orders', buscar), 'pedidos');
    assert.strictEqual(await comCache('orders', buscar), 'pedidos');
    assert.strictEqual(idas, 1);
});

test('duas telas pedindo junto dividem UMA requisição', async () => {
    // É o caso de abrir uma tela que carrega pedidos e clientes em paralelo
    // enquanto outra já pediu clientes: sem isto seriam duas requisições.
    let idas = 0;
    const buscar = async () => {
        idas++;
        await new Promise(r => setTimeout(r, 10));
        return 'clientes';
    };

    const [a, b] = await Promise.all([comCache('clients', buscar), comCache('clients', buscar)]);
    assert.strictEqual(a, 'clientes');
    assert.strictEqual(b, 'clientes');
    assert.strictEqual(idas, 1);
});

test('chaves diferentes não se misturam', async () => {
    assert.strictEqual(await comCache('a', async () => 1), 1);
    assert.strictEqual(await comCache('b', async () => 2), 2);
    assert.strictEqual(await comCache('a', async () => 99), 1);
});

test('QUALQUER escrita descarta o cache — é a regra que não pode quebrar', async () => {
    let idas = 0;
    const buscar = async () => { idas++; return idas; };

    assert.strictEqual(await comCache('orders', buscar), 1);
    invalidarCacheDeLeitura();
    assert.strictEqual(await comCache('orders', buscar), 2, 'devia ter buscado de novo');
});

test('a invalidação atinge todas as chaves, não só a escrita', async () => {
    // Grosseiro de propósito: mapear "esta escrita afeta estas leituras" seria
    // uma lista para alguém esquecer, e o sintoma seria número errado na tela.
    await comCache('orders', async () => 'v1');
    await comCache('clients', async () => 'v1');
    invalidarCacheDeLeitura();
    assert.strictEqual(await comCache('orders', async () => 'v2'), 'v2');
    assert.strictEqual(await comCache('clients', async () => 'v2'), 'v2');
});

test('erro não fica cacheado — um tropeço de rede não se repete por 20s', async () => {
    let idas = 0;
    const falha = async () => { idas++; throw new Error('rede caiu'); };

    await assert.rejects(() => comCache('orders', falha), /rede caiu/);
    await assert.rejects(() => comCache('orders', falha), /rede caiu/);
    assert.strictEqual(idas, 2);

    // E depois de voltar, o valor bom entra normalmente.
    assert.strictEqual(await comCache('orders', async () => 'ok'), 'ok');
});

// ── Interceptação das escritas ──────────────────────────────────────────────

/** Cliente de mentira com a mesma forma da parte do supabase que usamos. */
function clienteFalso() {
    const chamadas: string[] = [];
    const construtor: any = {
        select: (..._a: any[]) => { chamadas.push('select'); return construtor; },
        insert: (..._a: any[]) => { chamadas.push('insert'); return construtor; },
        upsert: (..._a: any[]) => { chamadas.push('upsert'); return construtor; },
        update: (..._a: any[]) => { chamadas.push('update'); return construtor; },
        delete: (..._a: any[]) => { chamadas.push('delete'); return construtor; },
        eq: (..._a: any[]) => { chamadas.push('eq'); return construtor; },
        order: (..._a: any[]) => { chamadas.push('order'); return construtor; },
    };
    return {
        chamadas,
        cliente: {
            from: (_t: string) => construtor,
            rpc: (_n: string, _a?: any) => Promise.resolve({ data: 'ok', error: null }),
            auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        },
    };
}

for (const verbo of ['insert', 'upsert', 'update', 'delete'] as const) {
    test(`from().${verbo}() invalida o cache sozinho`, async () => {
        const { cliente } = clienteFalso();
        const db: any = comInvalidacaoAutomatica(cliente);

        await comCache('orders', async () => 'antigo');
        const antes = versaoAtualDosDados();

        db.from('orders')[verbo]({ id: 1 });

        assert.ok(versaoAtualDosDados() > antes, `${verbo} devia ter invalidado`);
        assert.strictEqual(await comCache('orders', async () => 'novo'), 'novo');
    });
}

test('leitura NÃO invalida — senão o cache nunca serviria para nada', async () => {
    const { cliente } = clienteFalso();
    const db: any = comInvalidacaoAutomatica(cliente);

    await comCache('orders', async () => 'v1');
    const antes = versaoAtualDosDados();

    db.from('orders').select('*').eq('id', 1).order('name');

    assert.strictEqual(versaoAtualDosDados(), antes);
    assert.strictEqual(await comCache('orders', async () => 'v2'), 'v1', 'não devia ter recarregado');
});

test('rpc invalida — é por onde passam as baixas e os pagamentos', async () => {
    const { cliente } = clienteFalso();
    const db: any = comInvalidacaoAutomatica(cliente);

    await comCache('orders', async () => 'v1');
    const antes = versaoAtualDosDados();

    await db.rpc('log_production', { p_order_id: 'x', p_qty_done: 5 });

    assert.ok(versaoAtualDosDados() > antes);
});

test('o encadeamento depois do verbo continua funcionando', async () => {
    // delete().eq() precisa chegar inteiro no cliente real, senão apagaria a
    // tabela toda em vez de uma linha.
    const { cliente, chamadas } = clienteFalso();
    const db: any = comInvalidacaoAutomatica(cliente);

    db.from('orders').delete().eq('id', 'abc');

    assert.deepStrictEqual(chamadas, ['delete', 'eq']);
});

test('o que não é from/rpc passa intacto', async () => {
    const { cliente } = clienteFalso();
    const db: any = comInvalidacaoAutomatica(cliente);

    const r = await db.auth.getUser();
    assert.strictEqual(r.data.user.id, 'u1');
    assert.strictEqual(versaoAtualDosDados(), 0, 'auth não devia invalidar');
});
