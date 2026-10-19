/**
 * Deterministic hue from string, used for avatar colors.
 */
export function stringToColor(s: string): string {
    const hue = [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
    return `hsl(${hue}, 65%, 38%)`;
}

/**
 * First letters of the first 2 words, used for avatar initials.
 */
export function initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
