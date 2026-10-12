export interface LogEntry {
    time: number;
    direction: '>' | '<' | '!';
    text: string;
}

const MAX_ENTRIES = 5000;

const entries: LogEntry[] = [];

export function logLine(direction: LogEntry['direction'], text: string): void {
    entries.push({ time: Date.now(), direction, text: text.replace(/\r/g, '\\r').replace(/\n/g, '\\n') });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export function logSize(): number {
    return entries.length;
}

export function exportLog(context: Record<string, string>): string {
    const start = entries[0]?.time ?? Date.now();
    const header = Object.entries(context).map(([k, v]) => `# ${k}: ${v}`);
    const lines = entries.map((e) => `${((e.time - start) / 1000).toFixed(3).padStart(9)} ${e.direction} ${e.text}`);
    return [...header, '', ...lines].join('\n');
}

export function clearLog(): void {
    entries.length = 0;
}
