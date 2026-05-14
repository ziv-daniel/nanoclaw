import type { MediaKind } from './types.js';

/**
 * Channel adapters render attachments into the formatted message body
 * as bracketed tags like `[Image: …]`, `[Video: …]`, `[Voice: …]`,
 * `[Document: …]`, `[File: …]`, `[Audio: …]`. We text-match on those.
 *
 * When multiple kinds are present in a batch, the strongest one wins:
 * video > image > document > audio. Rationale:
 *   - video: screen recordings, debugging — needs deepest analysis
 *   - image: charts, screenshots — vision-heavy
 *   - document: PDFs, long files — long-context, not vision
 *   - audio/voice: usually a transcript already exists in text
 */
const MEDIA_RE = /\[(image|video|voice|audio|document|file)\b/gi;

const PRIORITY: Record<string, { kind: MediaKind; pri: number }> = {
  video: { kind: 'video', pri: 4 },
  image: { kind: 'image', pri: 3 },
  document: { kind: 'document', pri: 2 },
  file: { kind: 'document', pri: 2 },
  voice: { kind: 'audio', pri: 1 },
  audio: { kind: 'audio', pri: 1 },
};

export function detectMediaKind(messages: Array<{ content: string }>): MediaKind | null {
  let best: { kind: MediaKind; pri: number } | null = null;
  for (const m of messages) {
    const matches = m.content.matchAll(MEDIA_RE);
    for (const match of matches) {
      const tag = match[1].toLowerCase();
      const entry = PRIORITY[tag];
      if (!entry) continue;
      if (!best || entry.pri > best.pri) best = entry;
    }
  }
  return best?.kind ?? null;
}
