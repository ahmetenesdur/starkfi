import { performance } from "perf_hooks";
import { fetchTokens, resolveToken } from "./src/services/tokens/tokens.js";

async function run() {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
        resolveToken("STRK");
    }
    const end = performance.now();
    console.log(`1000 lookups took ${end - start}ms`);
}

run();
