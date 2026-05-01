const express = require("express");
const pool = require("../db");

const router = express.Router();

const JSON_FIELDS = ["tags", "scope", "differentiators", "outcomes", "techPartners", "impact"];

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function decodeRow(row) {
  if (!row) return row;
  for (const f of JSON_FIELDS) row[f] = parseJson(row[f], []);
  return row;
}

/**
 * GET /api/projects
 * List — light payload for the filter grid.
 */
router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, slug, title, subtitle, industry, solution, platform, metric,
              description, image, heroImg, tags, impact, createdAt, updatedAt, featured
         FROM projects
        ORDER BY id ASC`,
    );
    res.json(rows.map((r) => ({
      ...r,
      tags: parseJson(r.tags, []),
      impact: parseJson(r.impact, []),
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:slug
 * Single — full case study.
 */
router.get("/:slug", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, slug, title, subtitle, industry, solution, platform, metric,
              description, image, heroImg, tags, challenge, solutionDetail,
              scope, differentiators, outcomes, techPartners, impact,
              createdAt, updatedAt, featured
         FROM projects
        WHERE slug = ?
        LIMIT 1`,
      [req.params.slug],
    );
    if (rows.length === 0) return res.status(404).json({ error: "project_not_found" });
    res.json(decodeRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
