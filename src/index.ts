#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command, type Help } from "commander";
import chalk from "chalk";
import { formatError } from "./lib/format.js";
import { startMcpServer } from "./mcp/server.js";
import { blue, mint, LOGO_ROW_COLORS } from "./lib/brand.js";

/**
 * STARKFI_VERSION is replaced at build time by tsup (esbuild define).
 * For dev mode (tsx), the fallback reads from package.json directly.
 */
declare const STARKFI_VERSION: string;

const version: string =
	typeof STARKFI_VERSION !== "undefined"
		? STARKFI_VERSION
		: (createRequire(import.meta.url)("../package.json") as { version: string }).version;

import { registerLoginCommand } from "./commands/auth/login.js";
import { registerVerifyCommand } from "./commands/auth/verify.js";
import { registerLogoutCommand } from "./commands/auth/logout.js";
import { registerAddressCommand } from "./commands/wallet/address.js";
import { registerBalanceCommand } from "./commands/wallet/balance.js";
import { registerSendCommand } from "./commands/wallet/send.js";
import { registerDeployCommand } from "./commands/wallet/deploy.js";
import { registerSwapCommand } from "./commands/trade/swap.js";
import { registerMultiSwapCommand } from "./commands/trade/multi-swap.js";
import { registerStatusCommand } from "./commands/system/status.js";
import { registerTxStatusCommand } from "./commands/chain/tx-status.js";
import {
	registerStakeCommand,
	registerUnstakeCommand,
	registerRewardsCommand,
	registerPoolsCommand,
	registerValidatorsCommand,
	registerStakeStatusCommand,
} from "./commands/staking/staking.js";
import {
	registerLendPoolsCommand,
	registerLendSupplyCommand,
	registerLendWithdrawCommand,
	registerLendBorrowCommand,
	registerLendRepayCommand,
	registerLendCloseCommand,
	registerLendStatusCommand,
	registerLendMonitorCommand,
	registerLendAutoCommand,
} from "./commands/lending/lending.js";
import { registerPortfolioCommand } from "./commands/portfolio/portfolio.js";
import { registerPortfolioRebalanceCommand } from "./commands/portfolio/portfolio-rebalance.js";
import { registerBatchCommand } from "./commands/batch/batch.js";
import { registerConfigCommand } from "./commands/config/config.js";
import {
	registerDcaCreateCommand,
	registerDcaListCommand,
	registerDcaCancelCommand,
	registerDcaPreviewCommand,
} from "./commands/dca/dca.js";
import {
	registerConfSetupCommand,
	registerConfBalanceCommand,
	registerConfFundCommand,
	registerConfTransferCommand,
	registerConfWithdrawCommand,
	registerConfRagequitCommand,
	registerConfRolloverCommand,
} from "./commands/confidential/confidential.js";

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const LOGO_LINES = [
	"███████╗████████╗ █████╗ ██████╗ ██╗  ██╗███████╗██╗",
	"██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║ ██╔╝██╔════╝██║",
	"███████╗   ██║   ███████║██████╔╝█████╔╝ █████╗  ██║",
	"╚════██║   ██║   ██╔══██║██╔══██╗██╔═██╗ ██╔══╝  ██║",
	"███████║   ██║   ██║  ██║██║  ██║██║  ██╗██║     ██║",
	"╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
] as const;

const coloredLogo = LOGO_LINES.map((line, i) =>
	(LOGO_ROW_COLORS[i] ?? mint).bold(line)
).join("\n");

const tagline =
	chalk.dim("v") +
	blue.bold(version) +
	chalk.dim("  ·  ") +
	chalk.white("Starknet DeFi CLI + MCP Server");

const banner = `\n${coloredLogo}\n\n${tagline}\n`;

const dim = chalk.dim.bind(chalk);
const white = chalk.white.bind(chalk);

// Quick Start block shown only on the root --help page.
const footer = `
${mint.bold("Quick Start")}

  ${dim("$")} ${white("starkfi auth login <email>")}              ${dim("# Sign in with Privy OTP")}
  ${dim("$")} ${white("starkfi trade 0.1 ETH USDC")}             ${dim("# Best-price swap via Fibrous")}
  ${dim("$")} ${white("starkfi balance")}                         ${dim("# View all token balances")}
  ${dim("$")} ${white("starkfi stake 10 -v karnot")}        ${dim("# Stake STRK with a validator")}
  ${dim("$")} ${white("starkfi lend-supply 100 -p Prime -t USDC")}   ${dim("# Supply to Vesu")}
  ${dim("$")} ${white('starkfi batch --swap "0.1 ETH USDC" --stake "50 STRK karnot"')}   ${dim("# Multicall")}

  ${dim("Run")} ${white("starkfi <command> --help")} ${dim("for detailed flags and examples.")}
  ${dim("Docs →")} ${blue.underline("https://docs.starkfi.app/docs")}
`;

const COMMAND_GROUPS: Record<string, string[]> = {
	Authentication: ["auth"],
	Wallet: ["address", "balance", "send", "deploy"],
	Trading: ["trade", "multi-swap"],
	Staking: ["stake", "unstake", "rewards", "pools", "validators", "stake-status"],
	DCA: ["dca-create", "dca-list", "dca-cancel", "dca-preview"],
	Lending: [
		"lend-pools",
		"lend-supply",
		"lend-withdraw",
		"lend-borrow",
		"lend-repay",
		"lend-close",
		"lend-status",
		"lend-monitor",
		"lend-auto",
	],
	Portfolio: ["portfolio", "portfolio-rebalance"],
	Operations: ["batch"],
	Confidential: [
		"conf-setup",
		"conf-balance",
		"conf-fund",
		"conf-transfer",
		"conf-withdraw",
		"conf-ragequit",
		"conf-rollover",
	],
	Configuration: ["config"],
	System: ["status", "tx-status", "mcp-start", "help"],
};

