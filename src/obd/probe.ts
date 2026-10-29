const WAKE_TIMEOUT_MS = 300;
const PROBE_TIMEOUT_MS = 900;

export type ProbeRead = (ms: number, done: (text: string) => boolean) => Promise<string>;

export function hexId(n: number | undefined): string {
    return n === undefined ? '?' : `0x${n.toString(16).padStart(4, '0')}`;
}

// Texte lisible pour le journal, avec les octets bruts quand ce n'est pas du texte (mauvaise vitesse, parasites).
export function describeAnswer(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '(rien)';
    if (!/[^\x20-\x7e\r\n\t]/.test(text)) return trimmed;
    const bytes = Array.from(new TextEncoder().encode(text).slice(0, 48), (b) => b.toString(16).padStart(2, '0'));
    return `${trimmed} [hex ${bytes.join(' ')}]`;
}

export function isElmAnswer(text: string): boolean {
    return /(ELM|STN|OBD)[\s\S]*>/i.test(text);
}

/**
 * Le premier \r vide ce qui traîne dans le tampon de l'adaptateur (il répond souvent « ? » et un prompt).
 * On attend ce prompt avant d'envoyer ATI, sinon on prendrait le « > » du réveil pour la réponse.
 */
export async function probeElm(send: (text: string) => Promise<unknown>, read: ProbeRead): Promise<{ ok: boolean; answer: string }> {
    await send('\r');
    let answer = await read(WAKE_TIMEOUT_MS, (text) => text.includes('>'));
    for (let attempt = 0; attempt < 2; attempt++) {
        await send('ATI\r');
        const reply = await read(PROBE_TIMEOUT_MS, isElmAnswer);
        answer += reply;
        if (isElmAnswer(reply)) return { ok: true, answer };
        if (!reply.includes('>')) break;
    }
    return { ok: false, answer };
}
