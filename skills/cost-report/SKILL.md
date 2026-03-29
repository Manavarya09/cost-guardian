---
name: cost-report
description: "Generate detailed cost reports with charts and breakdowns. Shows daily/weekly/monthly spend, per-tool costs, and trends. Use when user says 'cost report', 'spending report', 'usage report', 'show costs', or '/cost-report'."
argument-hint: "[session|daily|weekly|monthly]"
allowed-tools: Bash
---

# Cost Report

Generate formatted cost reports with ASCII charts.

## Commands

### `/cost-report` or `/cost-report session`
Show current session report:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" session "${CLAUDE_SESSION_ID}"
```

### `/cost-report daily`
Show last 7 days:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" daily 7
```

### `/cost-report weekly`
Show last 4 weeks (28 days):
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" daily 28
```

### `/cost-report monthly`
Show last 30 days:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" daily 30
```

## Display Rules
- Show the ASCII output exactly as returned — do not reformat it
- The box-drawing characters are intentional, preserve them
- Add brief commentary only if there's a notable trend or budget concern
- If no data exists yet, tell the user that tracking starts automatically and they'll see data after a few tool calls
