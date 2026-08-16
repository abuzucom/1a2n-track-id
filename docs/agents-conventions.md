# AGENTS.md and the abuzucom/agents upstream

This repo's AI-agent instruction files come from
[abuzucom/agents](https://github.com/abuzucom/agents), a shared
instruction template maintained across ABUZUCOM projects. This document
explains how the adoption is structured and how to pull future upstream
changes. Read it before editing `AGENTS.md` or any of its copies.

## Source of truth and generated copies

`AGENTS.md` at the repo root is canonical. `CLAUDE.md`, `GEMINI.md`,
`CONVENTIONS.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`,
`.copilot-instructions`, and `.github/copilot-instructions.md` are exact
copies, kept in sync by `scripts/sync.py` (multiple copies exist because
different tools look for different filenames; see upstream's README for
why). Never hand-edit a copy. Edit `AGENTS.md`, then run
`python scripts/sync.py` to propagate the change, and
`python scripts/sync.py --check` (also run in
`.github/workflows/sync-check.yml`) to verify nothing drifted.

`.claudeignore`, `.gitattributes`, and `.editorconfig` are single shared
files from the same template, not part of the sync step.

## How this repo tailors the template

Upstream's `AGENTS.md` ships as a generic template: Python code examples,
no repo-specific context, and a commented-out orientation block. This
repo's copy diverges from upstream in two structural ways, per upstream's
own `README.md` "Adopting" guide:

- **Orientation filled in, not commented out.** The `## Non-negotiable:
  read first` section is followed by `Commands`, `Do not touch`,
  `Architecture`, `Gotchas`, `Read before touching`, and `Banned agents`,
  all specific to this repo. Upstream ships these as an HTML comment for
  adopting repos to fill in and uncomment.
- **Examples translated to TypeScript.** Every code sample in the
  Critical rules, Correctness & safety, Code quality, and Style sections
  uses TypeScript/JavaScript syntax, not upstream's Python.

Everything else, rule numbering, rule text, and section structure, tracks
upstream as closely as this repo's own adoption decisions allow (see
below).

## What is and is not adopted

This repo does not pull upstream verbatim. Each release gets reviewed and
partially adopted, with gaps and deviations tracked here rather than
silently:

- **Rule 12 (upstream): non-root containers, not adopted.** This repo has
  no Dockerfile or compose file, so the rule and its checker
  (`check_dockerfile_root.py`) have nothing to check. Local `AGENTS.md`
  renumbers upstream's rule 13 (back enforcement claims with real checks)
  down to local rule 12 to close the gap. **Local rule numbers and
  upstream rule numbers are not the same past rule 11**; do not assume
  "Rule N" means the same thing in both files when comparing.
- **`claude/`-branch ban: adopted as upstream wrote it**, including the
  Dependabot exemption. This repo also stopped using
  `claude/`-prefixed branches for its own agent-driven work as a result;
  see the Branch naming conventions section of `AGENTS.md`.
- **Checker scripts and CI/pre-commit wiring: adopted for the rules this
  repo actually enforces.** See "Enforcement" below.
- **Not adopted, upstream-only for now:** `CONTRIBUTING.md.example`,
  `SECURITY.md.example`, `plan/HANDOFF.md.example`, the Claude Code
  `PreToolUse` hook example (`hooks/`), live `.github/PULL_REQUEST_TEMPLATE.md`
  / `.github/ISSUE_TEMPLATE.md`, and the third-party AgentLint CI action.
  These are upstream's opt-in extras; adopting any of them is a new-tooling
  proposal under `AGENTS.md` Rule 9, not something to add silently.
  Upstream also offers calling its reusable
  `.github/workflows/agents-compliance.yml` directly via `uses:` instead
  of copying checker scripts; this repo copies scripts instead, to avoid
  a live dependency on an external repo's workflow.

## Enforcement

Two workflows cover different things:

- **`.github/workflows/sync-check.yml`**: path-scoped to the convention
  files themselves. Runs `scripts/sync.py --check` (copies match
  `AGENTS.md`) and `scripts/lint_style.py` (dash/ASCII rules). Only
  triggers when a convention file changes.
- **`.github/workflows/agents-compliance.yml`**: runs on every PR and
  push to `main`, regardless of which files changed, since branch names,
  commit messages, and commit authorship apply to every change. Wires in
  the checker scripts below.

| Script | Backs | Blocking? |
|---|---|---|
| `scripts/check_banned_agents.py` | Banned agents | Yes |
| `scripts/check_persist_credentials.py` | Rule 11 | Yes |
| `scripts/check_weak_hashing.py` | Rule 7 | Yes |
| `scripts/check_secrets_heuristic.py` | Rule 8 | Yes |
| `scripts/check_branch_name.py` | Branch naming | Yes |
| `scripts/check_commit_message.py` | Commit-message style | No (warning only) |
| `scripts/check_us_spelling.py` | American spelling | No (warning only) |
| `scripts/check_english_only.py` | English only | No (warning only) |
| `scripts/check_hedging.py` | No hedging/self-narration; Comment the why | No (warning only) |
| `scripts/lint_style.py` | No run-on/dashes; No non-ASCII | Yes |

`AGENTS.md` Rule 12 (back enforcement claims with real checks) means: if
a rule's text says "Backed by `scripts/check_x.py`", that script must
actually run in CI or pre-commit. Do not add a "Backed by" sentence
without wiring the check in the same change, and do not remove a check
without removing the sentence that claims it.

`.pre-commit-config.yaml` mirrors the CI checks for local, pre-push
feedback; it is optional tooling, not required to commit.

## Pulling future upstream changes

1. Clone `abuzucom/agents` and compare its `AGENTS.md` and `CHANGELOG.md`
   against this repo's copies. `CHANGELOG.md` (upstream) is the fastest
   way to see what changed release over release.
2. For each new or changed rule, decide: adopt as-is, adopt with a
   repo-specific tailoring (translate Python examples to TypeScript,
   like the rest of this file), or prune with a reason recorded here.
   Follow upstream's own `README.md` "Adopting" section, which this repo
   generally follows step for step.
3. Any new checker script, CI job, or file (opt-in templates, hooks,
   third-party actions) is new tooling under `AGENTS.md` Rule 9: propose
   it and get explicit approval before adding it, the same as any other
   dependency.
4. Edit `AGENTS.md` only, run `python scripts/sync.py`, then run every
   checker script locally against this repo before wiring it into CI, to
   catch false positives against this repo's actual content.
5. Update this document's "What is and is not adopted" section so the
   next agent does not have to re-derive the gap between this repo and
   upstream from a diff.

See commit history on `AGENTS.md` for the adoption trail: the initial
template adoption, the rule-10 sync, and the reintegration that added
rules 11-12, the new Style rules, and this document.
