import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, type ToolSummary } from "./tools/index.js";

declare const STARKFI_VERSION: string;

const pkg = {
	name: "starkfi",
	version:
		typeof STARKFI_VERSION !== "undefined"
			? STARKFI_VERSION
			: (createRequire(import.meta.url)("../../package.json") as { version: string }).version,
};

const MCP_INSTRUCTIONS = `StarkFi is a Starknet DeFi toolkit. You can:
- Check auth status and configure settings (network, RPC, gas payment mode)
- Query balances, deploy accounts, send tokens, and view full portfolio with USD values
- Get swap quotes and execute token swaps via Fibrous aggregation
- Execute multi-swaps (2-3 pairs) and batch multiple DeFi operations in a single transaction
- Stake/unstake tokens across validators, claim and compound rewards
- Supply, borrow, repay, withdraw, and close positions on Vesu V2 lending pools
- Monitor lending health factors with 4-level risk alerts (HEALTHY/WARNING/DANGER/CRITICAL)
- Auto-rebalance lending positions via repay or add-collateral strategies
- Create, preview, list, and cancel Dollar-Cost Averaging (DCA) recurring buy orders via AVNU or Ekubo
- Fund, transfer, withdraw, and manage confidential (private) balances via Tongo Cash
- Rebalance portfolio to target allocation via optimized multi-swap

Always call get_swap_quote before swap_tokens. Always call list_validators before staking. Always call list_lending_pools before lending operations. Always call dca_preview before dca_create. Always call confidential_balance before confidential fund/transfer/withdraw. Always call confidential_setup first to configure Tongo keys. Use simulate=true on transactional tools to preview fees before execution.`;

function printBanner(summary: ToolSummary): void {
	const version = pkg.version;
	const line = "═".repeat(49);
	const maxNameLen = Math.max(...summary.categories.map((c) => c.name.length));

	const lines = [
		"",
		`  ${line}`,
		`   StarkFi MCP Server v${version}`,
		`   Transport: stdio`,
		`  ${line}`,
		"",
		`   Tools (${summary.total}):`,
		...summary.categories.map((c) => {
			const dots = "·".repeat(maxNameLen - c.name.length + 4);
			return `     ${c.name} ${dots} ${c.count} tools`;
		}),
		"",
		`   ✓ Server ready — awaiting client connection`,
		`  ${line}`,
		"",
	];

	// MCP stdio transport reserves stdout for JSON-RPC.
	// All human-readable output MUST go to stderr.
	process.stderr.write(lines.join("\n") + "\n");
}

export async function startMcpServer(): Promise<void> {
	const server = new McpServer(
		{
			name: pkg.name,
			version: pkg.version,
		},
		{
			instructions: MCP_INSTRUCTIONS,
			capabilities: { logging: {} },
		}
	);

	const summary = registerTools(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	printBanner(summary);
}
