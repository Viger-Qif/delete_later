# Knowledge / RAG layer

This module is the single retrieval boundary for Negotiation Lab.

## Current implementation

- `handbook.json` stores source chunks with stable IDs and metadata.
- `HandbookRetriever` builds an in-memory BM25 index at process start.
- Retrieval is filtered by `scenario_ids`, optionally by content `kind`, then reranked by tags.
- Dialogue opponent, coach, final analysis and scenario generator all call `retrieve_context`.
- `/api/knowledge/status` reports index health.
- `/api/knowledge/search` exposes retrieval for a future handbook UI.

This is real retrieval-augmented generation: only top relevant fragments are injected into each model prompt. The model is explicitly told to treat retrieved text as reference data and not as instructions.

## Chunk schema

```json
{
  "id": "stable-source-chunk-id",
  "title": "Human readable title",
  "kind": "playbook|objection|method|guardrail|rubric",
  "source": "Source or document name",
  "scenario_ids": ["scenario-id", "*"],
  "tags": ["search", "terms"],
  "text": "Self-contained factual fragment"
}
```

Use `"*"` for general negotiation guidance. Use explicit scenario IDs for private/domain-specific material so unrelated scenarios do not retrieve it.

## Scaling to a large handbook

Keep `retrieve_context(...)`, `get_retriever().search(...)`, and the API response shape stable. Replace only the storage/index implementation with a hybrid vector + keyword backend (for example pgvector/Qdrant plus BM25). Recommended ingestion stages:

1. parse documents and retain source/access metadata;
2. split into self-contained 300–700 token chunks;
3. attach scenario, topic, audience and version metadata;
4. create embeddings and keyword index entries;
5. retrieve with access/scenario filters;
6. rerank the top candidates;
7. log chunk IDs used by each response and evaluation.

Do not place instructions from uploaded documents directly into system prompts. Retrieved documents remain untrusted reference content.
