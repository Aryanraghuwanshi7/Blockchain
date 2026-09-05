const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlockDrive Contracts", function () {
  let accessControl;
  let fileRegistry;
  let admin, owner, recipient, unauthorizedUser;

  const mockFileId = ethers.keccak256(ethers.toUtf8Bytes("file-test-001.pdf"));
  const mockCid = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  const mockOwnerWrappedKey = ethers.hexlify(ethers.toUtf8Bytes("mock-wrapped-key-owner"));
  const mockRecipientWrappedKey = ethers.hexlify(ethers.toUtf8Bytes("mock-wrapped-key-recipient"));

  beforeEach(async function () {
    [admin, owner, recipient, unauthorizedUser] = await ethers.getSigners();

    const AccessControlFactory = await ethers.getContractFactory("BlockDriveAccessControl");
    accessControl = await AccessControlFactory.deploy(admin.address);
    await accessControl.waitForDeployment();

    const FileRegistryFactory = await ethers.getContractFactory("FileRegistry");
    fileRegistry = await FileRegistryFactory.deploy(await accessControl.getAddress());
    await fileRegistry.waitForDeployment();
  });

  describe("AccessControl", function () {
    it("should set and verify user attributes", async function () {
      const attributes = 0x05; // 00000101 binary flags
      await expect(accessControl.connect(admin).setUserAttributes(owner.address, attributes))
        .to.emit(accessControl, "UserAttributesUpdated")
        .withArgs(owner.address, attributes, admin.address);

      expect(await accessControl.getUserAttributes(owner.address)).to.equal(attributes);
      expect(await accessControl.hasRequiredAttributes(owner.address, 0x01)).to.be.true;
      expect(await accessControl.hasRequiredAttributes(owner.address, 0x02)).to.be.false;
    });

    it("should reject non-admin attribute update", async function () {
      await expect(
        accessControl.connect(unauthorizedUser).setUserAttributes(owner.address, 0x01)
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
    });
  });

  describe("FileRegistry", function () {
    it("should register a file and emit FileRegistered event", async function () {
      const tx = await fileRegistry
        .connect(owner)
        .registerFile(mockFileId, mockCid, mockOwnerWrappedKey);

      await expect(tx)
        .to.emit(fileRegistry, "FileRegistered")
        .withArgs(mockFileId, owner.address, mockCid, (await ethers.provider.getBlock("latest")).timestamp);

      expect(await fileRegistry.isAuthorized(owner.address, mockFileId)).to.be.true;
    });

    it("should reject duplicate file registration", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);
      await expect(
        fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey)
      ).to.be.revertedWithCustomError(fileRegistry, "FileAlreadyExists");
    });

    it("should allow authorized owner to retrieve file record and wrapped key", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);

      const record = await fileRegistry.connect(owner).getFileRecord(mockFileId);
      expect(record.ipfsCid).to.equal(mockCid);
      expect(record.ownerAddress).to.equal(owner.address);
      expect(record.callerWrappedKey).to.equal(mockOwnerWrappedKey);
    });

    it("should allow owner to add authorized recipient and emit RecipientAuthorized", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);

      await expect(
        fileRegistry
          .connect(owner)
          .addAuthorizedRecipient(mockFileId, recipient.address, mockRecipientWrappedKey)
      )
        .to.emit(fileRegistry, "RecipientAuthorized")
        .withArgs(mockFileId, recipient.address, owner.address);

      expect(await fileRegistry.isAuthorized(recipient.address, mockFileId)).to.be.true;

      const record = await fileRegistry.connect(recipient).getFileRecord(mockFileId);
      expect(record.ipfsCid).to.equal(mockCid);
      expect(record.callerWrappedKey).to.equal(mockRecipientWrappedKey);
    });

    it("should reject unauthorized caller attempting to retrieve file record", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);

      await expect(
        fileRegistry.connect(unauthorizedUser).getFileRecord(mockFileId)
      ).to.be.revertedWithCustomError(fileRegistry, "UnauthorizedCaller");
    });

    it("should reject non-owner attempting to add authorized recipient", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);

      await expect(
        fileRegistry
          .connect(unauthorizedUser)
          .addAuthorizedRecipient(mockFileId, recipient.address, mockRecipientWrappedKey)
      ).to.be.revertedWithCustomError(fileRegistry, "NotFileOwner");
    });

    it("should revert on revokeRecipient with AdvancedRevocationNotImplemented", async function () {
      await fileRegistry.connect(owner).registerFile(mockFileId, mockCid, mockOwnerWrappedKey);
      await fileRegistry
        .connect(owner)
        .addAuthorizedRecipient(mockFileId, recipient.address, mockRecipientWrappedKey);

      await expect(
        fileRegistry.connect(owner).revokeRecipient(mockFileId, recipient.address)
      ).to.be.revertedWithCustomError(fileRegistry, "AdvancedRevocationNotImplemented");
    });
  });
});
