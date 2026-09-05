const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);

  // 1. Deploy AccessControl
  const AccessControlFactory = await hre.ethers.getContractFactory("BlockDriveAccessControl");
  const accessControl = await AccessControlFactory.deploy(deployer.address);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log(`BlockDriveAccessControl deployed to: ${accessControlAddress}`);

  // 2. Deploy FileRegistry
  const FileRegistryFactory = await hre.ethers.getContractFactory("FileRegistry");
  const fileRegistry = await FileRegistryFactory.deploy(accessControlAddress);
  await fileRegistry.waitForDeployment();
  const fileRegistryAddress = await fileRegistry.getAddress();
  console.log(`FileRegistry deployed to: ${fileRegistryAddress}`);

  // 3. Export deployment artifacts for frontend consumption
  const frontendContractsDir = path.join(__dirname, "..", "frontend", "src", "utils");
  if (fs.existsSync(frontendContractsDir)) {
    const deploymentConfig = {
      network: hre.network.name,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      accessControlAddress: accessControlAddress,
      fileRegistryAddress: fileRegistryAddress,
    };

    fs.writeFileSync(
      path.join(frontendContractsDir, "deployedAddresses.json"),
      JSON.stringify(deploymentConfig, null, 2)
    );
    console.log(`Deployment addresses saved to frontend/src/utils/deployedAddresses.json`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
