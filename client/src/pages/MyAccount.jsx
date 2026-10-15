function MyAccount() {
  return (
    <div className="account">
      <h2>My account</h2>

      <div className="account-cards">
        <div className="box">Wallet</div>
        <div className="box">Network</div>
        <div className="box">Completed trades</div>
      </div>

      <h3>Selling</h3>
      <div className="box trade-box" />

      <h3>Buying</h3>
      <div className="box trade-box" />
    </div>
  )
}

export default MyAccount
