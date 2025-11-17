import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const SUBGRAPH_URL = import.meta.env.VITE_SUBGRAPH_URL as string;

// Pointing at our local subgraph
const httpLink = new HttpLink({
  uri: SUBGRAPH_URL,
});

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});