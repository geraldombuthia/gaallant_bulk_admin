/**
 * The admin console's own sign-in recording, tested on the same real user
 * agents the main app is tested on. Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeClient, normaliseIp } from "../lib/auth/login";

describe("describeClient", () => {
    const cases: [string, string, Partial<ReturnType<typeof describeClient>>][] = [
        ["Samsung, Chrome", "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36", { source: "admin", browser_name: "Chrome", os_name: "Android", os_version: "14", device_vendor: "Samsung", device_type: "mobile" }],
        ["Tecno, Chrome", "Mozilla/5.0 (Linux; Android 13; TECNO KI5q) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36", { browser_name: "Chrome", os_name: "Android", device_vendor: "TECNO" }],
        ["iPhone, Safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", { browser_name: "Mobile Safari", os_name: "iOS", device_model: "iPhone", device_type: "mobile" }],
        ["Windows, Edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79", { browser_name: "Edge", os_name: "Windows", os_version: "10" }],
        ["Ubuntu, Firefox", "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0", { browser_name: "Firefox", browser_version: "155.0", os_name: "Ubuntu" }],
        ["Mac, Safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15", { browser_name: "Safari", os_name: "Mac OS", device_vendor: "Apple" }],
        ["Huawei, HarmonyOS", "Mozilla/5.0 (Linux; Android 10; HarmonyOS; ANA-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 HuaweiBrowser/14.0.2.311 Mobile Safari/537.36", { browser_name: "Huawei Browser", os_name: "HarmonyOS", device_vendor: "Huawei" }],
    ];
    for (const [label, ua, expected] of cases) {
        test(label, () => {
            const c = describeClient(ua);
            for (const [k, v] of Object.entries(expected)) assert.equal((c as Record<string, unknown>)[k], v, `${k}`);
        });
    }
    for (const [label, ua] of [["node", "node"], ["curl", "curl/8.4.0"], ["undici", "undici"], ["python", "python-requests/2.32.0"], ["empty", ""]]) {
        test(`${label} is a script`, () => assert.equal(describeClient(ua).source, "script"));
    }
});

describe("normaliseIp", () => {
    for (const [given, stored] of [["::1", "127.0.0.1"], ["::ffff:127.0.0.1", "127.0.0.1"], ["::ffff:41.90.64.12", "41.90.64.12"], ["197.248.10.5", "197.248.10.5"], ["2c0f:fe38:2123:a1b2:9c0d:1e2f:3a4b:5c6d", "2c0f:fe38:2123:a1b2:9c0d:1e2f:3a4b:5c6d"], ["2001:db8::1", "2001:db8::1"]]) {
        test(`${given} -> ${stored}`, () => assert.equal(normaliseIp(given), stored));
    }
});
