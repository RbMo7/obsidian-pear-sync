# obsidian-pear-sync

Peer-to-peer vault sync for Obsidian — no cloud, no server, no subscription.

Replicates your vault over a direct, encrypted P2P connection using the [Holepunch](https://holepunch.to/) stack (Hyperdrive, Corestore, Hyperswarm). Runs entirely in Obsidian's Electron/Node environment on desktop.

**v0.1.0 — initial scaffolding**

## Status

This plugin is in early development. See [the specification](./spec.md) for the full architecture and roadmap.

## Dependencies

This plugin uses native Node modules for P2P networking:

| Package        | Purpose                                      |
|----------------|----------------------------------------------|
| `hyperdrive`   | P2P file storage mirroring the vault         |
| `corestore`    | Local storage backing the Hyperdrive         |
| `hyperswarm`   | DHT-based peer discovery and direct connection |
| `sodium-universal` | Cryptographic primitives (key generation) |

These require native bindings compiled for your platform. The plugin is `isDesktopOnly: true` for this reason.
