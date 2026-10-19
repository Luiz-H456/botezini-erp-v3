export function parseBRL(value: string | number | null | undefined): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (!value) return 0;

    const cleaned = value.trim().replace(/[^\d,.-]/g, '');
    if (!cleaned) return 0;

    // "1.000" e "2.500" (ponto com grupos de 3 e sem vírgula) são milhar no Brasil.
    // "0.500" e "1.5" continuam decimais: grupo começando em 0, ou de 1–2 dígitos, não é milhar.
    if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''));

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';

    const normalized = decimalSeparator === ','
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
