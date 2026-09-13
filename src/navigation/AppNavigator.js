import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext'; // 🚀 Import du hook
import { supabase } from '../services/supabaseClient';

// Importation de tous vos écrans
import ArchiveAdminScreen from '../screens/admin/ArchiveAdminScreen';
import AttestationsAdminScreen from '../screens/admin/AttestationsAdminScreen';
import CahierAdminScreen from '../screens/admin/CahierAdminScreen';
import DashboardAdmin from '../screens/admin/DashboardAdmin';
import EngagementAdminScreen from '../screens/admin/EngagementAdminScreen';
import GestionCantineAdminScreen from '../screens/admin/GestionCantineAdmin';
import GestionFamillesScreen from '../screens/admin/GestionFamillesScreen';
import GestionTransportAdminScreen from '../screens/admin/GestionTransportAdmin';
import GestionUtilisateursScreen from '../screens/admin/GestionUtilisateursScreen';
import HistoriquePointageScreen from '../screens/admin/HistoriquePointageScreen';
import MenuProgrammeAdminScreen from '../screens/admin/MenuProgrammeAdminScreen';
import MurAdminScreen from '../screens/admin/MurAdminScreen';
import PaiementsAdminScreen from '../screens/admin/PaiementsAdminScreen';
import ReglagesAdminScreen from '../screens/admin/ReglagesAdminScreen';
import RessourcesAdminScreen from '../screens/admin/RessourcesAdminScreen';
import TerminalPointageEmployesScreen from '../screens/admin/TerminalPointageEmployes';

import InscriptionScreen from '../screens/auth/InscriptionScreen';
import LoginScreen from '../screens/auth/LoginScreen';

import DashboardParent from '../screens/parent/DashboardParent';
import MenuProgrammeParentScreen from '../screens/parent/MenuProgrammeParentScreen'; // 🚀 Chemin corrigé
import MesEnfantsScreen from '../screens/parent/MesEnfantsScreen';
import PaiementsParentScreen from '../screens/parent/PaiementsParentScreen';

import MessagerieScreen from '../screens/shared/MessagerieScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    verifierSession();
  }, []);

  const verifierSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { data: userData, error } = await supabase
          .from('utilisateurs')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (!error && userData) {
          if (userData.role === 'admin') {
            setInitialRoute('DashboardAdmin');
          } else if (userData.role === 'parent') {
            setInitialRoute('DashboardParent');
          } else {
            setInitialRoute('Login');
          }
        } else {
          setInitialRoute('Login');
        }
      } else {
        setInitialRoute('Login');
      }
    } catch (error) {
      console.log("Erreur lors de la vérification de session :", error);
      setInitialRoute('Login'); 
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute}>
        
        {/* Vos écrans principaux */}
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DashboardAdmin" component={DashboardAdmin} options={{ title: 'Administration', headerBackVisible: false }} />
        <Stack.Screen name="DashboardParent" component={DashboardParent} options={{ title: 'Espace Parents', headerBackVisible: false }} />
        
        {/* Les sous-écrans */}
        <Stack.Screen name="Messagerie" component={MessagerieScreen} options={{ title: 'Messages' }} />
        <Stack.Screen name="PaiementsAdmin" component={PaiementsAdminScreen} options={{ title: 'Gestion des Paiements' }} />
        <Stack.Screen name="PaiementsParent" component={PaiementsParentScreen} options={{ title: 'Mes Paiements' }} />
        <Stack.Screen name="GestionFamillesScreen" component={GestionFamillesScreen} options={{ title: 'Gestion des Familles' }} />
        <Stack.Screen name="ReglagesAdminScreen" component={ReglagesAdminScreen} options={{ title: 'Réglages' }} />
        <Stack.Screen name="CahierAdmin" component={CahierAdminScreen} options={{ title: 'Cahier de Liaison' }} />
        <Stack.Screen name="MesEnfantsScreen" component={MesEnfantsScreen} options={{ title: 'Mes Enfants' }} />
        <Stack.Screen name="MurAdmin" component={MurAdminScreen} options={{ title: 'Mur d\'Actualités' }} />
        <Stack.Screen name="GestionUtilisateurs" component={GestionUtilisateursScreen} options={{ title: 'Comptes Utilisateurs' }} />
        <Stack.Screen name="Inscription" component={InscriptionScreen} options={{ title: 'Inscription' }} />
        <Stack.Screen name="RessourcesAdmin" component={RessourcesAdminScreen} options={{ title: 'Ressources' }} />
        <Stack.Screen name="ArchiveAdminScreen" component={ArchiveAdminScreen} options={{ title: 'Archive' }} />
        <Stack.Screen name="AttestationsAdminScreen" component={AttestationsAdminScreen} options={{ title: 'Attestations' }} />
        <Stack.Screen name="EngagementAdminScreen" component={EngagementAdminScreen} options={{ headerShown: false }} />
        
        {/* 🚌 RECOURS LOGISTIQUE : Écrans validés */}
        <Stack.Screen name="GestionTransportAdmin" component={GestionTransportAdminScreen} options={{ title: 'Transport Scolaire' }} />
        <Stack.Screen name="GestionCantineAdmin" component={GestionCantineAdminScreen} options={{ title: 'Cantine' }} />
        <Stack.Screen name="HistoriquePointage" component={HistoriquePointageScreen} options={{ title: 'Historique Présences' }} />
        
        {/* 🥦 MENUS ET PROGRAMMES HEBDOMADAIRES */}
        <Stack.Screen name="MenuProgrammeAdmin" component={MenuProgrammeAdminScreen} options={{ title: 'Menu & Programme Hebdo' }} />
        <Stack.Screen name="MenuProgrammeParent" component={MenuProgrammeParentScreen} options={{ title: 'Menu & Programme' }} /> 
        
        {/* 🕙 TERMINAL POINTAGE PERSONNEL */}
        <Stack.Screen name="TerminalPointageEmployes" component={TerminalPointageEmployesScreen} options={{ title: 'Pointage Personnel' }} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});