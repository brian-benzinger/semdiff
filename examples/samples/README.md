# semdiff sample payloads

Two before/after pairs for trying the engine end to end.

## `policy.*` — exercises the model (needs `ANTHROPIC_API_KEY`)

A short commerce/terms-of-service blurb edited so the aligner produces a mix of
paths:

| Sentence | before → after | Expected |
| --- | --- | --- |
| Free shipping threshold | `$50` → `$100` | **substantive** (model call) |
| Refund window | `30 days` → `14 days` | **substantive** (model call) |
| Early access scope | `All members` → `Premium members` | **substantive** (model call) |
| Inactivity clause | unchanged | unchanged (no call) |
| Gift cards sentence | added in `after` | **substantive** insertion (local) |
| Welcome / contact lines | unchanged | unchanged (no call) |

So this run makes roughly **3 model calls** (the three reworded sentences) and
classifies the insertion and unchanged lines locally.

```sh
export ANTHROPIC_API_KEY=sk-ant-...
node src/cli.ts examples/samples/policy.before.txt examples/samples/policy.after.txt
```

## `cosmetic.*` — proves gating (needs NO key)

Differs only by casing and punctuation, plus one identical sentence. Every pair
resolves to `unchanged` or `trivial-change`, so **no model is called** and it
runs with no API key — the determinism/gating guarantee (ADR-0003/0004) in
action.

```sh
node src/cli.ts examples/samples/cosmetic.before.txt examples/samples/cosmetic.after.txt
```
