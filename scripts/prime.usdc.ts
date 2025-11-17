import { ethers } from "hardhat";
import { ADDR } from "./constants";
import { parseEther } from "ethers";

const wethAbi = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];

async function main() {
  const [me] = await ethers.getSigners();
  const adapterAddr = process.env.ADAPTER_ADDR!;
  const adapter = await ethers.getContractAt("UniswapV3Adapter", adapterAddr, me);

  // amount to swap WETH -> USDC
  const amountIn = parseEther("0.01");

  // 1) Get Quote
  const quoted: bigint = await adapter.getQuote.staticCall(
    ADDR.WETH,
    ADDR.USDC,
    ADDR.FEE_500,
    amountIn
  );
  console.log("Quote 0.01 WETH -> USDC:", quoted.toString());

  // 2) Approve adapter to spend WETH
  const weth = new ethers.Contract(ADDR.WETH, wethAbi, me);
  await (await weth.approve(adapterAddr, amountIn)).wait();

  // 3) Swap with 1% slippage guard
  const minOut = (quoted * 99n) / 100n;
  const tx = await adapter.swapExactInput(ADDR.WETH, ADDR.USDC, ADDR.FEE_500, amountIn, minOut);
  const rcpt = await tx.wait();
  console.log("Swap tx:", rcpt?.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
