import { gql } from "@apollo/client";

export const GET_PAIR_STATS = gql`
  query GetPairStats {
    pair(id: "WETH-USDC") {
      fee
      totalLiquidityAdded
      totalLiquidityRemoved
      totalSwappedUSDC
    }
  }
`;
