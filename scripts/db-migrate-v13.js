const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 13) {
  console.log('Starting migration from v12 to v13 (Stripe SaaS, Coupons, Invoices & Entry Fees)...');
  db.transaction(() => {
    // 1. Add plan and currency fields to courses.
    const courseCols = db.pragma('table_info(courses)').map(c => c.name);
    if (!courseCols.includes('subscription_plan')) {
      db.exec(`ALTER TABLE courses ADD COLUMN subscription_plan TEXT DEFAULT 'starter'`);
    }
    if (!courseCols.includes('currency')) {
      db.exec(`ALTER TABLE courses ADD COLUMN currency TEXT DEFAULT 'USD'`);
    }
    if (!courseCols.includes('trial_ends_at')) {
      db.exec(`ALTER TABLE courses ADD COLUMN trial_ends_at DATETIME`);
    }

    // 2. Coupon and discount-code table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS coupon_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        code TEXT NOT NULL UNIQUE,
        discount_type TEXT DEFAULT 'percent',
        discount_value REAL NOT NULL,
        max_uses INTEGER DEFAULT 100,
        used_count INTEGER DEFAULT 0,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
    `);

    // 3. Invoice history table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'paid',
        plan_name TEXT NOT NULL,
        period_start TEXT,
        period_end TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
    `);

    // 4. Tournament registration fee table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS tournament_entry_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        fee_amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        payment_status TEXT DEFAULT 'paid',
        paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id),
        FOREIGN KEY(team_id) REFERENCES teams(id)
      );
    `);

    // Default sample invoices and coupon for testing
    const courses = db.prepare('SELECT id FROM courses').all();
    const insertInvoice = db.prepare(`
      INSERT OR IGNORE INTO billing_invoices (course_id, invoice_number, amount, currency, status, plan_name, period_start, period_end)
      VALUES (?, ?, ?, 'USD', 'paid', 'Pro Club ($149/ay)', '2026-08-01', '2026-09-01')
    `);
    const insertCoupon = db.prepare(`
      INSERT OR IGNORE INTO coupon_codes (course_id, code, discount_type, discount_value, max_uses)
      VALUES (?, 'BIRVO20', 'percent', 20.0, 50)
    `);

    for (const c of courses) {
      insertInvoice.run(c.id, `INV-2026-${c.id}-001`, 149.00);
      insertCoupon.run(c.id);
    }

    db.pragma('user_version = 13');
  })();

  console.log('Migration v13 applied successfully.');
} else {
  console.log('Database is already at version 13 or higher. No migration needed.');
}

db.close();
