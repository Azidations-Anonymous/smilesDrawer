# Plans Directory

This directory collects the longer-term planning material we use while chasing feature parity with PIKAChU and other roadmap items for SmilesDrawer.

## What’s Here Today

- `*-roadmap.md` documents capture active parity workstreams (for example `cis-trans-parity-roadmap.md` and `sssr-parity-roadmap.md`). Each file summarises the current gaps, references the upstream Python implementation, and lists concrete action items.
- Subdirectories store artefacts gathered while investigating specific rendering issues. For instance, `anti_crowding/current/*.html` and `nodejs_render_issue/*.html` hold saved output from manual experiments so we can compare before/after behaviour.
- Older snapshots or abandoned explorations stay in sibling folders such as `anti_crowding/previous` so the historical context is still discoverable.

## Recommended Structure Going Forward

When starting a brand-new plan, prefer creating a dedicated folder that contains:

- `proposal.md` – problem statement and desired outcome
- `design.md` – technical approach, alternatives considered, rationale
- `implementation.md` – ordered task list, open questions, blockers
- `testing.md` – validation strategy, datasets, regression coverage
- `notes.md` – research links, scratch calculations, meeting minutes

The folder name should describe the topic with hyphenated lowercase words (for example `plans/atom-annotations/`). Sticking to this convention keeps workstreams discoverable even as the collection grows.

## Guidelines

- Keep each plan focused on a single enhancement or defect class.
- Update the relevant roadmap or `implementation.md` as work lands so plans stay useful.
- Link to issues, pull requests, commits, or external references whenever possible.
- When archiving finished investigations, move supporting artefacts into a clearly labelled `archive/` or `previous/` subfolder instead of deleting them outright.
