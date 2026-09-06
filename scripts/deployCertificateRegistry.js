const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`\n======================================================`);
  console.log(`Deploying CertificateRegistry with account: ${deployer.address}`);
  console.log(`======================================================\n`);

  // 1. Deploy CertificateRegistry
  const CertificateRegistryFactory = await hre.ethers.getContractFactory("CertificateRegistry");
  const certificateRegistry = await CertificateRegistryFactory.deploy(deployer.address);
  await certificateRegistry.waitForDeployment();
  const certificateRegistryAddress = await certificateRegistry.getAddress();

  console.log(`✅ CertificateRegistry deployed successfully!`);
  console.log(`📍 Contract Address: ${certificateRegistryAddress}`);

  // 2. Export deployment address to frontend configuration (non-destructive merge)
  const frontendContractsDir = path.join(__dirname, "..", "frontend", "src", "utils");
  const deployedAddressesFile = path.join(frontendContractsDir, "deployedAddresses.json");

  if (fs.existsSync(frontendContractsDir)) {
    let currentConfig = {};
    if (fs.existsSync(deployedAddressesFile)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(deployedAddressesFile, "utf-8"));
      } catch (e) {
        console.warn("Could not parse existing deployedAddresses.json, creating fresh entry.", e);
      }
    }

    const updatedConfig = {
      ...currentConfig,
      network: hre.network.name,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      certificateRegistryAddress: certificateRegistryAddress,
    };

    fs.writeFileSync(
      deployedAddressesFile,
      JSON.stringify(updatedConfig, null, 2)
    );
    console.log(`💾 Saved certificateRegistryAddress to frontend/src/utils/deployedAddresses.json\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
