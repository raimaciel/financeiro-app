const { execSync } = require('child_process');
const fs = require('fs');

const resetSql = `
DELETE FROM transactions;
DELETE FROM invoices;
DELETE FROM credit_cards;
DELETE FROM categories;
DELETE FROM budgets;
DELETE FROM savings_goals;
DELETE FROM recurring_transactions;
DELETE FROM workspace_members;
DELETE FROM workspaces;
DELETE FROM users WHERE email != 'raimaciel@gmail.com';
DELETE FROM invite_codes;
DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'categories', 'budgets', 'savings_goals', 'recurring_transactions');
UPDATE users SET is_admin = 1, is_active = 1 WHERE email = 'raimaciel@gmail.com';
`;

fs.writeFileSync('reset_commands.sql', resetSql, 'utf8');

console.log('Executing reset on remote Cloudflare D1 database (financeiro-db)...');
const out = execSync('npx wrangler d1 execute financeiro-db --remote --file=reset_commands.sql', { encoding: 'utf8' });
console.log(out);

if (fs.existsSync('reset_commands.sql')) {
  fs.unlinkSync('reset_commands.sql');
}

console.log('Checking final counts...');
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

for (const table of tables) {
  const countCmd = `npx wrangler d1 execute financeiro-db --remote --json --command "SELECT count(*) as count FROM ${table};"`;
  const countOut = execSync(countCmd, { encoding: 'utf8' });
  const countJson = JSON.parse(countOut);
  const count = countJson[0]?.results[0]?.count ?? 0;
  console.log(`Table ${table.padEnd(25)}: ${count} rows`);
}
