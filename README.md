# Cost Guardian

[![License: MIT](https://img.shields.io/github/license/Manavarya09/cost-guardian?color=0a0a0a)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Manavarya09/cost-guardian?style=flat&color=0a0a0a)](https://github.com/Manavarya09/cost-guardian/stargazers)
[![Issues](https://img.shields.io/github/issues/Manavarya09/cost-guardian?color=0a0a0a)](https://github.com/Manavarya09/cost-guardian/issues)
[![Last commit](https://img.shields.io/github/last-commit/Manavarya09/cost-guardian?color=0a0a0a)](https://github.com/Manavarya09/cost-guardian/commits/main)


**The only Claude Code cost tool that tells you WHERE you're wasting money and HOW to stop.**

Other tools show what you spent. Cost Guardian shows what you *wasted*, what you *got for it*, and what you *could have saved* — with an efficiency score, ROI metrics, and model savings calculator that no other tool has.

Zero setup. No Docker. No Grafana. Just install and go.

---

## What Makes This Different

Every cost tracking tool shows you a number. Cost Guardian gives you **intelligence**:

| Feature | Cost Guardian | ccusage | claude-code-otel | Built-in /cost |
|---------|:---:|:---:|:---:|:---:|
| Real-time tracking | ✅ | ❌ (post-hoc) | ✅ | ✅ |
| Budget guardrails | ✅ | ❌ | ❌ | ❌ |
| **Waste detection** | ✅ | ❌ | ❌ | ❌ |
| **Efficiency score** | ✅ | ❌ | ❌ | ❌ |
| **Cost-per-line ROI** | ✅ | ❌ | ❌ | ❌ |
| **Model savings calculator** | ✅ | ❌ | ❌ | ❌ |
| **Anomaly detection** | ✅ | ❌ | ❌ | ❌ |
| **GitHub badge** | ✅ | ❌ | ❌ | ❌ |
| Per-branch costs | ✅ | ❌ | ❌ | ❌ |
| Multi-model comparison | ✅ | ❌ | ❌ | ❌ |
| CSV/JSON export | ✅ | ✅ | ✅ | ❌ |
| Zero setup | ✅ | ✅ | ❌ (Docker) | ✅ |

---

## Insights Engine (No Other Tool Has This)

### Efficiency Score
Every session gets a score from 0-100 showing how efficiently you're spending:
```
Efficiency Score: 68/100
██████████████░░░░░░ Good

Wasted: $1.43 of $4.71 (30%)
  14 redundant file reads ($0.82)
  3 failed/empty bash commands ($0.34)
  2 calls were 3x+ more expensive than average ($0.27)
```

### Cost-Per-Line ROI
Know what you're getting for your money:
```
Cost per line:    $0.03/line
Lines added:      +247
Lines removed:    -89
Cost per commit:  $1.18/commit
```

### Model Savings Calculator
See how much you could save with different models:
```
Current spend:    $4.71
Cheapest option:  $1.02 (Claude Haiku 4.5)
Potential saving: $3.69 (78% cheaper)
```

### Anomaly Detection
Catches runaway sessions before they drain your limits:
```
 ANOMALY: 3.2x your average session cost
This session: $14.20 | Average: $4.40
Top driver: Agent ($9.80, 4x)
```

### GitHub Badge
Add your AI development cost to your README:
```
![AI Dev Cost](https://img.shields.io/badge/AI_Dev_Cost-$142-2ea44f)
```

---

## The Problem

Every Claude Code user has been there:

- "Why did my session use 80% of my daily limit in 20 minutes?"
- "How much did that refactor actually cost me?"
- "I wish I knew this feature would cost $15 before I started"

There's no built-in way to see what you're spending **as you spend it**. Existing solutions require Docker, Grafana, or OpenTelemetry infrastructure. Most developers just... guess.

## The Solution

Cost Guardian is a Claude Code plugin that gives you full cost visibility with **zero setup**:

```
╔══════════════════════════════════════════════╗
║          COST GUARDIAN - Session Report      ║
╠══════════════════════════════════════════════╣
║  Total Cost:     $2.41                       ║
║  Total Tokens:   12.3K                       ║
║  Duration:       18.2 min                    ║
║  Burn Rate:      $0.13/min                   ║
╠══════════════════════════════════════════════╣
║  Budget:         $5.00 (hard)                ║
║  Used:           ████████████░░░░░░░░  48%   ║
║  Remaining:      $2.59                       ║
║  Time to limit:  ~20 min                     ║
╠══════════════════════════════════════════════╣
║  Per-Tool Breakdown                          ║
╠══════════════════════════════════════════════╣
║  Agent        ███████████████  $1.20 ( 3x)   ║
║  Read         ████████         $0.62 (28x)   ║
║  Edit         █████            $0.34 (12x)   ║
║  Bash         ███              $0.18 ( 8x)   ║
║  Grep         ██               $0.07 (15x)   ║
╚══════════════════════════════════════════════╝
```

## Features

### Real-Time Cost Tracking
Every tool call is automatically tracked via hooks. No manual logging. No configuration.

### Budget Guardrails
Set spending limits that actually enforce themselves:
- **Hard mode**: Blocks tool calls when budget is exceeded
- **Soft mode**: Warns you but lets work continue
- Scopes: per-session, daily, weekly, monthly

### Pre-Task Cost Estimation
Before starting work, get a cost prediction:
```
/cost-estimate add user authentication with OAuth
```
```
Cost Estimate: Add user authentication with OAuth

Complexity:    High
Est. Reads:    15-25 files
Est. Edits:    8-12 files
Est. Tools:    60-90 total tool calls

Estimated Cost:
  Sonnet 4.6:  $2.50 - $5.00
  Opus 4.6:    $12.00 - $25.00
```

### Spending Reports
Beautiful ASCII reports with trend analysis:
```
/cost-report daily
```
Shows daily spend charts, budget status bars, and week-over-week trends.

### Status Line
See your running cost at a glance:
```
$2.41 | 12.3K tok | ~$0.13/min
```

---

## Installation

### Quick Install
```bash
claude plugin marketplace add Manavarya09/cost-guardian
claude plugin install cost-guardian
```

### Manual Install
```bash
git clone https://github.com/Manavarya09/cost-guardian.git ~/.claude/plugins/cost-guardian
```

Then add to your Claude Code settings (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "bash ~/.claude/plugins/cost-guardian/hooks/session-start.sh"
        }]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [{
          "type": "command",
          "command": "bash ~/.claude/plugins/cost-guardian/hooks/budget-guard.sh"
        }]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [{
          "type": "command",
          "command": "bash ~/.claude/plugins/cost-guardian/hooks/track-usage.sh"
        }]
      }
    ]
  }
}
```

---

## Usage

### Check Current Costs
```
/cost-guardian
```

### Set a Budget
```
/cost-guardian budget $10/session        # Hard stop at $10
/cost-guardian budget $25/daily soft     # Soft warning at $25/day
/cost-guardian budget $100/weekly hard   # Hard stop at $100/week
```

### Override a Budget Block
```
/cost-guardian resume
```

### Get a Cost Estimate
```
/cost-estimate fix the authentication bug in login.ts
/cost-estimate refactor the entire API layer to use async/await
```

### View Reports
```
/cost-report              # Current session (with model + expensive call breakdown)
/cost-report daily        # Last 7 days (with averages + projected monthly)
/cost-report weekly       # Last 4 weeks
/cost-report monthly      # Last 30 days
/cost-report branch       # Cost per git branch
```

### Export Data
```
/cost-guardian export csv ~/costs.csv    # Export all data as CSV
/cost-guardian export json ~/costs.json  # Export all data as JSON
```

### View/Customize Multipliers
```
/cost-guardian multipliers  # Show current tool estimation multipliers
```

### Cost Insights
```
/cost-insights              # Full report: efficiency score, waste, ROI, savings, anomalies
/cost-insights waste        # Detailed waste breakdown (redundant reads, failed commands)
/cost-insights roi          # Cost-per-line and cost-per-commit ROI
/cost-insights savings      # Model savings calculator (Opus vs Sonnet vs Haiku)
/cost-insights anomaly      # Anomaly detection — flags runaway sessions
/cost-insights badge        # Generate a GitHub badge for your README
```

### Reset Session Tracking
```
/cost-guardian reset
```

---

## How It Works

Cost Guardian uses Claude Code's hook system to intercept tool calls:

1. **PreToolUse hook** (`budget-guard.sh`): Before each tool call, checks your spending against budget limits. Blocks or warns if exceeded.

2. **PostToolUse hook** (`track-usage.sh`): After each tool call, estimates token usage from the tool's input/output and logs it to a local SQLite database.

3. **Skills**: Four slash commands (`/cost-guardian`, `/cost-estimate`, `/cost-report`, `/cost-insights`) that query the database and generate reports.

### Token Estimation

Since Claude Code doesn't expose exact per-tool token counts, Cost Guardian estimates them using:
- Character count / 4 (industry-standard chars-per-token ratio)
- Tool-specific multipliers (Agent calls cost ~3x more than simple reads)
- Calibrated against real-world usage data

Estimates are typically within 15-20% of actual costs.

### Data Storage

All data stays local in `~/.cost-guardian/`:
- `usage.db` — SQLite database with all tracked usage
- `config.json` — Your budget settings and preferences

No data is ever sent externally. No telemetry. No cloud.

---

## Configuration

Default config is created at `~/.cost-guardian/config.json` on first run:

```json
{
  "budgets": {
    "session": { "limit": 5.00, "mode": "hard" },
    "daily": { "limit": 25.00, "mode": "soft" },
    "weekly": { "limit": 100.00, "mode": "soft" },
    "monthly": { "limit": 400.00, "mode": "soft" }
  },
  "notifications": {
    "warn_at_percent": [50, 75, 90]
  },
  "tracking": {
    "group_by_branch": true,
    "estimate_multiplier": 1.0
  }
}
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `budgets.<scope>.limit` | Spending limit in USD | Varies |
| `budgets.<scope>.mode` | `"hard"` (blocks) or `"soft"` (warns) | `"hard"` |
| `notifications.warn_at_percent` | Warning thresholds (% of budget) | `[50, 75, 90]` |
| `tracking.group_by_branch` | Track costs per git branch | `true` |
| `tracking.estimate_multiplier` | Adjust estimates up/down | `1.0` |

---

## Supported Models

| Model | Input Cost | Output Cost |
|-------|-----------|-------------|
| Claude Opus 4.6 | $15/M tokens | $75/M tokens |
| Claude Sonnet 4.6 | $3/M tokens | $15/M tokens |
| Claude Haiku 4.5 | $0.80/M tokens | $4/M tokens |

Pricing auto-detects the active model. Update `data/pricing.json` to add new models.

---

## Requirements

- Claude Code (any version with hook support)
- `sqlite3` (pre-installed on macOS and most Linux distros)
- Node.js (ships with Claude Code)

---

## FAQ

**Q: How accurate are the cost estimates?**
A: Within 15-20% of actual API costs. The estimation uses character-to-token ratios and tool-specific multipliers calibrated against real usage. For exact tracking, Anthropic's OpenTelemetry integration provides precise numbers.

**Q: Does this work with Claude Max/Pro subscriptions?**
A: Yes. While Max/Pro users don't pay per-token, Cost Guardian helps you understand your usage patterns and why you might be hitting rate limits.

**Q: Will this slow down my Claude Code sessions?**
A: No. Hooks run in ~50ms. The SQLite queries are sub-millisecond. You won't notice any difference.

**Q: Where is my data stored?**
A: Everything stays in `~/.cost-guardian/` on your local machine. Nothing is sent anywhere.

**Q: Can I export my data?**
A: The SQLite database at `~/.cost-guardian/usage.db` can be queried directly with any SQLite client or imported into spreadsheets/dashboards.

---

## Contributing

Contributions welcome! Areas where help is needed:

- [x] ~~CSV/JSON export commands~~ (shipped in v2.0)
- [x] ~~Per-branch cost tracking~~ (shipped in v2.0)
- [x] ~~Efficiency scoring and waste detection~~ (shipped via `/cost-insights`)
- [ ] More accurate token estimation per tool type
- [ ] Team/shared budget features
- [ ] Integration with Anthropic's Usage API for exact costs
- [ ] Dashboard UI (terminal-based)
- [ ] Slack/Discord notifications on budget warnings
- [ ] Burn rate alerts (warn when session is consuming budget unusually fast)

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**Stop guessing. Start tracking.**
