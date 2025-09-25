# Signature-Based Derivation Implementation Guide

This document provides step-by-step instructions for implementing the signature-based derivation protocol in a frontend application. The protocol enables deterministic derivation of application-specific secrets from a user's master seed via a single wallet signature.

We'll use [viem.sh](https://viem.sh/) as the primary library for Ethereum interactions, along with additional cryptographic utilities for HKDF implementation.

---

# Implementation Flow

The signature-based derivation protocol consists of 5 main steps:

- **Derive Dedicated Address:** Request an address from a unique BIP-44 path using privileged wallet access
- **Construct EIP-712 Payload:** Create an structured message containing the address hash
- **Request Signature:** Sign the payload using the dedicated key with deterministic ECDSA
- **Derive Root Secret:** Extract entropy from signature and combine with address using HKDF
- **Derive Application Secret:** Generate final app-specific secret using application identifier

---

## Step 1: Derive Dedicated Address

The first step requires privileged access to derive an address from a BIP-44 path. This creates the information asymmetry that prevents phishing attacks.

**Steps:**

1. Define the dedicated derivation path using a registered SLIP-44 coin type
2. Request the address from the wallet using a privileged method
3. Store the address securely for subsequent steps

```tsx
// 1. Define the dedicated path with your SLIP-44 coin type
const COIN_TYPE = 9001; // Example: Replace with your registered coin type
const dedicatedPath = `m/44'/${COIN_TYPE}'/0'/0/0`; // TBD: we have to find a path that suits our generation of an unknown, non existent address.

// 2. Request address from dedicated path (privileged operation)
// Note: This requires a non-standard wallet method not available to sandboxed dApps
const signerAddress = await walletClient.request({
  method: 'wallet_getAddressFromPath', // Conceptual privileged method
  params: [dedicatedPath]
});

// 3. Validate the returned address
if (!signerAddress || !isAddress(signerAddress)) {
  throw new Error('Failed to derive dedicated address');
}

```

> Security Note: The wallet_getAddressFromPath method is conceptual and represents privileged access that standard dApps cannot obtain.
> 

## Step 2: Construct EIP-712 Payload

Create the structured EIP-712 message that serves as an unforgeable challenge. The payload includes the hash of the dedicated address and a salt derived from the application identifier, making it impossible for malicious dApps to forge or reuse signatures across different applications.

**Steps:**

1. Define the application identifier
2. Compute the address hash using keccak256
3. Construct the complete EIP-712 payload with domain (including app identifier as salt) and message
4. Validate the payload structure

```tsx
import { keccak256, toBytes } from 'viem';

// 1. Define the application identifier
const appIdentifier = "com.example.myapp"; // Replace with your app's identifier

// 2. Compute the address hash for the unforgeable challenge
const addressHash = keccak256(toBytes(signerAddress));

// 3. Construct the complete EIP-712 payload
const eip712Payload = {
  domain: {
    name: "Standardized Secret Derivation",
    version: "1",
    verifyingContract: "0x0000000000000000000000000000000000000000",
    salt: keccak256(toBytes(appIdentifier))
  },
  message: {
    purpose: "This signature is used to deterministically derive application-specific secrets from your master seed. It is not a transaction and will not cost any gas.",
    addressHash: addressHash
  },
  primaryType: "SecretDerivation",
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" }
    ],
    SecretDerivation: [
      { name: "purpose", type: "string" },
      { name: "addressHash", type: "bytes32" }
    ]
  }
} as const;

// 4. Validate payload structure
if (!eip712Payload.message.addressHash || !eip712Payload.domain.name) {
  throw new Error('Invalid EIP-712 payload construction');
}

```

## Step 3: Request Signature

Sign the EIP-712 payload using the dedicated address. The signature must be deterministic (RFC 6979) and performed by the same key that generated the dedicated address.

**Steps:**

1. Request the signature using viem's signTypedData
2. Validate the signature format
3. Extract the r, s, v components
4. Securely destroy s and v components (only r is used)

```tsx
// 1. Request the actual signature
const signature = await walletClient.signTypedData({
  account: signerAddress,
  domain: eip712Payload.domain,
  types: eip712Payload.types,
  primaryType: eip712Payload.primaryType,
  message: eip712Payload.message
});

// 2. Validate signature format
if (!signature || signature.length !== 132) { // 0x + 64 + 64 + 2 chars
  throw new Error('Invalid signature format received');
}

// 3. Extract signature components
import { hexToSignature } from 'viem';
const { r, s, v } = hexToSignature(signature);

// 4. Verify determinism (optional compliance check)
const verificationSignature = await walletClient.signTypedData({
  account: signerAddress,
  ...eip712Payload
});

if (signature !== verificationSignature) {
  console.warn('Wallet may not be RFC 6979 compliant - signatures are not deterministic');
}

// 5. Securely destroy s and v components (only r is used for derivation)
// This prevents potential signature reconstruction attacks
const rValue = r;
s = null; // Destroy s component
v = null; // Destroy v component
signature = null; // Destroy signature

