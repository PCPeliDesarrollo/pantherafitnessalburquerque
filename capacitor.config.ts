import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pantherafitness.alburquerque',
  appName: 'Panthera Fitness Alburquerque',
  webDir: 'dist',
  ios: {
    // Required for @capacitor/camera 8.x (CapacitorCamera pod)
    minVersion: '15.0'
  },
  android: {
    backgroundColor: '#000000',
    webContentsDebuggingEnabled: true,
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    },
    FirebaseMessaging: {
      presentationOptions: ["alert", "badge", "sound"]
    }
  }

};

export default config;
