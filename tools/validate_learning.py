"""Dependency-free validation for learning content and evidence calibration fixtures."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE = ROOT / "backend" / "app" / "knowledge"


def main() -> int:
    learning = json.loads((KNOWLEDGE / "learning.json").read_text(encoding="utf-8"))
    gold = json.loads((KNOWLEDGE / "evidence_gold.json").read_text(encoding="utf-8"))
    exercise_ids = {item["id"] for item in learning["exercises"]}
    assert len(exercise_ids) == len(learning["exercises"])
    assert learning["mini_dialogues"], "mini_dialogues must not be empty"
    for item in learning["exercises"]:
        assert item["rubric"], item["id"]
        assert item["method_id"] == "spin", item["id"]
    gold_ids = {item["id"] for item in gold}
    assert len(gold_ids) == len(gold)
    for case in gold:
        turns = case["user_turns"]
        for evidence in case.get("expected_evidence", []):
            index = evidence["turn_index"] - 1
            assert 0 <= index < len(turns), case["id"]
            assert evidence["quote"] in turns[index], case["id"]
            assert evidence["skill_id"].startswith("spin."), case["id"]
    print(f"learning validation passed: {len(learning['exercises'])} exercises, {len(gold)} gold cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())