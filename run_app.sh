#!/bin/bash

port=8000

# Exit if a the build fails
set -e

echo "🔄 Rebuilding and restarting..."
docker compose up -d --build


echo "✅ Application is running on http://127.0.0.1:${port}"

echo "📜 Tailing logs (press Ctrl+C to exit logs)..."
docker compose logs -f