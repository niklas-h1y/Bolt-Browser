import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bolt.browser.mobile',
  appName: 'Bolt Browser',
  webDir: 'mobile',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

export default config;
