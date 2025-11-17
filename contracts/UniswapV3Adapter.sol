// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/* -------------------------------------------------------------------------
 * Uniswap v3 + ERC721 interfaces
 * ---------------------------------------------------------------------- */

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function ownerOf(uint256 tokenId) external view returns (address);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24  fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams calldata params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32  initializedTicksCrossed,
            uint256 gasEstimate
        );
}

/**
 * @title UniswapV3Adapter
 * @notice Thin helper around Uniswap v3 router + position manager.
 * @dev
 * - Pulls tokens from the caller, approves router/position manager, and forwards calls.
 * - Does not hold long-term balances; all residuals stay on the caller.
 * - Assumes ERC20 tokens follow the OpenZeppelin IERC20/SafeERC20 behaviour.
 */
contract UniswapV3Adapter {
    using SafeERC20 for IERC20;

    /// @notice Uniswap v3 swap router.
    ISwapRouter public immutable router;

    /// @notice Uniswap v3 NonfungiblePositionManager for LP NFTs.
    INonfungiblePositionManager public immutable positionManager;

    /// @notice Uniswap v3 quoter for off-chain quoting.
    IQuoterV2 public immutable quoter;

    /// @notice Emitted when liquidity is added via `addLiquidity`.
    event LiquidityAdded(
        uint256 indexed tokenId,
        address tokenA,
        address tokenB,
        uint24 fee,
        uint256 amountA,
        uint256 amountB,
        int24 tickLower,
        int24 tickUpper
    );

    /// @notice Emitted when liquidity is removed via `withdrawLiquidity`.
    event LiquidityRemoved(
        uint256 indexed tokenId,
        address tokenA,
        address tokenB,
        uint24 fee,
        uint256 amount0,
        uint256 amount1
    );

    /// @notice Emitted when a swap is routed via `swapExactInput`.
    event TokensSwapped(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @param _router           Address of the Uniswap v3 swap router.
     * @param _positionManager  Address of the NonfungiblePositionManager.
     * @param _quoter           Address of the quoter v2 contract.
     */
    constructor(address _router, address _positionManager, address _quoter) {
        require(_router != address(0) && _positionManager != address(0) && _quoter != address(0), "zero addr");
        router = ISwapRouter(_router);
        positionManager = INonfungiblePositionManager(_positionManager);
        quoter = IQuoterV2(_quoter);
    }

    /* -------------------------------------------------------------------------
     * Internal helpers
     * ---------------------------------------------------------------------- */

    /**
     * @notice Pulls `amount` of `token` from msg.sender and approves `spender`.
     * @dev
     * - Reverts early if adapter doesn't have enough allowance from the sender.
     * - Uses `forceApprove` (OZ v5) pattern to deal with non-standard ERC20s.
     * @param token   ERC20 token to pull from the caller.
     * @param spender Downstream contract to approve (router or positionManager).
     * @param amount  Amount to transfer/approve (no effect if zero).
     */
    function _pullApprove(address token, address spender, uint256 amount) internal {
        if (amount == 0) return;

        // explicit allowance check for clearer error message
        uint256 allow = IERC20(token).allowance(msg.sender, address(this));
        require(allow >= amount, "approve adapter for token first");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve downstream spender (positionManager/router).
        IERC20(token).forceApprove(spender, 0);
        IERC20(token).forceApprove(spender, amount);
    }

    /* -------------------------------------------------------------------------
     * Liquidity: add
     * ---------------------------------------------------------------------- */

    /**
     * @notice Adds liquidity to a Uniswap v3 pool and mints an LP NFT to the caller.
     * @dev
     * - Caller must approve this adapter for `tokenA` and/or `tokenB` beforehand.
     * - Token ordering is normalized to (token0, token1) as required by Uniswap.
     * - `amount0Min`/`amount1Min` are set to 0 for simplicity; slippage is handled
     *   by the caller choosing a tight tick range and amounts.
     * @param tokenA     First token in the pair (caller-facing naming only).
     * @param tokenB     Second token in the pair (caller-facing naming only).
     * @param fee        Uniswap v3 pool fee tier (e.g., 500, 3000, 10000).
     * @param amountA    Desired amount of `tokenA` to supply.
     * @param amountB    Desired amount of `tokenB` to supply.
     * @param tickLower  Lower tick of the position.
     * @param tickUpper  Upper tick of the position.
     * @return tokenId   Newly minted position NFT id.
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint24 fee,
        uint256 amountA,
        uint256 amountB,
        int24 tickLower,
        int24 tickUpper
    ) external returns (uint256 tokenId) {
        require(tokenA != tokenB, "same token");
        require(amountA > 0 || amountB > 0, "no amounts");
        require(tickLower < tickUpper, "ticks inverted");

        (address token0, address token1, uint256 amt0, uint256 amt1) =
            tokenA < tokenB
                ? (tokenA, tokenB, amountA, amountB)
                : (tokenB, tokenA, amountB, amountA);

        _pullApprove(token0, address(positionManager), amt0);
        _pullApprove(token1, address(positionManager), amt1);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amt0,
            amount1Desired: amt1,
            amount0Min: 0,
            amount1Min: 0,
            recipient: msg.sender,
            deadline: block.timestamp
        });

        (tokenId, , , ) = positionManager.mint(params);

        emit LiquidityAdded(tokenId, tokenA, tokenB, fee, amountA, amountB, tickLower, tickUpper);
        return tokenId;
    }

    /* -------------------------------------------------------------------------
     * Liquidity: withdraw
     * ---------------------------------------------------------------------- */

    /**
     * @notice Decreases liquidity for a given LP NFT and sends underlying tokens to the caller.
     * @dev
     * - Caller must own the position NFT.
     * - The NFT must be approved for this adapter (either `approve` or `setApprovalForAll`).
     * - Collects all fees and principal up to the removed liquidity.
     * @param tokenId    The Uniswap v3 position NFT id.
     * @param liquidity  Amount of liquidity to burn from the position.
     * @param amount0Min Minimum amount of token0 to receive.
     * @param amount1Min Minimum amount of token1 to receive.
     * @return amount0   Amount of token0 actually returned.
     * @return amount1   Amount of token1 actually returned.
     */
    function withdrawLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external returns (uint256 amount0, uint256 amount1) {
        address owner = positionManager.ownerOf(tokenId);
        require(owner == msg.sender, "not owner");

        // Require adapter approval on the NFT before acting
        bool approved =
            positionManager.getApproved(tokenId) == address(this) ||
            positionManager.isApprovedForAll(owner, address(this));
        require(approved, "adapter not approved for position");

        INonfungiblePositionManager.DecreaseLiquidityParams memory dec =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp
            });

        (amount0, amount1) = positionManager.decreaseLiquidity(dec);

        INonfungiblePositionManager.CollectParams memory col =
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        positionManager.collect(col);

        (, , address token0, address token1, uint24 fee, , , , , , , ) = positionManager.positions(tokenId);

        emit LiquidityRemoved(tokenId, token0, token1, fee, amount0, amount1);
    }

    /* -------------------------------------------------------------------------
     * Swaps
     * ---------------------------------------------------------------------- */

    /**
     * @notice Swap an exact `amountIn` of `tokenIn` for `tokenOut` via Uniswap v3.
     * @dev
     * - Caller must have approved this adapter for `tokenIn`.
     * - Uses a single pool (no multi-hop).
     * - `minOut` is forwarded to `amountOutMinimum` to protect against slippage.
     * @param tokenIn   Token being sold.
     * @param tokenOut  Token being bought.
     * @param fee       Fee tier for the pool to route through.
     * @param amountIn  Exact amount of `tokenIn` to swap.
     * @param minOut    Minimum amount of `tokenOut` expected.
     * @return amountOut Amount of `tokenOut` actually received by the caller.
     */
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minOut
    ) external returns (uint256 amountOut) {
        require(tokenIn != tokenOut, "same token");
        require(amountIn > 0, "zero in");

        _pullApprove(tokenIn, address(router), amountIn);

        ISwapRouter.ExactInputSingleParams memory p = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender,
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = router.exactInputSingle(p);

        emit TokensSwapped(tokenIn, tokenOut, fee, amountIn, amountOut);
    }

    /* -------------------------------------------------------------------------
     * Quoting
     * ---------------------------------------------------------------------- */

    /**
     * @notice Get a quote for swapping `amountIn` of `tokenIn` to `tokenOut`.
     * @dev
     * - Thin wrapper around Uniswap v3 QuoterV2.
     * - Intended for off-chain use; the Quoter can be quite gas-heavy on-chain.
     * @param tokenIn    Token being sold.
     * @param tokenOut   Token being bought.
     * @param fee        Pool fee tier to quote against.
     * @param amountIn   Input amount to quote for.
     * @return quotedOut Estimated output amount from the quoter.
     */
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) external returns (uint256 quotedOut) {
        IQuoterV2.QuoteExactInputSingleParams memory qp = IQuoterV2.QuoteExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            fee: fee,
            sqrtPriceLimitX96: 0
        });

        (quotedOut, , , ) = quoter.quoteExactInputSingle(qp);
    }
}