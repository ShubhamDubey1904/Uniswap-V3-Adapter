import { ethers } from "hardhat";
import { ADDR } from "./constants";
import { writeFile } from "fs/promises";

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log("Deployer:", deployer.address);
  console.log("Chain:", net.chainId.toString());

  const Adapter = await ethers.getContractFactory("UniswapV3Adapter");
  const adapter = await Adapter.deploy(
    ADDR.SWAP_ROUTER02,
    ADDR.POSITION_MANAGER,
    ADDR.QUOTER_V2
  );
  await adapter.waitForDeployment();

  const addr = await adapter.getAddress();
  const tx = adapter.deploymentTransaction();
  if (!tx) throw new Error("No deployment tx found on this instance");

  const rcpt = await tx.wait();

  console.log("Adapter deployed at:", addr);
  console.log("Deploy tx:", tx.hash);
  console.log("Deploy block:", rcpt?.blockNumber);

  const out = {
    chainId: net.chainId.toString(),
    adapter: addr,
    deployTx: tx.hash,
    deployBlock: rcpt?.blockNumber ?? null,
    router02: ADDR.SWAP_ROUTER02,
    positionManager: ADDR.POSITION_MANAGER,
    quoterV2: ADDR.QUOTER_V2,
    timestamp: new Date().toISOString(),
  };
  await writeFile("deploy.out.json", JSON.stringify(out, null, 2));
  console.log("Wrote deploy.out.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
