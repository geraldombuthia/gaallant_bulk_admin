/**
 * Transactional-only review aids.
 *
 * The sender ID is registered for transactional traffic. Promotional content
 * through it risks the route, and in Kenya the CA's unsolicited-messaging
 * rules put the liability on the sender. A reviewer cannot read every
 * template with the regulations in their head, so this surfaces the things
 * that usually mean "this is marketing" -- each with a plain-language
 * explanation the reviewer can drop straight into a correction note.
 *
 * These are prompts, not verdicts. A flagged template can still be fine;
 * an unflagged one can still be marketing. The reviewer decides.
 */

export type Severity = "block" | "warn" | "note";

export interface Flag {
    id: string;
    severity: Severity;
    title: string;
    detail: string;
    /** Text a reviewer can send to the user as-is */
    suggestion: string;
    /** The matched fragment, when there is one */
    match?: string;
}

const PROMO_WORDS = [
    "offer", "offers", "sale", "discount", "promo", "promotion", "deal", "deals",
    "win", "winner", "prize", "jackpot", "free", "bonus", "cashback", "cash back",
    "limited time", "hurry", "buy now", "order now", "shop now", "don't miss", "dont miss",
    "exclusive", "special", "save up to", "% off", "percent off", "subscribe", "join now",
    "bet", "betting", "odds", "stake", "reward", "rewards", "voucher", "coupon",
    "new arrival", "launch", "introducing", "upgrade now", "refer a friend", "invite",
];

const OPT_OUT = /\b(stop|unsubscribe|opt[- ]?out|reply\s+stop|send\s+stop)\b/i;
const URL = /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|co\.ke|ke|io|net|org|app|link|ly|me)(\/\S*)?\b/i;
const SHORT_URL = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|shorturl\.at)\b/i;
const PHONE = /\b(\+?254|0)7\d{8}\b/;
const PLACEHOLDER = /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g;

const GSM_CHARSET = /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\r\n^{}\\[~\]|€]*$/;

export function segments(text: string): { segments: number; encoding: "gsm" | "unicode"; characters: number } {
    const unicode = !GSM_CHARSET.test(text);
    const single = unicode ? 70 : 160;
    const multi = unicode ? 67 : 153;
    const length = unicode ? text.length : text.length + (text.match(/[\\^{}[\]~|€]/g) || []).length;
    const count = length === 0 || length <= single ? 1 : Math.ceil(length / multi);
    return { segments: count, encoding: unicode ? "unicode" : "gsm", characters: length };
}

