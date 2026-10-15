// The network the escrow contract is deployed on.
// Default is Sepolia (chain 11155111 = 0xaa36a7), matching contracts/hardhat.config.js.
// To test against `npm run chain` (Hardhat, chain 31337), create client/.env.local with:
//   VITE_CHAIN_ID=31337
const chainFromEnv = Number(import.meta.env.VITE_CHAIN_ID)
export const REQUIRED_CHAIN_ID = chainFromEnv ? `0x${chainFromEnv.toString(16)}` : '0xaa36a7'

const NETWORK_NAMES = {
  '0x1': 'Ethereum Mainnet',
  '0xaa36a7': 'Sepolia',
  '0x7a69': 'Hardhat (local)',
  '0x539': 'Localhost 8545',
}

export const REQUIRED_NETWORK_NAME = NETWORK_NAMES[REQUIRED_CHAIN_ID]

export function networkName(chainId) {
  if (!chainId) return 'Not connected'
  return NETWORK_NAMES[chainId.toLowerCase()] ?? `Unknown network (chain ${parseInt(chainId, 16)})`
}

export const EXPLORER_URL = 'https://sepolia.etherscan.io'
