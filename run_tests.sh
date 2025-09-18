#!/bin/bash

# Script to run Arweave latency tests with multiple file sizes
# Usage: ./run_tests.sh

# Check if wallet file exists
WALLET_FILE="arweave-keyfile-_uNxWVn_U9mEQKadjYe5BsgZ7Rd5CHVJRq56-7NYPG4.json"

if [ ! -f "$WALLET_FILE" ]; then
    echo "Error: Wallet file not found: $WALLET_FILE"
    exit 1
fi

# Array of test sizes
SIZES=("10KB" "10MB" "20MB" "30MB" "70MB" "130MB")

echo "Starting Arweave latency tests with ${#SIZES[@]} different file sizes"
echo "================================================"

# Run test for each size
for SIZE in "${SIZES[@]}"; do
    echo ""
    echo "================================================"
    echo "Testing with file size: $SIZE"
    echo "================================================"

    # Run the test
    node arweave_latency.js "$WALLET_FILE" "$SIZE"

    # Check if the test was successful
    if [ $? -eq 0 ]; then
        echo "✓ Test completed for $SIZE"
    else
        echo "✗ Test failed for $SIZE"
    fi

    # Small delay between tests to avoid overwhelming the network
    echo "Waiting 5 seconds before next test..."
    sleep 5
done

echo ""
echo "================================================"
echo "All tests completed!"
echo "Results saved to arweave-test-*.json files"
echo "================================================"