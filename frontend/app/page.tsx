import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <main className="flex flex-col items-center gap-8 px-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-6xl font-bold text-black">
            Tentacle
          </h1>
          <p className="max-w-md text-lg text-zinc-600">
            Your intelligent note-taking companion
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-lg bg-black px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-black px-8 py-3 text-base font-medium text-black transition-colors hover:bg-zinc-100"
          >
            Sign Up
          </Link>
        </div>
      </main>
    </div>
  );
}
