const bcrypt = require("bcryptjs");
const pool = require("./db");

/**
 * Ensure admins table exists and seed the default admin from .env.
 * Re-hashes if the .env ADMIN_PASSWORD has been rotated.
 */
async function seedAdmin() {
  const fs = require("fs");
  const path = require("path");
  const ddl = fs.readFileSync(path.join(__dirname, "schema", "admin.sql"), "utf8");
  await pool.query(ddl);

  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn("[seedAdmin] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping");
    return;
  }
  const [rows] = await pool.query("SELECT id, password_hash FROM admins WHERE email = ? LIMIT 1", [email]);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO admins (email, password_hash) VALUES (?, ?)", [email, hash]);
    // eslint-disable-next-line no-console
    console.log(`[seedAdmin] created admin ${email}`);
  } else {
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE admins SET password_hash = ? WHERE id = ?", [hash, rows[0].id]);
      // eslint-disable-next-line no-console
      console.log(`[seedAdmin] rotated password for ${email}`);
    }
  }
}

module.exports = { seedAdmin };
