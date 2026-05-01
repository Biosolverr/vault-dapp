[README.md](https://github.com/user-attachments/files/27266863/README.md)
# SecureVault dApp

EIP-712 escrow vault built on **Base mainnet**. Standard Web App — no Farcaster SDK required.

## Stack

- **wagmi v2** + **viem v2** — wallet connection & contract interaction
- **@tanstack/react-query v5** — async state
- **React 18** + **Vite 5** — frontend
- **Sign-In with Ethereum (SIWE / EIP-4361)** — authentication
- **EIP-712 typed data** — guardian recovery signing

## Contract

`contracts/SecureVault.sol` — UUPS upgradeable, EIP-712, OpenZeppelin.

State machine: `INIT → FUNDED → LOCKED → EXECUTION_PENDING → EXECUTED` (or `REFUNDED`).

| Function | Who | State required |
|---|---|---|
| `deposit()` | Anyone | INIT |
| `lock()` | Owner | FUNDED |
| `initiateExecution(secret)` | Owner / Counterparty | LOCKED + past lockDuration |
| `execute()` | Owner / Counterparty | EXECUTION_PENDING |
| `refund()` | Owner | FUNDED or LOCKED+expired |

## Setup

```bash
npm install
npm run dev
```

Set your deployed contract address in `src/contract.js`:

```js
export const CONTRACT_ADDRESS = '0xYourContractAddress';
```

## Base App compliance

- ✅ Standard web app (no Farcaster manifest)
- ✅ wagmi + viem for wallet + contract interaction
- ✅ SIWE for authentication
- ✅ No deprecated Farcaster SDK methods
- ✅ Loads in Base App in-app browser
- ⬜ Register on [base.dev](https://base.dev) with metadata

## Deploy

```bash
npm run build
# deploy dist/ to Vercel, Cloudflare Pages, or any static host
```
