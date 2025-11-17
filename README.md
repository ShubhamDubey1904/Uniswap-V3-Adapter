# Uniswap V3 Adapter – Arbitrum One (Local Fork)
Uniswap V3 Adapter on Local Arbitrum Forkwith Subgraph + Frontend

- Hardhat fork of **Arbitrum One**
- `UniswapV3Adapter` contract (WETH/USDC)
- Backend scripts for swap / addLiquidity / withdraw
- Local **Graph Node** + custom subgraph
- **React + Vite** frontend using **Ethers v6 + MetaMask + Apollo**

---

## Prerequisites

- Node.js **v20 or higher** (`>= 20`)
- MetaMask browser extension - <https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn>
- Docker Used for running The Graph Node, local subgraph indexing, and other services. Download: <https://www.docker.com/get-started>

---

## Project Structure

```txt
univ3-arb-adapter/
├─ contracts/
│  └─ UniswapV3Adapter.sol         # Adapter contract
├─ scripts/
│  ├─ constants.ts                 # Arbitrum token/router/PM/quoter addresses
│  ├─ deploy.ts                    # Deploy adapter on local fork
│  ├─ fork.setup.ts                # Wrap ETH → WETH
│  ├─ prime.usdc.ts                # Swap WETH → USDC via adapter
│  ├─ addLiquidity.ts              # Add WETH/USDC liquidity
│  ├─ approvePosition.ts           # Approve adapter for a position NFT
│  ├─ approveAll.ts                # setApprovalForAll for PM
│  └─ withdraw.ts                  # Withdraw % of liquidity
├─ hardhat.config.ts               # Arbitrum fork + Solidity config
├─ subgraph/
│  ├─ subgraph.yaml                # Subgraph manifest
│  ├─ schema.graphql               # Entities & types
│  ├─ src/mapping.ts               # Event handlers
│  ├─ package.json, tsconfig.json  # Subgraph tooling
│  └─ (generated/, build/ ignored) # Built artifacts
├─ frontend/                       # React + Vite app
│  ├─ src/
│  │  ├─ App.tsx                   # UI (swap / add / withdraw / stats)
│  │  ├─ eth.ts                    # Ethers + MetaMask helpers
│  │  ├─ apolloClient.ts           # Apollo client
│  │  ├─ queries.ts                # GQL queries to subgraph
│  │  └─ App.css                   # Basic dapp-styled layout
│  ├─ vite.config.ts, index.html   # Vite React setup
│  └─ package.json                 # Frontend deps & scripts
├─ .env                            # Backend env (Hardhat)
└─ README.md
```
---

## 1) Fork Arbitrum (Hardhat)
1. Create .env in repo root with at least:
 - ```ARBITRUM_RPC_URL``` – your Arbitrum One HTTPS RPC URL
 - ```ADAPTER_ADDR``` – will be filled after deployment
 - ```POSITION_ID``` - This will be populated after you run: ```npx hardhat run scripts/addLiquidity.ts```
 - ```PCT``` - The percentage used when withdrawing liquidity (e.g., 50, 70, or 100).
 
Note - 
 - ```POSITION_ID``` refers to the unique NFT-based Liquidity Position identifier used by Uniswap V3 (and compatible AMMs) when you add liquidity.
 - When liquidity is added, the protocol mints an NFT that represents that position.
 - This tokenId (the NFT ID) is what we store as POSITION_ID.
 
**Install**
```bash 
cd univ3-arb-adapter
npm install
```

**Start the Hardhat Arbitrum fork:**
```bash
npx hardhat node
```

**Add a MetaMask custom network (Browser extention):**

- RPC: http://127.0.0.1:8545
- Chain ID: 31337

---

## 2) Adapter Deployment & Backend Scripts

In a new terminal (with node still running):

