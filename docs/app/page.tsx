import Link from "next/link";

export default function HomePage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center text-center px-4">
			<div className="max-w-2xl space-y-6">
				<h1 className="text-5xl font-bold tracking-tight">StarkFi Docs</h1>
				<p className="text-lg text-fd-muted-foreground">
					Starknet DeFi CLI + MCP Server — Swaps, staking, lending, batch, gasless
					transactions.
				</p>
				<div className="flex gap-4 justify-center">
					<Link
						href="/docs"
						className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
					>
						Get Started →
					</Link>
					<Link
						href="https://github.com/ahmetenesdur/starkfi"
						className="inline-flex items-center gap-2 rounded-lg border border-fd-border px-6 py-3 text-sm font-medium transition-colors hover:bg-fd-accent"
					>
						GitHub
					</Link>
				</div>
			</div>
		</main>
	);
}
