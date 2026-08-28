import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseKey;
const crecheId = Constants.expoConfig?.extra?.crecheId || 'default'; // 👈 1. Grab the ID

console.log("🔥 CONNECTING TO DATABASE:", supabaseUrl);
console.log("🛡️ MEMORY FILE:", `supabase-auth-${crecheId}`);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // 👇 2. THE MAGIC FIX: Give each app its own isolated memory slot
    storageKey: `supabase-auth-${crecheId}`, 
  },
});