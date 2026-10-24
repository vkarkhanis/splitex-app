---
name: traxettle-kb
description: >-
  Locate and use the Traxettle knowledgebase — the one-stop reference for this repo covering
  functionality, workflows, architecture, data model, API, environments, builds, deployment,
  testing and known issues. Invoke this at the start of ANY task in this repository before
  exploring the codebase.
---

# Traxettle Knowledgebase (external)

This repository has a dedicated, curated knowledgebase that lives **outside** the repo:

```
/Users/vkarkhanis/workspace/Knowledgebase/Traxettle
```

**Read it before walking the codebase.** It was written precisely so routine questions cost
one or two file reads instead of an exploration.

## Do this first

1. Read `/Users/vkarkhanis/workspace/Knowledgebase/Traxettle/INDEX.md` — it maps questions to
   documents.
2. Read the one or two documents it points at.
3. Only then open source code, starting from the paths the knowledgebase cites.

## Structure

| Directory | Covers |
|---|---|
| `01-product/` | What the app does, glossary, capability matrix, user journeys, money pooling, plans & billing |
| `02-architecture/` | System architecture, data model, full API reference, pooling engine, web & mobile code maps, shared libraries, auth & security, realtime |
| `03-operations/` | Environments, local development, **staging verification guide**, **test scenarios**, build & release, deployment, testing & QA, troubleshooting |
| `04-engineering/` | Conventions, change playbooks ("I need to add X" → files in order), known issues & technical debt |

The full skill, with the answering protocol and the non-negotiable domain facts, is at:

```
/Users/vkarkhanis/workspace/Knowledgebase/Traxettle/.devin/skills/traxettle-kb/SKILL.md
```

Read that file and follow it.

## Before you change anything

- `04-engineering/01-change-playbooks.md` — the files to touch, in order, for the kind of
  change you are making.
- `04-engineering/00-conventions.md` — the patterns this codebase actually uses.
- `04-engineering/02-known-issues-and-debt.md` — so you neither re-break a deliberate
  trade-off nor get blamed for a pre-existing failure (notably: **two mobile unit tests fail
  on `main` already**).

## After you change anything

Check whether the knowledgebase went stale, and refresh it if so:

```bash
node /Users/vkarkhanis/workspace/Knowledgebase/Traxettle/.devin/skills/traxettle-kb-refresh/scripts/check-staleness.mjs
```

Exit `0` fresh, `1` stale. For the refresh workflow, read
`/Users/vkarkhanis/workspace/Knowledgebase/Traxettle/.devin/skills/traxettle-kb-refresh/SKILL.md`.

## Facts worth knowing immediately

- The active monorepo is `traxettle-rush/`; the in-repo docs are `traxettle-app/docs/`.
- Node must be **≥24.11.1 and <25** (pinned by `rush.json`).
- Web and mobile consume `@traxettle/shared` from its built `dist/` — **rebuild it after any
  change to `libraries/shared`**, or your change will appear to do nothing:
  `node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui`
- Every money-pooling field is **optional**, and an **absent** field always means today's
  peer-to-peer behaviour. Never backfill `fundingModel` or `fundingSource`.
- All pool amounts are **integer minor units**, always suffixed `Minor`.
- The **deployed staging API does not have money pooling** on this branch; `/api/pools/*`
  returns 404 there. To test pooling against staging data, run the API locally against the
  `traxettle-staging` Firebase project — see
  `03-operations/02-staging-verification-guide.md`.
