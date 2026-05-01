const express = require("express");
const pool = require("../db");

const router = express.Router();

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function paginate(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

const PROJECT_JSON_FIELDS = ["tags", "scope", "differentiators", "outcomes", "techPartners", "impact"];
function decodeProject(row) {
  if (!row) return row;
  for (const f of PROJECT_JSON_FIELDS) row[f] = parseJson(row[f], []);
  return row;
}

// ── Blogs ────────────────────────────────────────────────────────────────

router.get("/blogs", async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const q = (req.query.q || "").toString().trim();
    const status = (req.query.status || "").toString().trim();

    const where = [];
    const params = [];
    if (q) {
      where.push("(title LIKE ? OR slug LIKE ? OR excerpt LIKE ? OR author LIKE ? OR category LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (status === "draft" || status === "published") {
      where.push("status = ?");
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM blogs ${whereSql}`, params,
    );
    const [rows] = await pool.query(
      `SELECT id, slug, title, excerpt, author, role, date, category, tags,
              heroImg, heroAlt, readMinutes, status, createdAt, updatedAt
         FROM blogs ${whereSql}
        ORDER BY date DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    res.json({
      items: rows.map((r) => ({ ...r, tags: parseJson(r.tags, []) })),
      total, page, pageSize,
    });
  } catch (e) { next(e); }
});

router.get("/blogs/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [blogs] = await pool.query("SELECT * FROM blogs WHERE id = ? LIMIT 1", [id]);
    if (blogs.length === 0) return res.status(404).json({ error: "not_found" });
    const [sections, takeaways, faqs] = await Promise.all([
      pool.query("SELECT heading, body, order_index FROM blog_sections WHERE blog_id = ? ORDER BY order_index", [id]),
      pool.query("SELECT text, order_index FROM blog_key_takeaways WHERE blog_id = ? ORDER BY order_index", [id]),
      pool.query("SELECT question AS q, answer AS a, order_index FROM blog_faqs WHERE blog_id = ? ORDER BY order_index", [id]),
    ]);
    const b = blogs[0];
    res.json({
      ...b, tags: parseJson(b.tags, []),
      sections: sections[0], keyTakeaways: takeaways[0].map((r) => r.text), faqs: faqs[0],
    });
  } catch (e) { next(e); }
});

function normalizeStatus(v) {
  // Default to 'draft' when client omits or sends an unrecognised value.
  return v === "published" ? "published" : "draft";
}

router.post("/blogs", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const b = req.body || {};
    if (!b.slug || !b.title) { await conn.rollback(); return res.status(400).json({ error: "slug_and_title_required" }); }
    const [r] = await conn.query(
      `INSERT INTO blogs (slug, title, excerpt, author, role, date, category, tags, heroImg, heroAlt, readMinutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.slug, b.title, b.excerpt || "", b.author || "Hi-MAK Engineering Team", b.role || null,
      b.date || new Date().toISOString().slice(0, 10), b.category || "Insights",
      JSON.stringify(b.tags || []), b.heroImg || "", b.heroAlt || b.title, b.readMinutes || 5,
      normalizeStatus(b.status)],
    );
    const id = r.insertId;
    await writeChildren(conn, id, b);
    await conn.commit();
    res.status(201).json({ id });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.put("/blogs/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = Number(req.params.id);
    const b = req.body || {};
    await conn.query(
      `UPDATE blogs SET slug=?, title=?, excerpt=?, author=?, role=?, date=?, category=?, tags=?,
       heroImg=?, heroAlt=?, readMinutes=?, status=? WHERE id=?`,
      [b.slug, b.title, b.excerpt || "", b.author, b.role || null, b.date, b.category,
      JSON.stringify(b.tags || []), b.heroImg || "", b.heroAlt || b.title, b.readMinutes || 5,
      normalizeStatus(b.status), id],
    );
    await conn.query("DELETE FROM blog_sections WHERE blog_id = ?", [id]);
    await conn.query("DELETE FROM blog_key_takeaways WHERE blog_id = ?", [id]);
    await conn.query("DELETE FROM blog_faqs WHERE blog_id = ?", [id]);
    await writeChildren(conn, id, b);
    await conn.commit();
    res.json({ id });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.delete("/blogs/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM blogs WHERE id = ?", [Number(req.params.id)]);
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

// ── Projects ─────────────────────────────────────────────────────────────

router.get("/projects", async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const q = (req.query.q || "").toString().trim();
    const industry = (req.query.industry || "").toString().trim();
    const solution = (req.query.solution || "").toString().trim();

    const where = [];
    const params = [];
    if (q) {
      where.push("(title LIKE ? OR slug LIKE ? OR subtitle LIKE ? OR industry LIKE ? OR solution LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (industry) { where.push("industry = ?"); params.push(industry); }
    if (solution) { where.push("solution = ?"); params.push(solution); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM projects ${whereSql}`, params,
    );
    const [rows] = await pool.query(
      `SELECT * FROM projects ${whereSql}
        ORDER BY id ASC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    res.json({ items: rows.map(decodeProject), total, page, pageSize });
  } catch (e) { next(e); }
});

router.get("/projects/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM projects WHERE id = ? LIMIT 1", [Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json(decodeProject(rows[0]));
  } catch (e) { next(e); }
});

router.post("/projects", async (req, res, next) => {
  try {
    const p = req.body || {};
    if (!p.slug || !p.title) return res.status(400).json({ error: "slug_and_title_required" });

    const [r] = await pool.query(
      `INSERT INTO projects
         (slug, title, subtitle, industry, solution, platform, metric, description, image,
          heroImg, tags, challenge, solutionDetail, scope, differentiators, outcomes,
          techPartners, impact, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.slug, p.title, p.subtitle || null, p.industry || "", p.solution || "",
      p.platform || null, p.metric || null, p.description || null, p.image || null,
      p.heroImg || p.image || null,
      JSON.stringify(p.tags || []),
      p.challenge || null,
      p.solutionDetail || null,
      JSON.stringify(p.scope || []),
      JSON.stringify(p.differentiators || []),
      JSON.stringify(p.outcomes || []),
      JSON.stringify(p.techPartners || []),
      JSON.stringify(p.impact || []),
      p.featured ? 1 : 0,
      ],

    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { next(e); }
});

