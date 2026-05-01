const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null; // mock mode — see sendMail below
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },

    tls: { rejectUnauthorized: false, },
    debug: true,
    logger: true,
  });
  return transporter;
}

async function sendMail(opts) {
  const t = getTransporter();
  if (!t) {
    // Dev/mock: log and pretend success so RFQ flow isn't blocked.
    // eslint-disable-next-line no-console
    console.log("[email MOCK] would send:", {
      to: opts.to, cc: opts.cc, subject: opts.subject,
    });
    return { mocked: true };
  }
  // return t.sendMail({
  //   from: process.env.SMTP_FROM,
  //   ...opts,
  // });
  const res = await t.sendMail({
    from: process.env.SMTP_FROM,
    ...opts,
  });

  console.log("✅Email sent:", res.messageId);

  return res;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderInternalHtml(s) {
  const rows = [
    ["Name", s.name],
    ["Company", s.company],
    ["Email", s.email],
    ["Phone", s.phone],
    ["Inquiry Type", s.inquiry_type],
    ["Project Scope", s.project_scope],
    ["Message", s.message],
    ["Source", s.source],
    ["Reference ID", s.id],
  ];
  const body = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border:1px solid #e5e5e5;font-family:monospace;font-size:12px;color:#555;">${escapeHtml(k)}</td><td style="padding:6px 10px;border:1px solid #e5e5e5;font-size:14px;">${escapeHtml(v)}</td></tr>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;color:#222;">
    <h2 style="color:#005F9E;border-bottom:3px solid #FF6A00;padding-bottom:8px;">New Inquiry Received</h2>
    <p style="color:#555;font-size:14px;">A new inquiry has been submitted via the Hi-MAK website.</p>
    <table style="border-collapse:collapse;width:100%;margin-top:16px;">${body}</table>
    <p style="margin-top:20px;color:#888;font-size:12px;">Hi-MAK Pvt. Ltd. · Automated notification</p>
  </div>`;
}

function renderUserHtml(s) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:20px;color:#222;">
    <h2 style="color:#005F9E;border-bottom:3px solid #FF6A00;padding-bottom:8px;">Thank you for reaching out</h2>
    <p>Dear ${escapeHtml(s.name)},</p>
    <p>We have received your inquiry and our engineering team will get back to you within <strong>24 hours</strong>.</p>
    <p><strong>Your reference:</strong> #${escapeHtml(s.id)}</p>
    <p style="margin-top:20px;">Meanwhile, feel free to explore our <a href="https://himak.in/projects" style="color:#005F9E;">project portfolio</a> or reach us at <a href="mailto:info@himak.in" style="color:#005F9E;">info@himak.in</a>.</p>
    <p style="margin-top:24px;">Warm regards,<br/><strong>Hi-MAK Pvt. Ltd.</strong><br/><span style="color:#888;font-size:12px;">Your Automation Partner · Since 1993</span></p>
  </div>`;
}

async function sendContactEmails(submission) {
  const internalTo = process.env.MAIL_TO_INTERNAL;
  const internalCc = (process.env.MAIL_CC_INTERNAL || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const tasks = [];
  if (internalTo) {
    tasks.push(
      sendMail({
        to: internalTo,
        cc: internalCc,
        subject: `[Hi-MAK Inquiry #${submission.id}] ${submission.inquiry_type || "New submission"} from ${submission.name}`,
        html: renderInternalHtml(submission),
        replyTo: submission.email,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[email] internal notification failed:", err.message);
      }),
    );
  }
  if (submission.email) {
    tasks.push(
      sendMail({
        to: submission.email,
        subject: `Thanks — we received your inquiry (Ref #${submission.id})`,
        html: renderUserHtml(submission),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[email] user ack failed:", err.message);
      }),
    );
  }
  await Promise.allSettled(tasks);
}

module.exports = { sendContactEmails, sendMail };
