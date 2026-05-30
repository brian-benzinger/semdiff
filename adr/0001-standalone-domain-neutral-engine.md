# 0001. Standalone, domain-neutral engine separate from any application

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

`semdiff` was conceived as the change-detection engine behind a
sustainability-regulation tracker (the `sust-reg-reporter` application). That
application needs to know, when an authoritative source republishes a
regulation, whether the *substance* changed — a new threshold, a shifted
deadline, an added exemption — and not merely that bytes moved.

There are two ways to package that capability:

1. **Embed it** inside the application as a private module, tuned to regulatory
   text and coupled to the application's data model, bitemporal corpus, and
   ingestion pipeline.
2. **Extract it** as an independent library and CLI with no backend and no
   domain assumptions, which the application then depends on like any other
   package.

The capability — surface substantive prose changes, ignore cosmetic ones — is
not specific to regulations. It applies to contracts, policies, terms of
service, and documentation. The market for a generic semantic-diff tool is open;
the market for emissions calculators and bespoke regulatory scrapers is
saturated. A reusable engine is also a cleaner, more credible artifact than a
module buried in an application.

The constraint pulling the other way: more repos and cross-repo version juggling
are real overhead for a solo developer. Two repositories is the deliberate
ceiling.

## Decision

`semdiff` is a **standalone, domain-neutral library and CLI**. It lives in its
own repository, has **no backend**, makes **no assumptions about regulations**,
and carries a **domain-neutral name** so it reads as a general-purpose tool.

The downstream application (`sust-reg-reporter`) depends on `semdiff` as a
published package and owns everything domain-specific: the corpus, the
bitemporal model, ingestion, applicability logic, the API, and the web app.
`semdiff` never reaches back into the application.

The boundary is concrete:

- **In scope for semdiff:** take two text inputs, segment them, align them,
  classify the changes as substantive or cosmetic, and emit a structured diff.
- **Out of scope for semdiff:** fetching or scraping sources, storage,
  snapshotting, scheduling, bitemporal modeling, applicability rules, legal
  interpretation, anything regulation-specific.

Any domain tuning the application needs (e.g. a regulatory-aware prompt or a
glossary of legal terms of art) is supplied to `semdiff` as **configuration and
data passed in by the caller**, not baked into the engine.

## Consequences

**Easier**
- `semdiff` is independently testable, versionable, and adoptable by developers
  who have nothing to do with sustainability regulation.
- The application's dependency on diffing is an explicit, semver-bounded package
  edge rather than an implicit internal coupling.
- The engine's quality bar is set by a general audience, which keeps it honest.

**Harder**
- We carry a package boundary and its versioning discipline (changelog, semver,
  release) even while there is a single consumer.
- Domain knowledge that *would* improve regulatory diffs cannot be hardcoded; it
  must flow in through the public configuration surface, which we must design
  to be expressive enough (see [0004](0004-llm-classification-and-deterministic-gating.md)
  and [0006](0006-structured-diff-output-schema.md)).

## Alternatives considered

- **Embed in the application.** Rejected: couples a broadly useful capability to
  one domain, forecloses external adoption, and produces a less credible
  artifact. The coupling buys short-term convenience at the cost of the engine's
  reach.
- **Split further (separate library, CLI, and provider adapters into three+
  repos).** Rejected: cross-repo version juggling is pure overhead for a solo
  developer and signals nothing. Two repos total is the deliberate target; a
  third is justified only if the *ingestion* framework later proves reusable.
