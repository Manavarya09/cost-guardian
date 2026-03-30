#!/usr/bin/env node
const { charsToTokens, estimateCost } = require('./pricing');
const { recordUsage, loadConfig, getSessionCost, logError } = require('./store');

function getMultipliers() {
  const config = loadConfig();
  return config.tracking?.multipliers || {
    Read:        { input: 0.3, output: 1.0 },
    Edit:        { input: 0.8, output: 0.5 },
    Write:       { input: 1.0, output: 0.2 },
    Bash:        { input: 0.5, output: 1.2 },
    Grep:        { input: 0.3, output: 1.0 },
    Glob:        { input: 0.2, output: 0.8 },
    Agent:       { input: 2.0, output: 3.0 },
    WebFetch:    { input: 0.5, output: 1.5 },
    WebSearch:   { input: 0.3, output: 1.0 },
    TodoWrite:   { input: 0.5, output: 0.1 },
    NotebookEdit:{ input: 0.8, output: 0.3 },
    default:     { input: 0.5, output: 0.5 }
  };
}

function getMultiplier(toolName) {
  const mults = getMultipliers();
  return mults[toolName] || mults.default;
}

function estimateFromToolCall(toolName, toolInput, toolOutput, model) {
  const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || '');
  const outputStr = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput || '');

  const inputChars = inputStr.length;
  const outputChars = outputStr.length;

  const mult = getMultiplier(toolName);
  const inputTokens = Math.ceil(charsToTokens(inputChars) * mult.input);
  const outputTokens = Math.ceil(charsToTokens(outputChars) * mult.output);

  const cost = estimateCost(inputTokens, outputTokens, model);

  return {
    toolName,
    model: cost.model,
    inputChars,
    outputChars,
    inputTokens,
    outputTokens,
    costUsd: cost.totalCost
  };
}

function processHookInput(hookData) {
  const toolName = hookData.tool_name || hookData.tool || 'unknown';
  const toolInput = hookData.tool_input || hookData.input || '';
  const toolOutput = hookData.tool_output || hookData.output || hookData.tool_response || hookData.result || '';
  const sessionId = hookData.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';
  const model = hookData.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  // Get current git branch
  let branch = '';
  try {
    const { execSync } = require('child_process');
    branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {}

  const est = estimateFromToolCall(toolName, toolInput, toolOutput, model);

  // Record to database
  try {
    recordUsage(
      sessionId, est.toolName, model,
      est.inputChars, est.outputChars,
      est.inputTokens, est.outputTokens,
      est.costUsd, branch
    );
  } catch (e) {
    logError('processHookInput.record', e);
  }

  // Get running session total for feedback
  let sessionTotal = 0;
  let budgetPct = '';
  try {
    sessionTotal = getSessionCost(sessionId);
    const config = loadConfig();
    const sessionBudget = config.budgets?.session?.limit;
    if (sessionBudget) {
      const pct = Math.round((sessionTotal / sessionBudget) * 100);
      budgetPct = ` | Budget: ${pct}%`;
    }
  } catch {}

  return { ...est, sessionTotal, budgetPct };
}

module.exports = { estimateFromToolCall, processHookInput, getMultipliers };

if (require.main === module) {
  // Read hook input from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const hookData = JSON.parse(input);
      const result = processHookInput(hookData);
      // Per-tool cost feedback to stderr
      process.stderr.write(
        `⚡ +$${result.costUsd.toFixed(4)} (${result.toolName}) | Session: $${result.sessionTotal.toFixed(2)}${result.budgetPct}\n`
      );
    } catch (e) {
      logError('estimator.stdin', e);
    }
  });
}
