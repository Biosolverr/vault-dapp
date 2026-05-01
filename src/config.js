import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: 'SecureVault',
    }),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: false,
  transports: {
    [base.id]: http(),
  },
});
