import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      forking: { url: process.env.ARBITRUM_RPC_URL || "" },
      allowUnlimitedContractSize: true,
    },
  },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
};

export default config;