```

> Implementation Note: Some wallets (legacy Ledger firmware, some MetaMask Mobile versions) may not implement RFC 6979 correctly. Consider implementing a compliance check during onboarding.
> 

## Step 4: Derive Root Secret

Use HKDF to derive an ephemeral root secret from the signature's r value and the dedicated address. This secret must remain in the secure context.

**Steps:**

1. Validate that the EIP-712 payload is intended for our derived address
2. Extract the r value as Initial Keying Material (IKM)
3. Use the dedicated address as salt
4. Apply HKDF-SHA256 to derive the root secret
5. Ensure the root secret never leaves the secure context

```tsx
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, bytesToHex, keccak256, toBytes } from 'viem';

// 1. Validate that the EIP-712 payload is intended for our derived address
const ourAddressHash = keccak256(toBytes(signerAddress));
if (eip712Payload.message.addressHash !== ourAddressHash) {
  throw new Error('Payload address hash does not match our derived address - potential attack');
}

// 2. Extract r value as IKM
const rBytes = hexToBytes(rValue);

// 3. Use dedicated address as salt
const saltBytes = hexToBytes(signerAddress);

// 4. Define domain separation info
const rootInfoString = "Standardized-Secret-Derivation-v1-Root";
const infoBytes = new TextEncoder().encode(rootInfoString);

// 5. Derive root secret using HKDF-SHA256
const rootSecret = hkdf(sha256, rBytes, saltBytes, infoBytes, 32);

// 6. Validate root secret
if (!rootSecret || rootSecret.length !== 32) {
  throw new Error('Failed to derive root secret');
}

// CRITICAL: rootSecret must not leave this secure context
// Do not log, serialize, or transmit this value

```

> Security Warning: The rootSecret is extremely sensitive. It must never be logged, stored persistently, or transmitted. Treat it as ephemeral data that should be securely wiped after use.
> 

## Step 5: Derive Application Secret

Generate the final application-specific secret using the root secret and a unique application identifier.

**Steps:**

1. Use the root secret as IKM for the second HKDF stage
2. Use the application identifier as salt
3. Apply HKDF-SHA256 to derive the final app secret
4. Securely wipe the root secret from memory
5. Return only the app secret to the application

```tsx
// 1. Use root secret as IKM for second stage
const rootSecretBytes = rootSecret;

// 2. Use application identifier as salt
const appIdentifier = "com.example.myapp"; // Replace with your app's identifier
const appSaltBytes = new TextEncoder().encode(appIdentifier);

// 3. Define domain separation info for app stage
const appInfoString = "Standardized-Secret-Derivation-v1-App";
const appInfoBytes = new TextEncoder().encode(appInfoString);

// 4. Derive application-specific secret
const appSecret = hkdf(sha256, rootSecretBytes, appSaltBytes, appInfoBytes, 32); // This 32 is the derived key length, adapt if necessary
// rootSecret and rootSecretBytes should be zeroized after all required appSecrets are derived.
// Several appSecrets could be derived from the same rootSecret, changing the appInfo string.

// 5. Validate app secret
if (!appSecret || appSecret.length !== 32) {
  throw new Error('Failed to derive application secret');
}

// 6. Securely wipe root secret from memory
rootSecret.fill(0);

// 7. Convert to hex for application use
const appSecretHex = bytesToHex(appSecret);

// 8. Return only the app secret (this is safe to expose to application)
return appSecretHex;

```

<aside>
💡

**1. We will change eventually the EIP-712 payload to include an app separator**

</aside>

## Complete Implementation Example

Here's a complete function that implements the entire flow:

```tsx
import { createWalletClient, custom, keccak256, toBytes, hexToSignature, hexToBytes, bytesToHex, isAddress } from 'viem';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Derives an application-specific secret using the signature-based derivation protocol
 * @param walletClient - Viem wallet client instance
 * @param appIdentifier - Unique application identifier (e.g., "com.example.myapp")
 * @param coinType - Registered SLIP-44 coin type for your protocol
 * @returns Promise<string> - The derived application secret as hex string
 */
