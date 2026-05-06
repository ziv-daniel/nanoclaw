---
name: n8n-supabase
description: Complete n8n integration with Supabase for database operations and AI/RAG workflows. Use when building n8n workflows that connect to Supabase for CRUD operations, vector embeddings, semantic search, RAG pipelines, AI agents with retrieval tools, or any Supabase database automation. Covers both the standard Supabase node and the Supabase Vector Store node, including credentials setup, pgvector configuration, filter syntax, metadata queries, and common pitfalls like RLS empty results and dimension mismatches.
---

# n8n Supabase Integration Skill

n8n provides two dedicated Supabase nodes: the **Supabase node** for CRUD operations and the **Supabase Vector Store node** for AI/RAG workflows. This skill covers configuration, operations, and integration patterns.

## Quick Decision: Which Node to Use

| Need | Node | Notes |
|------|------|-------|
| Insert/Update/Delete rows | Supabase node | Simple CRUD via REST API |
| Read with filters | Supabase node | PostgREST filter syntax |
| Store embeddings | Vector Store node | Requires pgvector setup |
| Semantic search / RAG | Vector Store node | Similarity search via match function |
| Complex SQL / JOINs | PostgreSQL node | Direct DB connection |
| Upsert (INSERT ON CONFLICT) | PostgreSQL node | Not supported in Supabase node |
| RPC / Storage / Auth | HTTP Request node | Use Supabase credentials |

## Critical Setup Requirements

### Credentials (applies to both nodes)
- **Host**: `https://[PROJECT].supabase.co` (no trailing slash)
- **Service Role Key**: From Project Settings → API → `service_role` key
- ⚠️ **Never use anon key** in n8n—RLS blocks access, returning empty results with no error

### For Vector Store (AI workflows)
Before using, run this SQL in Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  content text,
  metadata jsonb,
  embedding vector(1536)  -- Match your embedding model
);

CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (id bigint, content text, metadata jsonb, embedding jsonb, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.content, d.metadata,
    (d.embedding::text)::jsonb as embedding,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM documents d
  WHERE d.metadata @> filter
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

## Reference Files

Read these based on the task:

| Reference | When to Read |
|-----------|--------------|
| [references/supabase-node.md](references/supabase-node.md) | CRUD operations, filter syntax, all parameters for Create/Read/Update/Delete |
| [references/vector-store-node.md](references/vector-store-node.md) | AI operations, embedding insertion, semantic search, agent tools |
| [references/credentials.md](references/credentials.md) | Service role vs anon key, PostgreSQL direct connection, pooler setup |
| [references/database-setup.md](references/database-setup.md) | pgvector setup, table schemas, match functions, indexing strategies |
| [references/pitfalls.md](references/pitfalls.md) | RLS empty results, dimension mismatches, known bugs, error decoding |
| [references/ai-workflows.md](references/ai-workflows.md) | RAG pipeline patterns, AI agent integration, chat memory setup |
| [references/examples.md](references/examples.md) | Complete workflow examples, filter expressions, metadata queries |

## Common Patterns

### Basic CRUD Flow
```
[Trigger] → [Supabase: Get All with filter] → [Process] → [Supabase: Update]
```

### RAG Ingestion Flow
```
[File Trigger] → [Document Loader] → [Text Splitter] → 
[Embeddings Model] → [Supabase Vector Store: Insert]
```

### RAG Retrieval Flow
```
[Chat Trigger] → [AI Agent] → [Vector Store Tool: Supabase] → 
                            → [Embeddings Model]
                            → [Chat Model]
```

## Debug Workflow

1. **Empty results?** → Check if using `service_role` key (not `anon`)
2. **Vector errors?** → Verify embedding dimensions match table column
3. **Filter not working?** → Test same query via PostgreSQL node
4. **Metadata filter ignored?** → Known bug #21271, use function parameter instead

## Embedding Dimensions Reference

| Model | Dimensions |
|-------|------------|
| OpenAI text-embedding-3-small | 1536 |
| OpenAI text-embedding-3-large | 3072 |
| OpenAI text-embedding-ada-002 | 1536 |
| Google Gemini Embedding | 768 |
| Ollama nomic-embed-text | 768 |
