/**
 * A grade de tamanhos digitada numa linha só: "P 10, M 20, G 15".
 * Cada tamanho continua sendo uma linha do orçamento — isto só poupa a digitação.
 */
export type ResultadoDaGrade =
    | { ok: true; tamanhos: { size: string; quantity: number }[] }
    | { ok: false; erro: string };

// Letras: "P10", "P 10", "P:10", "P=10". Números exigem separador, senão "364" seria 36 × 4 ou 3 × 64.
const LETRAS = /^([A-Za-z]{1,4})\s*[:=]?\s*(\d+)$/;
const NUMERO = /^(\d{1,3})\s*(?:[:=]|\s)\s*(\d+)$/;

export function lerGrade(texto: string): ResultadoDaGrade {
    const partes = (texto || '').split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    if (partes.length === 0) return { ok: false, erro: 'Digite a grade, ex.: P 10, M 20, G 15' };
    const tamanhos: { size: string; quantity: number }[] = [];
    for (const parte of partes) {
        const m = parte.match(LETRAS) || parte.match(NUMERO);
        if (!m) return { ok: false, erro: `Não entendi "${parte}"` };
        const size = m[1].toUpperCase();
        const quantity = Number(m[2]);
        if (tamanhos.some(t => t.size === size)) return { ok: false, erro: `Tamanho repetido: ${size}` };
        if (quantity <= 0) return { ok: false, erro: `Quantidade zero em ${size}` };
        tamanhos.push({ size, quantity });
    }
    return { ok: true, tamanhos };
}
