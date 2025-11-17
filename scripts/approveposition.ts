import { ethers } from "hardhat";
import { ADDR } from "./constants";
const pmAbi = [
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) external view returns (address)",
  "function ownerOf(uint256 tokenId) external view returns (address)"
];
async function main() {
  const [me] = await ethers.getSigners();
  const adapter = process.env.ADAPTER_ADDR!;
  const tokenId = BigInt(process.env.POSITION_ID!);
  const pm = new ethers.Contract(ADDR.POSITION_MANAGER, pmAbi, me);
  const owner: string = await pm.ownerOf(tokenId);
  if (owner.toLowerCase() !== me.address.toLowerCase()) throw new Error(`Not owner: ${owner}`);
  await (await pm.approve(adapter, tokenId)).wait();
  console.log("Approved:", await pm.getApproved(tokenId));
}
main().catch(e => { console.error(e); process.exit(1); });
