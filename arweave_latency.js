#!/usr/bin/env node
// Usage: node arweave_latency.js /path/to/key.json <size> [gateway]
// Example: node arweave_latency.js jwk.json 5MB https://arweave.net

const fs = require("fs/promises");
const crypto = require("crypto");
const Arweave = require("arweave");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => process.hrtime.bigint();
const elapsedMs = (start) => Number((now() - start) / 1000000n);

function parseSize(str) {
  const m = str.match(/^(\d+)([KMG]?B?)$/i);
  if (!m) throw new Error("Invalid size, e.g. 512KB, 5MB, 1GB");
  const n = parseInt(m[1], 10);
  const unit = m[2].toUpperCase();
  if (unit === "KB") return n * 1024;
  if (unit === "MB") return n * 1024 * 1024;
  if (unit === "GB") return n * 1024 * 1024 * 1024;
  return n;
}

(async () => {
  try {
    const [,, jwkPath, sizeArg, gatewayArg] = process.argv;
    if (!jwkPath || !sizeArg) {
      console.error("Usage: node arweave_latency.js /path/to/key.json <size> [gateway]");
      process.exit(1);
    }
    const gateway = gatewayArg || "https://arweave.net";
    const sizeBytes = parseSize(sizeArg);

    const arweave = Arweave.init({ host: "arweave.net", port: 443, protocol: "https" });

    const jwk = JSON.parse(await fs.readFile(jwkPath, "utf8"));
    console.log(`Generating random buffer of ${sizeBytes.toLocaleString()} bytes...`);
    const data = crypto.randomBytes(sizeBytes);

    console.log(`Gateway: ${gateway}`);

    // --- Upload ---
    const tx = await arweave.createTransaction({ data }, jwk);
    tx.addTag("Content-Type", "application/octet-stream");
    await arweave.transactions.sign(tx, jwk);

    let uploader = await arweave.transactions.getUploader(tx);
    const tUploadStart = now();
    while (!uploader.isComplete) {
      await uploader.uploadChunk();
    }
    const uploadMs = elapsedMs(tUploadStart);

    const txid = tx.id;
    const uploadMBps = sizeBytes / (uploadMs / 1000) / 1e6;

    console.log(`\nTxID: ${txid}`);
    console.log(`Upload latency (to post all chunks): ${uploadMs.toLocaleString()} ms`);
    console.log(`Upload throughput: ${uploadMBps.toFixed(2)} MB/s`);

    // --- Wait until the gateway serves the data ---
    const tAvailStart = now();
    const url = `${gateway.replace(/\/$/, "")}/${txid}`;
    let available = false;
    let statusText = "";
    const maxWaitMs = 10 * 60 * 1000;
    const pollIntervalMs = 2000;
    let waitedMs = 0;
    while (waitedMs <= maxWaitMs) {
      try {
        const head = await fetch(url, { method: "HEAD" });
        statusText = `${head.status} ${head.statusText}`;
        if (head.ok) { available = true; break; }
      } catch (e) {
        statusText = e.message || "fetch error";
      }
      await sleep(pollIntervalMs);
      waitedMs += pollIntervalMs;
    }
    const availabilityMs = elapsedMs(tAvailStart);
    console.log(`Gateway availability: ${available ? "OK" : "NOT YET"} (last status: ${statusText})`);
    console.log(`Time until first 200 from gateway: ${availabilityMs.toLocaleString()} ms`);

    if (!available) {
      console.log("Stopping before download (content not yet served by the gateway).");
      process.exit(0);
    }

    // --- Download ---
    const tDlStart = now();
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Unexpected download status: ${resp.status} ${resp.statusText}`);
      process.exit(1);
    }
    const dlBuf = Buffer.from(await resp.arrayBuffer());
    const downloadMs = elapsedMs(tDlStart);

    const same = dlBuf.length === sizeBytes && dlBuf.equals(data);
    const downloadMBps = sizeBytes / (downloadMs / 1000) / 1e6;

    console.log(`Download latency: ${downloadMs.toLocaleString()} ms`);
    console.log(`Download throughput: ${downloadMBps.toFixed(2)} MB/s`);
    console.log(`Integrity check: ${same ? "PASS" : "FAIL"}`);

    // Summary
    const uploadMBpsSummary = sizeBytes / (uploadMs / 1000) / 1e6;
    console.log("\n=== Summary ===");
    console.log(`Upload: ${uploadMs.toLocaleString()} ms (${uploadMBpsSummary.toFixed(2)} MB/s)`);
    console.log(`Gateway availability: ${availabilityMs.toLocaleString()} ms`);
    console.log(`Download: ${downloadMs.toLocaleString()} ms (${downloadMBps.toFixed(2)} MB/s)`);
    console.log(`TxID: ${txid}`);
    console.log(`URL:  ${url}`);

    // Save results to JSON file
    const results = {
      timestamp: new Date().toISOString(),
      gateway: gateway,
      fileSize: {
        bytes: sizeBytes,
        humanReadable: sizeArg
      },
      upload: {
        latencyMs: uploadMs,
        throughputMBps: uploadMBpsSummary,
        throughputMBpsFormatted: uploadMBpsSummary.toFixed(2)
      },
      gatewayAvailability: {
        latencyMs: availabilityMs,
        available: available,
        lastStatus: statusText
      },
      download: {
        latencyMs: downloadMs,
        throughputMBps: downloadMBps,
        throughputMBpsFormatted: downloadMBps.toFixed(2)
      },
      integrityCheck: same ? "PASS" : "FAIL",
      transaction: {
        id: txid,
        url: url
      }
    };

    const outputFilename = `arweave-test-${txid}.json`;
    await fs.writeFile(outputFilename, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${outputFilename}`);
  } catch (err) {
    console.error("Error:", err);
    // Try to save error to JSON file
    try {
      const errorResults = {
        timestamp: new Date().toISOString(),
        error: err.message || String(err),
        stack: err.stack
      };
      const errorFilename = `arweave-test-error-${Date.now()}.json`;
      await fs.writeFile(errorFilename, JSON.stringify(errorResults, null, 2));
      console.error(`Error details saved to: ${errorFilename}`);
    } catch (writeErr) {
      console.error("Failed to save error to file:", writeErr);
    }
    process.exit(1);
  }
})();

