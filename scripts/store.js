#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(process.env.HOME, '.cost-guardian');
const DB_PATH = path.join(DB_DIR, 'usage.db');
const CONFIG_PATH = path.join(DB_DIR, 'config.json');
const ERROR_LOG_PATH = path.join(DB_DIR, 'error.log');
const SCHEMA_VERSION = 2;

const DEFAULT_CONFIG = {
  budgets: {
    session: { limit: 5.00, mode: 'hard' },
    daily: { limit: 25.00, mode: 'soft' },
    weekly: { limit: 100.00, mode: 'soft' },
    monthly: { limit: 400.00, mode: 'soft' }
  },
  status_line: true,
  notifications: { warn_at_percent: [50, 75, 90] },
  tracking: {
    group_by_branch: true,
    estimate_multiplier: 1.0,
    multipliers: {
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
    }
  }
};

// --- Error Logging ---

function logError(context, error) {
  try {
    ensureDir();
    const timestamp = new Date().toISOString();
    const msg = `[${timestamp}] [${context}] ${error.message || error}\n`;
    fs.appendFileSync(ERROR_LOG_PATH, msg);
    // Rotate: keep last 1000 lines
    try {
      const lines = fs.readFileSync(ERROR_LOG_PATH, 'utf8').split('\n');
      if (lines.length > 1000) {
        fs.writeFileSync(ERROR_LOG_PATH, lines.slice(-800).join('\n'));
      }
    } catch {}
  } catch {}
}

// --- Safe SQL ---

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  const s = String(val).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${s}'`;
}

function sql(query, ...args) {
  ensureDir();
  const escaped = args.map(a => escapeSQL(a));
  let fullQuery = query;
  for (const val of escaped) {
    fullQuery = fullQuery.replace('?', val);
  }
  try {
    const tmpFile = path.join(DB_DIR, '.query.sql');
    fs.writeFileSync(tmpFile, fullQuery);
    const result = execSync(`sqlite3 "${DB_PATH}" < "${tmpFile}"`, { encoding: 'utf8', timeout: 5000 }).trim();
    try { fs.unlinkSync(tmpFile); } catch {}
    return result;
  } catch (e) {
    logError('sql', e);
    return '';
  }
}

function initDb() {
  ensureDir();
  const schema = `
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
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
      started_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
      total_cost_usd REAL DEFAULT 0,
      total_tokens INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
    INSERT OR IGNORE INTO schema_version VALUES (${SCHEMA_VERSION});
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_branch ON usage(branch);
  `.replace(/\n/g, ' ');
  try {
    const tmpFile = path.join(DB_DIR, '.init.sql');
    fs.writeFileSync(tmpFile, schema);
    execSync(`sqlite3 "${DB_PATH}" < "${tmpFile}"`, { timeout: 5000 });
    try { fs.unlinkSync(tmpFile); } catch {}
  } catch (e) {
    logError('initDb', e);
  }
}

// --- Config ---

function loadConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // Merge with defaults for any missing keys
    return {
      ...DEFAULT_CONFIG,
      ...config,
      tracking: { ...DEFAULT_CONFIG.tracking, ...config.tracking },
      budgets: { ...DEFAULT_CONFIG.budgets, ...config.budgets }
    };
  } catch (e) {
    logError('loadConfig', e);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// --- CRUD ---

function recordUsage(sessionId, toolName, model, inputChars, outputChars, inputTokens, outputTokens, costUsd, branch) {
  initDb();
  // Use transaction for consistency
  const txn = `
    BEGIN TRANSACTION;
    INSERT INTO usage (session_id, tool_name, model, input_chars, output_chars, est_input_tokens, est_output_tokens, est_cost_usd, branch) VALUES (${escapeSQL(sessionId)}, ${escapeSQL(toolName)}, ${escapeSQL(model)}, ${escapeSQL(inputChars)}, ${escapeSQL(outputChars)}, ${escapeSQL(inputTokens)}, ${escapeSQL(outputTokens)}, ${escapeSQL(costUsd)}, ${escapeSQL(branch || '')});
    INSERT INTO sessions (session_id, total_cost_usd, total_tokens) VALUES (${escapeSQL(sessionId)}, ${escapeSQL(costUsd)}, ${escapeSQL(inputTokens + outputTokens)}) ON CONFLICT(session_id) DO UPDATE SET total_cost_usd = total_cost_usd + ${escapeSQL(costUsd)}, total_tokens = total_tokens + ${escapeSQL(inputTokens + outputTokens)};
    COMMIT;
  `;
  try {
    const tmpFile = path.join(DB_DIR, '.txn.sql');
    fs.writeFileSync(tmpFile, txn);
    execSync(`sqlite3 "${DB_PATH}" < "${tmpFile}"`, { timeout: 5000 });
    try { fs.unlinkSync(tmpFile); } catch {}
  } catch (e) {
    logError('recordUsage', e);
  }
}

// --- Queries ---

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
  return sql(`SELECT MIN(timestamp) FROM usage WHERE session_id = ?`, sessionId) || null;
}

