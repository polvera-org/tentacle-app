import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <main className="flex flex-col items-center gap-8 px-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/tentacle-spiral.png"
            alt="Tentacle logo"
            width={120}
            height={120}
            priority
            className="h-24 w-24 sm:h-28 sm:w-28"
          />
          <p className="max-w-md text-lg text-zinc-600">
            Your intelligent note-taking companion
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app"
            className="rounded-lg bg-black px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Go to app
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-black px-8 py-3 text-base font-medium text-black transition-colors hover:bg-zinc-100"
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
