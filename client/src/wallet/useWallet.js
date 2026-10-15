import { useContext } from 'react'
import { WalletContext } from './walletContext'

// Use this in any component that needs the wallet:
//   const { account, isCorrectNetwork, connect } = useWallet()
export function useWallet() {
  const wallet = useContext(WalletContext)
  if (!wallet) throw new Error('useWallet must be used inside <WalletProvider>')
  return wallet
}
