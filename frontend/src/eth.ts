import {
  BrowserProvider,
  Contract,
  parseUnits,
  formatUnits,
  isAddress,
} from "ethers";

// ---- Env helper with validation + logging ----
function getAddressEnv(name: string): string {
  const raw = (import.meta as any).env[name] as string | undefined;

  if (!raw) {
    throw new Error(
      `Missing env var ${name}. Did you create frontend/.env.local with ${name}=... ?`
    );
  }

  const value = raw.trim();

  if (!isAddress(value)) {
    throw new Error(
      `${name} is not a valid Ethereum address: "${raw}". ` +
        `Check frontend/.env.local (no quotes, no spaces, must start with 0x).`
    );
  }

  console.log(`${name} =`, value);
  return value;
}

export const ADAPTER_ADDRESS = getAddressEnv("VITE_ADAPTER_ADDRESS");
export const WETH_ADDRESS = getAddressEnv("VITE_WETH_ADDRESS");
export const USDC_ADDRESS = getAddressEnv("VITE_USDC_ADDRESS");
export const POSITION_MANAGER_ADDRESS = getAddressEnv("VITE_POSITION_MANAGER");

// ---- ABIs ----
export const adapterAbi = [
  "function getQuote(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn) view returns (uint256)",
  "function swapExactInput(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minOut) returns (uint256)",
  "function addLiquidity(address tokenA, address tokenB, uint24 fee, uint256 amountA, uint256 amountB, int24 tickLower, int24 tickUpper) returns (uint256)",
  "function withdrawLiquidity(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min) returns (uint256,uint256)",
  "event LiquidityAdded(uint256 indexed tokenId, address tokenA, address tokenB, uint24 fee, uint256 amountA, uint256 amountB, int24 tickLower, int24 tickUpper)",
  "event LiquidityRemoved(uint256 indexed tokenId, address tokenA, address tokenB, uint24 fee, uint256 amount0, uint256 amount1)",
];

export const erc20Abi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const positionManagerAbi = [
  "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

export const FEE_OPTIONS = [500, 3000, 10000];
export const TICK_LOWER = -887220;
export const TICK_UPPER = 887220;

// Provider + signer from MetaMask
export async function getProviderAndSigner() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  console.log(
    "Connected network:",
    network.chainId.toString(),
    network.name || "unknown"
  );
  const signer = await provider.getSigner();
  return { provider, signer };
}

// Contracts
export async function getContracts() {
  const { signer } = await getProviderAndSigner();

  const adapter = new Contract(ADAPTER_ADDRESS, adapterAbi, signer);
  const weth = new Contract(WETH_ADDRESS, erc20Abi, signer);
  const usdc = new Contract(USDC_ADDRESS, erc20Abi, signer);
  const pm = new Contract(POSITION_MANAGER_ADDRESS, positionManagerAbi, signer);

  const address = await signer.getAddress();
  return { adapter, weth, usdc, pm, signer, address };
}

// Allowance helper
export async function ensureAllowance(
  token: Contract,
  owner: string,
  spender: string,
  amount: bigint
) {
  const current: bigint = await token.allowance(owner, spender);
  if (current >= amount) return;
  const tx = await token.approve(spender, amount);
  await tx.wait();
}

// Unit helpers
export function toWei(amount: string, decimals: number): bigint {
  return parseUnits(amount || "0", decimals);
}

export function fromWei(value: string | bigint, decimals: number): string {
  const v = typeof value === "bigint" ? value : BigInt(value);
  return formatUnits(v, decimals);
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
