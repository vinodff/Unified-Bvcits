import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-extrabold text-crimson-200">404</p>
        <h1 className="mt-2 text-2xl font-bold text-navy">Page not found</h1>
        <p className="mt-2 text-ink-soft">The page you are looking for doesn&rsquo;t exist or has moved.</p>
        <Link href="/" className="btn-primary mt-6">Back to Home</Link>
      </div>
    </div>
  );
}
