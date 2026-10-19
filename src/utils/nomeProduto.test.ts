import test from 'node:test';
import assert from 'node:assert';
import { montarNomeProduto, montarSkuProduto, interpretarNomeProduto, nomePrincipal } from './nomeProduto.ts';
import type { PartesDoNome } from './nomeProduto.ts';

test('monta o nome completo na ordem do padrão', () => {
    assert.strictEqual(
        montarNomeProduto({
            tipo: 'Camisa Polo', manga: 'manga_curta', genero: 'masculino',
            modelagem: 'slim', tecido: 'Piquê',
        }),
        'CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ',
    );
});

test('campo vazio some do nome, sem deixar espaço duplo', () => {
    assert.strictEqual(
        montarNomeProduto({ tipo: 'Jaleco', tecido: 'Oxford' }),
        'JALECO OXFORD',
    );
    assert.strictEqual(
        montarNomeProduto({ tipo: 'Camiseta', manga: 'manga_curta', tecido: 'Malha PV' }),
        'CAMISETA MANGA CURTA MALHA PV',
    );
});

test('a ordem é fixa: a mesma peça descrita fora de ordem dá o mesmo nome', () => {
    // É o ponto do padrão — dois cadastradores chegam no mesmo texto.
    const a = montarNomeProduto({ tipo: 'Polo', genero: 'feminino', manga: 'manga_longa', tecido: 'Piquê' });
    const b = montarNomeProduto({ tecido: 'Piquê', manga: 'manga_longa', tipo: 'Polo', genero: 'feminino' });
    assert.strictEqual(a, b);
    assert.strictEqual(a, 'POLO MANGA LONGA FEM PIQUÊ');
});

test('gênero é abreviado para não errar concordância', () => {
    // "CAMISA MASCULINA" e "JALECO MASCULINO" — MASC serve para os dois.
    assert.ok(montarNomeProduto({ tipo: 'Camisa', genero: 'masculino' }).endsWith('MASC'));
    assert.ok(montarNomeProduto({ tipo: 'Jaleco', genero: 'masculino' }).endsWith('MASC'));
    assert.strictEqual(montarNomeProduto({ tipo: 'Avental', genero: 'unissex' }), 'AVENTAL UNISSEX');
});

test('faixa refletiva entra por extenso, no fim', () => {
    assert.strictEqual(
        montarNomeProduto({ tipo: 'Camisa', manga: 'manga_longa', tecido: 'Brim', faixaRefletiva: true }),
        'CAMISA MANGA LONGA BRIM C/ FAIXA REFLETIVA',
    );
    // Sem faixa não escreve nada — não existe "S/ FAIXA" no nome.
    assert.strictEqual(
        montarNomeProduto({ tipo: 'Camisa', tecido: 'Brim', faixaRefletiva: false }),
        'CAMISA BRIM',
    );
});

test('normaliza espaços e caixa do texto livre', () => {
    assert.strictEqual(
        montarNomeProduto({ tipo: '  camisa   social  ', tecido: ' tricoline ' }),
        'CAMISA SOCIAL TRICOLINE',
    );
});

test('sem nenhuma parte, devolve string vazia', () => {
    assert.strictEqual(montarNomeProduto({}), '');
});

test('acento é preservado no nome', () => {
    assert.strictEqual(montarNomeProduto({ tipo: 'Polo', tecido: 'Piquê' }), 'POLO PIQUÊ');
});

// ── SKU ──────────────────────────────────────────────────────────────────────

test('SKU segue a mesma ordem, em blocos', () => {
    assert.strictEqual(
        montarSkuProduto({
            tipo: 'Camisa Polo', manga: 'manga_curta', genero: 'masculino',
            modelagem: 'slim', tecido: 'Piquê',
        }),
        'CAMPOL-MC-M-SLIM-PIQ',
    );
});

test('SKU tira acento', () => {
    // "PIQUÊ" viraria PIQÊ e quebraria busca/exportação.
    assert.strictEqual(montarSkuProduto({ tipo: 'Polo', tecido: 'Piquê' }), 'POL-PIQ');
    assert.strictEqual(montarSkuProduto({ tipo: 'Túnica', tecido: 'Oxford' }), 'TUN-OXF');
});

test('SKU usa no máximo as 2 primeiras palavras do tipo', () => {
    assert.strictEqual(
        montarSkuProduto({ tipo: 'Camisa Social Executiva', tecido: 'Tricoline' }),
        'CAMSOC-TRI',
    );
});

test('SKU marca faixa refletiva no fim', () => {
    assert.strictEqual(
        montarSkuProduto({ tipo: 'Camisa', tecido: 'Brim', faixaRefletiva: true }),
        'CAM-BRI-FX',
    );
});

test('SKU omite blocos vazios sem deixar hífen solto', () => {
    assert.strictEqual(montarSkuProduto({ tipo: 'Jaleco' }), 'JAL');
    assert.strictEqual(montarSkuProduto({ tecido: 'Brim' }), 'BRI');
    assert.strictEqual(montarSkuProduto({}), '');
    // O caso que produzia "--" antes de filtrar os vazios:
    assert.strictEqual(
        montarSkuProduto({ tipo: 'Polo', modelagem: 'regular' }),
        'POL-REG',
    );
});