function getToolBreakdown(sessionId) {
  initDb();
  const result = sql(
    `SELECT tool_name || '\t' || COALESCE(SUM(est_cost_usd), 0) || '\t' || COUNT(*) FROM usage WHERE session_id = ? GROUP BY tool_name ORDER BY SUM(est_cost_usd) DESC`,
    sessionId
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [tool, cost, count] = line.split('\t');
    return { tool, cost: parseFloat(cost), count: parseInt(count) };
  });
}

function getModelBreakdown(sessionId) {
  initDb();
  const result = sql(
    `SELECT model || '\t' || COALESCE(SUM(est_cost_usd), 0) || '\t' || COALESCE(SUM(est_input_tokens + est_output_tokens), 0) FROM usage WHERE session_id = ? GROUP BY model ORDER BY SUM(est_cost_usd) DESC`,
    sessionId
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [model, cost, tokens] = line.split('\t');
    return { model, cost: parseFloat(cost), tokens: parseInt(tokens) };
  });
}

function getBranchBreakdown(days) {
  initDb();
  const result = sql(
    `SELECT branch || '\t' || COALESCE(SUM(est_cost_usd), 0) || '\t' || COUNT(*) FROM usage WHERE branch != '' AND timestamp >= datetime('now', '-${parseInt(days) || 30} days') GROUP BY branch ORDER BY SUM(est_cost_usd) DESC`
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [branch, cost, count] = line.split('\t');
    return { branch, cost: parseFloat(cost), count: parseInt(count) };
  });
}

function getDailyBreakdown(days) {
  initDb();
  const result = sql(
    `SELECT date(timestamp) || '\t' || COALESCE(SUM(est_cost_usd), 0) || '\t' || COALESCE(SUM(est_input_tokens + est_output_tokens), 0) FROM usage WHERE timestamp >= datetime('now', '-${parseInt(days) || 7} days') GROUP BY date(timestamp) ORDER BY date(timestamp)`
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [date, cost, tokens] = line.split('\t');
    return { date, cost: parseFloat(cost), tokens: parseInt(tokens) };
  });
}

function getTopExpensiveCalls(sessionId, limit) {
  initDb();
  const n = parseInt(limit) || 3;
  const result = sql(
    `SELECT tool_name || '\t' || est_cost_usd || '\t' || est_input_tokens || '\t' || est_output_tokens FROM usage WHERE session_id = ? ORDER BY est_cost_usd DESC LIMIT ${n}`,
    sessionId
  );
  if (!result) return [];
  return result.split('\n').filter(Boolean).map(line => {
    const [tool, cost, inTok, outTok] = line.split('\t');
    return { tool, cost: parseFloat(cost), inputTokens: parseInt(inTok), outputTokens: parseInt(outTok) };
  });
}

function getTotalEntries() {
  initDb();
  const result = sql(`SELECT COUNT(*) FROM usage`);
  return parseInt(result) || 0;
}

// --- Budget ---

function checkBudget(sessionId) {
  const config = loadConfig();
  const budgets = config.budgets || {};
  const violations = [];

  if (budgets.session) {
    const cost = getSessionCost(sessionId);
    if (cost > budgets.session.limit) {
      violations.push({ scope: 'session', spent: cost, limit: budgets.session.limit, mode: budgets.session.mode });
    } else {
      const pct = (cost / budgets.session.limit) * 100;
      const warns = config.notifications?.warn_at_percent || [];
      for (const w of warns.sort((a, b) => b - a)) {
        if (pct >= w) {
          violations.push({ scope: 'session', spent: cost, limit: budgets.session.limit, mode: 'warn', percent: Math.round(pct) });
          break;
        }
      }
    }
  }
  if (budgets.daily) {
    const cost = getDailyCost();
    if (cost > budgets.daily.limit) {
      violations.push({ scope: 'daily', spent: cost, limit: budgets.daily.limit, mode: budgets.daily.mode });
    }
  }
  if (budgets.weekly) {
    const cost = getWeeklyCost();
    if (cost > budgets.weekly.limit) {
      violations.push({ scope: 'weekly', spent: cost, limit: budgets.weekly.limit, mode: budgets.weekly.mode });
    }
  }

  return violations;
}

