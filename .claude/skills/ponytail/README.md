Vendored from https://github.com/DietrichGebert/ponytail (v4.9.0, MIT,
Copyright (c) 2026 DietrichGebert).

Only `SKILL.md` is vendored — the upstream plugin's SessionStart,
SubagentStart, and UserPromptSubmit hooks are not included. Those hooks are
what make the ruleset always-on and carry it into subagents, so install the
plugin itself for the full effect:

    claude plugin marketplace add DietrichGebert/ponytail
    claude plugin install ponytail@ponytail

The condensed ruleset in the repo root `CLAUDE.md` covers sessions where the
plugin is not installed.
