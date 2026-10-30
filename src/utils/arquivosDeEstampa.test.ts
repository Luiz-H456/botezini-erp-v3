import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDoArquivo, recusaDoArquivo, baseComNome, nomeParaMostrar, TAMANHO_MAX_MB_ARQUIVO } from './arquivosDeEstampa.ts';

test('tipo pela extensão, sem caso: PDF, foto, Corel e matriz de bordado', () => {
    assert.equal(tipoDoArquivo('u/estampas/x/1_a--logo.PDF'), 'pdf');
    assert.equal(tipoDoArquivo('logo.jpeg'), 'foto');
    assert.equal(tipoDoArquivo('logo.HEIC'), 'foto');
    assert.equal(tipoDoArquivo('logo.cdr'), 'corel');
    assert.equal(tipoDoArquivo('logo.DST'), 'bordado');
    assert.equal(tipoDoArquivo('logo.exe'), null);
    assert.equal(tipoDoArquivo('sem-extensao'), null);
});

test('recusa diz o motivo: formato fora da lista ou acima do limite', () => {
    assert.equal(recusaDoArquivo({ name: 'logo.dst', size: 120_000 }), null);
    assert.match(recusaDoArquivo({ name: 'virus.exe', size: 10 })!, /formato/);
    assert.match(recusaDoArquivo({ name: 'enorme.cdr', size: (TAMANHO_MAX_MB_ARQUIVO + 1) * 1024 * 1024 })!, new RegExp(`${TAMANHO_MAX_MB_ARQUIVO} MB`));
});

test('o nome original sobrevive ao caminho do bucket (quem baixa quer logo-silva.dst, não um carimbo)', () => {
    const base = baseComNome('Logo Silva — Peito.DST', '1737_ab12c');
    assert.equal(base, '1737_ab12c--logo-silva-peito');
    assert.equal(nomeParaMostrar(`u1/estampas/e1/${base}.DST`), 'logo-silva-peito.DST');
    // arquivo antigo, sem nome guardado, mostra o que tem
    assert.equal(nomeParaMostrar('u1/clients/c1/1737_ab12c.jpg'), '1737_ab12c.jpg');
});

// ── A lista de arquivos não viaja no formulário ─────────────────────────────
// saveArte grava o objeto do formulário; se `arquivos` fosse junto, salvar a estampa aberta antes
// de um upload apagaria o arquivo novo — o padrão "linha inteira" que já custou dinheiro duas vezes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function saveArteLevaArquivos(fonte: string): boolean {
    // \r? : no Windows o git pode entregar o arquivo em CRLF, e o bloco não seria achado.
    const bloco = /async saveArte\([\s\S]*?\r?\n    }\r?\n/.exec(fonte)?.[0] ?? '';
    if (!bloco) return true; // sem o método, não dá para afirmar nada: reprova
    return !/const \{[^}]*\barquivos\b[^}]*\.\.\.rest \} = arte/.test(bloco);
}

test('saveArte tira `arquivos` do que grava (só definirArquivosDaEstampa muda a lista)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'repositories', 'personalizacaoRepository.ts'), 'utf8');
    assert.equal(saveArteLevaArquivos(fonte), false);
});

test('o detector sabe reprovar', () => {
    const ruim = "    async saveArte(arte) {\n        const { cliente_nome, clients, ...rest } = arte as any;\n    }\n";
    const bom = "    async saveArte(arte) {\n        const { cliente_nome, clients, arquivos, ...rest } = arte as any;\n    }\n";
    assert.equal(saveArteLevaArquivos(ruim), true);
    assert.equal(saveArteLevaArquivos(bom), false);
});
