import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC' },
  demo: { primary: '#2196F3', background: '#E3F2FD' }
};

const getLundiDate = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const lundi = new Date(date.setDate(diff));
  return lundi.toISOString().split('T')[0];
};

export default function MenuProgrammeParentScreen() {
  const [loading, setLoading] = useState(true);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(getLundiDate(new Date()));
  const [donnees, setDonnees] = useState(null);

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => { chargerSemaine(); }, [currentWeekMonday]);

  const chargerSemaine = async () => {
    setLoading(true);
    setDonnees(null);
    try {
      const { data } = await supabase
        .from('menu_programme_hebdo')
        .select('*')
        .eq('date_lundi', currentWeekMonday)
        .maybeSingle();
      if (data) setDonnees(data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const naviguerSemaine = (jours) => {
    const dateAlternative = new Date(currentWeekMonday);
    dateAlternative.setDate(dateAlternative.getDate() + jours);
    setCurrentWeekMonday(getLundiDate(dateAlternative));
  };

  const formaterAffichageSemaine = () => {
    const l = new Date(currentWeekMonday);
    const v = new Date(currentWeekMonday);
    v.setDate(v.getDate() + 4);
    return `Du ${l.getDate()} au ${v.getDate()} ${v.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
  };

  const JourMenu = ({ jour, menu }) => {
    if (!menu) return null;
    return (
      <View style={styles.dayCard}>
        <Text style={[styles.dayTitle, { color: currentTheme.primary }]}>{jour}</Text>
        <Text style={styles.dayContent}>{menu}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['bottom', 'left', 'right']}>
      <View style={styles.weekNavigator}>
        <TouchableOpacity style={styles.navBtn} onPress={() => naviguerSemaine(-7)}><Text style={styles.navBtnText}>◀ Précédente</Text></TouchableOpacity>
        <View style={styles.centerWeekText}>
          <Text style={styles.weekDates}>{formaterAffichageSemaine()}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => naviguerSemaine(7)}><Text style={styles.navBtnText}>Suivante ▶</Text></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={currentTheme.primary} /></View>
      ) : !donnees ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyText}>Le programme de cette semaine n'a pas encore été publié par la crèche.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
          <View style={styles.themeCard}>
            <Text style={styles.themeHeader}>🎨 Thème de la semaine</Text>
            <Text style={styles.themeTitle}>{donnees.theme_semaine}</Text>
            {donnees.objectifs_pedagogiques ? (
              <Text style={styles.themeDesc}>{donnees.objectifs_pedagogiques}</Text>
            ) : null}
          </View>

          <Text style={styles.sectionMenuTitle}>🥦 Au menu de la cantine :</Text>
          <JourMenu jour="LUNDI" menu={donnees.menu_lundi} />
          <JourMenu jour="MARDI" menu={donnees.menu_mardi} />
          <JourMenu jour="MERCREDI" menu={donnees.menu_mercredi} />
          <JourMenu jour="JEUDI" menu={donnees.menu_jeudi} />
          <JourMenu jour="VENDREDI" menu={donnees.menu_vendredi} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  scrollContainer: { padding: 15, paddingBottom: 40 },
  weekNavigator: { flexDirection: 'row', backgroundColor: '#FFF', padding: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', elevation: 1 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 8 },
  navBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  centerWeekText: { flex: 1, alignItems: 'center' },
  weekDates: { fontSize: 13, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', fontWeight: '500', lineHeight: 20 },
  themeCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  themeHeader: { fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  themeTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
  themeDesc: { fontSize: 14, color: '#334155', lineHeight: 22 },
  sectionMenuTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 15, marginLeft: 5 },
  dayCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#10B981', elevation: 1 },
  dayTitle: { fontSize: 13, fontWeight: '900', marginBottom: 6 },
  dayContent: { fontSize: 14, color: '#334155', lineHeight: 20 }
});