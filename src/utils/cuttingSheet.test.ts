import test from 'node:test';
import assert from 'node:assert';
import { buildCuttingSheet, ordenarTamanhos, buildAdicionais } from './cuttingSheet.ts';
import type { CutItem } from './cuttingSheet.ts';

const item = (o: Partial<CutItem>): CutItem => ({
    product_name: 'Polo', quantity: 1, size: 'M',
    fabric_name: 'Piquet', color: 'Azul', ...o,
});

test('mesmo tecido, cor e especificacao viram um enfesto so', () => {
    const s = buildCuttingSheet([
        item({ product_name: 'Polo', quantity: 20, size: 'M' }),
        item({ product_name: 'Polo', quantity: 10, size: 'G' }),
        item({ fabric_name: 'Brim', color: 'Cinza', quantity: 5, size: 'M' }),
    ]);
    assert.strictEqual(s.enfestos.length, 2);
    assert.strictEqual(s.enfestos[0].label, 'PIQUET / AZUL');
    assert.strictEqual(s.enfestos[0].total, 30);
    assert.strictEqual(s.enfestos[1].label, 'BRIM / CINZA');
});

test('manga diferente no mesmo tecido e cor separa o enfesto', () => {
    // molde diferente = encaixe diferente. Juntar esconderia a especificacao
    // do segundo item e a fabrica cortaria peca errada.
    const s = buildCuttingSheet([
        item({ product_name: 'Polo', quantity: 20, size: 'M', sleeve_type: 'manga_curta' }),
        item({ product_name: 'Polo', quantity: 10, size: 'M', sleeve_type: 'manga_longa' }),
    ]);
    assert.strictEqual(s.enfestos.length, 2);
    assert.match(s.enfestos[0].spec, /M\.CURTA/);
    assert.match(s.enfestos[1].spec, /M\.LONGA/);
});

test('modelagem, genero e faixa tambem separam o enfesto', () => {
    const base = { product_name: 'Polo', quantity: 10, size: 'M' } as const;
    for (const variacao of [
        { fit: 'slim' as const }, { gender: 'feminino' as const }, { has_band: true },
    ]) {
        const s = buildCuttingSheet([item({ ...base }), item({ ...base, ...variacao })]);
        assert.strictEqual(s.enfestos.length, 2, `variacao ${JSON.stringify(variacao)} deveria separar`);
    }
});

test('modelos diferentes com a mesma especificacao nao se fundem', () => {
    // A polo e a camisa tem moldes distintos mesmo com tecido, cor e manga iguais.
    const s = buildCuttingSheet([
        item({ product_name: 'Polo', quantity: 20, size: 'M', sleeve_type: 'manga_curta' }),
        item({ product_name: 'Camisa', quantity: 10, size: 'M', sleeve_type: 'manga_curta' }),
    ]);
    assert.strictEqual(s.enfestos.length, 2);
});

test('mesma cor em tecidos diferentes sao enfestos separados', () => {
    const s = buildCuttingSheet([
        item({ fabric_name: 'Piquet', color: 'Preto', quantity: 5 }),
        item({ fabric_name: 'Malha PV', color: 'Preto', quantity: 5 }),
    ]);
    assert.strictEqual(s.enfestos.length, 2);
});

test('soma quantidades do mesmo tamanho dentro do enfesto', () => {
    const s = buildCuttingSheet([
        item({ quantity: 8, size: 'M' }),
        item({ quantity: 12, size: 'M' }),
    ]);
    assert.deepStrictEqual(s.enfestos[0].rows, [{ size: 'M', qty: 20 }]);
});

test('tamanhos saem na ordem da grade, nao alfabetica', () => {
    assert.deepStrictEqual(
        ordenarTamanhos(['GG', 'P', 'XG', 'M', 'PP', 'G']),
        ['PP', 'P', 'M', 'G', 'GG', 'XG'],
    );
});

test('tamanho numerico ordena por valor', () => {
    assert.deepStrictEqual(ordenarTamanhos(['42', '38', '40']), ['38', '40', '42']);
});

test('tamanho desconhecido vai para o fim sem quebrar', () => {
    assert.deepStrictEqual(ordenarTamanhos(['ZZZ', 'M', 'P']), ['P', 'M', 'ZZZ']);
});

test('conferencia agrupa por modelo + cor e bate com o total', () => {
    const s = buildCuttingSheet([
        item({ product_name: 'Polo', quantity: 20, size: 'M' }),
        item({ product_name: 'Polo', quantity: 18, size: 'G' }),
        item({ product_name: 'Calca', fabric_name: 'Brim', color: 'Cinza', quantity: 14, size: 'M' }),
    ]);
    assert.strictEqual(s.totalPieces, 52);
    assert.strictEqual(s.conferencia[0].total, 38);
    assert.deepStrictEqual(s.conferencia[0].bySize, { M: 20, G: 18 });
    // o total por tamanho cruza os dois modelos
    assert.deepStrictEqual(s.totalBySize, { M: 34, G: 18 });
});

