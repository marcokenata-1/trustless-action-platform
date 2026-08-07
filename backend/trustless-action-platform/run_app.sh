#!/bin/bash

port=8000
use_docker=true

# If docker is installed
if ! docker info > /dev/null 2>&1; then
    echo "⚠️ Docker is not running or not installed."
    echo "🔄 Falling back to local Uvicorn server..."
    use_docker=false
fi

# Function runs when Ctrl+C is pressed
cleanup(){
    if [ "$USE_DOCKER" = true ]; 
    then
        echo "🛑 Stopping containers"
        docker compose down -v
        echo "🧹 Clearing complete. Quitting..."
    else
        echo "🛑 Stopping local Uvicorn server..."
        echo "🧹 Quitting..."
    fi
    exit 0
}

# Run cleanup function when received interrupt signal
trap cleanup SIGINT

# Exit if a the build fails
set -e

if [ "$use_docker" = true ];
then
    echo "🔄 Rebuilding and restarting..."
    docker compose up --build


    echo "✅ Application is running on http://127.0.0.1:${port}"

    echo "📜 Tailing logs (press Ctrl+C to exit logs)..."
    docker compose logs -f
else
    # Run the code on 
    echo "✅ Application is starting locally on http://127.0.0.1:${port}"
    
    uvicorn main:app --host 0.0.0.0 --port "${port}"

fi