export function review(content: string): Flag[] {
    const text = content || "";
    const lower = text.toLowerCase();
    const flags: Flag[] = [];

    // --- promotional language ---
    const hits = PROMO_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(lower));
    if (hits.length > 0) {
        flags.push({
            id: "promo-words",
            severity: hits.length >= 2 ? "block" : "warn",
            title: `Promotional language: ${hits.slice(0, 4).map((h) => `"${h}"`).join(", ")}`,
            detail: "Words like these signal an offer or campaign rather than a record of something the recipient did or asked for.",
            suggestion: `Please remove promotional wording (${hits.slice(0, 3).join(", ")}). This sender ID is registered for transactional messages only: confirmations, receipts, codes, alerts and status updates about something the recipient initiated.`,
            match: hits.join(", "),
        });
    }

    // --- opt-out language: marketing has it, transactional does not need it ---
    const optOut = text.match(OPT_OUT);
    if (optOut) {
        flags.push({
            id: "opt-out",
            severity: "warn",
            title: "Contains opt-out wording",
            detail: "\"Reply STOP\" and similar are required on marketing messages. Their presence usually means the message is one.",
            suggestion: "Opt-out instructions are for marketing messages. A transactional message about the recipient's own activity does not need one; if this message needs it, it belongs on a promotional route.",
            match: optOut[0],
        });
    }

    // --- links ---
    const shortUrl = text.match(SHORT_URL);
    if (shortUrl) {
        flags.push({
            id: "short-url",
            severity: "block",
            title: "Shortened link",
            detail: "Link shorteners hide the destination. Carriers filter them and recipients cannot tell a receipt from phishing.",
            suggestion: "Please replace the shortened link with the full address on your own domain, or remove it. Shortened links are filtered by carriers and read as phishing to recipients.",
            match: shortUrl[0],
        });
    } else {
        const url = text.match(URL);
        if (url) {
            flags.push({
                id: "url",
                severity: "warn",
                title: "Contains a link",
                detail: "Links are fine when they go to the recipient's own order, invoice or account. Links to a storefront or landing page are marketing.",
                suggestion: "Links must point at something specific to the recipient (their invoice, order or account page), not a general page. If this link is a landing page, please remove it.",
                match: url[0],
            });
        }
    }

    // --- no variables: a fixed message to many people is a broadcast ---
    const vars = text.match(PLACEHOLDER) || [];
    if (vars.length === 0 && text.trim().length > 0) {
        flags.push({
            id: "no-variables",
            severity: "warn",
            title: "No variables",
            detail: "Every recipient would get the same text. Transactional messages almost always carry something specific: a name, an amount, a code, a reference.",
            suggestion: "This template has no variables, so every recipient would receive identical text -- that is a broadcast. Please include what makes the message specific to the recipient: their name, amount, reference or code, as {{ variable }}.",
        });
    }

    // --- shouting and punctuation ---
    const letters = text.replace(/[^A-Za-z]/g, "");
    const caps = letters.replace(/[^A-Z]/g, "").length;
    if (letters.length >= 20 && caps / letters.length > 0.6) {
        flags.push({
            id: "all-caps",
            severity: "warn",
            title: "Mostly upper case",
            detail: "Sustained capitals read as advertising and trip carrier spam filters.",
            suggestion: "Please use normal sentence case. Messages in capitals are filtered by carriers and read as advertising.",
        });
    }
    const bangs = text.match(/!{2,}|\?{2,}/);
    if (bangs || (text.match(/!/g) || []).length >= 3) {
        flags.push({
            id: "punctuation",
            severity: "note",
            title: "Excessive punctuation",
            detail: "Multiple exclamation marks are a marketing tell.",
            suggestion: "Please keep punctuation to a single full stop or exclamation mark; repeated marks read as advertising.",
            match: bangs?.[0],
        });
    }

    // --- a phone number in the body: "call us" is a campaign ---
    const phone = text.match(PHONE);
    if (phone && !/\{\{/.test(phone[0])) {
        flags.push({
            id: "phone-in-body",
            severity: "note",
            title: "Phone number in the message",
            detail: "A contact number is often a call-to-action. It is fine when it is the recipient's own reference.",
            suggestion: "If the phone number is a \"call us\" line, please remove it; transactional messages inform, they do not solicit contact.",
            match: phone[0],
        });
    }

    // --- length ---
    const seg = segments(text);
    if (seg.segments >= 3) {
        flags.push({
            id: "long",
            severity: "note",
            title: `${seg.segments} segments (${seg.characters} ${seg.encoding === "unicode" ? "unicode " : ""}characters)`,
            detail: "Each segment is billed. Transactional messages are usually one; three or more suggests marketing copy.",
            suggestion: `This message is ${seg.segments} SMS segments long and each is billed. Transactional messages are usually one segment; please shorten it to the essential facts.`,
        });
    }
    if (seg.encoding === "unicode") {
        const culprit = [...text].find((c) => !GSM_CHARSET.test(c));
        flags.push({
            id: "unicode",
            severity: "note",
            title: "Unicode encoding (70 characters per segment)",
            detail: `A character outside the GSM alphabet${culprit ? ` (${JSON.stringify(culprit)})` : ""} forces the whole message to unicode, halving capacity. Often a smart quote or emoji.`,
            suggestion: "A character in this message forces unicode encoding, which halves the characters per segment. Please replace smart quotes, emoji or special symbols with plain equivalents.",
            match: culprit,
        });
    }

    // --- empty ---
    if (text.trim().length === 0) {
        flags.push({ id: "empty", severity: "block", title: "Empty template", detail: "", suggestion: "The template has no content." });
    }

    const order: Record<Severity, number> = { block: 0, warn: 1, note: 2 };
    return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function worst(flags: Flag[]): Severity | "clean" {
    if (flags.some((f) => f.severity === "block")) return "block";
    if (flags.some((f) => f.severity === "warn")) return "warn";
    if (flags.length > 0) return "note";
    return "clean";
}
