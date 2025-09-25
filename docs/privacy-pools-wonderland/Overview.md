# Kohaku: Privacy-First Ethereum Wallet

As Ethereum matures from experimental technology into a global financial infrastructure, one critical transition remains incomplete: **the privacy transition**. Without privacy-preserving transfers, Ethereum fails because having all transactions publicly visible creates an unacceptable privacy sacrifice for most users, driving them toward centralized solutions.

Current privacy systems require users to leave their wallet, navigate complex dApps, and manage fragmented interfaces. This friction kills adoption, even among privacy-conscious users.

Kohaku solves this by embedding privacy preserving protocols directly into the wallet interface, making private transfers as simple as public ones.

## Privacy Pools v2 by ![Wonderland](assets/wonderland.svg): Beyond Sender Privacy

Privacy Pools v2 evolves from sender-only privacy into a fully private payment system, where both sender and recipient remain hidden and in-pool transfers leave no exposed data.

**Key Innovations:**
- **In-Pool Private Transfers**: Users transfer funds privately within the pool, enabling sustained privacy across multiple transactions without exiting the anonymity set
- **Universal Private Receive**: Any EVM address can receive privately, solving the cold start problem through a decoupled key registry that separates spending authorization from note ownership

**Enhanced Features:**
- **Recipient Privacy**: ZK proofs conceal sender, recipient and amount from public view through opaque cryptographic commitments
- **Note Ownership Model**: Each commitment binds to a recipient's address without revealing it publicly. Only the assigned owner can generate spending proofs
- **Enhanced Key Management**: On-chain key registry with rotation capabilities and viewing keys for encrypted discovery
- **Payment Requests**: Recipients create shareable URIs containing `addressHash = Poseidon(ownerAddress, noteSecret)` for direct private payments

All Privacy Pools v1 functionality remains intact while adding these privacy-preserving capabilities.

**Technical Documentation:**
- [Wallet Integration Design](WalletTechDesign.md) - Complete wallet integration architecture and user flows
- [Secret Generation Guide](SecretGeneration.md) - Deterministic key derivation system  
- [Protocol Invariants](Invariants.md) - Security guarantees and protocol constraints
- [Smart Contracts Design](ContractsTechDesign.md) - On-chain architecture and interfaces
- [ZK Circuits Design](CircuitsTechDesign.md) - Zero-knowledge proof implementation

**Design Resources:**
- [Kohaku Wallet UI Design](https://www.figma.com/design/3KKnxqwyclua6k4DPS5EGb/Kohaku-by-Wonderland?node-id=1-2&p=f&t=AkKPth3YO2wyYdrm-0) - Main wallet interface screens and user flows

## The Privacy Problem

Today's Ethereum exposes every transaction detail: who sent what to whom, when, and how much. This transparency creates permanent financial surveillance that no mainstream user would accept from traditional banking.

## One-Click Privacy

Kohaku transforms privacy from a complex opt-in feature into seamless wallet functionality. Private transfers work exactly like normal transfers: same interface, same simplicity, but with cryptographic privacy guarantees.

**Key Innovation: Any EVM address can receive privately without prior setup.**

Alice can send private funds to Bob's regular Ethereum address immediately. No registration required. No new addresses to manage. The protocol creates a cryptographic commitment that only Bob can spend, while keeping his identity completely hidden on-chain.

## How It Works

Privacy Pools v2 uses a note-based architecture where payments create commitments bound to recipient addresses through zero-knowledge proofs.

**Note Structure:**
```
noteAddressHash: Poseidon(ownerAddress, noteSecret),
precommitment: Poseidon(noteAddressHash, tokenId, value)
```

The `addressHash` hides the recipient's real address while ensuring only they can spend the funds. On-chain observers see only opaque cryptographic commitments. No addresses, no amounts, no transaction graphs.

**Core Operations:**
- **Deposit**: Move funds from public wallet into privacy pool
- **Private Transfer**: Send within pool while maintaining anonymity set
- **Private Withdrawal**: Exit pool to any public address
- **Payment Requests**: Generate privacy-preserving payment URIs

All operations use the same wallet interface as regular transactions.

## Deterministic Secret Generation

Kohaku leverages a novel approach to key management without additional seed storage while preventing phishing attacks.

Privacy keys derive deterministically from EIP-712 signatures using a dedicated address from a custom BIP-44 path. This dedicated address exists solely within the wallet's secure enclave, dApps cannot access or replicate it.

**The Process:**
1. Wallet generates ephemeral address from unique derivation path
2. User signs domain-separated message containing address hash
3. Signature's r-value becomes root secret via HKDF expansion
4. App-specific secrets derive from root using protocol identifiers

This approach provides deterministic key generation while maintaining signature uniqueness through address binding. The dedicated address acts as a cryptographic firewall since only the wallet can generate valid signatures, protecting users from phishing attempts.

**Reusable Randomness:** This signature-based derivation creates a foundation for any protocol requiring secret generation. The same mechanism can secure stealth addresses, encrypted communications, or any system needing user-specific entropy within the wallet's trusted environment.

*For detailed implementation guide, see [Secret Generation Documentation](SecretGeneration.md).*


## The Path Forward

Kohaku represents the first step toward privacy-by-default Ethereum. By making private transfers as easy as public ones, removing usability barriers that have prevented mainstream privacy adoption. When privacy becomes as simple as clicking "send" it stops being a feature and becomes infrastructure.

The privacy transition isn't optional. It's essential for Ethereum's evolution from experimental technology to global financial rails. Kohaku makes that transition possible, one private transaction at a time.