import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { baseOptions } from "@/app/base-options";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout
			{...baseOptions()}
			tree={source.pageTree}
			sidebar={{
				defaultOpenLevel: 1,
			}}
		>
			{children}
		</DocsLayout>
	);
}
