const QDRANT_URL = process.env.QDRANT_URL ?? 'http://172.17.0.1:6333';
const COLLECTION = 'memories';
const VECTOR_SIZE = 4;

export interface QdrantMemory {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}

let collectionReady = false;

async function ensureCollection(): Promise<void> {
  if (collectionReady) return;
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (r.status === 404) {
      await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: 'Cosine' } }),
        signal: AbortSignal.timeout(3000),
      });
    }
    collectionReady = true;
  } catch (e) {
    console.error('[qdrant] ensureCollection failed:', e);
  }
}

function randomVector(): number[] {
  return Array.from({ length: VECTOR_SIZE }, () => Math.random() * 2 - 1);
}

export async function fetchRelevantMemories(query: string, limit = 5): Promise<QdrantMemory[]> {
  try {
    await ensureCollection();
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3);

    const body: Record<string, unknown> = { limit, with_payload: true, with_vectors: false };
    if (words.length > 0) {
      body.filter = {
        should: words.map(word => ({ key: 'text', match: { text: word } })),
      };
    }

    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (!r.ok) return [];
    const data = await r.json() as { result?: { points?: Array<{ id: string | number; payload?: Record<string, unknown> }> } };
    return (data.result?.points ?? [])
      .map(p => ({
        id: String(p.id),
        score: 1,
        text: String(p.payload?.text ?? ''),
        metadata: p.payload ?? {},
      }))
      .filter(m => m.text.length > 0);
  } catch (e) {
    console.error('[qdrant] fetchRelevantMemories failed:', e);
    return [];
  }
}

export async function storeMemory(text: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    await ensureCollection();
    await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/upsert`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id: crypto.randomUUID(),
          vector: randomVector(),
          payload: { text, created_at: new Date().toISOString(), ...metadata },
        }],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // fire-and-forget — swallow all errors
  }
}