test('a soma dos enfestos e igual ao total do pedido', () => {
    const s = buildCuttingSheet([
        item({ quantity: 20, size: 'M' }),
        item({ quantity: 18, size: 'G', color: 'Preto' }),
        item({ quantity: 5, size: 'P', fabric_name: 'Brim' }),
    ]);
    assert.strictEqual(s.enfestos.reduce((t, e) => t + e.total, 0), s.totalPieces);
});

test('item sem tecido ou cor nao some da ficha', () => {
    const s = buildCuttingSheet([item({ fabric_name: '', fabric: '', color: '', quantity: 7 })]);
    assert.strictEqual(s.enfestos[0].label, 'SEM TECIDO / SEM COR');
    assert.strictEqual(s.totalPieces, 7);
});

test('quantidade zero, negativa ou item nulo sao ignorados', () => {
    const s = buildCuttingSheet([
        item({ quantity: 0 }), item({ quantity: -3 }), null as any, item({ quantity: 4 }),
    ]);
    assert.strictEqual(s.totalPieces, 4);
    assert.strictEqual(s.enfestos.length, 1);
});

test('pedido vazio devolve estrutura vazia sem quebrar', () => {
    const s = buildCuttingSheet([]);
    assert.deepStrictEqual(s.enfestos, []);
    assert.strictEqual(s.totalPieces, 0);
});

test('faixa refletiva aparece na especificacao do enfesto', () => {
    const s = buildCuttingSheet([
        item({ quantity: 10, sleeve_type: 'manga_longa', gender: 'masculino', has_band: true }),
    ]);
    assert.match(s.enfestos[0].spec, /C\/FAIXA REFLETIVA/);
});

test('sem faixa nao polui a especificacao', () => {
    const s = buildCuttingSheet([item({ quantity: 10, has_band: false })]);
    assert.ok(!s.enfestos[0].spec.toUpperCase().includes('FAIXA'));
});

test('adicionais juntam personalizacoes e extras com quantidade', () => {
    const a = buildAdicionais(
        [{ type: 'Embroidery', description: 'Logo 3 cores', position: 'Peito esq.', quantity: 50 }],
        [{ description: 'Saco plastico individual', quantity: 120 }],
    );
    assert.strictEqual(a.length, 2);
    assert.deepStrictEqual(a[0], { tipo: 'BORDADO', descricao: 'Logo 3 cores', local: 'Peito esq.', quantidade: 50 });
    assert.deepStrictEqual(a[1], { tipo: 'EXTRA', descricao: 'Saco plastico individual', local: '', quantidade: 120 });
});

test('tipos de personalizacao sao traduzidos', () => {
    const a = buildAdicionais([
        { type: 'ScreenPrint', description: 'a' }, { type: 'DTF', description: 'b' },
        { type: 'Other', description: 'c' }, { type: 'Coisa nova', description: 'd' },
    ], []);
    assert.deepStrictEqual(a.map(x => x.tipo), ['SILK', 'DTF', 'OUTRO', 'COISA NOVA']);
});

test('adicional sem descricao nao entra; personalizacao com so posicao entra', () => {
    const a = buildAdicionais(
        [{ type: 'DTF', description: '', position: 'Costas' }, { type: 'DTF', description: '  ' }],
        [{ description: '' }, { description: '  ' }],
    );
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0].descricao, '(sem descrição)');
    assert.strictEqual(a[0].local, 'Costas');
});

test('adicionais tolera nulo e undefined', () => {
    assert.deepStrictEqual(buildAdicionais(null, undefined), []);
    assert.deepStrictEqual(buildAdicionais([null as any], [null as any]), []);
});

test('quantidade ausente vira zero em vez de NaN', () => {
    const a = buildAdicionais([{ type: 'DTF', description: 'x' }], []);
    assert.strictEqual(a[0].quantidade, 0);
});

test('enfesto maior vem primeiro', () => {
    const s = buildCuttingSheet([
        item({ fabric_name: 'A', color: 'X', quantity: 5 }),
        item({ fabric_name: 'B', color: 'Y', quantity: 50 }),
    ]);
    assert.strictEqual(s.enfestos[0].fabric, 'B');
});

