import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-2 text-xl font-semibold">We could not find that page</h1>
        <Link href="/" className="mt-4 inline-block font-medium text-primary hover:underline">Back to home</Link>
      </div>
    </main>
  );
}
