#!/bin/bash
echo "🥛 Starting MrMilk × Pomelli Bridge Server..."
cd "$(dirname "$0")"
npm install --silent
node server.js