// ── Caminho de volta: ler o nome ────────────────────────────────────────────

test('lê de volta o que o padrão escreveu', () => {
    const a = interpretarNomeProduto('CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ');
    assert.deepStrictEqual(a, {
        manga: 'manga_curta', genero: 'masculino', modelagem: 'slim', faixaRefletiva: undefined,
    });
});

test('ida e volta: tudo que foi escrito é recuperado', () => {
    const casos: PartesDoNome[] = [
        { tipo: 'Camisa Polo', manga: 'manga_curta', genero: 'masculino', modelagem: 'slim', tecido: 'Piquê' },
        { tipo: 'Jaleco', manga: 'manga_longa', genero: 'feminino', modelagem: 'regular', tecido: 'Oxford' },
        { tipo: 'Colete', manga: 'sem_manga', genero: 'unissex', modelagem: 'plus_size', tecido: 'Brim', faixaRefletiva: true },
        { tipo: 'Camiseta', genero: 'infantil', modelagem: 'babylook', tecido: 'Malha' },
    ];
    for (const p of casos) {
        const lido = interpretarNomeProduto(montarNomeProduto(p));
        assert.strictEqual(lido.manga, p.manga || undefined, `manga de ${p.tipo}`);
        assert.strictEqual(lido.genero, p.genero || undefined, `genero de ${p.tipo}`);
        assert.strictEqual(lido.modelagem, p.modelagem || undefined, `modelagem de ${p.tipo}`);
        assert.strictEqual(lido.faixaRefletiva, p.faixaRefletiva || undefined, `faixa de ${p.tipo}`);
    }
});

test('entende o catálogo antigo, escrito à mão', () => {
    assert.strictEqual(interpretarNomeProduto('Camisa Polo M/C Masculino').manga, 'manga_curta');
    assert.strictEqual(interpretarNomeProduto('polo m. longa feminina').manga, 'manga_longa');
    assert.strictEqual(interpretarNomeProduto('polo m. longa feminina').genero, 'feminino');
    assert.strictEqual(interpretarNomeProduto('Regata S/ Manga Unisex').manga, 'sem_manga');
    assert.strictEqual(interpretarNomeProduto('Regata S/ Manga Unisex').genero, 'unissex');
    assert.strictEqual(interpretarNomeProduto('Camisa Slim Fit Oxford').modelagem, 'slim');
    assert.strictEqual(interpretarNomeProduto('Blusa Baby Look').modelagem, 'babylook');
});

test('nome sem atributo reconhecido não inventa nada', () => {
    assert.deepStrictEqual(interpretarNomeProduto('JALECO OXFORD'), {
        manga: undefined, genero: undefined, modelagem: undefined, faixaRefletiva: undefined,
    });
    assert.deepStrictEqual(interpretarNomeProduto(''), {
        manga: undefined, genero: undefined, modelagem: undefined, faixaRefletiva: undefined,
    });
});

// ── Nome principal (sem duplicar no orçamento) ──────────────────────────────

test('nome principal tira as características que viram campo', () => {
    assert.strictEqual(
        nomePrincipal('CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ'),
        'CAMISA POLO PIQUÊ',
    );
});

test('nome principal tira também o tecido, quando a ficha técnica informa qual é', () => {
    assert.strictEqual(
        nomePrincipal('CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ', ['Piquê']),
        'CAMISA POLO',
    );
    // Tecido de duas palavras.
    assert.strictEqual(
        nomePrincipal('CAMISETA MANGA CURTA MALHA PV', ['Malha PV']),
        'CAMISETA',
    );
});

test('INVARIANTE: tudo que é lido também sai do nome principal', () => {
    // Se as duas funções discordarem, o orçamento mostra a característica duas
    // vezes — uma no nome do item, outra no campo. Este é o teste que garante
    // que a tabela de vocabulário serve às duas.
    const nomes = [
        'CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ',
        'COLETE SEM MANGA UNISSEX PLUS SIZE BRIM C/ FAIXA REFLETIVA',
        'Camisa Polo M/C Masculino',
        'Camisa Slim Fit Oxford',
        'JALECO OXFORD',
    ];
    for (const nome of nomes) {
        const principal = nomePrincipal(nome);
        const sobrou = interpretarNomeProduto(principal);
        assert.deepStrictEqual(
            sobrou,
            { manga: undefined, genero: undefined, modelagem: undefined, faixaRefletiva: undefined },
            `sobrou característica em "${principal}" (veio de "${nome}")`,
        );
    }
});

test('nome principal não deixa espaço duplo nem sobra de pontuação', () => {
    assert.strictEqual(nomePrincipal('POLO  M/C   MASC  PIQUÊ'), 'POLO PIQUÊ');
    assert.strictEqual(nomePrincipal('COLETE BRIM C/ FAIXA REFLETIVA'), 'COLETE BRIM');
});

test('nome só de características vira string vazia, não lixo', () => {
    assert.strictEqual(nomePrincipal('MANGA CURTA MASC'), '');
});

test('nome principal preserva a caixa original do que sobra', () => {
    // O item do orçamento herda o texto como o usuário cadastrou.
    assert.strictEqual(nomePrincipal('Camisa Polo Manga Curta Masc'), 'Camisa Polo');
});
