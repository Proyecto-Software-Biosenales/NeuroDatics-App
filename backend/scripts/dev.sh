#!/usr/bin/env bash

# Development script for NeuroDatics backend

set -e

echo "Starting NeuroDatics backend development server..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
source venv/bin/activate || source venv/Scripts/activate

# Install dependencies
echo "Installing dependencies..."
pip install -e .

# Run database migrations
echo "Running database migrations..."
alembic upgrade head

# Start development server
echo "Starting development server..."
python -m neurodatics.main