router.put("/projects/:id", async (req, res, next) => {
  try {
    const p = req.body || {};

    await pool.query(
      `UPDATE projects SET slug=?, title=?, subtitle=?, industry=?, solution=?, platform=?,
         metric=?, description=?, image=?, heroImg=?, tags=?, challenge=?, solutionDetail=?,
         scope=?, differentiators=?, outcomes=?, techPartners=?, impact=?, featured=?
       WHERE id=?`,
      [p.slug, p.title, p.subtitle || null, p.industry, p.solution, p.platform || null,
      p.metric || null, p.description || null, p.image || null,
      p.heroImg || p.image || null,
      JSON.stringify(p.tags || []),
      p.challenge || null,
      p.solutionDetail || null,
      JSON.stringify(p.scope || []),
      JSON.stringify(p.differentiators || []),
      JSON.stringify(p.outcomes || []),
      JSON.stringify(p.techPartners || []),
      JSON.stringify(p.impact || []),
      p.featured ? 1 : 0,
      Number(req.params.id)],
    );

    res.json({ id: Number(req.params.id) });
  } catch (e) {
    next(e);
  }
});

router.delete("/projects/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM projects WHERE id = ?", [Number(req.params.id)]);
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

// ── Submissions + Stats ──────────────────────────────────────────────────

router.get("/submissions", async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const q = (req.query.q || "").toString().trim();
    const where = [];
    const params = [];
    if (q) {
      where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ? OR message LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM contact_submissions ${whereSql}`, params,
    );
    const [rows] = await pool.query(
      `SELECT * FROM contact_submissions ${whereSql}
        ORDER BY createdAt DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    res.json({ items: rows, total, page, pageSize });
  } catch (e) { next(e); }
});

router.get("/stats", async (_req, res, next) => {
  try {
    const [[b], [p], [c]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS n FROM blogs"),
      pool.query("SELECT COUNT(*) AS n FROM projects"),
      pool.query("SELECT COUNT(*) AS n FROM contact_submissions"),
    ]);
    res.json({ blogs: b[0].n, projects: p[0].n, submissions: c[0].n });
  } catch (e) { next(e); }
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function writeChildren(conn, blogId, b) {
  for (const [i, s] of (b.sections || []).entries()) {
    if (!s || !s.heading) continue;
    await conn.query(
      "INSERT INTO blog_sections (blog_id, heading, body, order_index) VALUES (?, ?, ?, ?)",
      [blogId, s.heading, s.body || "", i],
    );
  }
  for (const [i, t] of (b.keyTakeaways || []).entries()) {
    if (!t) continue;
    await conn.query(
      "INSERT INTO blog_key_takeaways (blog_id, text, order_index) VALUES (?, ?, ?)",
      [blogId, t, i],
    );
  }
  for (const [i, f] of (b.faqs || []).entries()) {
    if (!f || !f.q) continue;
    await conn.query(
      "INSERT INTO blog_faqs (blog_id, question, answer, order_index) VALUES (?, ?, ?, ?)",
      [blogId, f.q, f.a || "", i],
    );
  }
}

module.exports = router;
