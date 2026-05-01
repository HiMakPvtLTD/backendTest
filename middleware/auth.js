const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const auth = req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

module.exports = { requireAuth };
