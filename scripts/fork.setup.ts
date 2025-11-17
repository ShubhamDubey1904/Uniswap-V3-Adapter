import { ethers } from "hardhat";
import { ADDR } from "./constants";
import { parseEther } from "ethers";

const wethAbi = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)"
];

async function main() {
  const [me] = await ethers.getSigners();
  console.log("Me:", me.address);

  const weth = new ethers.Contract(ADDR.WETH, wethAbi, me);
  await (await weth.deposit({ value: parseEther("0.05") })).wait();
  console.log("Wrapped 0.05 ETH to WETH. WETH balance:", (await weth.balanceOf(me.address)).toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
