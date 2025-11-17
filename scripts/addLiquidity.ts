import { ethers } from "hardhat";
import { ADDR } from "./constants";
import { parseEther } from "ethers";

const erc20Abi = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [me] = await ethers.getSigners();
  const adapterAddr = process.env.ADAPTER_ADDR!;
  const adapter = await ethers.getContractAt("UniswapV3Adapter", adapterAddr, me);

  const weth = new ethers.Contract(ADDR.WETH, erc20Abi, me);
  const usdc = new ethers.Contract(ADDR.USDC, erc20Abi, me);

  // Read balances
  const wethBal: bigint = await weth.balanceOf(me.address);
  const usdcBal: bigint = await usdc.balanceOf(me.address);

  console.log("WETH balance:", wethBal.toString());
  console.log("USDC balance:", usdcBal.toString());

  const wantWeth = parseEther("0.01");      // target 0.01 WETH
  const wantUsdc = 50_000_000n;             // target 50 USDC (6 decimals)

  const amtWeth = wethBal < wantWeth ? wethBal : wantWeth;
  const amtUsdc = usdcBal < wantUsdc ? usdcBal : wantUsdc;

  if (amtWeth === 0n || amtUsdc === 0n) {
    throw new Error("Not enough token balance: need both WETH and USDC > 0");
  }
  console.log("Supplying WETH:", amtWeth.toString(), "USDC:", amtUsdc.toString());

  // Approve adapter
  await (await weth.approve(adapterAddr, amtWeth)).wait();
  await (await usdc.approve(adapterAddr, amtUsdc)).wait();

  // Wide ticks for demo (VERY wide; production would center around current price)
  const tickLower = -887220;
  const tickUpper =  887220;

  const tx = await adapter.addLiquidity(
    ADDR.WETH, ADDR.USDC, ADDR.FEE_500,
    amtWeth, amtUsdc,
    tickLower, tickUpper
  );
  const rcpt = await tx.wait();
  console.log("Add liquidity tx:", rcpt?.hash);

  for (const l of rcpt!.logs) {
    try {
      const parsed = adapter.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === "LiquidityAdded") {
        console.log("Position tokenId:", parsed.args.tokenId.toString());
      }
    } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
