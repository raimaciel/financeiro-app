const { execSync } = require('child_process');
const fs = require('fs');

const tables = [
  'users',
  'workspaces',
  'workspace_members',
  'credit_cards',
  'invoices',
  'transactions',
  'categories',
  'budgets',
  'savings_goals',
  'recurring_transactions',
  'invite_codes'
];

if (!fs.existsSync('backups')) {
  fs.mkdirSync('backups', { recursive: true });
}

const backupData = {};

for (const table of tables) {
  try {
    console.log('Backing up table:', table);
    const cmd = `npx wrangler d1 execute financeiro-db --remote --json --command "SELECT * FROM ${table};"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const json = JSON.parse(out);
    backupData[table] = json[0]?.results || [];
    console.log(`  -> ${backupData[table].length} records`);
  } catch (err) {
    console.error('Error backing up table ' + table + ':', err.message);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `backups/backup_remote_${timestamp}.json`;
fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
console.log('Successfully saved backup to:', backupPath);
