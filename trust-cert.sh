#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[TRUST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo "🔐 Installing trusted SSL certificate for localhost"
echo "===================================================="
echo ""

# Remove existing localhost certificates from System keychain
print_status "Removing old localhost certificates from System Keychain..."

# Find and remove the old cert
security find-certificate -a -c localhost -p /Library/Keychains/System.keychain > /tmp/localhost_old.cer 2>/dev/null
if [[ $? -eq 0 ]]; then
    # Extract the SHA-1 hash and delete by hash
    hash=$(security find-certificate -a -c localhost -p /Library/Keychains/System.keychain | \
           openssl x509 -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')
    
    if [[ ! -z "$hash" ]]; then
        sudo security delete-certificate -Z "$hash" /Library/Keychains/System.keychain 2>/dev/null
        if [[ $? -eq 0 ]]; then
            print_success "Old certificate removed"
        else
            print_warning "Could not remove old certificate (may require manual Keychain cleanup)"
        fi
    fi
fi

# Install new certificate
print_status "Installing new localhost certificate..."

if [[ ! -f "localhost.pem" ]]; then
    echo "ERROR: localhost.pem not found!"
    exit 1
fi

# Use osascript to prompt for password (better UX)
/usr/bin/osascript <<EOD
do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $(pwd)/localhost.pem" with administrator privileges
EOD

if [[ $? -eq 0 ]]; then
    print_success "Certificate installed successfully!"
    echo ""
    echo "✅ Certificate is now trusted in macOS"
    echo "✅ https://localhost:3005 should now work without warnings"
    echo ""
    print_warning "⚠️  You may need to:"
    echo "  1. Restart your browser completely"
    echo "  2. Clear browser cache (Cmd+Shift+Delete in Chrome)"
    echo "  3. Close and reopen any open tabs to https://localhost:3005"
else
    print_warning "Installation was cancelled or failed"
    echo ""
    echo "Manual installation:"
    echo "  1. Open Keychain Access (Cmd+Space, search 'Keychain')"
    echo "  2. Drag localhost.pem into Keychain"
    echo "  3. Right-click > Get Info > Trust > 'Always Trust'"
    exit 1
fi
