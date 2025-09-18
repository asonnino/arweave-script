# Arweave Latency Testing Tool

A Node.js tool for measuring upload and download performance on the Arweave decentralized storage network.

## Features

- Measures upload latency and throughput
- Monitors gateway availability time
- Tests download speed and throughput
- Verifies data integrity
- Supports configurable file sizes
- Tests against different Arweave gateways

## Prerequisites

- Node.js (v14 or higher)
- An Arweave wallet with AR tokens for transaction fees

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/asonnino/arweave-script.git
   cd arweave-script
   ```

2. Install dependencies locally:

   ```bash
   npm install
   ```

This will create a `node_modules` directory with all required dependencies.

## Usage

```bash
node arweave_latency.js /path/to/wallet.json <size> [gateway]
```

### Parameters

- **wallet.json**: Path to your Arweave wallet key file (JWK format)
- **size**: File size to test (e.g., `100KB`, `5MB`, `1GB`)
- **gateway** (optional): Arweave gateway URL (default: `https://arweave.net`)

### Examples

Test with 100KB file using default gateway:

```bash
node arweave_latency.js wallet.json 100KB
```

Test with 5MB file using a custom gateway:

```bash
node arweave_latency.js wallet.json 5MB https://arweave.dev
```

## Output Metrics

The tool reports:

- **Upload latency**: Time to upload all data chunks (ms)
- **Upload throughput**: Upload speed (Mbps)
- **Gateway availability**: Time until data is accessible on gateway (ms)
- **Download latency**: Time to download the data (ms)
- **Download throughput**: Download speed (Mbps)
- **Data integrity**: Pass/Fail verification that downloaded data matches uploaded data
- **Transaction ID**: Unique identifier for the Arweave transaction
- **URL**: Direct link to access the uploaded data

## Example Output

```txt
Generating random buffer of 102,400 bytes...
Gateway: https://arweave.net

TxID: cwjE-f4ZIDXB_AlAsh1TXBC6CIftXq7tgkZO3UKHo1o
Upload latency (to post all chunks): 1,305 ms
Upload throughput: 0.63 Mbps
Gateway availability: OK (last status: 200 OK)
Time until first 200 from gateway: 1,532 ms
Download latency: 445 ms
Download throughput: 1.84 Mbps
Integrity check: PASS

=== Summary ===
Upload: 1,305 ms (0.63 Mbps)
Gateway availability: 1,532 ms
Download: 445 ms (1.84 Mbps)
TxID: cwjE-f4ZIDXB_AlAsh1TXBC6CIftXq7tgkZO3UKHo1o
URL:  https://arweave.net/cwjE-f4ZIDXB_AlAsh1TXBC6CIftXq7tgkZO3UKHo1o
```

## Security

- Never commit your wallet file to version control
- The `.gitignore` file is configured to exclude all `.json` files except `package.json`
- Keep your wallet file secure and backed up

## Notes

- Each test uploads actual data to Arweave and costs AR tokens
- Larger file sizes will cost more in transaction fees
- The tool waits up to 10 minutes for gateway availability
- Data uploaded is permanently stored on Arweave
