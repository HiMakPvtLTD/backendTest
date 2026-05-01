/**
 * Seed MySQL from the frontend's static data files so the new backend
 * serves the same content the hardcoded frontend already renders.
 *
 * Run with:  node schema/seed.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const pool = require("../db");

const FRONTEND_DATA_DIR = path.resolve(__dirname, "..", "..", "frontend", "src", "data");

/**
 * Minimal ESM → CJS transform for the frontend data files. Handles:
 *  - `import { a, b } from "@/data/xxx";`   → injected locals from `deps`
 *  - `export const FOO = ...`               → `module.exports.FOO = ...`
 *  - `export function foo ...`              → `module.exports.foo = function foo ...`
 * Strips any other exports (e.g. getPost helpers we don't need).
 */
function loadEsmModule(filePath, deps = {}) {
  let src = fs.readFileSync(filePath, "utf8");

  // Drop any import lines (we inject deps manually below)
  src = src.replace(/^\s*import\s+[^;]+;?\s*$/gm, "");

  // Convert named const/let/function exports
  src = src.replace(/export\s+const\s+(\w+)\s*=/g, "module.exports.$1 =");
  src = src.replace(/export\s+function\s+(\w+)/g, "module.exports.$1 = function $1");

  const prelude = Object.keys(deps)
    .map((k) => `const ${k} = __deps.${k};`)
    .join("\n");

  const wrapped = `${prelude}\n${src}`;
  const module_ = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function("module", "__deps", wrapped);
  fn(module_, deps);
  return module_.exports;
}

function loadBlogs() {
  const templates = loadEsmModule(path.join(FRONTEND_DATA_DIR, "blogTemplates.js"));
  const posts = loadEsmModule(path.join(FRONTEND_DATA_DIR, "blogPosts.js"), {
    technicalDeepDive: templates.technicalDeepDive,
    industryInsight: templates.industryInsight,
    projectSpotlight: templates.projectSpotlight,
  });
  return posts.BLOG_POSTS;
}

function loadCaseStudies() {
  return loadEsmModule(path.join(FRONTEND_DATA_DIR, "caseStudies.js")).CASE_STUDIES;
}

// ── Seeders ──────────────────────────────────────────────────────────────

async function resetSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const statements = ddl
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--") && !/^SET\s/i.test(s));
  // Disable FK checks so DROP can proceed in any order across re-seeds.
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const stmt of statements) {
      await pool.query(stmt);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  console.log(`[seed] schema reset — ${statements.length} statements`);
}

async function seedBlogs(blogs) {
  for (const b of blogs) {
    const [result] = await pool.query(
      `INSERT INTO blogs
         (slug, title, excerpt, author, role, date, category, tags,
          heroImg, heroAlt, readMinutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.slug, b.title, b.excerpt, b.author, b.role || null, b.date, b.category,
        JSON.stringify(b.tags || []), b.heroImg, b.heroAlt, b.readMinutes || 5,
      ],
    );
    const blogId = result.insertId;

    for (const [i, s] of (b.sections || []).entries()) {
      await pool.query(
        `INSERT INTO blog_sections (blog_id, heading, body, order_index) VALUES (?, ?, ?, ?)`,
        [blogId, s.heading, s.body, i],
      );
    }
    for (const [i, t] of (b.keyTakeaways || []).entries()) {
      await pool.query(
        `INSERT INTO blog_key_takeaways (blog_id, text, order_index) VALUES (?, ?, ?)`,
        [blogId, t, i],
      );
    }
    for (const [i, f] of (b.faqs || []).entries()) {
      await pool.query(
        `INSERT INTO blog_faqs (blog_id, question, answer, order_index) VALUES (?, ?, ?, ?)`,
        [blogId, f.q, f.a, i],
      );
    }
  }
  console.log(`[seed] blogs: ${blogs.length}`);
}

async function seedProjects(projects) {
  for (const p of projects) {
    await pool.query(
      `INSERT INTO projects
         (slug, title, subtitle, industry, solution, platform, metric, description, image,
          heroImg, tags, challenge, solutionDetail, scope, differentiators, outcomes,
          techPartners, impact, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.slug, p.title, p.subtitle || null, p.industry, p.solution,
        p.platform || null, p.metric || null, p.challenge || null, p.img || null,
        p.heroImg || p.img || null,
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
  }
  console.log(`[seed] projects: ${projects.length}`);
}

// ── Main ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    await resetSchema();
    const blogs = loadBlogs();
    const projects = loadCaseStudies();
    await seedBlogs(blogs);
    await seedProjects(projects);
    console.log("[seed] done");
  } catch (err) {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
