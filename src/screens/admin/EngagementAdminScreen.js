import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// 🎨 CONFIGURATION DES THÈMES DYNAMIQUES
const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC' },
  demo: { primary: '#2196F3', background: '#E3F2FD' }
};

export default function EngagementAdminScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [parentsActifs, setParentsActifs] = useState([]);
  const [parentsInactifs, setParentsInactifs] = useState([]);

  // 🚀 EXTRACTION DU THÈME DYNAMIQUE
  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => {
    fetchEngagement();
  }, []);

  const fetchEngagement = async () => {
    try {
      setLoading(true);
      
      // 1. Récupérer tous les parents
      const { data: parents, error: parentsError } = await supabase
        .from('utilisateurs')
        .select('id, nom, prenom, code_parent')
        .eq('role', 'parent');

      if (parentsError) throw parentsError;

      // 2. Récupérer tous les enfants avec leur parent_id (LIAISON)
      const { data: enfants, error: enfantsError } = await supabase
        .from('enfants')
        .select('parent_id'); 
      
      if (enfantsError) throw enfantsError;

      // 3. Récupérer les vues
      const { data: vues, error: vuesError } = await supabase
        .from('vues_publications')
        .select('utilisateur_id, date_vue')
        .order('date_vue', { ascending: false });

      if (vuesError) throw vuesError;

      // 4. Traitement des données
      const parentsAvecVues = parents.map(parent => {
        const derniereVue = vues.find(v => v.utilisateur_id === parent.id);
        
        // 🚀 CORRECTION : On vérifie si l'ID du parent est présent dans la table enfants
        const estLie = enfants.some(e => e.parent_id === parent.id);

        return {
          ...parent,
          derniere_vue: derniereVue ? new Date(derniereVue.date_vue) : null,
          est_lie: estLie
        };
      });

      const septJoursPlusTot = new Date();
      septJoursPlusTot.setDate(septJoursPlusTot.getDate() - 7);

      const actifs = [];
      const inactifs = [];

      parentsAvecVues.forEach(parent => {
        if (parent.derniere_vue && parent.derniere_vue >= septJoursPlusTot) {
          actifs.push(parent);
        } else {
          inactifs.push(parent);
        }
      });

      actifs.sort((a, b) => b.derniere_vue - a.derniere_vue);
      inactifs.sort((a, b) => {
        if (!a.derniere_vue) return -1;
        if (!b.derniere_vue) return 1;
        return a.derniere_vue - b.derniere_vue;
      });

      setParentsActifs(actifs);
      setParentsInactifs(inactifs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formaterDate = (date) => {
    if (!date) return "Jamais connectés";
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }).replace(',', ' à');
  };

  const renderParent = ({ item, isActif }) => (
    <View style={[styles.parentCard, { borderLeftColor: isActif ? '#4CAF50' : '#F44336' }]}>
      <View style={styles.parentHeader}>
        <View style={[styles.avatar, { backgroundColor: isActif ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={[styles.avatarText, { color: isActif ? '#2E7D32' : '#C62828' }]}>
            {item.prenom ? item.prenom.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.parentInfo}>
          <Text style={styles.parentName}>{item.prenom} {item.nom}</Text>
          <Text style={styles.parentCode}>
             Statut : <Text style={{fontWeight: 'bold', color: item.est_lie ? currentTheme.primary : '#EF4444'}}>
               {item.est_lie ? "Compte Lié" : "Non lié"}
             </Text>
          </Text>
        </View>
      </View>
      <View style={styles.vueInfo}>
        <Text style={styles.vueLabel}>Dernière vue :</Text>
        <Text style={[styles.vueDate, { color: isActif ? '#2E7D32' : '#C62828' }]}>{formaterDate(item.derniere_vue)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.mainTitle}>Engagement</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>🟢 Actifs ({parentsActifs.length})</Text>
          </View>
          <FlatList
            data={parentsActifs}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => renderParent({ item, isActif: true })}
            scrollEnabled={false}
          />
          <View style={[styles.sectionHeader, { marginTop: 30 }]}>
            <Text style={[styles.sectionTitle, { color: '#F44336' }]}>🔴 Inactifs ({parentsInactifs.length})</Text>
          </View>
          <FlatList
            data={parentsInactifs}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => renderParent({ item, isActif: false })}
            scrollEnabled={false}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 4, marginBottom: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { marginRight: 15, padding: 8, backgroundColor: '#F1F5F9', borderRadius: 8 },
  backButtonText: { fontWeight: 'bold', color: '#475569' },
  headerTitleContainer: { flex: 1 },
  mainTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 15, paddingBottom: 40 },
  sectionHeader: { marginBottom: 10, paddingHorizontal: 5 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  parentCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 16, marginBottom: 12, elevation: 2, borderLeftWidth: 5, borderWidth: 1, borderColor: '#F1F5F9' },
  parentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: '900' },
  parentInfo: { flex: 1 },
  parentName: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  parentCode: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },
  vueInfo: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  vueLabel: { fontSize: 12, color: '#475569', fontWeight: '500' },
  vueDate: { fontSize: 12, fontWeight: '800' }
});