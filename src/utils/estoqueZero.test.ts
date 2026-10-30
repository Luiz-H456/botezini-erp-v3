import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Estoque zero (decisão do Luiz, 30/10): todo pedido compra tudo o que a ficha pede, e a sobra de
 * uma compra fica só como registro — nunca abate o que um pedido precisa. Este teste lê o código e
 * reprova a volta do que contradiz isso: tirar do estoque para um pedido, ou mandar a pessoa a uma
 * tela de Estoque que não existe mais no menu (o apelido leva às Tabelas de custo, mas o texto
 * do botão mentiria).
 */

const RAIZ = join(process.cwd(), 'src');

function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return arquivos(p);
        return /\.tsx?$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
    });
}

const PROIBIDOS: [RegExp, string][] = [
    [/usar_do_estoque/, 'RPC que tira do estoque para um pedido'],
    [/UsarDoEstoque/, 'janela de usar do estoque'],
    [/Usar do estoque|Usar num pedido/, 'botão de usar do estoque'],
    // Só navegação: 'inventory' também é o domínio das categorias de produto, e esse fica.
    [/(?:onIrPara|onNavigate|handleNavigate|onNavegar|setCurrentView)\??\.?\(\s*'inventory'|view:\s*'inventory'/, "navegação para 'inventory' (use 'tabelas')"],
    [/Abrir Estoque/, 'botão para a tela de Estoque'],
];

export function violacoes(fonte: string): string[] {
    return PROIBIDOS.filter(([r]) => r.test(fonte)).map(([, motivo]) => motivo);
}

test('nada no app tira do estoque para um pedido nem manda para a tela de Estoque', () => {
    const achados: string[] = [];
    for (const p of arquivos(RAIZ)) {
        for (const v of violacoes(readFileSync(p, 'utf8'))) achados.push(`${relative(RAIZ, p)}: ${v}`);
    }
    assert.deepEqual(achados, []);
});

test('o detector sabe reprovar', () => {
    assert.deepEqual(violacoes("onClick={() => onIrPara('inventory')}"), ["navegação para 'inventory' (use 'tabelas')"]);
    assert.deepEqual(violacoes("supabase.rpc('usar_do_estoque', {})"), ['RPC que tira do estoque para um pedido']);
    assert.deepEqual(violacoes('<button>Usar do estoque</button>'), ['botão de usar do estoque']);
    assert.deepEqual(violacoes("destino: { view: 'inventory' }"), ["navegação para 'inventory' (use 'tabelas')"]);
    assert.deepEqual(violacoes("onNavigate?.('inventory', nome)"), ["navegação para 'inventory' (use 'tabelas')"]);
    assert.deepEqual(violacoes("onIrPara('tabelas')"), []);
    assert.deepEqual(violacoes("storageService.getGlobalCategories('inventory')"), [], 'domínio de categoria não é tela');
});
