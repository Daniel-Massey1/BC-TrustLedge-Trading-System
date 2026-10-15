import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// Fake MetaMask so pages that need a wallet can render in tests.
// eth_accounts returns an already-connected test account.
export const TEST_WALLET = '0x1111111111111111111111111111111111111111'

window.ethereum = {
  on() {},
  removeListener() {},
  async request({ method }) {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_WALLET]
    if (method === 'eth_chainId') return '0xaa36a7' // Sepolia
    if (method === 'eth_getBalance') return '0x0'
    return null
  },
}
