// 0x3fA2b1...9c1E -> 0x3fA2…9c1E
export function shortenAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Wei (BigInt) -> ETH string, e.g. 45000000000000000n -> "0.045".
// Done with BigInt so large balances don't lose precision.
export function formatEth(wei, decimals = 4) {
  if (wei == null) return '—'
  const base = 10n ** 18n
  const whole = wei / base
  const fraction = (wei % base).toString().padStart(18, '0').slice(0, decimals).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
