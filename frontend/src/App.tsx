// src/App.tsx
import React, { useCallback, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_PAIR_STATS } from "./queries";
import {
  getContracts,
  ensureAllowance,
  ADAPTER_ADDRESS,
  WETH_ADDRESS,
  USDC_ADDRESS,
  FEE_OPTIONS,
  TICK_LOWER,
  TICK_UPPER,
  toWei,
  fromWei,
} from "./eth";
import { Contract } from "ethers";

type PairStats = {
  pair: {
    fee: number;
    totalLiquidityAdded: string;
    totalLiquidityRemoved: string;
    totalSwappedUSDC: string;
  } | null;
};

function App() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Swap state
  const [swapAmountIn, setSwapAmountIn] = useState("0.01"); // WETH
  const [swapFee, setSwapFee] = useState<number>(500);
  const [quote, setQuote] = useState<string | null>(null);
  const [lastSwapHash, setLastSwapHash] = useState<string | null>(null);

  // Liquidity state
  const [liqWeth, setLiqWeth] = useState("0.01");
  const [liqUsdc, setLiqUsdc] = useState("50");
  const [lastPositionId, setLastPositionId] = useState<string | null>(null);
  const [lastLiqTxHash, setLastLiqTxHash] = useState<string | null>(null);

  // Withdraw state
  const [withdrawTokenId, setWithdrawTokenId] = useState("");
  const [withdrawPct, setWithdrawPct] = useState("50");
  const [lastWithdrawTxHash, setLastWithdrawTxHash] = useState<string | null>(
    null
  );

  // Subgraph stats
  const { data, loading, error, refetch } = useQuery<PairStats>(GET_PAIR_STATS);

  // 1) Connect MetaMask
  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) {
        alert("MetaMask not found. Please install the extension.");
        return;
      }

      console.log("[Wallet] Requesting accounts…");
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      console.log("[Wallet] Accounts from MetaMask:", accounts);
      if (accounts.length > 0) {
        setConnectedAddress(accounts[0]);
      }
    } catch (err: any) {
      console.error("[Wallet] Connect failed:", err);
      alert("Failed to connect wallet: " + err.message);
    }
  }, []);

  // 2) Get live quote via adapter.getQuote
