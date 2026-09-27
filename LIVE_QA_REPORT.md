# Live QA: chat, Fidelina and custom scenarios

The one-time cloud token was used only in a temporary `.env`. The previous
environment file was restored after the run, and the token is not included in
the repository or release archive.

## Results

- Built-in scenario catalog: passed.
- Cloud text chat: passed; two consecutive turns persisted with complete
  history and without expert fallback.
- Empty-dialogue advice: correctly blocked with `409` until the learner sends
  the first message.
- Fidelina in the salary scenario: passed.
- Fidelina in the second built-in scenario: passed.
- Hidden RAG policy: passed; hints exposed no chunk IDs or RAG metadata.
- Long Fidelina response: the complete 405-character response reached the
  client. The large modal and compact bubble both have bounded height and
  independent vertical scrolling.
- Custom scenario generation: initially exposed two defects:
  1. a truncated/invalid cloud JSON response;
  2. a structurally valid but generic conflict graph for an industrial pilot.
- After repair, the final custom-scenario cycle passed 9/9: generation,
  contextual map, graph validation, update, publication, session start, cloud
  chat, Fidelina and cleanup.

## Repairs made

- Scenario generation receives a 6000-token output budget instead of the
  generic 3000-token smart-task budget.
- A failed cloud JSON/graph receives one retry with the complete original
  description.
- Industrial-pilot descriptions are checked for contextual visible node
  labels. Generic base maps are rejected.
- The expert fallback has a dedicated pilot path with production conditions,
  downtime and implementation risks, safe-pilot criteria, pilot boundaries,
  owners and a stop point.
- The compact Fidelina bubble now scrolls independently instead of clipping
  long advice.

## Final automated checks

- Backend: 34 tests passed.
- Learning catalog: 19 exercises and 5 gold cases valid.
- Synthetic SPIN set: 25 cases valid.
- Internal RAG: Recall@3 = 1.0, Recall@5 = 1.0.

The shared visual browser could not reach the sandbox-local server because the
browser and workspace use isolated networks. Functional cloud checks therefore
ran against the live local API, while clipping protection was verified against
the complete returned text and the actual desktop/mobile scroll rules.