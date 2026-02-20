#!/bin/bash

echo "🚀 Setting up PostgreSQL for Nova Accounting..."
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "📦 Installing PostgreSQL via Homebrew..."
    brew install postgresql@14
    brew services start postgresql@14
    echo "✅ PostgreSQL installed and started"
    echo ""
else
    echo "✅ PostgreSQL is already installed"
    echo ""
fi

# Wait a moment for PostgreSQL to start
sleep 2

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "🔄 Starting PostgreSQL service..."
    brew services start postgresql@14 || brew services start postgresql
    sleep 3
fi

# Create database
echo "📊 Creating database 'nova_accounting'..."
createdb nova_accounting 2>/dev/null || echo "⚠️  Database might already exist (this is okay)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your .env file is configured (see setup instructions)"
echo "2. Run: cd server && npm install"
echo "3. Run: node index.js (to initialize the database schema)"
echo ""
