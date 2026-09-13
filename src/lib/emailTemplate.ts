/**
 * The branded email layout -- the same design as the main app's
 * src/templates/email-layout.js, in TypeScript. Keep the two in step.
 *
 * Inline styles on tables, because Gmail strips <style> and knows no CSS
 * variables. Logo as a CID attachment so it shows without "load images".
 */
import path from "path";

export const BRAND = { mark: "#e85020", brand: "#5058a8", ink: "#161a2e", ink2: "#4b5069", ink3: "#7c8199", line: "#e2e4ee", page: "#f4f5f9", surface: "#ffffff", soft: "#eceef8" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const NAME = "GallantSMS";
const LEGAL = "Gallant Byte";

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const p = (html: string) => `<p style="margin:0 0 14px;font:15px/1.55 ${FONT};color:${BRAND.ink2};">${html}</p>`;
export const callout = (html: string, { mono = true } = {}) =>
    `<div style="margin:18px 0;padding:16px 18px;background:${BRAND.soft};border-left:4px solid ${BRAND.brand};border-radius:6px;font:${mono ? "600 26px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : `15px/1.55 ${FONT}`};color:${BRAND.ink};letter-spacing:${mono ? "0.08em" : "0"};">${html}</div>`;
export const details = (rows: [string, string][]) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;border-collapse:collapse;font:14px/1.5 ${FONT};">` +
    rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:${BRAND.ink3};vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;color:${BRAND.ink};">${v}</td></tr>`).join("") + "</table>";

export interface EmailSpec { title: string; preheader?: string; name?: string | null; body: string; cta?: { label: string; url: string }; footnote?: string }

export function renderEmail({ title, preheader = "", name, body, cta, footnote }: EmailSpec): { html: string; text: string } {
    const year = new Date().getFullYear();
    const greeting = name ? `Hello ${esc(name)},` : "Hello,";
    const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td style="border-radius:6px;background:${BRAND.brand};"><a href="${esc(cta.url)}" style="display:inline-block;padding:11px 20px;font:600 14px ${FONT};color:#ffffff;text-decoration:none;border-radius:6px;">${esc(cta.label)}</a></td></tr></table>` : "";
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};"><tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:10px;">
    <tr><td style="padding:22px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:10px;"><img src="cid:gallantsmslogo" width="36" height="36" alt="" style="display:block;border-radius:8px;"></td>
      <td style="vertical-align:middle;font:700 17px ${FONT};color:${BRAND.ink};letter-spacing:-0.01em;">Gallant<span style="color:${BRAND.mark};">SMS</span></td>
    </tr></table></td></tr>
    <tr><td style="padding:22px 28px 6px;">
      <h1 style="margin:0 0 14px;font:600 21px/1.3 ${FONT};color:${BRAND.ink};letter-spacing:-0.01em;">${esc(title)}</h1>
      ${p(greeting)}${body}${button}
    </td></tr>
    ${footnote ? `<tr><td style="padding:10px 28px 0;"><p style="margin:0;font:12.5px/1.5 ${FONT};color:${BRAND.ink3};">${footnote}</p></td></tr>` : ""}
    <tr><td style="padding:22px 28px 24px;"><hr style="border:0;border-top:1px solid ${BRAND.line};margin:0 0 14px;">
      <p style="margin:0;font:12px/1.6 ${FONT};color:${BRAND.ink3};">Transactional SMS for Kenyan businesses.<br>&copy; ${year} ${LEGAL}. This message was sent to you because you have a ${NAME} account.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
    const text = [NAME, "", title, "", greeting, "",
        body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/\n{3,}/g, "\n\n").trim(),
        cta ? `\n${cta.label}: ${cta.url}` : "", footnote ? `\n${footnote.replace(/<[^>]+>/g, "")}` : "", "", "--", `${LEGAL} · ${NAME}`].join("\n");
    return { html, text };
}

export function brandAttachments() {
    return [{ filename: "gallant.png", path: path.join(process.cwd(), "public", "mark.png"), cid: "gallantsmslogo" }];
}

const APP = () => (process.env.MAIN_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The customer emails the console sends. Same wording as the main app's set. */
export const emails = {
    templateDecision: ({ name, templateName, slug, decision, note }: { name?: string | null; templateName: string; slug: string; decision: "approved" | "rejected" | "changes_requested"; note?: string | null }) => {
        const titles = { approved: "Template approved", rejected: "Template not approved", changes_requested: "Your template needs a change" } as const;
        const body = decision === "approved"
            ? p(`<strong>${esc(templateName)}</strong> (<code>${esc(slug)}</code>) has been approved. You can send it through the API now.`)
            : decision === "rejected"
                ? p(`<strong>${esc(templateName)}</strong> (<code>${esc(slug)}</code>) was not approved for the transactional route.`) + callout(esc(note), { mono: false }) + p("You can edit the template on your dashboard and it will be reviewed again when you save.")
                : p(`<strong>${esc(templateName)}</strong> (<code>${esc(slug)}</code>) needs one change before it can be approved:`) + callout(esc(note), { mono: false }) + p("Edit it on your dashboard; it returns to review automatically when you save.");
        return { subject: `${titles[decision]}: ${templateName}`, ...renderEmail({ title: titles[decision], preheader: note ? note.slice(0, 120) : `${templateName} is ready to send.`, name, body, cta: { label: "Open templates", url: `${APP()}/dashboard/templates` } }) };
    },
    supportReply: ({ name, subject, reply, adminName }: { name?: string | null; subject: string; reply: string; adminName: string }) => ({
        subject: `Re: ${subject}`,
        ...renderEmail({ title: `Reply to "${subject}"`, preheader: reply.slice(0, 120), name,
            body: callout(esc(reply).replace(/\n/g, "<br>"), { mono: false }) + p(`-- ${esc(adminName)}, GallantSMS support`) + p("Reply on your dashboard's Support page and we will see it there."),
            cta: { label: "Open support", url: `${APP()}/dashboard/support` } }),
    }),
    creditsAdjusted: ({ name, delta, balance, reason }: { name?: string | null; delta: number; balance: number; reason: string }) => ({
        subject: delta > 0 ? `${delta} credits added to your account` : `${Math.abs(delta)} credits removed from your account`,
        ...renderEmail({ title: delta > 0 ? "Credits added" : "Credits removed", name, body: p(esc(reason)) + details([["Change", `${delta > 0 ? "+" : ""}${delta} credits`], ["Balance now", `${balance} credits`]]), cta: { label: "View billing", url: `${APP()}/dashboard/billing` } }),
    }),
    accountStatus: ({ name, status, reason }: { name?: string | null; status: "active" | "suspended" | "banned"; reason: string }) => ({
        subject: status === "active" ? "Your GallantSMS account is active again" : `Your GallantSMS account has been ${status}`,
        ...renderEmail({ title: status === "active" ? "Account reactivated" : `Account ${status}`, name,
            body: status === "active" ? p("Your account is active again and your API keys will work from now.") : p(`Your account has been ${status}. API keys are refused while it is.`) + callout(esc(reason), { mono: false }) + p("If you believe this is a mistake, reply from your dashboard's Support page."),
            cta: { label: "Open support", url: `${APP()}/dashboard/support` } }),
    }),
    warning: ({ name, reason, count }: { name?: string | null; reason: string; count: number }) => ({
        subject: count === 1 ? "Warning: transactional-only sender" : `Warning ${count}: transactional-only sender`,
        ...renderEmail({ title: count === 1 ? "A message broke the transactional-only rule" : `Warning ${count}: transactional-only rule`, name,
            body: callout(esc(reason), { mono: false }) + p("This sender ID is registered for transactional messages only: confirmations, receipts, one-time codes, alerts and status updates about something the recipient initiated. " + (count >= 2 ? "<strong>Further marketing content will lead to suspension.</strong>" : "Please keep to those.")),
            cta: { label: "Review your templates", url: `${APP()}/dashboard/templates` } }),
    }),
    notice: ({ name, title, message, adminName }: { name?: string | null; title: string; message: string; adminName?: string }) => ({
        subject: title, ...renderEmail({ title, name, body: p(esc(message).replace(/\n/g, "<br>")) + (adminName ? p(`-- ${esc(adminName)}, GallantSMS`) : "") }),
    }),
    /** Free-form compose from the Email page: paragraphs from the admin's text */
    compose: ({ name, subject, body }: { name?: string | null; subject: string; body: string }) => ({
        subject, ...renderEmail({ title: subject, name, body: body.split(/\n{2,}/).map((para) => p(esc(para.trim()).replace(/\n/g, "<br>"))).join("") }),
    }),
};