test('o modelo da linha aparece na especificação do enfesto', () => {
    // Duas variantes do MESMO produto, tecido e cor: só o modelo as separa.
    const f = buildCuttingSheet([
        { product_name: 'CONJUNTO BASE ALIMENTAR', model: 'PINTURA', color: 'AZUL', fabric: 'PV', size: 'M', quantity: 5 },
        { product_name: 'CONJUNTO BASE ALIMENTAR', model: 'PLATAFORMA', color: 'AZUL', fabric: 'PV', size: 'M', quantity: 2 },
    ]);
    assert.equal(f.enfestos.length, 2, 'modelos diferentes são enfestos diferentes');
    const specs = f.enfestos.map(e => e.spec);
    assert.ok(specs.some(s => s.includes('PINTURA')), `faltou PINTURA em ${JSON.stringify(specs)}`);
    assert.ok(specs.some(s => s.includes('PLATAFORMA')), `faltou PLATAFORMA em ${JSON.stringify(specs)}`);
});

test('item sem modelo não deixa separador solto na especificação', () => {
    const f = buildCuttingSheet([
        { product_name: 'CAMISA', color: 'BRANCO', fabric: 'BRIM', size: 'M', quantity: 3 },
    ]);
    assert.equal(f.enfestos[0].spec, 'CAMISA');
    assert.ok(!f.enfestos[0].spec.includes('··'));
    assert.ok(!/·\s*$/.test(f.enfestos[0].spec));
});

// ── conjunto: várias peças, um preço ─────────────────────────────────────────

const conjunto = {
    product_name: 'CONJUNTO BASE ALIMENTAR', size: 'M', quantity: 30,
    fabric_name: 'MALHA PV', color: 'AZUL',
    components: [
        { name: 'JALECO', fabric_name: 'MALHA PV', color: 'AZUL' },
        { name: 'CALÇA', fabric_name: 'BRIM', color: 'PRETO' },
    ],
};

test('conjunto abre num enfesto por peça, cada um no seu tecido', () => {
    const f = buildCuttingSheet([conjunto]);
    assert.equal(f.enfestos.length, 2, 'jaleco e calça são aberturas diferentes na mesa');
    const rotulos = f.enfestos.map(e => e.label).sort();
    assert.deepEqual(rotulos, ['BRIM / PRETO', 'MALHA PV / AZUL']);
    // Cada peça leva a quantidade do conjunto: 30 conjuntos são 30 jalecos E 30 calças.
    assert.ok(f.enfestos.every(e => e.total === 30), JSON.stringify(f.enfestos.map(e => e.total)));
});

test('o nome da peça entra na especificação do enfesto', () => {
    const specs = buildCuttingSheet([conjunto]).enfestos.map(e => e.spec);
    assert.ok(specs.some(s => s.includes('JALECO')), JSON.stringify(specs));
    assert.ok(specs.some(s => s.includes('CALÇA')), JSON.stringify(specs));
});

test('a conferência conta o PEDIDO, não o corte', () => {
    const f = buildCuttingSheet([conjunto]);
    // O cliente pediu 30 conjuntos. Conferir contra 60 acusaria divergência sempre.
    assert.equal(f.totalPieces, 30);
    assert.equal(f.totalBySize['M'], 30);
    assert.equal(f.conferencia.length, 1);
    assert.equal(f.conferencia[0].total, 30);
    assert.equal(f.conferencia[0].label, 'CONJUNTO BASE ALIMENTAR · AZUL');
});

test('componente sem tecido herda o da linha em vez de virar SEM TECIDO', () => {
    const f = buildCuttingSheet([{
        product_name: 'CONJUNTO', size: 'G', quantity: 4,
        fabric_name: 'BRIM', color: 'BEGE',
        components: [{ name: 'CAMISA' }, { name: 'CALÇA', color: 'PRETO' }],
    }]);
    assert.ok(!f.enfestos.some(e => e.fabric === 'SEM TECIDO'), JSON.stringify(f.enfestos.map(e => e.label)));
    assert.equal(f.enfestos.length, 2, 'cores diferentes continuam sendo enfestos diferentes');
});

test('item sem componentes segue exatamente como antes', () => {
    const semComp = { product_name: 'CAMISA', size: 'M', quantity: 10, fabric_name: 'BRIM', color: 'BRANCO' };
    const f = buildCuttingSheet([semComp]);
    assert.equal(f.enfestos.length, 1);
    assert.equal(f.enfestos[0].total, 10);
    assert.equal(f.totalPieces, 10);
});

test('lista de componentes vazia não zera o item', () => {
    const f = buildCuttingSheet([{
        product_name: 'CAMISA', size: 'M', quantity: 7, fabric_name: 'BRIM', color: 'AZUL', components: [],
    }]);
    assert.equal(f.enfestos.length, 1);
    assert.equal(f.enfestos[0].total, 7);
});
