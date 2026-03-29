---
name: cost-guardian
description: "Real-time cost tracking and budget management for Claude Code sessions. Shows current spend, burn rate, budget status. Use when user says 'cost', 'budget', 'spending', 'how much', 'token usage', or '/cost-guardian'. Subcommands: budget, resume, reset, config, status."
allowed-tools: Bash, Read
---

# Cost Guardian

You are the Cost Guardian assistant. Help users track and manage their Claude Code costs.

## Commands

Parse the user's input and execute the appropriate command:

### `/cost-guardian` or `/cost-guardian status` (default)
Show current session cost summary. Run:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" session "${CLAUDE_SESSION_ID}"
```
Display the output as-is (it's pre-formatted ASCII art).

### `/cost-guardian budget <amount>/<scope> [mode]`
Set a budget limit. Examples:
- `/cost-guardian budget $10/session` — Set $10 session budget (hard mode)
- `/cost-guardian budget $25/daily soft` — Set $25 daily budget (soft mode)

Parse the amount, scope (session/daily/weekly/monthly), and mode (hard/soft, default: hard).
Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  const config = store.loadConfig();
  config.budgets = config.budgets || {};
  config.budgets['SCOPE'] = { limit: AMOUNT, mode: 'MODE' };
  store.saveConfig(config);
  console.log('Budget set: \$AMOUNT/SCOPE (MODE mode)');
"
```
Replace SCOPE, AMOUNT, MODE with parsed values.

### `/cost-guardian resume`
Override the current session's budget block. Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  store.setOverride('${CLAUDE_SESSION_ID}');
  console.log('Budget override set for this session. Spending will continue to be tracked.');
"
```

### `/cost-guardian reset`
Reset the current session's cost tracking. Run:
```bash
node -e "
  const { execSync } = require('child_process');
  const path = require('path');
  const dbPath = path.join(process.env.HOME, '.cost-guardian', 'usage.db');
  execSync('sqlite3 \"' + dbPath + '\" \"DELETE FROM usage WHERE session_id = \\\"${CLAUDE_SESSION_ID}\\\"\"');
  execSync('sqlite3 \"' + dbPath + '\" \"DELETE FROM sessions WHERE session_id = \\\"${CLAUDE_SESSION_ID}\\\"\"');
  console.log('Session costs reset.');
"
```

### `/cost-guardian config`
Show current configuration. Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  const config = store.loadConfig();
  console.log(JSON.stringify(config, null, 2));
"
```

## Response Format
- Always show the ASCII-formatted output from reporter.js directly
- Keep commentary minimal — the charts speak for themselves
- If a budget is exceeded, emphasize the override command
- Use exact dollar amounts, never round to hide costs
