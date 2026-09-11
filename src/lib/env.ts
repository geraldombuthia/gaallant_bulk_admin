/**
 * Environment, checked once at first use. A missing variable fails loudly
 * with its name rather than as a connection error three calls later.
 */
const required = ["DB_HOST", "DB_NAME", "DB_USERNAME", "ADMIN_SESSION_SECRET"] as const;

function read() {
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing environment: ${missing.join(", ")} (see .env.example)`);
    }
    const secret = process.env.ADMIN_SESSION_SECRET!;
    if (secret.length < 32) {
        throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
    }
    return {
        db: {
            host: process.env.DB_HOST!,
            port: Number(process.env.DB_PORT ?? 3306),
            database: process.env.DB_NAME!,
            user: process.env.DB_USERNAME!,
            password: process.env.DB_PASSWORD ?? "",
        },
        sessionSecret: new TextEncoder().encode(secret),
        sessionHours: Number(process.env.ADMIN_SESSION_HOURS ?? 8),
        mainAppUrl: (process.env.MAIN_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    };
}

let cached: ReturnType<typeof read> | null = null;
export function env() {
    if (!cached) {
        cached = read();
    }
    return cached;
}
