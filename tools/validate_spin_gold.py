"""Validate provisional SPIN examples against the current transparent checker.

This is a regression fixture, not a replacement for human labels. The file is
explicitly marked provisional so the team can replace cases after real usage.
"""
from __future__ import annotations
import json
from pathlib import Path
from app.api.learning import _assessment_label, _exercise_map, _match_criteria

ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / 'backend' / 'app' / 'knowledge' / 'spin_synthetic_gold.json'

def main() -> int:
    cases = json.loads(CASES.read_text(encoding='utf-8'))
    exercises = _exercise_map()
    assert cases and all(item.get('provisional') is True for item in cases)
    failures=[]
    for case in cases:
        exercise=exercises[case['exercise_id']]
        checks=_match_criteria(exercise,case['answer'])
        score=sum(x['weight'] for x in checks if x['passed'])
        max_score=sum(x['weight'] for x in checks)
        label=_assessment_label(score,max_score)
        # Strong examples must remain strong. Weak fixtures must not become strong.
        if case['expected_label']=='strong' and label!='strong': failures.append((case['id'],label))
        if case['expected_label']=='needs_focus' and label=='strong': failures.append((case['id'],label))
    assert not failures, failures
    print(f'spin synthetic gold validation passed: {len(cases)} provisional cases')
    return 0
if __name__ == '__main__':
    raise SystemExit(main())
