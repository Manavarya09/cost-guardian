---
name: cost-report
description: "Generate detailed cost reports with charts and breakdowns. Shows daily/weekly/monthly spend, per-tool costs, per-branch costs, and trends. Use when user says 'cost report', 'spending report', 'usage report', 'show costs', 'branch costs', or '/cost-report'."
argument-hint: "[session|daily|weekly|monthly|branch]"
allowed-tools: Bash
---

# Cost Report

Generate formatted cost reports with ASCII charts.

## Commands

### `/cost-report` or `/cost-report session`
Show current session report (enhanced with model breakdown and top expensive calls):
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" session "${CLAUDE_SESSION_ID}"
```

### `/cost-report daily`
Show last 7 days with day-of-week labels, averages, and projected monthly:
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

### `/cost-report branch`
Show cost per git branch (last 30 days):
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" branch 30
```

### `/cost-report branch <days>`
Show branch costs for a custom period:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" branch <DAYS>
```

## Display Rules
- Show the ASCII output exactly as returned — do not reformat it
- The box-drawing characters are intentional, preserve them
- Add brief commentary only if there's a notable trend or budget concern
- If no data exists yet, tell the user that tracking starts automatically
- For branch reports, mention that branch tracking requires working in a git repo