const fetchQuote = useCallback(async () => {
  try {
    console.log("[Quote] Starting fetchQuote for WETH → USDC");
    const { adapter } = await getContracts();

    const amountIn = toWei(swapAmountIn, 18);
    console.log(
      "[Quote] Params",
      "amountIn(WETH wei):",
      amountIn.toString(),
      "fee:",
      swapFee
    );

    const quotedOut: bigint = await adapter.getQuote(
      WETH_ADDRESS,
      USDC_ADDRESS,
      swapFee,
      amountIn
    );

    console.log(
      "[Quote] Raw quotedOut (USDC 6d, wei):",
      quotedOut.toString()
    );

    const outHuman = fromWei(quotedOut, 6);
    console.log("[Quote] Human-readable quotedOut:", outHuman, "USDC");

    setQuote(outHuman);
  } catch (err: any) {
    console.error("[Quote] Failed to fetch quote:", err);
    alert("Failed to fetch quote: " + err.message);
  }
}, [swapAmountIn, swapFee]);

  // 3) Swap WETH -> USDC using adapter.swapExactInput
  const handleSwap = useCallback(async () => {
    try {
      console.log("[Swap] Starting swap WETH → USDC…");
      const { adapter, weth, address } = await getContracts();

      const amountIn = toWei(swapAmountIn, 18);
      console.log(
        "[Swap] amountIn(WETH wei):",
        amountIn.toString(),
        "from:",
        address
      );

      // Ensure adapter is approved to pull WETH
      console.log("[Swap] Ensuring allowance for WETH → adapter…");
      await ensureAllowance(
        weth as unknown as Contract,
        address,
        ADAPTER_ADDRESS,
        amountIn
      );
      console.log("[Swap] Allowance OK, calling swapExactInput…");

      // Optional: use quote * 0.99 as minOut if we have a quote
      let minOut = 0n;
      if (quote) {
        const q = toWei(quote, 6);
        minOut = (q * 99n) / 100n;
        console.log(
          "[Swap] Using minOut from quote (99% slippage guard):",
          minOut.toString()
        );
      } else {
        console.log("[Swap] No quote set, minOut = 0 (no slippage guard)");
      }

      const tx = await adapter.swapExactInput(
        WETH_ADDRESS,
        USDC_ADDRESS,
        swapFee,
        amountIn,
        minOut
      );
      console.log("[Swap] Sent tx:", tx.hash);
      const rcpt = await tx.wait();
      console.log("[Swap] Tx mined:", rcpt?.hash);

      setLastSwapHash(rcpt?.hash ?? null);

      console.log("[Swap] Refetching subgraph stats…");
      await refetch();
    } catch (err: any) {
      console.error("[Swap] Swap failed:", err);
      alert("Swap failed: " + err.message);
    }
  }, [swapAmountIn, swapFee, quote, refetch]);

  // 4) Add liquidity via adapter.addLiquidity
  const handleAddLiquidity = useCallback(async () => {
    try {
      console.log("[AddLiquidity] Starting…");
      console.log(
        "[AddLiquidity] Inputs:",
        "liqWeth:",
        liqWeth,
        "liqUsdc:",
        liqUsdc,
        "fee:",
        swapFee
      );

      const { adapter, weth, usdc, address } = await getContracts();

      const amountWeth = toWei(liqWeth, 18);
      const amountUsdc = toWei(liqUsdc, 6);
      console.log(
        "[AddLiquidity] Computed amounts:",
        "WETH wei:",
        amountWeth.toString(),
        "USDC wei:",
        amountUsdc.toString()
      );

      // Approve adapter for both tokens
      console.log(
        "[AddLiquidity] Ensuring WETH allowance for adapter:",
        ADAPTER_ADDRESS
      );
      await ensureAllowance(
        weth as unknown as Contract,
        address,
        ADAPTER_ADDRESS,
        amountWeth
      );
      console.log("[AddLiquidity] WETH allowance OK.");

      console.log(
        "[AddLiquidity] Ensuring USDC allowance for adapter:",
        ADAPTER_ADDRESS
      );
      await ensureAllowance(
        usdc as unknown as Contract,
        address,
        ADAPTER_ADDRESS,
        amountUsdc
      );
      console.log("[AddLiquidity] USDC allowance OK.");

      // Add liquidity
      console.log("[AddLiquidity] Calling adapter.addLiquidity…");
      const tx = await adapter.addLiquidity(
        WETH_ADDRESS,
        USDC_ADDRESS,
        swapFee,
        amountWeth,
        amountUsdc,
        TICK_LOWER,
        TICK_UPPER
      );
      console.log("[AddLiquidity] Sent tx:", tx.hash);
      const rcpt = await tx.wait();
      console.log("[AddLiquidity] Tx mined:", rcpt?.hash);

      setLastLiqTxHash(rcpt?.hash ?? null);

      // Parse LiquidityAdded event to get tokenId
      if (rcpt && rcpt.logs) {
        console.log(
          "[AddLiquidity] Parsing logs to find LiquidityAdded events…"
        );
        for (const log of rcpt.logs) {
          try {
            const parsed = adapter.interface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            if (parsed?.name === "LiquidityAdded") {
              const tokenId = parsed.args.tokenId.toString();
              console.log("[AddLiquidity] Found LiquidityAdded tokenId:", tokenId);
              setLastPositionId(tokenId);
            }
          } catch (e) {
            // ignore logs that aren't ours
          }
        }
      }

      console.log("[AddLiquidity] Refetching subgraph stats…");
      await refetch();
    } catch (err: any) {
      console.error("[AddLiquidity] Failed:", err);
      alert("Add liquidity failed: " + err.message);
    }
  }, [liqWeth, liqUsdc, swapFee, refetch]);

  // 5) Withdraw liquidity via adapter.withdrawLiquidity
  const handleWithdraw = useCallback(async () => {
    try {
      if (!withdrawTokenId) {
        alert("Please enter a position tokenId");
        return;
      }
      const pct = parseFloat(withdrawPct || "0");
      if (pct <= 0 || pct > 100) {
        alert("Percentage must be between 1 and 100");
        return;
      }

      console.log("[Withdraw] Starting…");
      console.log(
        "[Withdraw] tokenId:",
        withdrawTokenId,
        "percent:",
        pct.toString()
      );

      const { adapter, pm, address } = await getContracts();
      const tokenId = BigInt(withdrawTokenId);

      console.log("[Withdraw] Reading position from NonfungiblePositionManager…");
      const pos = await pm.positions(tokenId);
      const currentLiquidity: bigint = pos[7];
      console.log(
        "[Withdraw] Current liquidity:",
        currentLiquidity.toString()
      );

      const liqToBurn =
        (currentLiquidity * BigInt(Math.floor(pct))) / 100n;
      console.log(
        "[Withdraw] Liquidity to burn (based on pct):",
        liqToBurn.toString()
      );

      console.log(
        "[Withdraw] Checking isApprovedForAll(owner, adapter)…",
        "owner:",
        address,
        "operator:",
        ADAPTER_ADDRESS
      );
      const alreadyApproved: boolean = await pm.isApprovedForAll(
        address,
        ADAPTER_ADDRESS
      );
      console.log("[Withdraw] Already approved?", alreadyApproved);

      if (!alreadyApproved) {
        console.log(
          "[Withdraw] Sending setApprovalForAll(adapter, true)…"
        );
        const txApprove = await pm.setApprovalForAll(
          ADAPTER_ADDRESS,
          true
        );
        console.log("[Withdraw] Approve tx:", txApprove.hash);
        await txApprove.wait();
        console.log("[Withdraw] Approve mined.");
      }

      console.log("[Withdraw] Calling adapter.withdrawLiquidity…");
      const tx = await adapter.withdrawLiquidity(
        tokenId,
        liqToBurn,
        0n,
        0n // amount0Min / amount1Min = 0 for demo
      );
      console.log("[Withdraw] Sent tx:", tx.hash);
      const rcpt = await tx.wait();
      console.log("[Withdraw] Tx mined:", rcpt?.hash);
      setLastWithdrawTxHash(rcpt?.hash ?? null);

      console.log("[Withdraw] Refetching subgraph stats…");
      await refetch();
    } catch (err: any) {
      console.error("[Withdraw] Failed:", err);
      alert("Withdraw failed: " + err.message);
    }
  }, [withdrawTokenId, withdrawPct, refetch]);

  // ---- Render helpers ----
  const renderPairStats = () => {
    if (loading) return <p className="muted">Loading subgraph stats…</p>;
    if (error)
      return (
        <p className="error">
          Subgraph error: {error.message}
        </p>
      );
    if (!data || !data.pair)
      return <p className="muted">No stats yet. Try running some txs.</p>;

    const p = data.pair;
    console.log("[Subgraph] Pair stats:", p);

    return (
      <div className="stats-grid">
        <div className="stat-pill">
          <span className="stat-label">Fee tier</span>
          <span className="stat-value">{p.fee}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Total liquidity added (wei)</span>
          <span className="stat-value">{p.totalLiquidityAdded}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Total liquidity removed (wei)</span>
          <span className="stat-value">{p.totalLiquidityRemoved}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Total USDC swapped (6d)</span>
          <span className="stat-value">{p.totalSwappedUSDC}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="app-root">
      {/* Top bar – dappunk-style */}
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-pill">Univ3 Adapter</div>
          <h1 className="app-title">Uniswap V3 Adapter – WETH / USDC</h1>
          <p className="app-subtitle">
            Connected to Hardhat Arbitrum fork + local subgraph.
          </p>
        </div>

        <div className="header-actions">
          {connectedAddress ? (
            <div className="wallet-chip">
              <span className="dot" />
              <span className="wallet-label">Connected</span>
              <span className="wallet-address">
                {connectedAddress.slice(0, 6)}…
                {connectedAddress.slice(-4)}
              </span>
            </div>
          ) : (
            <button className="btn-primary" onClick={connectWallet}>
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      {/* Main grid – sections like your dappunk voucher UI */}
      <main className="section-grid">
        {/* Pair + fee */}
        <section className="section-card">
          <h2 className="section-title">Pair &amp; Fee</h2>
          <p className="section-help">
            Pair is fixed to <strong>WETH / USDC</strong> on Arbitrum (addresses
            are hardcoded in config).
          </p>

          <div className="field-row">
            <label className="field-label">Fee tier</label>
            <select
              className="field-input"
              value={swapFee}
              onChange={(e) => setSwapFee(parseInt(e.target.value, 10))}
            >
              {FEE_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f / 10000}% ({f})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Swap */}
        <section className="section-card">
          <h2 className="section-title">Swap WETH → USDC</h2>
          <p className="section-help">
            Uses the adapter&apos;s <code>getQuote</code> +{" "}
            <code>swapExactInput</code> on the local Arbitrum fork.
          </p>

          <div className="field-row">
            <label className="field-label">Amount in (WETH)</label>
            <input
              type="text"
              className="field-input"
              value={swapAmountIn}
              onChange={(e) => setSwapAmountIn(e.target.value)}
            />
            <button className="btn-secondary" onClick={fetchQuote}>
              Get quote
            </button>
          </div>

          {quote && (
            <p className="quote-pill">
              Estimated output: <span>{quote}</span> USDC
            </p>
          )}

          <div className="button-row">
            <button className="btn-primary" onClick={handleSwap}>
              Swap via Adapter
            </button>
          </div>

          {lastSwapHash && (
            <p className="tx-hash">
              Last swap tx:&nbsp;
              <a
                href={`https://arbiscan.io/tx/${lastSwapHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {lastSwapHash}
              </a>
            </p>
          )}
        </section>

        {/* Add liquidity */}
        <section className="section-card">
          <h2 className="section-title">Add Liquidity</h2>
          <p className="section-help">
            Approves the adapter for both tokens, then calls{" "}
            <code>addLiquidity</code> with a full-range position.
          </p>

          <div className="field-row">
            <label className="field-label">WETH amount</label>
            <input
              type="text"
              className="field-input"
              value={liqWeth}
              onChange={(e) => setLiqWeth(e.target.value)}
            />
          </div>

          <div className="field-row">
            <label className="field-label">USDC amount</label>
            <input
              type="text"
              className="field-input"
              value={liqUsdc}
              onChange={(e) => setLiqUsdc(e.target.value)}
            />
          </div>

          <div className="button-row">
            <button className="btn-primary" onClick={handleAddLiquidity}>
              Add liquidity via Adapter
            </button>
          </div>

          {lastLiqTxHash && (
            <p className="tx-hash">Last add-liquidity tx: {lastLiqTxHash}</p>
          )}
          {lastPositionId && (
            <p className="tx-hash">
              Last position tokenId: <strong>{lastPositionId}</strong>
            </p>
          )}
        </section>

        {/* Withdraw */}
        <section className="section-card">
          <h2 className="section-title">Withdraw Liquidity</h2>
          <p className="section-help">
            Reads liquidity from <code>positions()</code>, ensures NFT approval
            for the adapter, then calls <code>withdrawLiquidity</code>.
          </p>

          <div className="field-row">
            <label className="field-label">Position tokenId</label>
            <input
              type="text"
              className="field-input"
              value={withdrawTokenId}
              onChange={(e) => setWithdrawTokenId(e.target.value)}
            />
          </div>

          <div className="field-row">
            <label className="field-label">Percentage to withdraw</label>
            <input
              type="number"
              className="field-input"
              value={withdrawPct}
              onChange={(e) => setWithdrawPct(e.target.value)}
              min={1}
              max={100}
            />
            <span className="field-suffix">%</span>
          </div>

          <div className="button-row">
            <button className="btn-primary" onClick={handleWithdraw}>
              Withdraw via Adapter
            </button>
          </div>

          {lastWithdrawTxHash && (
            <p className="tx-hash">Last withdraw tx: {lastWithdrawTxHash}</p>
          )}
        </section>

        {/* Subgraph stats */}
        <section className="section-card">
          <h2 className="section-title">Subgraph Stats (WETH–USDC)</h2>
          <div className="button-row">
            <button
              className="btn-secondary"
              onClick={() => {
                console.log("[Subgraph] Manual refresh clicked");
                refetch();
              }}
            >
              Refresh from Subgraph
            </button>
          </div>
          {renderPairStats()}
        </section>
      </main>
    </div>
  );
}

export default App;