"""Small production-shaped RAG layer backed by a bundled negotiation handbook.

The public interface is intentionally independent of storage. The JSON/BM25 index can later
be replaced by pgvector, Qdrant, Elasticsearch or another vector/hybrid retriever without
changing dialogue, coach, analysis or API code.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

TOKEN_RE = re.compile(r"[a-zа-яё0-9%]+", re.IGNORECASE)
TOKEN_ALIASES = {
    "бюджета": "бюджет",
    "бюджету": "бюджет",
    "бюджетом": "бюджет",
    "варианты": "вариант",
    "вариантов": "вариант",
    "предложить": "предлаг",
    "предложите": "предлаг",
}
STOPWORDS = {
    "и", "в", "во", "на", "с", "со", "к", "по", "за", "из", "для", "что", "это", "как", "а", "но",
    "или", "не", "мы", "я", "вы", "он", "она", "они", "у", "о", "об", "при", "до", "бы", "же", "то",
    "the", "a", "an", "and", "or", "to", "of", "for", "in", "on",
}


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    title: str
    text: str
    kind: str
    source: str
    scenario_ids: tuple[str, ...]
    tags: tuple[str, ...]
    method_id: str = ""
    summary: str = ""
    steps: tuple[str, ...] = ()
    phrases: tuple[str, ...] = ()
    antipatterns: tuple[str, ...] = ()
    checks: tuple[str, ...] = ()
    stage: str = ""
    level: str = "basic"
    related_ids: tuple[str, ...] = ()
    source_ref: object = ""
    lang: str = "ru"
    version: str = ""


@dataclass(frozen=True)
class SearchHit:
    chunk: KnowledgeChunk
    score: float
    matched_terms: tuple[str, ...]

    def as_dict(self) -> dict:
        return {
            "id": self.chunk.id,
            "title": self.chunk.title,
            "text": self.chunk.text,
            "kind": self.chunk.kind,
            "source": self.chunk.source,
            "tags": list(self.chunk.tags),
            "method_id": self.chunk.method_id,
            "summary": self.chunk.summary,
            "steps": list(self.chunk.steps),
            "phrases": list(self.chunk.phrases),
            "antipatterns": list(self.chunk.antipatterns),
            "checks": list(self.chunk.checks),
            "stage": self.chunk.stage,
            "level": self.chunk.level,
            "related_ids": list(self.chunk.related_ids),
            "source_ref": self.chunk.source_ref,
            "lang": self.chunk.lang,
            "version": self.chunk.version,
            "score": round(self.score, 4),
            "matched_terms": list(self.matched_terms),
        }


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in TOKEN_RE.findall(text or ""):
        token = TOKEN_ALIASES.get(token.lower(), token.lower())
        if token not in STOPWORDS and len(token) > 1:
            tokens.append(token)
    return tokens


class HandbookRetriever:
    def __init__(self, chunks: Iterable[KnowledgeChunk]):
        self.chunks = list(chunks)
        self._tokens: list[list[str]] = [
            tokenize(" ".join((
                c.title,
                c.text,
                c.summary,
                c.method_id,
                c.stage,
                " ".join(c.tags),
                " ".join(c.steps),
                " ".join(c.phrases),
                " ".join(c.antipatterns),
                " ".join(c.checks),
            )))
            for c in self.chunks
        ]
        self._term_freqs: list[dict[str, int]] = []
        document_frequency: dict[str, int] = {}
        for tokens in self._tokens:
            frequencies: dict[str, int] = {}
            for token in tokens:
                frequencies[token] = frequencies.get(token, 0) + 1
            self._term_freqs.append(frequencies)
            for token in frequencies:
                document_frequency[token] = document_frequency.get(token, 0) + 1
        count = max(1, len(self.chunks))
        self._idf = {term: math.log(1 + (count - freq + 0.5) / (freq + 0.5)) for term, freq in document_frequency.items()}
        self._avg_len = sum(len(tokens) for tokens in self._tokens) / count

    def search(
        self,
        query: str,
        *,
        scenario_id: str | None = None,
        stage: str = "",
        kinds: set[str] | None = None,
        limit: int = 4,
    ) -> list[SearchHit]:
        query_tokens = tokenize(f"{query} {stage}")
        if not query_tokens:
            query_tokens = ["переговоры"]
        unique_query = set(query_tokens)
        hits: list[SearchHit] = []
        k1, b = 1.45, 0.72
        for index, chunk in enumerate(self.chunks):
            if kinds and chunk.kind not in kinds:
                continue
            if scenario_id and scenario_id not in chunk.scenario_ids and "*" not in chunk.scenario_ids:
                continue
            tf = self._term_freqs[index]
            doc_len = max(1, len(self._tokens[index]))
            score = 0.0
            for term in unique_query:
                freq = tf.get(term, 0)
                if not freq:
                    continue
                denominator = freq + k1 * (1 - b + b * doc_len / max(1, self._avg_len))
                score += self._idf.get(term, 0.0) * (freq * (k1 + 1) / denominator)
            tag_tokens = set(tokenize(" ".join(chunk.tags)))
            score += len(unique_query & tag_tokens) * 0.9
            # A scenario match is a reranking boost, never a substitute for semantic/lexical relevance.
            if score <= 0:
                continue
            if scenario_id and scenario_id in chunk.scenario_ids:
                score += 0.35
            hits.append(SearchHit(chunk, score, tuple(sorted(unique_query & set(tf)))))
        hits.sort(key=lambda hit: (-hit.score, hit.chunk.id))
        return hits[: max(1, min(limit, 10))]

    def get(self, chunk_id: str) -> KnowledgeChunk | None:
        return next((chunk for chunk in self.chunks if chunk.id == chunk_id), None)

    def list_chunks(
        self,
        *,
        query: str = "",
        method_id: str | None = None,
        kind: str | None = None,
    ) -> list[KnowledgeChunk]:
        rows = self.chunks
        if kind:
            rows = [row for row in rows if row.kind == kind]
        if method_id:
            rows = [row for row in rows if getattr(row, "method_id", "") == method_id]
        if query:
            needle = tokenize(query)
            rows = [
                row for row in rows
                if set(needle) & set(tokenize(f"{row.title} {row.text} {' '.join(row.tags)} {row.summary} {' '.join(row.steps)}"))
            ]
        return rows

    def status(self) -> dict:
        return {
            "enabled": True,
            "engine": "bm25+llm-grounded",
            "llm_grounding": "optional-per-stage",
            "active_method": "spin",
            "chunks": len(self.chunks),
            "sources": len({chunk.source for chunk in self.chunks}),
            "kinds": sorted({chunk.kind for chunk in self.chunks}),
        }


def _load_chunks() -> list[KnowledgeChunk]:
    path = Path(__file__).with_name("handbook.json")
    rows = json.loads(path.read_text(encoding="utf-8"))
    def normalized_stage(value) -> str:
        if isinstance(value, list):
            return ", ".join(str(item) for item in value)
        return str(value or "")

    return [KnowledgeChunk(
        id=str(row["id"]), title=str(row["title"]), text=str(row["text"]),
        kind=str(row.get("kind", "reference")), source=str(row.get("source", "handbook")),
        scenario_ids=tuple(str(x) for x in row.get("scenario_ids", ["*"])),
        tags=tuple(str(x) for x in row.get("tags", [])),
        method_id=str(row.get("method_id", "")),
        summary=str(row.get("summary", "")),
        steps=tuple(str(x) for x in row.get("steps", [])),
        phrases=tuple(str(x) for x in row.get("phrases", [])),
        antipatterns=tuple(str(x) for x in row.get("antipatterns", [])),
        checks=tuple(str(x) for x in row.get("checks", [])),
        stage=normalized_stage(row.get("stage", "")),
        level=str(row.get("level", "basic")),
        related_ids=tuple(str(x) for x in row.get("related_ids", [])),
        source_ref=row.get("source_ref", ""),
        lang=str(row.get("lang", "ru")),
        version=str(row.get("version", "")),
    ) for row in rows]


@lru_cache(maxsize=1)
def get_retriever() -> HandbookRetriever:
    return HandbookRetriever(_load_chunks())


@lru_cache(maxsize=1)
def get_drills() -> list[dict]:
    path = Path(__file__).with_name("drills.json")
    if not path.exists():
        return []
    rows = json.loads(path.read_text(encoding="utf-8"))
    return [row for row in rows if isinstance(row, dict)]


def retrieve_context(
    query: str,
    *,
    scenario_id: str | None = None,
    stage: str = "",
    kinds: set[str] | None = None,
    limit: int = 4,
    max_chars: int = 2600,
    include_ids: Iterable[str] = (),
) -> str:
    hits = get_retriever().search(query, scenario_id=scenario_id, stage=stage, kinds=kinds, limit=limit)
    blocks = []
    used = 0
    selected_ids = {str(item) for item in include_ids}
    explicit = [get_retriever().get(item) for item in selected_ids]
    explicit = [chunk for chunk in explicit if chunk is not None]
    ordered = explicit + [hit.chunk for hit in hits if hit.chunk.id not in selected_ids]
    for chunk in ordered:
        metadata = []
        if chunk.method_id:
            metadata.append(f"метод={chunk.method_id}")
        if chunk.stage:
            metadata.append(f"этап={chunk.stage}")
        if chunk.level:
            metadata.append(f"уровень={chunk.level}")
        header = f"[{chunk.id}] {chunk.title}"
        if metadata:
            header += " (" + "; ".join(metadata) + ")"
        block = f"{header}: {chunk.summary + ' ' if chunk.summary else ''}{chunk.text}"
        if chunk.steps:
            block += " Шаги: " + " ".join(chunk.steps[:4])
        if chunk.source_ref:
            source = chunk.source_ref.get("doc", "") if isinstance(chunk.source_ref, dict) else str(chunk.source_ref)
            locator = chunk.source_ref.get("locator", "") if isinstance(chunk.source_ref, dict) else ""
            block += f" Источник: {source}{f' / {locator}' if locator else ''}."
        if blocks and used + len(block) > max_chars:
            break
        blocks.append(block)
        used += len(block)
    return "\n".join(blocks)