const program = new Command();

program
	.name("starkfi")
	.description("Starknet DeFi CLI + MCP Server")
	.version(version)
	.showHelpAfterError()
	.addHelpText("beforeAll", banner);

program.configureHelp({
	formatHelp(cmd: Command, helper: Help): string {
		if (cmd.name() !== "starkfi") {
			const lines: string[] = [];
			const width = helper.padWidth(cmd, helper);

			const usage = helper.commandUsage(cmd);
			if (usage) lines.push(`${chalk.bold("Usage:")} ${usage}`, "");

			const desc = helper.commandDescription(cmd);
			if (desc) lines.push(desc, "");

			const args = helper.visibleArguments(cmd);
			if (args.length) {
				lines.push(chalk.bold("Arguments:"));
				for (const a of args) {
					lines.push(
						`  ${chalk.white(helper.argumentTerm(a).padEnd(width))}  ${chalk.dim(helper.argumentDescription(a))}`
					);
				}
				lines.push("");
			}

			const opts = helper.visibleOptions(cmd);
			if (opts.length) {
				lines.push(chalk.bold("Options:"));
				for (const o of opts) {
					lines.push(
						`  ${chalk.white(helper.optionTerm(o).padEnd(width))}  ${chalk.dim(helper.optionDescription(o))}`
					);
				}
				lines.push("");
			}

			const subs = helper.visibleCommands(cmd);
			if (subs.length) {
				lines.push(chalk.bold("Commands:"));
				for (const s of subs) {
					lines.push(
						`  ${chalk.white(helper.subcommandTerm(s).padEnd(width))}  ${chalk.dim(helper.subcommandDescription(s))}`
					);
				}
				lines.push("");
			}

			return lines.join("\n");
		}

		const lines: string[] = [];
		const width = helper.padWidth(cmd, helper);

		lines.push(
			`${chalk.bold("Usage:")} starkfi ${chalk.dim("[command]")} ${chalk.dim("[options]")}`,
			""
		);

		const opts = helper.visibleOptions(cmd);
		if (opts.length) {
			lines.push(chalk.bold("Options:"));
			for (const o of opts) {
				lines.push(
					`  ${blue(helper.optionTerm(o).padEnd(width))}  ${chalk.dim(helper.optionDescription(o))}`
				);
			}
			lines.push("");
		}

		lines.push(chalk.bold("Commands:"));

		const allCmds = helper.visibleCommands(cmd);
		const cmdMap = new Map(allCmds.map((c) => [c.name(), c]));
		const rendered = new Set<string>();

		for (const [groupLabel, cmdNames] of Object.entries(COMMAND_GROUPS)) {
			const groupCmds = cmdNames
				.map((n) => cmdMap.get(n))
				.filter((c): c is Command => c !== undefined);

			if (groupCmds.length === 0) continue;

			lines.push(`\n  ${blue.bold(groupLabel)}`);
			for (const c of groupCmds) {
				lines.push(
					`    ${chalk.white(helper.subcommandTerm(c).padEnd(width))}  ${chalk.dim(helper.subcommandDescription(c))}`
				);
				rendered.add(c.name());
			}
		}

		const ungrouped = allCmds.filter((c) => !rendered.has(c.name()));
		if (ungrouped.length) {
			lines.push(`\n  ${chalk.bold("Other")}`);
			for (const c of ungrouped) {
				lines.push(
					`    ${chalk.white(helper.subcommandTerm(c).padEnd(width))}  ${chalk.dim(helper.subcommandDescription(c))}`
				);
			}
		}

		lines.push("", footer);
		return lines.join("\n");
	},
});

registerLoginCommand(program);
registerVerifyCommand(program);
registerLogoutCommand(program);

registerAddressCommand(program);
registerBalanceCommand(program);
registerSendCommand(program);
registerDeployCommand(program);

registerSwapCommand(program);
registerMultiSwapCommand(program);
registerStatusCommand(program);

registerTxStatusCommand(program);

registerStakeCommand(program);
registerUnstakeCommand(program);
registerRewardsCommand(program);
registerPoolsCommand(program);
registerValidatorsCommand(program);
registerStakeStatusCommand(program);

registerDcaCreateCommand(program);
registerDcaListCommand(program);
registerDcaCancelCommand(program);
registerDcaPreviewCommand(program);

// ── Confidential ──
registerConfSetupCommand(program);
registerConfBalanceCommand(program);
registerConfFundCommand(program);
registerConfTransferCommand(program);
registerConfWithdrawCommand(program);
registerConfRagequitCommand(program);
registerConfRolloverCommand(program);

registerLendPoolsCommand(program);
registerLendSupplyCommand(program);
registerLendWithdrawCommand(program);
registerLendBorrowCommand(program);
registerLendRepayCommand(program);
registerLendCloseCommand(program);
registerLendStatusCommand(program);
registerLendMonitorCommand(program);
registerLendAutoCommand(program);

registerPortfolioCommand(program);
registerPortfolioRebalanceCommand(program);
registerBatchCommand(program);
registerConfigCommand(program);

program
	.command("mcp-start")
	.description("Start the MCP server (stdio transport)")
	.addHelpText(
		"after",
		`
Notes:
  Communicates via stdin/stdout (stdio transport — standard MCP protocol).
  Add to your AI client config (Claude, Cursor, etc.):

    {
      "mcpServers": {
        "starkfi": { "command": "starkfi", "args": ["mcp-start"] }
      }
    }

  See MCP.md for the full integration guide.`
	)
	.action(async () => {
		await startMcpServer();
	});

program.parseAsync().catch((error: unknown) => {
	console.error(formatError(error));
	process.exit(1);
});
