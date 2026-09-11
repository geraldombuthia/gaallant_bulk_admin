import Link from "next/link";
export default function NotFound() {
    return <main className="flex min-h-screen items-center justify-center text-sm text-ink-3">Not found. <Link href="/" className="ml-2 text-brand">Overview</Link></main>;
}
