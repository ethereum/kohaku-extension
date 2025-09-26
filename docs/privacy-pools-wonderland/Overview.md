# Kohaku: Privacy-First Ethereum Wallet

As Ethereum evolves into global financial infrastructure, **the privacy transition** represents the next critical step. While transparency enables verification and composability, many users need privacy for everyday financial activities. This gap currently drives users toward centralized solutions that at least hide transaction details from public view. 

Kohaku solves this by embedding privacy-preserving protocols directly into the wallet interface, making private transfers as simple as public ones. The wallet supports multiple privacy features with one-click simplicity, starting with Privacy Pools v2 developed by the Wonderland team.

## Privacy Pools v2 by ![Wonderland](assets/wonderland.svg)

Privacy Pools v2 transforms private payments by letting any EVM address receive funds privately without any extra setup. Behind the scenes, it uses a decoupled keystore that separates spending rights from note ownership, while ZK proofs hide all transaction details from public view.

The protocol works through a note-based architecture where each payment creates a cryptographic commitment bound to the recipient's address. When you send funds, the system generates an `addressHash` by combining the recipient's address with a secret, then creates a `commitment` that includes the token and amount. This ensures only the intended recipient can spend the funds while keeping their identity completely hidden.

What makes this powerful is the complete privacy it offers: both private sends and private receives work seamlessly through the same wallet interface you already know. On-chain observers see only opaque commitments. No addresses, no amounts, no transaction patterns. 

## The Path Forward

Kohaku represents the first step toward privacy-by-default Ethereum. By making private transfers as easy as public ones. For a deeper look at how Privacy Pools v2 is integrated into the wallet, take a look at the following documents:

**Technical Documentation:**
- [Wallet Integration Design](WalletTechDesign.md) - Complete wallet integration architecture and user flows
- [Secret Generation Guide](SecretGeneration.md) - Deterministic key derivation system  
- [Protocol Invariants](Invariants.md) - Security guarantees and protocol constraints
- [Smart Contracts Design](ContractsTechDesign.md) - On-chain architecture and interfaces
- [ZK Circuits Design](CircuitsTechDesign.md) - Zero-knowledge proof implementation

**Design Resources:**
- [Kohaku Wallet UI Design](https://www.figma.com/design/3KKnxqwyclua6k4DPS5EGb/Kohaku-by-Wonderland?node-id=1-2&p=f&t=AkKPth3YO2wyYdrm-0) - Main wallet interface screens and user flows