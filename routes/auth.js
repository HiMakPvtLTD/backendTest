const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const [rows] = await pool.query(
      "SELECT id, email, password_hash FROM admins WHERE email = ? LIMIT 1",
      [email],
    );
    if (rows.length === 0) return res.status(401).json({ error: "invalid_credentials" });
    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    const token = jwt.sign(
      { sub: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );
    res.json({ token, admin: { id: admin.id, email: admin.email } });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ admin: { id: req.admin.sub, email: req.admin.email } });
});

module.exports = router;
