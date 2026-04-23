#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🚀 Content Environment Migration - HTTPS Setup"
echo "=============================================="
echo ""

# Step 1: Install dependencies if not already installed
print_status "Checking dependencies..."
if [[ ! -d "node_modules" ]]; then
    print_status "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed!"
else
    print_warning "Dependencies already installed"
fi

# Step 2: Generate certificates
print_status "Generating SSL certificates..."
if bash generate-ssl.sh; then
    print_success "SSL certificates generated!"
else
    print_error "Failed to generate SSL certificates"
    exit 1
fi

# Step 3: Install certificates in macOS Keychain
print_status "Installing certificate in macOS Keychain..."
echo ""
if bash install-cert-macos.sh; then
    print_success "Certificate installed!"
else
    print_error "Failed to install certificate"
    print_warning "You may still use --insecure mode or accept the certificate manually in your browser"
fi

echo ""
echo "=========================================="
print_success "Setup Complete! 🎉"
echo "=========================================="
echo ""
echo "Ready to start development:"
echo "  npm run dev:https"
echo ""
echo "The app will be available at:"
echo "  https://localhost:3005"
echo ""
