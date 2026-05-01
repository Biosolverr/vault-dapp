import { CONTRACT_ADDRESS } from './contract.js';

/**
 * Sign a Recovery typed-data message (EIP-712) using wagmi wallet client.
 * Used for account recovery with guardian co-signature.
 */
export async function signRecovery({ walletClient, newOwner, nonce, deadline, chainId }) {
  return walletClient.signTypedData({
    domain: {
      name: 'SecureVault',
      version: '1',
      chainId,
      verifyingContract: CONTRACT_ADDRESS,
    },
    types: {
      Recovery: [
        { name: 'newOwner', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Recovery',
    message: {
      newOwner,
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
    },
  });
}
