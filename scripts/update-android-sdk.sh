#!/bin/bash
set -e

# Subir el targetSdk y compileSdk a API 36 (Android 16)
# Google Play lo exige a partir del 31 ago 2026.

BUILD_GRADLE="android/build.gradle"
APP_BUILD_GRADLE="android/app/build.gradle"
VARIABLES_GRADLE="android/variables.gradle"

patch_file() {
  local file="$1"
  if [ -f "$file" ]; then
    # Patrones típicos de Capacitor 7: compileSdkVersion = 35 / targetSdkVersion = 35
    sed -i "s/compileSdkVersion = [0-9]*/compileSdkVersion = 36/g" "$file"
    sed -i "s/targetSdkVersion = [0-9]*/targetSdkVersion = 36/g" "$file"
    # Google Play ya no acepta mínimos por debajo de 24 (Android 7).
    sed -i "s/minSdkVersion = [0-9]*/minSdkVersion = 24/g" "$file"
    # Alternativa con DSL nuevo: compileSdk 35
    sed -i "s/compileSdk [0-9]*/compileSdk 36/g" "$file"
    sed -i "s/targetSdk [0-9]*/targetSdk 36/g" "$file"
    sed -i "s/minSdk [0-9]*/minSdk 24/g" "$file"
    echo "✓ Actualizado $file"
  fi
}

patch_file "$VARIABLES_GRADLE"
patch_file "$BUILD_GRADLE"
patch_file "$APP_BUILD_GRADLE"

echo "Android SDK apunta ahora a API 36"
