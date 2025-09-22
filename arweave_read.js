#!/usr/bin/env node
// Usage: node arweave_read.js <txid> [gateway]
// Example: node arweave_read.js Ab1Rul2b5FJvjOwD11XW5BgVSTvNvtwSQqZqYjYzNwU https://arweave.net

const fs = require("fs/promises");
const crypto = require("crypto");

const now = () => process.hrtime.bigint();
const elapsedMs = (start) => Number((now() - start) / 1000000n);

(async () => {
  try {
    const [,, txid, gatewayArg] = process.argv;
    if (!txid) {
      console.error("Usage: node arweave_read.js <txid> [gateway]");
      console.error("Example: node arweave_read.js Ab1Rul2b5FJvjOwD11XW5BgVSTvNvtwSQqZqYjYzNwU");
      process.exit(1);
    }

    const gateway = gatewayArg || "https://arweave.net";
    // Use the raw endpoint to ensure we get the actual data blob
    const rawUrl = `${gateway.replace(/\/$/, "")}/raw/${txid}`;
    const txUrl = `${gateway.replace(/\/$/, "")}/${txid}`;

    console.log(`Reading transaction: ${txid}`);
    console.log(`Gateway: ${gateway}`);
    console.log(`Raw data URL: ${rawUrl}`);
    console.log(`Transaction URL: ${txUrl}`);
    console.log("");

    // First, get transaction metadata
    console.log("Fetching transaction metadata...");
    const tMetaStart = now();
    let expectedSize = 0;
    let tags = {};

    try {
      const metaUrl = `${gateway.replace(/\/$/, "")}/tx/${txid}`;
      const metaResp = await fetch(metaUrl);

      if (metaResp.ok) {
        const metadata = await metaResp.json();
        expectedSize = parseInt(metadata.data_size || "0", 10);

        // Parse tags
        if (metadata.tags && Array.isArray(metadata.tags)) {
          metadata.tags.forEach(tag => {
            // Decode base64 encoded tag names and values
            const name = Buffer.from(tag.name, 'base64').toString('utf-8');
            const value = Buffer.from(tag.value, 'base64').toString('utf-8');
            tags[name] = value;
          });
        }

        const metaMs = elapsedMs(tMetaStart);
        console.log(`Transaction metadata retrieved in ${metaMs.toLocaleString()} ms`);
        console.log(`Expected data size: ${expectedSize.toLocaleString()} bytes (${(expectedSize / 1e6).toFixed(2)} MB)`);
        if (tags['Content-Type']) {
          console.log(`Content-Type tag: ${tags['Content-Type']}`);
        }
        console.log("");
      } else {
        console.log(`Could not fetch metadata: ${metaResp.status} ${metaResp.statusText}`);
        console.log("");
      }
    } catch (err) {
      console.log(`Metadata fetch failed: ${err.message}`);
      console.log("");
    }

    // Check availability with HEAD request on raw endpoint
    console.log("Checking raw data availability...");
    const tHeadStart = now();
    let contentLength = 0;
    let contentType = "";

    try {
      const head = await fetch(rawUrl, { method: "HEAD" });
      const headMs = elapsedMs(tHeadStart);

      if (!head.ok) {
        console.error(`Transaction data not available: ${head.status} ${head.statusText}`);
        console.error(`HEAD request latency: ${headMs.toLocaleString()} ms`);
        console.error("\nNote: The transaction may still be pending or not yet available on this gateway.");
        process.exit(1);
      }

      contentLength = parseInt(head.headers.get("content-length") || "0", 10);
      contentType = head.headers.get("content-type") || "unknown";

      console.log(`Status: ${head.status} ${head.statusText}`);
      console.log(`Response Content-Type: ${contentType}`);
      console.log(`Response Content-Length: ${contentLength.toLocaleString()} bytes`);
      console.log(`HEAD request latency: ${headMs.toLocaleString()} ms`);
      console.log("");
    } catch (err) {
      console.error(`HEAD request failed: ${err.message}`);
      process.exit(1);
    }

    // Now download the full raw data
    console.log("Downloading raw data blob...");
    const tDownloadStart = now();
    let downloadedBytes = 0;
    const chunkSizes = [];

    try {
      const resp = await fetch(rawUrl);

      if (!resp.ok) {
        console.error(`Download failed: ${resp.status} ${resp.statusText}`);
        process.exit(1);
      }

      // Stream the response to track progress
      const chunks = [];
      const reader = resp.body.getReader();

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          chunks.push(value);
          chunkSizes.push(value.length);
          downloadedBytes += value.length;

          // Progress reporting for large files
          if (expectedSize > 0 && downloadedBytes % (10 * 1024 * 1024) < value.length) {
            const progress = ((downloadedBytes / expectedSize) * 100).toFixed(1);
            const downloadedMB = (downloadedBytes / 1e6).toFixed(2);
            process.stdout.write(`\rDownloaded: ${downloadedMB} MB (${progress}%)`);
          }
        }
      }

      if (expectedSize > 0) {
        process.stdout.write('\n');
      }

      // Combine all chunks into a single buffer
      const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
      const downloadMs = elapsedMs(tDownloadStart);

      const actualSize = buffer.length;
      const throughputMBps = actualSize / (downloadMs / 1000) / 1e6;

      // Calculate SHA-256 hash of downloaded data
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      console.log(`\nDownload complete!`);
      console.log(`Downloaded size: ${actualSize.toLocaleString()} bytes`);
      console.log(`Number of chunks received: ${chunks.length}`);
      console.log(`Average chunk size: ${(actualSize / chunks.length / 1024).toFixed(2)} KB`);
      console.log(`Download latency: ${downloadMs.toLocaleString()} ms`);
      console.log(`Download throughput: ${throughputMBps.toFixed(2)} MB/s`);
      console.log(`SHA-256 hash: ${hash}`);

      // Verification
      if (expectedSize > 0) {
        if (expectedSize === actualSize) {
          console.log(`✓ Size verification: PASS (matches expected ${expectedSize} bytes)`);
        } else {
          console.log(`✗ Size verification: FAIL (expected ${expectedSize}, got ${actualSize} bytes)`);
        }
      }

      // Check if this looks like HTML (might indicate we got a web page instead of raw data)
      const first1000 = buffer.slice(0, 1000).toString('utf-8', 0, Math.min(1000, buffer.length));
      if (first1000.includes('<!DOCTYPE') || first1000.includes('<html')) {
        console.log("\n⚠️  WARNING: Downloaded content appears to be HTML, not raw data!");
        console.log("This might indicate the raw endpoint is not working correctly.");
      }

      // Summary
      console.log("\n=== Summary ===");
      console.log(`Transaction ID: ${txid}`);
      console.log(`File size: ${actualSize.toLocaleString()} bytes (${(actualSize / 1e6).toFixed(2)} MB)`);
      if (tags['Content-Type']) {
        console.log(`Content-Type (from tags): ${tags['Content-Type']}`);
      }
      console.log(`Response Content-Type: ${contentType}`);
      console.log(`Download latency: ${downloadMs.toLocaleString()} ms`);
      console.log(`Download throughput: ${throughputMBps.toFixed(2)} MB/s`);
      console.log(`Data hash (SHA-256): ${hash.substring(0, 16)}...`);
      console.log(`Gateway: ${gateway}`);
      console.log(`Raw URL: ${rawUrl}`);

      // Save results to JSON
      const results = {
        timestamp: new Date().toISOString(),
        transaction: {
          id: txid,
          rawUrl: rawUrl,
          txUrl: txUrl,
          gateway: gateway
        },
        metadata: {
          expectedSize: expectedSize,
          tags: tags,
          responseContentType: contentType,
          responseContentLength: contentLength
        },
        download: {
          actualSize: actualSize,
          downloadLatencyMs: downloadMs,
          throughputMBps: throughputMBps,
          throughputMBpsFormatted: throughputMBps.toFixed(2),
          chunks: chunks.length,
          averageChunkSizeKB: actualSize / chunks.length / 1024
        },
        verification: {
          sizeMatch: expectedSize > 0 ? expectedSize === actualSize : null,
          sha256Hash: hash,
          looksLikeHTML: first1000.includes('<!DOCTYPE') || first1000.includes('<html')
        },
        fileSize: {
          bytes: actualSize,
          megabytes: actualSize / 1e6,
          humanReadable: `${(actualSize / 1e6).toFixed(2)} MB`
        }
      };

      const outputFilename = `arweave-read-${txid}-${Date.now()}.json`;
      await fs.writeFile(outputFilename, JSON.stringify(results, null, 2));
      console.log(`\nResults saved to: ${outputFilename}`);

    } catch (err) {
      console.error(`\nDownload error: ${err.message}`);

      // Save error details
      const errorResults = {
        timestamp: new Date().toISOString(),
        transaction: {
          id: txid,
          rawUrl: rawUrl,
          gateway: gateway
        },
        error: {
          message: err.message || String(err),
          stack: err.stack
        }
      };

      const errorFilename = `arweave-read-error-${txid}-${Date.now()}.json`;
      await fs.writeFile(errorFilename, JSON.stringify(errorResults, null, 2));
      console.error(`Error details saved to: ${errorFilename}`);
      process.exit(1);
    }

  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();