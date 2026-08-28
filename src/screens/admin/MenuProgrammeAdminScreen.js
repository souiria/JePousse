import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC' },
  demo: { primary: '#2196F3', background: '#E3F2FD' }
};

// Fonction utilitaire pour obtenir la date du lundi de la semaine d'une date donnée
const getLundiDate = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajuste si c'est dimanche
  const lundi = new Date(date.setDate(diff));
  return lundi.toISOString().split('T')[0];
};

export default function MenuProgrammeAdminScreen() {
  const [loading, setLoading] = useState(false);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(getLundiDate(new Date()));

  // États du formulaire
  const [themeSemaine, setThemeSemaine] = useState('');
  const [objectifs, setObjectifs] = useState('');
  const [lundiMenu, setLundiMenu] = useState('');
  const [mardiMenu, setMardiMenu] = useState('');
  const [mercrediMenu, setMercrediMenu] = useState('');
  const [jeudiMenu, setJeudiMenu] = useState('');
  const [vendrediMenu, setVendrediMenu] = useState('');

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => {
    chargerSemaine();
  }, [currentWeekMonday]);

  const chargerSemaine = async () => {
    setLoading(true);
    // Reset initial
    setThemeSemaine(''); setObjectifs(''); setLundiMenu(''); setMardiMenu(''); setMercrediMenu(''); setJeudiMenu(''); setVendrediMenu('');
    
    try {
      const { data, error } = await supabase
        .from('menu_programme_hebdo')
        .select('*')
        .eq('date_lundi', currentWeekMonday)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setThemeSemaine(data.theme_semaine || '');
        setObjectifs(data.objectifs_pedagogiques || '');
        setLundiMenu(data.menu_lundi || '');
        setMardiMenu(data.menu_mardi || '');
        setMercrediMenu(data.menu_mercredi || '');
        setJeudiMenu(data.menu_jeudi || '');
        setVendrediMenu(data.menu_vendredi || '');
      }
    } catch (e) {
      Alert.alert("Erreur", "Impossible de récupérer les données de cette semaine.");
    } finally {
      setLoading(false);
    }
  };

  const naviguerSemaine = (jours) => {
    const dateAlternative = new Date(currentWeekMonday);
    dateAlternative.setDate(dateAlternative.getDate() + jours);
    setCurrentWeekMonday(getLundiDate(dateAlternative));
  };

  const sauvegarderFicheSemaine = async () => {
    if (!themeSemaine.trim()) {
      Alert.alert("Champ obligatoire", "Veuillez donner un thème principal à cette semaine.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('menu_programme_hebdo')
        .upsert({
          date_lundi: currentWeekMonday,
          theme_semaine: themeSemaine.trim(),
          objectifs_pedagogiques: objectifs.trim(),
          menu_lundi: lundiMenu.trim(),
          menu_mardi: mardiMenu.trim(),
          menu_mercredi: mercrediMenu.trim(),
          menu_jeudi: jeudiMenu.trim(),
          menu_vendredi: vendrediMenu.trim(),
          mis_a_jour_le: new Date().toISOString()
        }, { onConflict: 'date_lundi' });

      if (error) throw error;
      Alert.alert("Publié avec succès ! ✨", "Le menu et le programme sont en ligne pour les parents.");
    } catch (err) {
      Alert.alert("Erreur", "Une erreur est survenue lors de la sauvegarde.");
    } finally {
      setLoading(false);
    }
  };

  const formaterAffichageSemaine = () => {
    const l = new Date(currentWeekMonday);
    const v = new Date(currentWeekMonday);
    v.setDate(v.getDate() + 4);
    return `Du ${l.getDate()} au ${v.getDate()} ${v.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['bottom', 'left', 'right']}>
      {/* Sélecteur de Semaine */}
      <View style={styles.weekNavigator}>
        <TouchableOpacity style={styles.navBtn} onPress={() => naviguerSemaine(-7)}><Text style={styles.navBtnText}>◀ Sem. Précédente</Text></TouchableOpacity>
        <View style={styles.centerWeekText}>
          <Text style={styles.weekDates}>{formaterAffichageSemaine()}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => naviguerSemaine(7)}><Text style={styles.navBtnText}>Sem. Suivante ▶</Text></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={currentTheme.primary} /></View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
            
            {/* SECTION 1 : PROGRAMME PÉDAGOGIQUE */}
            <View style={styles.sectionCard}>
              <Text style={[styles.sectionTitle, { color: currentTheme.primary }]}>🎨 Projet Pédagogique de la semaine</Text>
              
              <Text style={styles.label}>Thème principal de la semaine *</Text>
              <TextInput style={styles.inputSolo} value={themeSemaine} onChangeText={setThemeSemaine} placeholder="Ex: À la découverte des animaux de la forêt 🌲" placeholderTextColor="#94A3B8" />

              <Text style={styles.label}>Activités & Objectifs clés</Text>
              <TextInput style={styles.textArea} value={objectifs} onChangeText={setObjectifs} placeholder="Ex: Peinture propre, motricité fine avec des pommes de pin, éveil musical..." placeholderTextColor="#94A3B8" multiline />
            </View>

            {/* SECTION 2 : MENU DE LA CANTINE */}
            <View style={styles.sectionCard}>
              <Text style={[styles.sectionTitle, { color: currentTheme.primary }]}>🥦 Menu de la Cantine & Goûters</Text>

              <Text style={styles.dayLabel}>🟢 LUNDI</Text>
              <TextInput style={styles.dayInput} value={lundiMenu} onChangeText={setLundiMenu} placeholder="Entrée, Plat, Dessert..." placeholderTextColor="#94A3B8" multiline />

              <Text style={styles.dayLabel}>🟢 MARDI</Text>
              <TextInput style={styles.dayInput} value={mardiMenu} onChangeText={setMardiMenu} placeholder="Entrée, Plat, Dessert..." placeholderTextColor="#94A3B8" multiline />

              <Text style={styles.dayLabel}>🟢 MERCREDI</Text>
              <TextInput style={styles.dayInput} value={mercrediMenu} onChangeText={setMercrediMenu} placeholder="Entrée, Plat, Dessert..." placeholderTextColor="#94A3B8" multiline />

              <Text style={styles.dayLabel}>🟢 JEUDI</Text>
              <TextInput style={styles.dayInput} value={jeudiMenu} onChangeText={setJeudiMenu} placeholder="Entrée, Plat, Dessert..." placeholderTextColor="#94A3B8" multiline />

              <Text style={styles.dayLabel}>🟢 VENDREDI</Text>
              {/* 🚀 FIX EFFECTUÉ SUR CETTE LIGNE (setVendrediMenu) */}
              <TextInput style={styles.dayInput} value={vendrediMenu} onChangeText={setVendrediMenu} placeholder="Entrée, Plat, Dessert..." placeholderTextColor="#94A3B8" multiline />
            </View>

            {/* Bouton de sauvegarde */}
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: currentTheme.primary }]} onPress={sauvegarderFicheSemaine}>
              <Text style={styles.saveButtonText}>🚀 Mettre à jour l'Espace Parents</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  weekNavigator: { flexDirection: 'row', backgroundColor: '#FFF', padding: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', elevation: 1 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 8 },
  navBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  centerWeekText: { flex: 1, alignItems: 'center' },
  weekDates: { fontSize: 13, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  sectionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 15, letterSpacing: -0.3 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, textTransform: 'uppercase' },
  dayLabel: { fontSize: 12, fontWeight: '900', color: '#0F172A', marginBottom: 6, marginTop: 8 },
  inputSolo: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#334155', marginBottom: 15 },
  textArea: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#334155', minHeight: 80, textAlignVertical: 'top' },
  dayInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, fontSize: 13, color: '#334155', minHeight: 50, textAlignVertical: 'top' },
  saveButton: { padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 3, marginTop: 10 },
  saveButtonText: { color: '#FFF', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 }
});