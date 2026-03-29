# Contributing to Cost Guardian

Thanks for your interest in improving Cost Guardian!

## Quick Start

1. Fork and clone the repo
2. Make your changes
3. Test locally by symlinking to `~/.claude/plugins/cost-guardian`
4. Open a PR

## Areas Where Help is Needed

### High Priority
- **Token estimation accuracy**: Better per-tool multipliers based on real-world data
- **Integration with Anthropic Usage API**: Exact cost tracking for API users
- **CSV/JSON export**: Export usage data for external analysis

### Medium Priority
- **Team budgets**: Shared budget limits across team members
- **Terminal dashboard**: Real-time TUI with live-updating charts
- **Slack/Discord alerts**: Notifications when budgets hit thresholds

### Nice to Have
- **Cost comparison**: Compare cost of same task across different models
- **Smart suggestions**: "This task would be 80% cheaper on Sonnet"
- **Historical patterns**: "You usually spend more on Mondays"

## Code Style

- Keep scripts simple and dependency-free (no npm packages)
- Use Node.js built-ins only (fs, path, child_process)
- SQLite via the system `sqlite3` binary
- ASCII art reports should fit in 50-character-wide terminals

## Testing

```bash
# Initialize the database
node scripts/store.js init

# Test pricing lookup
node scripts/pricing.js list

# Test report generation
node scripts/reporter.js session test-session
node scripts/reporter.js daily 7

# Test estimation
echo '{"tool_name":"Read","tool_input":{"file_path":"test.js"},"tool_output":"const x = 1;"}' | node scripts/estimator.js
```

## Commit Messages

Use conventional commit style:
- `feat: add CSV export command`
- `fix: correct token estimation for Agent tool`
- `docs: update README with new examples`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
