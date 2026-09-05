# BlockDrive

BlockDrive is a decentralized secure file-sharing dApp combining IPFS storage, Ethereum smart contracts for access control, and client-side encryption based on the scheme by Wang, Zhang & Zhang (*IEEE Access* 2018, DOI: 10.1109/ACCESS.2018.2851611).

## Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- MetaMask browser extension
- Local IPFS daemon (optional, or uses mock/gateway fallback)

## Setup Steps
1. Clone the repository and install root dependencies:
   ```bash
   npm install
   ```
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```
3. Configure environment variables:
   ```bash
   cp .env.example .env
   cp frontend/.env.example frontend/.env
   ```

## Running Smart Contracts & Tests

### Run Unit Tests & Coverage
```bash
npx hardhat test
npx hardhat coverage
```

### Local Hardhat Node & Deployment
1. Start local blockchain:
   ```bash
   npx hardhat node
   ```
2. In a separate terminal, deploy contracts to local network:
   ```bash
   npm run deploy:local
   ```

### Deploy to Ethereum Sepolia Testnet
Ensure `.env` contains valid `SEPOLIA_RPC_URL` and `PRIVATE_KEY`.
```bash
npm run deploy:sepolia
```

## Running Frontend
1. Start the Vite dev server:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open `http://localhost:5173` in a browser with MetaMask connected to Localhost (8545) or Sepolia.
