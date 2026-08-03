#!/bin/bash

port=8000

# Function runs when Ctrl+C is pressed
cleanup(){
    echo "🛑 Stopping containers and Clear database volumes..."
    docker compose down -v
    echo "🧹 Clearing complete. Quitting..."
    exit 0
}

# Run cleanup function when received interrupt signal
trap cleanup SIGINT

# Exit if a the build fails
set -e

echo "🔄 Rebuilding and restarting..."
docker compose build --no-cache
docker compose up -d


echo "✅ Application is running on http://127.0.0.1:${port}"

echo "📜 Tailing logs (press Ctrl+C to exit logs)..."
docker compose logs -f