import { ethers } from "hardhat";
import { ADDR } from "./constants";
const pmAbi = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)"
];
async function main() {
  const [me] = await ethers.getSigners();
  const adapter = process.env.ADAPTER_ADDR!;
  const pm = new ethers.Contract(ADDR.POSITION_MANAGER, pmAbi, me);
  await (await pm.setApprovalForAll(adapter, true)).wait();
  console.log("isApprovedForAll:", await pm.isApprovedForAll(me.address, adapter));
}
main().catch(e => { console.error(e); process.exit(1); });
