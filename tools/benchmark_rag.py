"""Run the small SPIN retrieval benchmark without external services."""
from __future__ import annotations

import json
from pathlib import Path

from app.knowledge import get_retriever


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    cases = json.loads(
        (ROOT / "backend" / "app" / "knowledge" / "rag_gold.json").read_text(encoding="utf-8")
    )
    retriever = get_retriever()
    results = []
    for case in cases:
        hits = retriever.search(case["query"], stage=case.get("stage", ""), limit=5)
        found = [hit.chunk.id for hit in hits]
        expected = set(case["expected_ids"])
        results.append({
            "id": case["id"],
            "top": found,
            "hit_at_3": bool(expected & set(found[:3])),
            "hit_at_5": bool(expected & set(found[:5])),
        })
    recall3 = sum(item["hit_at_3"] for item in results) / len(results)
    recall5 = sum(item["hit_at_5"] for item in results) / len(results)
    print(json.dumps({
        "queries": len(results),
        "recall_at_3": round(recall3, 3),
        "recall_at_5": round(recall5, 3),
        "results": results,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())