import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle, DocsDescription, PageLastUpdate } from "fumadocs-ui/page";
import { MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;
	const filePath = `docs/content/docs/${page.path}`;
	const githubUrl = `https://github.com/ahmetenesdur/starkfi/blob/main/${filePath}`;
	const markdownUrl = `/api/markdown/${page.path}`;

	return (
		<DocsPage
			toc={page.data.toc}
			tableOfContent={{ style: "clerk" }}
			breadcrumb={{
				includeRoot: { url: "/docs" },
				includePage: true,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<div className="flex items-center gap-1.5 mb-6 -mt-2">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={githubUrl} />
			</div>
			<DocsBody>
				<MDX components={defaultMdxComponents} />
			</DocsBody>
			<a
				href={githubUrl}
				target="_blank"
				rel="noreferrer noopener"
				className="w-fit border rounded-xl p-2 font-medium text-sm text-fd-secondary-foreground bg-fd-secondary transition-colors hover:text-fd-accent-foreground hover:bg-fd-accent"
			>
				Edit on GitHub
			</a>
			{page.data.lastModified && <PageLastUpdate date={page.data.lastModified} />}
		</DocsPage>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	return {
		title: page.data.title,
		description: page.data.description,
	};
}
