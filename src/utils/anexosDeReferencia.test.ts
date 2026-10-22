import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ehPdf, ehImagem, somenteImagens, nomeDaPagina, paginasDoPdf, removerComPaginas, paginasAConverter,
    MAX_PAGINAS_PDF,
} from './anexosDeReferencia.ts';

const base = 'u1/budgets/orc1/1729_ab12c';
const pdf = `${base}.pdf`;
const p1 = `${base}_p01.jpg`;
const p2 = `${base}_p02.jpg`;
const foto = 'u1/budgets/orc1/1700_zz99x.png';

test('reconhece PDF e imagem pela extensao, sem diferenciar maiusculas', () => {
    assert.equal(ehPdf(pdf), true);
    assert.equal(ehPdf('x/ARTE.PDF'), true);
    assert.equal(ehPdf(foto), false);
    for (const c of [p1, foto, 'a.jpeg', 'a.webp', 'a.HEIC']) assert.equal(ehImagem(c), true, c);
    assert.equal(ehImagem(pdf), false);
});

test('somente as imagens entram no PDF do orcamento e na ficha: o PDF original fica de fora, as paginas entram', () => {
    assert.deepEqual(somenteImagens([foto, pdf, p1, p2]), [foto, p1, p2]);
});

test('nome da pagina: base do PDF + _p e dois digitos (ordena certo ate 99)', () => {
    assert.equal(nomeDaPagina('1729_ab12c', 1), '1729_ab12c_p01');
    assert.equal(nomeDaPagina('1729_ab12c', 12), '1729_ab12c_p12');
});

test('paginas de um PDF: so as dele, nunca as de outro PDF com nome parecido', () => {
    const outro = `${base}9.pdf`, outraPagina = `${base}9_p01.jpg`;
    assert.deepEqual(paginasDoPdf(pdf, [foto, pdf, p1, p2, outro, outraPagina]), [p1, p2]);
    assert.deepEqual(paginasDoPdf(foto, [foto, p1]), []);
});

test('remover o PDF leva as paginas junto; remover uma pagina tira so ela', () => {
    const lista = [foto, pdf, p1, p2];
    assert.deepEqual(removerComPaginas(lista, 1), { nova: [foto], removidos: [pdf, p1, p2] });
    assert.deepEqual(removerComPaginas(lista, 2), { nova: [foto, pdf, p2], removidos: [p1] });
    assert.deepEqual(removerComPaginas(lista, 9), { nova: lista, removidos: [] });
});

test('PDF longo converte so as primeiras paginas e diz quantas ficaram de fora', () => {
    assert.deepEqual(paginasAConverter(3), { converter: 3, deFora: 0 });
    assert.deepEqual(paginasAConverter(MAX_PAGINAS_PDF + 5), { converter: MAX_PAGINAS_PDF, deFora: 5 });
    assert.deepEqual(paginasAConverter(0), { converter: 0, deFora: 0 });
});
