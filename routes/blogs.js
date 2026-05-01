const express = require("express");
const pool = require("../db");

const router = express.Router();

/** MariaDB JSON columns return strings via mysql2 — decode defensively. */
function parseTags(row) {
  if (!row) return row;
  const tags = row.tags;
  if (typeof tags === "string") {
    try { row.tags = JSON.parse(tags); } catch { row.tags = []; }
  } else if (tags == null) {
    row.tags = [];
  }
  return row;
}

/**
 * GET /api/blogs
 * Public list — only published. Sorted by date DESC. Lightweight payload.
 */
router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, slug, title, excerpt, author, role, date, category,
              tags, heroImg, heroAlt, readMinutes, status, createdAt, updatedAt
         FROM blogs
        WHERE status = 'published'
        ORDER BY date DESC, id DESC`,
    );
    res.json(rows.map(parseTags));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/blogs/:slug
 * Public single — only published. Nested sections/takeaways/faqs.
 */
router.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const [blogs] = await pool.query(
      `SELECT id, slug, title, excerpt, author, role, date, category,
              tags, heroImg, heroAlt, readMinutes, status, createdAt, updatedAt
         FROM blogs
        WHERE slug = ? AND status = 'published'
        LIMIT 1`,
      [slug],
    );
    if (blogs.length === 0) {
      return res.status(404).json({ error: "blog_not_found" });
    }
    const blog = blogs[0];
    const blogId = blog.id;

    const [sections, takeaways, faqs] = await Promise.all([
      pool.query(
        `SELECT heading, body
           FROM blog_sections
          WHERE blog_id = ?
          ORDER BY order_index ASC, id ASC`,
        [blogId],
      ),
      pool.query(
        `SELECT text
           FROM blog_key_takeaways
          WHERE blog_id = ?
          ORDER BY order_index ASC, id ASC`,
        [blogId],
      ),
      pool.query(
        `SELECT question AS q, answer AS a
           FROM blog_faqs
          WHERE blog_id = ?
          ORDER BY order_index ASC, id ASC`,
        [blogId],
      ),
    ]);

    res.json({
      ...parseTags(blog),
      sections: sections[0],
      keyTakeaways: takeaways[0].map((r) => r.text),
      faqs: faqs[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
