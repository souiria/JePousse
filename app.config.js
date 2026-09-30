const APP_VARIANT = process.env.APP_VARIANT || 'jeupousse';

const crecheProfiles = {
  jeupousse: {
    id: 'jeupousse',
    name: 'Jeu Pousse',
    bundleId: 'com.abderrahim.jeupousse',
    icon: './assets/images/jeupousse/icon.png',
    splash: './assets/images/jeupousse/splash-icon.png',
    supabaseUrl : 'https://lvtsmcwomcksvjcrldae.supabase.co',
     supabaseKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2dHNtY3dvbWNrc3ZqY3JsZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDcyMDEsImV4cCI6MjA5NjQ4MzIwMX0.7Ikqo980m5tCMjY8135ZnwRUC7BmpTLW6wUJFGywZF0',
    facebook: 'https://www.facebook.com/jeupousse',
    instagram: 'https://www.instagram.com/jeupousse',
    maps: 'https://share.google/AusnEyNjiITtBp55d',
    theme: {
      primary: '#E91E63',     // Magenta
      background: '#F8FAFC',  // Light Grey
      buttonText: '#FFFFFF',
    }
  },
  demo: {
    id: 'demo',
    name: 'Demo Crèche',
    bundleId: 'com.abderrahim.demo',
    icon: './assets/images/demo/icon.png',
    splash: './assets/images/demo/splash-icon.png',
    supabaseUrl:   'https://oytbgitdnyfkcueuizhz.supabase.co',
    supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dGJnaXRkbnlma2N1ZXVpemh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTYxNDUsImV4cCI6MjA5NDI3MjE0NX0.RNN8R10nW53Fhgz3KG_B0hvuWz7qCBWqJto9Mdr9vrg',
    facebook: 'https://www.facebook.com/demo',
    instagram: 'https://www.instagram.com/demo',
    maps: 'https://maps.google.com/demo',
    theme: {
      primary: '#2196F3',     // Blue
      background: '#E3F2FD',  // Light Blue
      buttonText: '#FFFFFF',
    }
  }
};

const currentConfig = crecheProfiles[APP_VARIANT] || crecheProfiles.jeupousse;

export default {
  expo: {
    name: currentConfig.name,
    slug: "creche-base-app", 
    version: "1.1.1",
    icon: currentConfig.icon,
    ios: { 
      bundleIdentifier: currentConfig.bundleId,
      buildNumber: "16",
      // 🚀 AJOUT DE LA CONFIGURATION D'EXPORTATION APPLE :
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: { 
      package: currentConfig.bundleId,
      versionCode: 17,
      googleServicesFile: "./google-services.json" 
    },
    extra: {
      eas: {
        projectId: "50f7612a-8628-4d80-a696-c83141f93e8a"
      },
      crecheId: currentConfig.id,
      supabaseUrl: currentConfig.supabaseUrl,
      supabaseKey: currentConfig.supabaseKey,
      facebookUrl: currentConfig.facebook,
      instagramUrl: currentConfig.instagram,
      mapsUrl: currentConfig.maps
    }
  }
};