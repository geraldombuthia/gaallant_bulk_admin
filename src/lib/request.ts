import { headers } from "next/headers";

/** The caller's address, for the audit log. Behind a proxy, the first hop. */
export async function clientIp(): Promise<string> {
    const h = await headers();
    return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function userAgent(): Promise<string> {
    return (await headers()).get("user-agent") ?? "";
}