async function deriveAppSecret(
  walletClient: any,
  appIdentifier: string,
  coinType: number = 9001
): Promise<string> {

  // Step 1: Derive dedicated address
  const dedicatedPath = `m/44'/${coinType}'/0'/0/0`;
  const signerAddress = await walletClient.request({
    method: 'wallet_getAddressFromPath',
    params: [dedicatedPath]
  });

  if (!isAddress(signerAddress)) {
    throw new Error('Invalid address derived from dedicated path');
  }

  // Step 2: Construct EIP-712 payload
  const addressHash = keccak256(toBytes(signerAddress));
  const eip712Payload = {
    domain: {
      name: "Standardized Secret Derivation",
      version: "1",
      verifyingContract: "0x0000000000000000000000000000000000000000"
    },
    message: {
      purpose: "This signature is used to deterministically derive application-specific secrets from your master seed. It is not a transaction and will not cost any gas.",
      addressHash: addressHash
    },
    primaryType: "SecretDerivation",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "verifyingContract", type: "address" }
      ],
      SecretDerivation: [
        { name: "purpose", type: "string" },
        { name: "addressHash", type: "bytes32" }
      ]
    }
  } as const;

  // Step 3: Request signature
  const signature = await walletClient.signTypedData({
    account: signerAddress,
    domain: eip712Payload.domain,
    types: eip712Payload.types,
    primaryType: eip712Payload.primaryType,
    message: eip712Payload.message
  });

  const { r, s, v } = hexToSignature(signature);

  // Securely destroy s and v components (only r is used for derivation)
  const rValue = r;
  s = null; // Destroy s component
  v = null; // Destroy v component

  // Step 4: Derive root secret
  const rBytes = hexToBytes(rValue);
  const saltBytes = hexToBytes(signerAddress);
  const rootInfoBytes = new TextEncoder().encode("Standardized-Secret-Derivation-v1-Root");

  const rootSecret = hkdf(sha256, rBytes, saltBytes, rootInfoBytes, 32);

  // Step 5: Derive application secret
  const appSaltBytes = new TextEncoder().encode(appIdentifier);
  const appInfoBytes = new TextEncoder().encode("Standardized-Secret-Derivation-v1-App");

  const appSecret = hkdf(sha256, rootSecret, appSaltBytes, appInfoBytes, 32);

  // Securely wipe root secret
  rootSecret.fill(0);

  return bytesToHex(appSecret);
}

// Usage example
const walletClient = createWalletClient({
  transport: custom(window.ethereum!)
});

const appSecret = await deriveAppSecret(walletClient, "com.example.myapp", 9001);
console.log("Derived app secret:", appSecret);

```

---

## Error Handling

### RFC 6979 Compliance Check

Some wallets may not implement deterministic signatures correctly. Implement a compliance check:

```tsx
async function checkWalletCompliance(walletClient: any, signerAddress: string, payload: any): Promise<boolean> {
  try {
    const sig1 = await walletClient.signTypedData({
      account: signerAddress,
      ...payload
    });

    const sig2 = await walletClient.signTypedData({
      account: signerAddress,
      ...payload
    });

    return sig1 === sig2;
  } catch (error) {
    console.warn('Wallet compliance check failed:', error);
    return false;
  }
}

// Usage
const isCompliant = await checkWalletCompliance(walletClient, signerAddress, eip712Payload);
if (!isCompliant) {
  throw new Error('Wallet does not support deterministic signatures (RFC 6979)');
}

```

### Wallet Connection Errors

Handle cases where the wallet doesn't support the required methods:

```tsx
async function safeRequestAddress(walletClient: any, path: string): Promise<string> {
  try {
    return await walletClient.request({
      method: 'wallet_getAddressFromPath',
      params: [path]
    });
  } catch (error) {
    if (error.code === -32601) { // Method not found
      throw new Error('Wallet does not support BIP-44 path derivation. Please use a compatible wallet.');
    }
    throw error;
  }
}

```

### Signature Validation

Validate signature components before processing:

```tsx
function validateSignature(signature: string): void {
  if (!signature.startsWith('0x') || signature.length !== 132) {
    throw new Error('Invalid signature format');
  }

  try {
    const { r, s, v } = hexToSignature(signature);
    if (!r || !s || (v !== 27 && v !== 28)) {
      throw new Error('Invalid signature components');
    }
  } catch (error) {
    throw new Error('Failed to parse signature components');
  }
}

```

---

## Security Considerations

### Path Disclosure Prevention

The dedicated address should never be exposed to untrusted contexts:

```tsx
// DON'T: Expose dedicated address to dApp
window.exposedAddress = signerAddress;

// DO: Keep address contained in secure context
const secureContext = {
  signerAddress,
  // ... other sensitive data
};

```

### Memory Security

Implement secure memory handling for sensitive values:

```tsx
class SecureBuffer {
  private buffer: Uint8Array;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
  }

  write(data: Uint8Array): void {
    this.buffer.set(data);
  }

  read(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  wipe(): void {
    this.buffer.fill(0);
  }
}

// Usage for root secret
const secureRoot = new SecureBuffer(32);
secureRoot.write(rootSecret);
// ... use the secret
secureRoot.wipe(); // Always wipe when done

```

### Session Management

Implement proper session handling for the "sign-once-per-session" model:

```tsx
class DerivationSession {
  private rootSecret: Uint8Array | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = crypto.randomUUID();
  }

  setRootSecret(secret: Uint8Array): void {
    this.rootSecret = new Uint8Array(secret);
  }

  deriveAppSecret(appId: string): string {
    if (!this.rootSecret) {
      throw new Error('No active session');
    }

    const appSalt = new TextEncoder().encode(appId);
    const appInfo = new TextEncoder().encode("Standardized-Secret-Derivation-v1-App");

    return bytesToHex(hkdf(sha256, this.rootSecret, appSalt, appInfo, 32));
  }

  destroy(): void {
    if (this.rootSecret) {
      this.rootSecret.fill(0);
      this.rootSecret = null;
    }
  }
}

```
