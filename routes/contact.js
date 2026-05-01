const express = require("express");
const pool = require("../db");
const { sendContactEmails } = require("../services/emailService");

const router = express.Router();

function validate(payload) {
  const errors = {};
  if (!payload.name || typeof payload.name !== "string" || payload.name.trim() === "") errors.name = "required";
  if (!payload.email || typeof payload.email !== "string") errors.email = "required";
  else if (!/^\S+@\S+\.\S+$/.test(payload.email)) errors.email = "invalid";
  return errors;
}

async function insertSubmission(payload, source) {
  const row = {
    name: (payload.name || "").trim(),
    email: (payload.email || "").trim(),
    phone: payload.phone ? String(payload.phone).trim() : null,
    company: payload.company ? String(payload.company).trim() : null,
    inquiry_type: payload.inquiry_type ? String(payload.inquiry_type).trim() : null,
    project_scope: payload.project_scope ? String(payload.project_scope).trim() : null,
    message: payload.message ? String(payload.message) : null,
    source,
  };
  const [result] = await pool.query(
    `INSERT INTO contact_submissions
       (name, email, phone, company, inquiry_type, project_scope, message, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.name, row.email, row.phone, row.company, row.inquiry_type, row.project_scope, row.message, row.source],
  );
  return { ...row, id: result.insertId };
}

/**
 * Shared handler for /api/contact and /api/rfq. Identical behaviour, only
 * `source` differs in the persisted row. Emails are fire-and-forget so an
 * SMTP outage does not break form submission for end-users — but every
 * failure is explicitly logged with the submission id for traceability.
 */
async function handleSubmit(req, res, next, source) {
  try {
    const errors = validate(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: "validation_failed", fields: errors });
    }
    const submission = await insertSubmission(req.body, source);
    // eslint-disable-next-line no-console
    console.log(`[contact] submission stored id=${submission.id} source=${source} email=${submission.email}`);

    sendContactEmails(submission)
      .then(() => {
        // eslint-disable-next-line no-console
        console.log(`[contact] emails dispatched id=${submission.id}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[contact] email dispatch FAILED id=${submission.id} source=${source}:`, err);
      });

    res.status(201).json({ id: String(submission.id), status: "received" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[contact] submit failed source=${source}:`, err);
    next(err);
  }
}

router.post("/rfq", (req, res, next) => handleSubmit(req, res, next, "rfq"));
router.post("/contact", (req, res, next) => handleSubmit(req, res, next, "contact"));

module.exports = router;