// --- Overrides (with expiry) ---

function isOverridden(sessionId) {
  const overridePath = path.join(DB_DIR, `.override-${sessionId}`);
  if (!fs.existsSync(overridePath)) return false;
  // Check if override is older than 24 hours
  try {
    const created = parseInt(fs.readFileSync(overridePath, 'utf8'));
    if (Date.now() - created > 24 * 60 * 60 * 1000) {
      fs.unlinkSync(overridePath); // Expired
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setOverride(sessionId) {
  ensureDir();
  fs.writeFileSync(path.join(DB_DIR, `.override-${sessionId}`), Date.now().toString());
  // Cleanup stale overrides while we're here
  cleanupOverrides();
}

function cleanupOverrides() {
  try {
    const files = fs.readdirSync(DB_DIR).filter(f => f.startsWith('.override-'));
    const now = Date.now();
    for (const f of files) {
      try {
        const created = parseInt(fs.readFileSync(path.join(DB_DIR, f), 'utf8'));
        if (now - created > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(path.join(DB_DIR, f));
        }
      } catch {}
    }
  } catch {}
}

// --- Export ---

function exportCSV(sessionId, filepath) {
  initDb();
  const where = sessionId ? `WHERE session_id = ${escapeSQL(sessionId)}` : '';
  const result = sql(`SELECT timestamp || ',' || session_id || ',' || tool_name || ',' || model || ',' || est_input_tokens || ',' || est_output_tokens || ',' || est_cost_usd || ',' || branch FROM usage ${where} ORDER BY timestamp`);
  const header = 'timestamp,session_id,tool_name,model,input_tokens,output_tokens,cost_usd,branch';
  const csv = header + '\n' + (result || '');
  if (filepath) {
    fs.writeFileSync(filepath, csv);
    return { path: filepath, rows: result ? result.split('\n').length : 0 };
  }
  return csv;
}

function exportJSON(sessionId, filepath) {
  initDb();
  const where = sessionId ? `WHERE session_id = ${escapeSQL(sessionId)}` : '';
  const result = sql(`SELECT timestamp || '\t' || session_id || '\t' || tool_name || '\t' || model || '\t' || est_input_tokens || '\t' || est_output_tokens || '\t' || est_cost_usd || '\t' || branch FROM usage ${where} ORDER BY timestamp`);
  const rows = result ? result.split('\n').filter(Boolean).map(line => {
    const [timestamp, session_id, tool_name, model, input_tokens, output_tokens, cost_usd, branch] = line.split('\t');
    return { timestamp, session_id, tool_name, model, input_tokens: +input_tokens, output_tokens: +output_tokens, cost_usd: +cost_usd, branch };
  }) : [];
  const json = JSON.stringify(rows, null, 2);
  if (filepath) {
    fs.writeFileSync(filepath, json);
    return { path: filepath, rows: rows.length };
  }
  return json;
}

module.exports = {
  initDb, loadConfig, saveConfig, recordUsage,
  getSessionCost, getDailyCost, getWeeklyCost, getMonthlyCost,
  getSessionTokens, getSessionStart, getToolBreakdown, getModelBreakdown,
  getBranchBreakdown, getDailyBreakdown, getTopExpensiveCalls, getTotalEntries,
  checkBudget, isOverridden, setOverride, cleanupOverrides,
  exportCSV, exportJSON, logError, sql, escapeSQL,
  DB_PATH, CONFIG_PATH, DB_DIR, SCHEMA_VERSION
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
    case 'model-breakdown': console.log(JSON.stringify(getModelBreakdown(args[0]))); break;
    case 'branch-breakdown': console.log(JSON.stringify(getBranchBreakdown(args[0] || 30))); break;
    case 'daily-breakdown': console.log(JSON.stringify(getDailyBreakdown(args[0] || 7))); break;
    case 'top-expensive': console.log(JSON.stringify(getTopExpensiveCalls(args[0], args[1]))); break;
    case 'export-csv': console.log(exportCSV(args[0], args[1])); break;
    case 'export-json': console.log(exportJSON(args[0], args[1])); break;
    case 'override': setOverride(args[0]); console.log('Budget override set (expires in 24h)'); break;
    default: console.log('Commands: init, session-cost, daily-cost, weekly-cost, monthly-cost, check-budget, tool-breakdown, model-breakdown, branch-breakdown, daily-breakdown, top-expensive, export-csv, export-json, override');
  }
}
