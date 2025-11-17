import { BigInt, Address } from "@graphprotocol/graph-ts";
import {
  LiquidityAdded,
  LiquidityRemoved,
  TokensSwapped
} from "../generated/Adapter/UniswapV3Adapter";
import { Pair } from "../generated/schema";

// Arbitrum One token addresses (USDC 6d, WETH 18d)
const USDC = Address.fromString("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
const WETH = Address.fromString("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");

function getPairId(tokenA: Address, tokenB: Address): string {
  let a = tokenA.equals(WETH) ? "WETH" : tokenA.toHexString().toUpperCase();
  let b = tokenB.equals(USDC) ? "USDC" : tokenB.toHexString().toUpperCase();
  if ((a == "WETH" && b == "USDC") || (a == "USDC" && b == "WETH")) return "WETH-USDC";
  return a < b ? a + "-" + b : b + "-" + a;
}

function loadOrInitPair(id: string, fee: i32): Pair {
  let p = Pair.load(id);
  if (p == null) {
    p = new Pair(id);
    p.fee = fee;
    p.totalLiquidityAdded = BigInt.zero();
    p.totalLiquidityRemoved = BigInt.zero();
    p.totalSwappedUSDC = BigInt.zero();
  }
  return p as Pair;
}

/* ───────── Event Handlers ───────── */

export function handleLiquidityAdded(ev: LiquidityAdded): void {
  const id = getPairId(ev.params.tokenA, ev.params.tokenB);
  let pair = loadOrInitPair(id, ev.params.fee as i32);

  // amountA and amountB are already BigInt
  pair.totalLiquidityAdded = pair.totalLiquidityAdded
    .plus(ev.params.amountA)
    .plus(ev.params.amountB);

  pair.save();
}

export function handleLiquidityRemoved(ev: LiquidityRemoved): void {
  const id = getPairId(ev.params.tokenA, ev.params.tokenB);
  let pair = loadOrInitPair(id, ev.params.fee as i32);

  // amount0 and amount1 are BigInt
  pair.totalLiquidityRemoved = pair.totalLiquidityRemoved
    .plus(ev.params.amount0)
    .plus(ev.params.amount1);

  pair.save();
}

export function handleTokensSwapped(ev: TokensSwapped): void {
  // Track USDC volume only; add amountOut when tokenOut=USDC, or amountIn when tokenIn=USDC
  let id: string;
  let fee: i32 = ev.params.fee as i32;

  if (
    (ev.params.tokenIn.equals(WETH) && ev.params.tokenOut.equals(USDC)) ||
    (ev.params.tokenIn.equals(USDC) && ev.params.tokenOut.equals(WETH))
  ) {
    id = "WETH-USDC";
  } else {
    id = getPairId(ev.params.tokenIn, ev.params.tokenOut);
  }

  let pair = loadOrInitPair(id, fee);

  if (ev.params.tokenOut.equals(USDC)) {
    pair.totalSwappedUSDC = pair.totalSwappedUSDC.plus(ev.params.amountOut);
  } else if (ev.params.tokenIn.equals(USDC)) {
    pair.totalSwappedUSDC = pair.totalSwappedUSDC.plus(ev.params.amountIn);
  }

  pair.save();
}