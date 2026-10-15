const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Deploys TrustLedgeEscrow and writes { address, chainId, abi } to the
// client and server so both pick up the latest deployment automatically.
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No deployer account for "${hre.network.name}". Set DEPLOYER_PRIVATE_KEY in contracts/.env (see .env.example).`
    );
  }
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying from ${deployer.address} (${hre.ethers.formatEther(balance)} ETH on ${hre.network.name})`);

  const Escrow = await hre.ethers.getContractFactory("TrustLedgeEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  const artifact = await hre.artifacts.readArtifact("TrustLedgeEscrow");

  const output = JSON.stringify(
    { address, chainId: Number(chainId), abi: artifact.abi },
    null,
    2
  );

  const targets = [
    path.join(__dirname, "../../client/src/contracts/TrustLedgeEscrow.json"),
    path.join(__dirname, "../../server/src/contracts/TrustLedgeEscrow.json"),
  ];
  for (const file of targets) {
    fs.writeFileSync(file, output);
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  }

  console.log(`TrustLedgeEscrow deployed to ${address} (chainId ${chainId})`);
  if (hre.network.name === "sepolia") {
    console.log(`View: https://sepolia.etherscan.io/address/${address}`);
    console.log("Restart the server so it picks up the new address.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
