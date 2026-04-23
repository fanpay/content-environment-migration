# 🔐 SSL Certificate Installation Guide

## ¿Qué fue el problema?

**Antes:** `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` → Vite generaba certificados auto-firmados defectuosos  
**Ahora:** `ERR_CERT_AUTHORITY_INVALID` → ✅ Vite usa tu certificado REAL, pero no está confiado

## ✅ Solución: Confiar el certificado en macOS

El servidor ahora está usando el certificado correcto. Solo necesitas confiar en él.

### Opción 1: Automático (recomendado)

```bash
cd custom-apps/content-environment-migration

# Copiar este comando exacto y pegarlo en Terminal:
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $(pwd)/localhost.pem
```

Ingresa tu contraseña cuando se te pida.

### Opción 2: Manual en Keychain Access

1. **Abre Keychain Access:**
   - Presiona `Cmd+Space`
   - Escribe `Keychain`
   - Abre "Keychain Access.app"

2. **Importa el certificado:**
   - `File` → `Import Items...`
   - Navega a: `custom-apps/content-environment-migration/localhost.pem`
   - Haz clic en `Import`

3. **Confía en el certificado:**
   - Busca `localhost` en Keychain
   - Haz doble-click en el certificado
   - Expande sección `Trust`
   - Cambia `When using this certificate:` a `Always Trust`
   - Cierra la ventana (se pedirá tu contraseña)

4. **Reinicia el navegador:**
   - Cierra Chrome completamente
   - Borra cache: `Cmd+Shift+Delete`
   - Reabre Chrome
   - Navega a `https://localhost:3005`

### Opción 3: Temporal (sin instalar)

Si no quieres instalar el certificado, en Chrome:

1. Ve a `https://localhost:3005`
2. Click en `Advanced`
3. Click en `Proceed to localhost (unsafe)`

El navegador recordará esta decisión por esa sesión.

## ✅ Verificación

Para confirmar que funciona, usa:

```bash
curl --cacert localhost.pem https://localhost:3005
```

Si ves estado 200 o HTML, está funcionando. ✅

## 🚀 Desarrollo

Ahora que los certificados están configurados:

```bash
npm run dev:https    # https://localhost:3005
```

Sin errores SSL. ✨
