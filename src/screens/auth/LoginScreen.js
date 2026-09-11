import Constants from 'expo-constants'; // 🚀 REQUIRED FOR DYNAMIC CONFIG
import * as Notifications from 'expo-notifications'; // 🚀 AJOUT POUR LES NOTIFICATIONS
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// 🚀 Mapping des logos dynamiques
const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

// 🎨 CONFIGURATION DES THÈMES DYNAMIQUES SELON LA CRÈCHE CHARGÉE
const themes = {
  jeupousse: {
    primary: '#E91E63',     // Magenta
    background: '#F8FAFC',  // Light Grey
  },
  demo: {
    primary: '#2196F3',     // Blue
    background: '#E3F2FD',  // Light Blue
  }
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // 🚀 Configurations dynamiques extraites depuis l'environnement Expo
  const appName = Constants.expoConfig?.name || 'Ma Crèche';
  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const facebookUrl = Constants.expoConfig?.extra?.facebookUrl;
  const instagramUrl = Constants.expoConfig?.extra?.instagramUrl;
  const mapsUrl = Constants.expoConfig?.extra?.mapsUrl;

  // 🚀 Extraction automatique du logo et du thème
  const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;
  const currentTheme = themes[crecheId] || themes.jeupousse;

  // --- 🚀 FONCTION : ENREGISTREMENT DU TOKEN DE NOTIFICATION ---
  const registerForPushNotificationsAsync = async (userId) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Permission refusée pour les notifications push');
        return;
      }

      // Récupération dynamique du Project ID depuis app.config.js
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      if (!projectId) {
        console.error('Project ID EAS introuvable dans la configuration');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;

      // Sauvegarde du token dans la base de données de la crèche active
      if (token) {
        await supabase
          .from('utilisateurs')
          .update({ expo_push_token: token })
          .eq('id', userId);
        
        console.log("✅ Push Token enregistré :", token);
      }
    } catch (error) {
      console.error("❌ Erreur lors de l'enregistrement du push token :", error);
    }
  };

  // --- FONCTION DE CONNEXION ---
  const handleLogin = async () => {
    if (!email || !password) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    setLoading(true);
    setResetMessage(''); 

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) throw new Error(authError.message);

      const userId = authData.user.id;

      const { data: userData, error: dbError } = await supabase
        .from('utilisateurs')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); 

      if (userData) {
        // 🚀 1. VÉRIFICATION DU STATUT DU COMPTE AVANT TOUT
        if (userData.role === 'suspendu') {
          await supabase.auth.signOut(); // Déconnexion forcée immédiate
          Alert.alert("Accès suspendu 🚫", "Votre compte a été suspendu par la direction. Veuillez les contacter pour plus d'informations.");
          setLoading(false);
          return;
        } 
        
        if (userData.role === 'en_attente') {
          await supabase.auth.signOut(); // Déconnexion forcée immédiate
          Alert.alert("Compte en attente ⏳", "Votre compte n'a pas encore été validé par la direction de la crèche. Veuillez patienter.");
          setLoading(false);
          return;
        }

        // 🚀 1.BIS. VÉRIFICATION POUR LES PARENTS "NON LIÉS"
        if (userData.role === 'parent') {
          const { data: enfantsLies, error: verifError } = await supabase
            .from('enfants')
            .select('id')
            .eq('parent_id', userId)
            .limit(1);

          if (verifError) throw new Error(verifError.message);

          if (!enfantsLies || enfantsLies.length === 0) {
            await supabase.auth.signOut(); // Déconnexion forcée
            Alert.alert(
              "Compte non lié 🚫", 
              "Votre profil n'est rattaché à aucun dossier d'enfant. Veuillez vous rapprocher de la direction ou supprimer ce compte."
            );
            setLoading(false);
            return;
          }
        }

        // 🚀 2. SI LE COMPTE EST VALIDE, ON ENREGISTRE LES NOTIFICATIONS
        await registerForPushNotificationsAsync(userId);

        // 🚀 3. REDIRECTION SELON LE RÔLE
        if (userData.role === 'admin') {
          navigation.replace('DashboardAdmin');
        } else if (userData.role === 'parent') {
          navigation.replace('DashboardParent');
        } else if (userData.role === 'personnel') {
          navigation.replace('DashboardParent'); // Si le personnel utilise le dashboard parent
        } else {
          Alert.alert("Erreur", "Rôle inconnu.");
        }
      } else {
        // Fallback si la table utilisateur n'est pas remplie correctement
        if (email.toLowerCase().includes('admin')) {
          navigation.replace('DashboardAdmin');
        } else {
          navigation.replace('DashboardParent');
        }
      }
    } catch (error) {
      alert("Erreur de connexion : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- FONCTION : MOT DE PASSE OUBLIÉ ---
  const handleForgotPassword = async () => {
    setResetMessage(''); 

    if (!email) {
      Alert.alert(
        "Adresse e-mail requise", 
        "Veuillez d'abord taper votre adresse e-mail dans le champ, puis cliquez à nouveau sur 'Mot de passe oublié'."
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      
      setResetMessage("Un lien de réinitialisation a été envoyé. Pensez à vérifier vos spams ✉️");
      
    } catch (error) {
      Alert.alert("Erreur", "Impossible d'envoyer l'e-mail : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- FONCTION LIENS SOCIAUX ---
  const openLink = (url) => {
    if (!url) {
      Alert.alert("Indisponible", "Ce lien n'est pas configuré pour cette crèche.");
      return;
    }
    Linking.openURL(url).catch(err => console.error("Erreur d'ouverture :", err));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            
            {/* EN-TÊTE DYNAMIQUE (LOGO + NOM APPLI) */}
            <View style={styles.headerContainer}>
              <View style={styles.logoCircle}>
                <Image 
                  source={selectedLogo} 
                  style={styles.logoImage} 
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.title}>{appName}</Text>
              <Text style={[styles.subtitle, { color: currentTheme.primary }]}>Espace de Connexion</Text>
            </View>

            <View style={styles.formContainer}>
              <TextInput 
                style={styles.input} 
                placeholder="Adresse Email" 
                placeholderTextColor="#94A3B8"
                value={email} 
                onChangeText={setEmail} 
                keyboardType="email-address" 
                autoCapitalize="none"
              />

              <TextInput 
                style={styles.inputPass} 
                placeholder="Mot de passe" 
                placeholderTextColor="#94A3B8"
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry
              />

              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordBtn}>
                <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>

              {resetMessage !== '' && (
                <View style={styles.successMessageContainer}>
                  <Text style={styles.successMessageText}>{resetMessage}</Text>
                </View>
              )}

              {/* BOUTON DE CONNEXION COULEUR PRIMAIRE */}
              <TouchableOpacity style={[styles.button, { backgroundColor: currentTheme.primary }]} onPress={handleLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF"/>
                ) : (
                  <Text style={styles.buttonText}>Se Connecter</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => navigation.navigate('Inscription')} style={styles.linkButton}>
                <Text style={[styles.linkText, { color: currentTheme.primary }]}>Nouveau parent ? Créer un compte</Text>
              </TouchableOpacity>

              {/* BARRE RÉSEAUX SOCIAUX */}
              <View style={styles.socialBar}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(facebookUrl)}>
                  <View style={[styles.socialIconCircle, { backgroundColor: '#E3F2FD' }]}>
                    <Text style={styles.socialIcon}>📘</Text>
                  </View>
                  <Text style={styles.socialLabel}>Facebook</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(instagramUrl)}>
                  <View style={[styles.socialIconCircle, { backgroundColor: '#FCE4EC' }]}>
                    <Text style={styles.socialIcon}>📸</Text>
                  </View>
                  <Text style={styles.socialLabel}>Instagram</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(mapsUrl)}>
                  <View style={[styles.socialIconCircle, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={styles.socialIcon}>📍</Text>
                  </View>
                  <Text style={styles.socialLabel}>Maps</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Developped by A S © 2026</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContainer: { flexGrow: 1, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 40 },
  headerContainer: { alignItems: 'center', marginBottom: 40 },
  logoCircle: { width: 100, height: 100, backgroundColor: '#FFFFFF', borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  title: { fontSize: 32, fontWeight: '900', color: '#4A148C', textAlign: 'center', marginBottom: 5, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  formContainer: { width: '100%' },
  input: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16, color: '#334155', elevation: 1 },
  inputPass: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16, color: '#334155', elevation: 1 },
  forgotPasswordBtn: { alignSelf: 'flex-end', marginBottom: 15, paddingRight: 4 },
  forgotPasswordText: { color: '#00BCD4', fontSize: 13, fontWeight: '700' },
  successMessageContainer: { backgroundColor: '#F1F8E9', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#8BC34A' },
  successMessageText: { color: '#4CAF50', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  button: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 5, elevation: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  linkButton: { marginTop: 25, alignItems: 'center', padding: 10 },
  linkText: { fontWeight: '700', fontSize: 15 },
  
  socialBar: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  socialBtn: { alignItems: 'center' },
  socialIconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  socialIcon: { fontSize: 24 },
  socialLabel: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  
  footer: { alignItems: 'center', paddingBottom: 20, paddingTop: 20 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' }
});