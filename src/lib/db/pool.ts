import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

/** What mysql2 accepts as bound parameters. */
export type Params = (string | number | boolean | Date | null | Buffer)[];
export type Runner = (sql: string, params?: Params) => Promise<ResultSetHeader>;
import { env } from "../env";

/**
 * One pool per process. Next's dev server re-evaluates modules on edit, so
 * the pool hangs off globalThis to survive hot reloads without leaking
 * connections.
 */
const g = globalThis as unknown as { __gallantPool?: Pool };

export function pool(): Pool {
    if (!g.__gallantPool) {
        const { db } = env();
        g.__gallantPool = mysql.createPool({
            ...db,
            waitForConnections: true,
            connectionLimit: 8,
            // DECIMAL comes back as a string by default, which is right for
            // money: nothing here does arithmetic on it without parsing.
            decimalNumbers: false,
            dateStrings: false,
            timezone: "Z",
        });
    }
    return g.__gallantPool;
}

/** A typed SELECT. */
export async function query<T extends RowDataPacket>(sql: string, params: Params = []): Promise<T[]> {
    const [rows] = await pool().execute<T[]>(sql, params);
    return rows;
}

/** The first row or null. */
export async function one<T extends RowDataPacket>(sql: string, params: Params = []): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE. */
export async function exec(sql: string, params: Params = []): Promise<ResultSetHeader> {
    const [result] = await pool().execute<ResultSetHeader>(sql, params);
    return result;
}

/** Runs fn inside a transaction; rolls back on throw. */
export async function transaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool().getConnection();
    try {
        await conn.beginTransaction();
        const out = await fn(conn);
        await conn.commit();
        return out;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

/** Pagination helper: clamps page and size, returns LIMIT/OFFSET numbers. */
export function paging(searchParams: { page?: string; size?: string }, defaultSize = 25) {
    const size = Math.min(100, Math.max(5, Number(searchParams.size ?? defaultSize) || defaultSize));
    const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
    return { size, page, offset: (page - 1) * size };
}
