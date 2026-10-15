import { useCallback, useEffect, useMemo, useState } from 'react'
import { WalletContext } from './walletContext'
import { REQUIRED_CHAIN_ID, REQUIRED_NETWORK_NAME } from './networks'

// Remembers that the user pressed "Disconnect", so we don't silently
// reconnect on the next page load (MetaMask still trusts the site).
const DISCONNECTED_KEY = 'trustledge:disconnected'

function readFlag() {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

function writeFlag(on) {
  try {
    if (on) localStorage.setItem(DISCONNECTED_KEY, '1')
    else localStorage.removeItem(DISCONNECTED_KEY)
  } catch {
    // storage blocked (private window etc.) - not important
  }
}

function errorMessage(err) {
  if (err?.code === 4001) return 'Request rejected in MetaMask.'
  if (err?.code === -32002) return 'MetaMask is already waiting for you. Open the extension to continue.'
  return err?.message ?? 'Something went wrong talking to MetaMask.'
}

export function WalletProvider({ children }) {
  // MetaMask injects window.ethereum (EIP-1193 provider)
  const ethereum = typeof window !== 'undefined' ? window.ethereum : undefined

  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [balance, setBalance] = useState(null) // in wei, as a BigInt
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  // On load: reconnect silently if the user already approved this site,
  // then keep in sync when they switch account or network in MetaMask.
  useEffect(() => {
    if (!ethereum) return

    ethereum.request({ method: 'eth_chainId' }).then(setChainId).catch(() => {})

    if (!readFlag()) {
      // eth_accounts never opens a popup - it only returns already-approved accounts
      ethereum
        .request({ method: 'eth_accounts' })
        .then((accounts) => setAccount(accounts[0] ?? null))
        .catch(() => {})
    }

    const onAccountsChanged = (accounts) => {
      if (readFlag()) return
      setAccount(accounts[0] ?? null)
    }
    const onChainChanged = (id) => setChainId(id)

    ethereum.on?.('accountsChanged', onAccountsChanged)
    ethereum.on?.('chainChanged', onChainChanged)
    return () => {
      ethereum.removeListener?.('accountsChanged', onAccountsChanged)
      ethereum.removeListener?.('chainChanged', onChainChanged)
    }
  }, [ethereum])

  // Re-read the balance whenever the account or network changes,
  // or when refreshBalance() is called (e.g. after a trade)
  const [balanceRefresh, setBalanceRefresh] = useState(0)
  const refreshBalance = useCallback(() => setBalanceRefresh((n) => n + 1), [])

  useEffect(() => {
    if (!ethereum || !account) return
    let cancelled = false
    ethereum
      .request({ method: 'eth_getBalance', params: [account, 'latest'] })
      .then((hex) => !cancelled && setBalance(BigInt(hex)))
      .catch(() => !cancelled && setBalance(null))
    return () => {
      cancelled = true
    }
  }, [ethereum, account, chainId, balanceRefresh])

  // Opens the MetaMask popup. Returns the connected address, or null if it failed.
  const connect = useCallback(async () => {
    if (!ethereum) {
      setError('MetaMask is not installed.')
      return null
    }
    setConnecting(true)
    setError('')
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      writeFlag(false)
      setAccount(accounts[0] ?? null)
      setChainId(await ethereum.request({ method: 'eth_chainId' }))
      return accounts[0] ?? null
    } catch (err) {
      setError(errorMessage(err))
      return null
    } finally {
      setConnecting(false)
    }
  }, [ethereum])

  const disconnect = useCallback(async () => {
    writeFlag(true)
    setAccount(null)
    setBalance(null)
    setError('')
    try {
      // Removes this site's permission in MetaMask (supported in recent versions)
      await ethereum?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      // Older MetaMask: the flag above still keeps us logged out
    }
  }, [ethereum])

  const switchNetwork = useCallback(async () => {
    if (!ethereum) return
    setError('')
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: REQUIRED_CHAIN_ID }],
      })
    } catch (err) {
      setError(
        err?.code === 4902
          ? `${REQUIRED_NETWORK_NAME} isn't added in MetaMask. Turn on "Show test networks" in MetaMask settings.`
          : errorMessage(err),
      )
    }
  }, [ethereum])

  const value = useMemo(
    () => ({
      isInstalled: Boolean(ethereum),
      account, // full address, or null when not connected
      chainId,
      isConnected: Boolean(account),
      isCorrectNetwork: chainId?.toLowerCase() === REQUIRED_CHAIN_ID,
      balance: account ? balance : null,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
      refreshBalance, // call after a trade so the balance updates
      clearError: () => setError(''),
    }),
    [ethereum, account, chainId, balance, connecting, error, connect, disconnect, switchNetwork, refreshBalance],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
