import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<>
					<Image
						src="/favicon.svg"
						alt="StarkFi"
						width={24}
						height={24}
						className="rounded-md"
					/>
					<span className="font-semibold">StarkFi</span>
				</>
			),
			url: "/",
		},
		githubUrl: "https://github.com/ahmetenesdur/starkfi",
		links: [
			{
				text: "Documentation",
				url: "/docs",
				active: "nested-url",
			},
			{
				type: "icon",
				text: "X (Twitter)",
				url: "https://x.com/starkfiapp",
				icon: (
					<svg role="img" viewBox="0 0 24 24" fill="currentColor">
						<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
					</svg>
				),
				external: true,
			},
			{
				type: "icon",
				text: "Landing Page",
				url: "https://starkfi.app",
				icon: (
					<svg
						role="img"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
						<polyline points="9 22 9 12 15 12 15 22" />
					</svg>
				),
				external: true,
			},
		],
	};
}
