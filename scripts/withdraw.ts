import { ethers } from "hardhat";
import { ADDR } from "./constants";

const pmAbi = [
  "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

async function main() {
  const [me] = await ethers.getSigners();
  const adapterAddr = process.env.ADAPTER_ADDR!;
  const tokenId = BigInt(process.env.POSITION_ID!);

  const adapter = await ethers.getContractAt("UniswapV3Adapter", adapterAddr, me);
  const pm = new ethers.Contract(ADDR.POSITION_MANAGER, pmAbi, me);

  const owner: string = await pm.ownerOf(tokenId);
  if (owner.toLowerCase() !== me.address.toLowerCase()) throw new Error(`Not owner: ${owner}`);

  const approved = (await pm.getApproved(tokenId)).toLowerCase() === adapterAddr.toLowerCase()
    || await pm.isApprovedForAll(me.address, adapterAddr);
  if (!approved) {
    throw new Error(
      "Adapter is not approved for this position. Run either:\n" +
      "  npx hardhat run scripts/approvePosition.ts --network localhost  (single token)\n" +
      "or\n" +
      "  npx hardhat run scripts/approveAll.ts --network localhost        (all positions)"
    );
  }

  const pos = await pm.positions(tokenId);
  const currentLiquidity: bigint = pos[7]; // liquidity
  if (currentLiquidity === 0n) throw new Error("Position has zero liquidity.");

  const pct = process.env.PCT ? BigInt(process.env.PCT) : 50n;
  if (pct <= 0n || pct > 100n) throw new Error("PCT must be in 1..100");
  const liquidityToBurn = (currentLiquidity * pct) / 100n;

  const tx = await adapter.withdrawLiquidity(tokenId, liquidityToBurn, 0, 0);
  const rcpt = await tx.wait();
  console.log("Withdraw tx:", rcpt?.hash);
}

main().catch(e => { console.error(e); process.exit(1); });
