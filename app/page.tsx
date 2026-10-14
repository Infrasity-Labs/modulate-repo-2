import { ArrowUpRight, Code2 } from "lucide-react";
import { Detector } from "@/components/detector";
import { ThemeToggle } from "@/components/theme-toggle";

const REPO = "https://github.com/Infrasity-Labs/modulate-repo-2";
const DEPLOY = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(REPO)}&env=VELMA_API_KEY&envDescription=${encodeURIComponent("Your Modulate Velma API key")}&envLink=${encodeURIComponent("https://platform.modulate.ai/signin")}`;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="font-heading text-sm font-semibold tracking-tight">velma-realtime-detect-starter</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">
        <section className="mx-auto max-w-2xl pb-10 pt-8 text-center sm:pt-14">
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> Powered by Velma
          </p>
          <h1 className="mt-5 font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Is this voice <span className="text-primary">real</span>?
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground sm:text-lg">
            Upload or record a short voice clip and see how Velma Deepfake Detection scores it.
          </p>
        </section>

        <Detector />

        <p role="note" className="mx-auto mt-6 max-w-3xl rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
          Demo only. Scores are estimates and are not proof.
        </p>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted-foreground">
          <p>Your key stays on the server. Audio is sent to Velma for analysis and is not stored by this app.</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
            <a className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" href="https://docs.modulate.ai/get-started/deepfake" target="_blank" rel="noreferrer">Velma docs <ArrowUpRight className="size-3.5" /></a>
            <a className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" href={REPO} target="_blank" rel="noreferrer"><Code2 className="size-3.5" /> GitHub</a>
            <a className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" href={DEPLOY} target="_blank" rel="noreferrer">Deploy with Vercel <ArrowUpRight className="size-3.5" /></a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