**Deploy adapter:**
```bash
npx hardhat run scripts/deploy.ts --network localhost

output example:
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266                                                                                                                      
Chain: 31337                                         
Adapter deployed at: 0xD6981a57e1E478d5918359f7e8f0674ceB569F2C
Deploy tx: 0x23af369970a4740da7a0564a3f0822f1f1de2de1c1f79f4c4d7a1bbcc132d59a
Deploy block: 401187020
Wrote deploy.out.json
```

**Copy the printed adapter address into:**

- .env → ```ADAPTER_ADDR```
- frontend/.env.local → ```VITE_ADAPTER_ADDRESS```
- subgraph/subgraph.yaml → source.address
- subgraph/subgraph.yaml -> source.startBlock: ```401150919```                      #Add Deploy block (We specify the deployment block number so the subgraph starts indexing from the moment the contract was deployed, instead of scanning the entire chain from block 0)

**Seed tokens on the fork (run as needed for testing purposes to verify everything is working correctly before using the frontend):**

```bash
npx hardhat run scripts/fork.setup.ts   --network localhost   # Wrap ETH → WETH
npx hardhat run scripts/prime.usdc.ts   --network localhost   # Swap WETH → USDC
npx hardhat run scripts/addLiquidity.ts --network localhost   # Add the initial WETH/USDC liquidity, then copy the generated POSITION_ID and paste it into .env file.
npx hardhat run scripts/approveAll.ts   --network localhost   # Approve adapter for positions
npx hardhat run scripts/withdraw.ts     --network localhost   # Example withdraw flow
```

These scripts simulate “real” on-chain flows against the forked Arbitrum state.

---

## 3) Subgraph Setup (Local Graph Node)

**Clone Uniswap v3-subgraph and run the local stack:**

```bash
git clone https://github.com/Uniswap/v3-subgraph.git
cd v3-subgraph
docker compose -f docker-compose.local.yml up
```

**In this repo, go to the subgraph folder:**

```bash
cd univ3-arb-adapter/subgraph
npm install
npm run codegen
npm run build
npm run create-local
npm run deploy-local -- --version-label v0.0.1        # choose version label, e.g. v0.0.1
```

**Confirm the subgraph is live on:**
- GraphQL: http://localhost:8000/subgraphs/name/adapter/local/graphql

---

## 4) Frontend (React + Vite + Ethers + Apollo)
**4.1 Environment**

Create frontend/.env.local with:
```
VITE_ADAPTER_ADDRESS – from scripts/deploy.ts
VITE_WETH_ADDRESS – Arbitrum WETH
VITE_USDC_ADDRESS – Arbitrum USDC
VITE_POSITION_MANAGER – Uniswap V3 NonfungiblePositionManager
VITE_GRAPHQL_URL – local subgraph endpoint (e.g. http://localhost:8000/subgraphs/name/adapter/local/graphql)
```

**4.2 Install & run**

```bash
cd frontend
npm install
npm run dev
```

**Open http://localhost:5173 and:**

- Connect MetaMask (Hardhat fork).
- Import WETH and USDC tokens into the currently connected Hardhat local Arbitrum fork network to verify balances and confirm network connection.
- Get a live quote.
- Ensure the wallet has WETH for swapping by running: ```npx hardhat run scripts/fork.setup.ts --network localhost``` This script seeds the account with 0.0500 WETH for testing.
- Swap WETH → USDC via adapter.
- Add liquidity & withdraw liquidity.
- Refresh stats from subgraph.

---

## 5) env Summary

**Back-end (.env at repo root):**

```
ARBITRUM_RPC_URL – Arbitrum One RPC used for Hardhat forking
ADAPTER_ADDR – adapter contract address on the local fork
POSITION_ID=401187020
PCT=50
```

**Front-end (frontend/.env.local):**

```
VITE_ADAPTER_ADDRESS
VITE_WETH_ADDRESS
VITE_USDC_ADDRESS
VITE_POSITION_MANAGER
VITE_GRAPHQL_URL
```

Keep these in sync whenever you restart the fork and redeploy the adapter.
