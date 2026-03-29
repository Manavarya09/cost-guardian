---
name: cost-estimate
description: "Estimate the cost of a task before starting it. Analyzes task complexity and predicts token usage and cost. Use when user says 'estimate cost', 'how much will this cost', 'cost estimate', or '/cost-estimate'."
argument-hint: "<task description>"
allowed-tools: Bash, Read, Grep, Glob
---

# Cost Estimate

Estimate the cost of a coding task before execution.

## Process

1. **Analyze the task description** from $ARGUMENTS
2. **Assess complexity** by examining the codebase:
   - Count files that will likely need reading (use Glob to find relevant files)
   - Count files that will likely need editing
   - Estimate number of tool calls needed
3. **Calculate estimated cost** using these heuristics:

### Cost Heuristics by Task Type

| Task Type | Typical Tool Calls | Est. Cost (Sonnet) | Est. Cost (Opus) |
|-----------|-------------------|--------------------|--------------------|
| Bug fix (single file) | 5-10 | $0.10-0.30 | $0.50-1.50 |
| Bug fix (multi-file) | 10-25 | $0.30-0.80 | $1.50-4.00 |
| Small feature | 15-30 | $0.50-1.20 | $2.50-6.00 |
| Medium feature | 30-60 | $1.20-3.00 | $6.00-15.00 |
| Large feature | 60-120 | $3.00-8.00 | $15.00-40.00 |
| Refactor (small) | 10-20 | $0.30-0.70 | $1.50-3.50 |
| Refactor (large) | 40-80 | $2.00-5.00 | $10.00-25.00 |
| Code review | 5-15 | $0.15-0.50 | $0.75-2.50 |

### Per-Tool Cost Estimates (Sonnet 4.6)
- Read a file: ~$0.005-0.02 (depends on file size)
- Edit a file: ~$0.01-0.03
- Bash command: ~$0.005-0.05
- Grep/Glob: ~$0.003-0.01
- Agent subquery: ~$0.10-0.50
- Web fetch: ~$0.02-0.08

4. **Check historical data** for similar past tasks:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  store.initDb();
  const daily = store.getDailyBreakdown(30);
  if (daily.length > 0) {
    const avg = daily.reduce((s, d) => s + d.cost, 0) / daily.length;
    console.log('Average daily spend: \$' + avg.toFixed(2));
    console.log('Days tracked: ' + daily.length);
  } else {
    console.log('No historical data yet.');
  }
"
```

## Output Format

Present the estimate clearly:

```
Cost Estimate: <task description>

Complexity:    <Low/Medium/High>
Est. Reads:    <N files>
Est. Edits:    <N files>
Est. Tools:    <N total tool calls>

Estimated Cost:
  Sonnet 4.6:  $X.XX - $X.XX
  Opus 4.6:    $X.XX - $X.XX

Based on: <reasoning>
```

Be honest about uncertainty — these are estimates, not guarantees.
