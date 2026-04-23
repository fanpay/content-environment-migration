#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[KEYCHAIN]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🔑 macOS Keychain SSL Certificate Installer"
echo "=========================================="

# Verificar que existe el certificado
if [[ ! -f "localhost.pem" ]]; then
    print_error "Certificate localhost.pem not found!"
    echo "Run ./generate-ssl.sh first"
    exit 1
fi

print_status "Installing SSL certificate in macOS Keychain..."

# Agregar certificado al keychain
if sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain localhost.pem; then
    print_success "Certificate installed in System Keychain!"
    echo ""
    print_warning "You may need to restart your browser for changes to take effect."
    echo ""
    print_status "Testing certificate..."
    
    # Verificar la instalación
    if security find-certificate -a -c localhost -p /Library/Keychains/System.keychain > /dev/null 2>&1; then
        print_success "Certificate verification: OK"
        echo ""
        echo "✅ Your certificate is now trusted!"
        echo "✅ https://localhost:3005 should work without warnings"
        echo "✅ Perfect for Kontent.ai Custom App integration"
    else
        print_warning "Certificate installed but verification failed"
        print_warning "You may still need to accept it manually in your browser"
    fi
else
    print_error "Failed to install certificate in Keychain"
    echo ""
    print_warning "Alternative: Manual browser acceptance"
    echo "1. Go to https://localhost:3005"
    echo "2. Click 'Advanced' > 'Proceed to localhost'"
    echo "3. This will need to be done once per browser"
fi

echo ""
echo "🚀 Ready to use with Kontent.ai!"
echo "   URL for Custom App: https://localhost:3005"
