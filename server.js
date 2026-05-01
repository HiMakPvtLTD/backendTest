require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const pool = require("./db");
const { seedAdmin } = require("./seedAdmin");
const { requireAuth } = require("./middleware/auth");
const blogsRouter = require("./routes/blogs");
const projectsRouter = require("./routes/projects");
const contactRouter = require("./routes/contact");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const { router: uploadsRouter, UPLOAD_DIR } = require("./routes/uploads");

const app = express();
const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || "0.0.0.0";

app.set("trust proxy", 1); // for rate-limit + req.ip behind kube ingress

app.use(helmet({ crossOriginResourcePolicy: false }));
// app.use(cors({
//   origin: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean),
// }));
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow Postman/Thunderclient

    if (allowedOrigins.length === 0) return callback(null, true); // dev fallback: allow all
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/api/status", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: rows[0].ok === 1 ? "up" : "unknown" });
  } catch (err) {
    res.status(500).json({ status: "degraded", db: "down", error: err.code });
  }
});

// Public
app.use("/api/blogs", blogsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api", contactRouter);        // /api/rfq + /api/contact
app.use("/api/auth", authRouter);      // /api/auth/login + /api/auth/me

// Public file serving for uploaded images (no auth needed for read)
app.use("/api/uploads", express.static(UPLOAD_DIR, {
  fallthrough: false,
  maxAge: "30d",
}));

// Protected admin APIs
app.use("/api/admin/uploads", requireAuth, uploadsRouter);
app.use("/api/admin", requireAuth, adminRouter);

// 404 for /api/*
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found", path: req.path });
  next();
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error("[backend error]", err);
  res.status(500).json({ error: "internal_error" });
});

(async () => {
  try {
    await seedAdmin();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[seedAdmin] failed:", err.message);
  }
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on http://${HOST}:${PORT}`);
  });
})();
