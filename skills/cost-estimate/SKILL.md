---
name: cost-estimate
description: "Estimate the cost of a task before starting it. Analyzes task complexity, predicts token usage, and compares cost across all Claude models. Use when user says 'estimate cost', 'how much will this cost', 'cost estimate', or '/cost-estimate'."
argument-hint: "<task description>"
allowed-tools: Bash, Read, Grep, Glob
---

# Cost Estimate

Estimate the cost of a coding task before execution, with multi-model comparison.

## Process

1. **Analyze the task description** from $ARGUMENTS
2. **Assess complexity** by examining the codebase:
   - Count files that will likely need reading (use Glob to find relevant files)
   - Count files that will likely need editing
   - Estimate number of tool calls needed
3. **Calculate estimated cost** using these heuristics:

### Cost Heuristics by Task Type

| Task Type | Typical Tool Calls | Est. Tokens |
|-----------|-------------------|-------------|
| Bug fix (single file) | 5-10 | 5K-15K |
| Bug fix (multi-file) | 10-25 | 15K-40K |
| Small feature | 15-30 | 25K-60K |
| Medium feature | 30-60 | 60K-150K |
| Large feature | 60-120 | 150K-400K |
| Refactor (small) | 10-20 | 15K-30K |
| Refactor (large) | 40-80 | 80K-200K |
| Code review | 5-15 | 10K-30K |

4. **Show multi-model comparison** using the estimated tokens:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/pricing.js" compare <est_input_tokens> <est_output_tokens> <current_model>
```

5. **Check historical data** for context:
```bash
node -e "
  const store = require('${CLAUDE_SKILL_DIR}/../../scripts/store');
  store.initDb();
  const daily = store.getDailyBreakdown(30);
  if (daily.length > 0) {
    const avg = daily.reduce((s, d) => s + d.cost, 0) / daily.length;
    console.log('Your avg daily spend: \$' + avg.toFixed(2) + ' (' + daily.length + ' days tracked)');
  }
  const total = store.getTotalEntries();
  console.log('Total tracked tool calls: ' + total);
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
Est. Tokens:   <N total tokens>

Model Comparison:
  Model                              Input    Output     Total
  ─────────────────────────────────────────────────────────────
  Claude Haiku 4.5                    $0.04    $0.20     $0.24
  Claude Sonnet 4.6                   $0.15    $0.75     $0.90  ← current
  Claude Opus 4.6                     $0.75    $3.75     $4.50

  💡 Claude Haiku 4.5 would be 73% cheaper

Based on: <reasoning>
```

Always include the model comparison table. Be honest about uncertainty — these are estimates, not guarantees.
