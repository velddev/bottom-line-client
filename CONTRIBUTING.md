# Contributing to Ventured

## Commit Convention

All commits must be prefixed with your **first name in lowercase**, followed by a colon and a space.

```
<name>: <short description>
```

**Examples:**
```
milo: add road network RPC
alex: fix citizen demand calculation
sam: refactor supply link handler
```

Keep the description lowercase and concise (imperative mood, no trailing period).

---

## Co-authorship

When using an AI assistant (e.g. GitHub Copilot), include the co-author trailer at the end of the commit message:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## General Guidelines

- One logical change per commit — don't bundle unrelated fixes.
- Always push after committing; dangling local commits block others.
- After any `.proto` file change in `TradeMMO/`, run `sync_protos.py` to sync to `TradeMMOClient/`.
- Monetary values are always **cents** (int64) — never floats.
- Proto enums must be strict: define named `enum` types, never raw strings, always include `_UNSPECIFIED = 0`.
