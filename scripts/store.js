#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(process.env.HOME, '.cost-guardian');
const DB_PATH = path.join(DB_DIR, 'usage.db');
const CONFIG_PATH = path.join(DB_DIR, 'config.json');

const DEFAULT_CONFIG = {
  budgets: {
    session: { limit: 5.00, mode: 'hard' },
    daily: { limit: 25.00, mode: 'soft' },
    weekly: { limit: 100.00, mode: 'soft' },
    monthly: { limit: 400.00, mode: 'soft' }
  },
  status_line: true,
  notifications: { warn_at_percent: [50, 75, 90] },
  tracking: { group_by_branch: true, estimate_multiplier: 1.0 }
};

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function sql(query, ...args) {
  ensureDir();
  // Escape args for shell safety
  const escaped = args.map(a => String(a).replace(/'/g, "''"));
  const fullQuery = escaped.reduce((q, val) => q.replace('?', `'${val}'`), query);
  try {
    return execSync(`sqlite3 "${DB_PATH}" "${fullQuery}"`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) {
    return '';
  }
}

function initDb() {
  ensureDir();
  const schema = `
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      session_id TEXT,
      tool_name TEXT,
      model TEXT,
      input_chars INTEGER DEFAULT 0,
      output_chars INTEGER DEFAULT 0,
      est_input_tokens INTEGER DEFAULT 0,
      est_output_tokens INTEGER DEFAULT 0,
      est_cost_usd REAL DEFAULT 0,
      branch TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      started_at TEXT DEFAULT (datetime('now')),
      total_cost_usd REAL DEFAULT 0,
      total_tokens INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
  `.replace(/\n/g, ' ');
  execSync(`sqlite3 "${DB_PATH}" "${schema}"`, { timeout: 5000 });
}

function loadConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function recordUsage(sessionId, toolName, model, inputChars, outputChars, inputTokens, outputTokens, costUsd, branch) {
  initDb();
  sql(
    `INSERT INTO usage (session_id, tool_name, model, input_chars, output_chars, est_input_tokens, est_output_tokens, est_cost_usd, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId, toolName, model, inputChars, outputChars, inputTokens, outputTokens, costUsd, branch || ''
  );
  // Upsert session
  sql(
    `INSERT INTO sessions (session_id, total_cost_usd, total_tokens) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET total_cost_usd = total_cost_usd + ?, total_tokens = total_tokens + ?`,
    sessionId, costUsd, inputTokens + outputTokens, costUsd, inputTokens + outputTokens
  );
}

function getSessionCost(sessionId) {
  initDb();
  const result = sql(`SELECT COALESCE(SUM(est_cost_usd), 0) FROM usage WHERE session_id = ?`, sessionId);
  return parseFloat(result) || 0;
}

function getDailyCost() {
  initDb();
  const result = sql(`SELECT COALESCE(SUM(est_cost_usd), 0) FROM usage WHERE date(timestamp) = date('now')`);
  return parseFloat(result) || 0;
}

function getWeeklyCost() {
  initDb();
  const result = sql(`SELECT COALESCE(SUM(est_cost_usd), 0) FROM usage WHERE timestamp >= datetime('now', '-7 days')`);
  return parseFloat(result) || 0;
}

function getMonthlyCost() {
  initDb();
  const result = sql(`SELECT COALESCE(SUM(est_cost_usd), 0) FROM usage WHERE timestamp >= datetime('now', '-30 days')`);
  return parseFloat(result) || 0;
}

function getSessionTokens(sessionId) {
  initDb();
  const result = sql(`SELECT COALESCE(SUM(est_input_tokens + est_output_tokens), 0) FROM usage WHERE session_id = ?`, sessionId);
  return parseInt(result) || 0;
}

function getSessionStart(sessionId) {
  initDb();
  const result = sql(`SELECT MIN(timestamp) FROM usage WHERE session_id = ?`, sessionId);
  return result || null;
}

function getToolBreakdown(sessionId) {
  initDb();
  const result = sql(
    `SELECT tool_name || '|' || COALESCE(SUM(est_cost_usd), 0) || '|' || COUNT(*) FROM usage WHERE session_id = ? GROUP BY tool_name ORDER BY SUM(est_cost_usd) DESC`,
    sessionId
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [tool, cost, count] = line.split('|');
    return { tool, cost: parseFloat(cost), count: parseInt(count) };
  });
}

function getDailyBreakdown(days) {
  initDb();
  const result = sql(
    `SELECT date(timestamp) || '|' || COALESCE(SUM(est_cost_usd), 0) || '|' || COALESCE(SUM(est_input_tokens + est_output_tokens), 0) FROM usage WHERE timestamp >= datetime('now', '-${days} days') GROUP BY date(timestamp) ORDER BY date(timestamp)`
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [date, cost, tokens] = line.split('|');
    return { date, cost: parseFloat(cost), tokens: parseInt(tokens) };
  });
}

function checkBudget(sessionId) {
  const config = loadConfig();
  const budgets = config.budgets || {};
  const violations = [];

  if (budgets.session) {
    const cost = getSessionCost(sessionId);
    if (cost >= budgets.session.limit) {
      violations.push({ scope: 'session', spent: cost, limit: budgets.session.limit, mode: budgets.session.mode });
    } else {
      const pct = (cost / budgets.session.limit) * 100;
      const warns = config.notifications?.warn_at_percent || [];
      for (const w of warns) {
        if (pct >= w) {
          violations.push({ scope: 'session', spent: cost, limit: budgets.session.limit, mode: 'warn', percent: Math.round(pct) });
          break;
        }
      }
    }
  }
  if (budgets.daily) {
    const cost = getDailyCost();
    if (cost >= budgets.daily.limit) {
      violations.push({ scope: 'daily', spent: cost, limit: budgets.daily.limit, mode: budgets.daily.mode });
    }
  }
  if (budgets.weekly) {
    const cost = getWeeklyCost();
    if (cost >= budgets.weekly.limit) {
      violations.push({ scope: 'weekly', spent: cost, limit: budgets.weekly.limit, mode: budgets.weekly.mode });
    }
  }

  return violations;
}

// Check for override file (created by /cost-guardian resume)
function isOverridden(sessionId) {
  const overridePath = path.join(DB_DIR, `.override-${sessionId}`);
  return fs.existsSync(overridePath);
}

function setOverride(sessionId) {
  ensureDir();
  fs.writeFileSync(path.join(DB_DIR, `.override-${sessionId}`), Date.now().toString());
}

module.exports = {
  initDb, loadConfig, saveConfig, recordUsage,
  getSessionCost, getDailyCost, getWeeklyCost, getMonthlyCost,
  getSessionTokens, getSessionStart, getToolBreakdown, getDailyBreakdown,
  checkBudget, isOverridden, setOverride, DB_PATH, CONFIG_PATH
};

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  switch (cmd) {
    case 'init': initDb(); console.log('Database initialized at ' + DB_PATH); break;
    case 'session-cost': console.log(getSessionCost(args[0])); break;
    case 'daily-cost': console.log(getDailyCost()); break;
    case 'weekly-cost': console.log(getWeeklyCost()); break;
    case 'monthly-cost': console.log(getMonthlyCost()); break;
    case 'check-budget': console.log(JSON.stringify(checkBudget(args[0]))); break;
    case 'tool-breakdown': console.log(JSON.stringify(getToolBreakdown(args[0]))); break;
    case 'daily-breakdown': console.log(JSON.stringify(getDailyBreakdown(args[0] || 7))); break;
    case 'override': setOverride(args[0]); console.log('Budget override set'); break;
    default: console.log('Commands: init, session-cost, daily-cost, weekly-cost, monthly-cost, check-budget, tool-breakdown, daily-breakdown, override');
  }
}
