import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <Link href="/" className="text-xl font-bold">
        AutoRemHub
      </Link>
      {children}
    </main>
  );
}
