import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
	const { slug } = await params;

	// Strip .mdx extension if present (Fumadocs components auto-append it)
	const lastSegment = slug[slug.length - 1].replace(/\.mdx$/, "");
	const segments = [...slug.slice(0, -1), lastSegment];

	const filePath = join(
		process.cwd(),
		"content",
		"docs",
		...segments.slice(0, -1),
		`${segments[segments.length - 1]}.mdx`
	);

	try {
		const content = await readFile(filePath, "utf-8");
		return new NextResponse(content, {
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	} catch {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
}
