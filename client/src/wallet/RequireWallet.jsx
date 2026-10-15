import { useWallet } from './useWallet'
import { LoginPage } from './LoginPage'

// Wrap any page that needs a logged-in wallet:
//   <RequireWallet action="create a listing"> ...page... </RequireWallet>
// If no wallet is connected, the login page is shown in its place.
export function RequireWallet({ action, children }) {
  const { account } = useWallet()
  if (account) return children
  return <LoginPage action={action} />
}
