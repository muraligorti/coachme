import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'life.coachme.app',
  appName: 'CoachMe',
  webDir: 'dist',
  server: {
    // For production: comment out url to use local assets
    // For dev: point to Vercel preview
    // url: 'https://muraligorti-coachme.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0a0a0f',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    backgroundColor: '#0a0a0f',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'CoachMe',
  },
};

export default config;
