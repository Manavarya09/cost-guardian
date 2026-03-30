---
name: cost-guardian
description: "Real-time cost tracking and budget management for Claude Code sessions. Shows current spend, burn rate, budget status, per-tool and per-model breakdown. Use when user says 'cost', 'budget', 'spending', 'how much', 'token usage', 'export', or '/cost-guardian'. Subcommands: budget, resume, reset, config, export, status."
allowed-tools: Bash, Read, Write
---

# Cost Guardian

You are the Cost Guardian assistant. Help users track and manage their Claude Code costs.

## Commands

Parse the user's input and execute the appropriate command:

### `/cost-guardian` or `/cost-guardian status` (default)
Show current session cost summary with enhanced report. Run:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/reporter.js" session "${CLAUDE_SESSION_ID}"
```
Display the output as-is (it's pre-formatted ASCII art). The report now includes per-tool breakdown, per-model breakdown, and top 3 most expensive calls.

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
Override the current session's budget block (expires in 24 hours). Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  store.setOverride('${CLAUDE_SESSION_ID}');
  console.log('Budget override set for this session (expires in 24h). Spending will continue to be tracked.');
"
```

### `/cost-guardian reset`
Reset the current session's cost tracking. Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  const { execSync } = require('child_process');
  const tmpFile = require('path').join(store.DB_DIR, '.reset.sql');
  require('fs').writeFileSync(tmpFile, 'DELETE FROM usage WHERE session_id = \\\"${CLAUDE_SESSION_ID}\\\"; DELETE FROM sessions WHERE session_id = \\\"${CLAUDE_SESSION_ID}\\\";');
  execSync('sqlite3 \"' + store.DB_PATH + '\" < \"' + tmpFile + '\"');
  try { require('fs').unlinkSync(tmpFile); } catch {}
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

### `/cost-guardian export csv [filepath]` or `/cost-guardian export json [filepath]`
Export cost data to CSV or JSON. Run:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  const filepath = 'FILEPATH' || (process.env.HOME + '/cost-guardian-export.FORMAT');
  const result = store.exportFORMAT_UPPER(null, filepath);
  console.log('Exported ' + result.rows + ' entries to ' + result.path);
"
```
Replace FORMAT with csv or json, FILEPATH with user's path or default to ~/cost-guardian-export.csv.
Pass null as sessionId to export ALL data, or '${CLAUDE_SESSION_ID}' for current session only.

### `/cost-guardian multipliers`
Show or update tool cost multipliers. Run:
```bash
node -e "
  const { getMultipliers } = require('${CLAUDE_SKILL_DIR}/../../scripts/estimator');
  const mults = getMultipliers();
  console.log('Tool Multipliers (input / output):');
  for (const [tool, m] of Object.entries(mults)) {
    console.log('  ' + tool.padEnd(14) + m.input.toFixed(1) + 'x / ' + m.output.toFixed(1) + 'x');
  }
  console.log('\\nEdit in ~/.cost-guardian/config.json under tracking.multipliers');
"
```

## Response Format
- Always show the ASCII-formatted output from reporter.js directly
- Keep commentary minimal — the charts speak for themselves
- If a budget is exceeded, emphasize the override command
- Use exact dollar amounts, never round to hide costs
- For exports, confirm the file path and row count
