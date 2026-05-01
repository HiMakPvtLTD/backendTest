const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
]);
const EXT_BY_MIME = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
  "image/gif": ".gif", "image/svg+xml": ".svg",
};

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  // limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("unsupported_mime"));
    }
    cb(null, true);
  },
});

/**
 * POST /api/admin/uploads — protected upload (mounted under requireAuth in server.js).
 * Returns: { url, filename, size, mime }
 */
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  res.status(201).json({
    url: `/api/uploads/${req.file.filename}`,
    filename: req.file.filename,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

router.use((err, _req, res, _next) => {
  if (err && err.message === "unsupported_mime") {
    return res.status(415).json({ error: "unsupported_mime" });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    // return res.status(413).json({ error: "file_too_large", limit: "8MB" });
    return res.status(413).json({ error: "file_too_large", limit: "10MB" });
  }
  // eslint-disable-next-line no-console
  console.error("[uploads] error:", err);
  res.status(500).json({ error: "upload_failed" });
});

module.exports = { router, UPLOAD_DIR };
