import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const formatYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Fonction utilitaire pour obtenir le dernier jour du mois de manière fiable
const getDernierJourDuMois = (annee, mois) => {
  return new Date(annee, mois + 1, 0).getDate();
};

export default function HistoriquePointageScreen() {
  const [ongletActif, setOngletActif] = useState('mensuel');
  
  const [loading, setLoading] = useState(true);
  const [employes, setEmployes] = useState([]);
  const [historiqueGlobal, setHistoriqueGlobal] = useState([]);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [pointagesMensuels, setPointagesMensuels] = useState([]);
  const [joursDuMois, setJoursDuMois] = useState([]);
  const [selectedEmploye, setSelectedEmploye] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [justifDate, setJustifDate] = useState('');
  const [justifStatut, setJustifStatut] = useState('conge');
  const [justifRemarque, setJustifRemarque] = useState('');
  const [savingJustif, setSavingJustif] = useState(false);

  const todayStr = formatYMD(new Date());

  useEffect(() => {
    chargerDonneesGlobales();
  }, []);

  useEffect(() => {
    calculerJoursDuMois(currentDate);
    if (employes.length > 0) {
      chargerPointagesDuMois(currentDate);
    }
  }, [currentDate, employes]);

  const chargerDonneesGlobales = async () => {
    setLoading(true);
    try {
      const { data: dataEmp } = await supabase
        .from('utilisateurs')
        .select('id, prenom, nom, role')
        .in('role', ['personnel', 'admin'])
        .order('prenom', { ascending: true });
      if (dataEmp) setEmployes(dataEmp);

      const { data: dataHist } = await supabase
        .from('pointage_personnel')
        .select('*, utilisateurs (prenom, nom, role)')
        .order('date_jour', { ascending: false })
        .order('heure_entree', { ascending: false })
        .limit(100);
      if (dataHist) setHistoriqueGlobal(dataHist);
      
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const calculerJoursDuMois = (date) => {
    const annee = date.getFullYear();
    const mois = date.getMonth();
    const jours = [];
    const d = new Date(annee, mois, 1);
    
    while (d.getMonth() === mois) {
      if (d.getDay() !== 0) { // EXCLURE LES DIMANCHES
        jours.push(formatYMD(d));
      }
      d.setDate(d.getDate() + 1);
    }
    setJoursDuMois(jours);
  };

  const chargerPointagesDuMois = async (date) => {
    setLoading(true);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    // Correction ici : obtenir le vrai dernier jour du mois pour éviter le 31 juin (erreur 400)
    const dernierJour = getDernierJourDuMois(y, date.getMonth());
    const startMois = `${y}-${m}-01`;
    const endMois = `${y}-${m}-${String(dernierJour).padStart(2, '0')}`;

    try {
      const { data } = await supabase
        .from('pointage_personnel')
        .select('*')
        .gte('date_jour', startMois)
        .lte('date_jour', endMois);
        
      setPointagesMensuels(data || []);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const changerMois = (offset) => {
    setSelectedEmploye(null);
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(newDate);
  };

  const getDayStatus = (jour, employeId) => {
    const record = pointagesMensuels.find(x => x.employe_id === employeId && x.date_jour === jour);
    if (record) return { ...record, isBdd: true };

    if (jour > todayStr) return { statut: 'a_venir', label: 'À venir', isBdd: false };
    return { statut: 'absent_injustifie', label: 'Absence (Non pointé)', isBdd: false };
  };

  const calculStats = (employeId) => {
    let presences = 0;
    let absences = 0;
    let conges_feries = 0;

    joursDuMois.forEach(jour => {
      const st = getDayStatus(jour, employeId);
      if (st.statut === 'present') presences++;
      else if (st.statut === 'conge' || st.statut === 'ferie') conges_feries++;
      else if (st.statut === 'absent_injustifie' || st.statut === 'absent' || st.statut === 'maladie') absences++;
    });

    return { totalJours: joursDuMois.length, presences, absences, conges_feries };
  };

  const ouvrirModaleJustif = (jour) => {
    const record = getDayStatus(jour, selectedEmploye.id);
    setJustifDate(jour);
    setJustifStatut(record.statut === 'absent_injustifie' || record.statut === 'a_venir' ? 'conge' : record.statut);
    setJustifRemarque(record.remarque || '');
    setModalVisible(true);
  };

  const sauvegarderJustification = async () => {
    setSavingJustif(true);
    try {
      const existing = pointagesMensuels.find(x => x.employe_id === selectedEmploye.id && x.date_jour === justifDate);
      
      const payload = {
        employe_id: selectedEmploye.id,
        date_jour: justifDate,
        statut: justifStatut,
        remarque: justifRemarque,
      };

      if (existing) {
        const { error } = await supabase.from('pointage_personnel').update({ statut: justifStatut, remarque: justifRemarque }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pointage_personnel').insert([payload]);
        if (error) throw error;
      }

      setModalVisible(false);
      chargerPointagesDuMois(currentDate);
    } catch (e) {
      alert("Erreur lors de la sauvegarde : " + e.message);
    } finally {
      setSavingJustif(false);
    }
  };

  const formaterHeure = (dateIso) => {
    if (!dateIso) return '--:--';
    const d = new Date(dateIso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getInitial = (prenom) => {
    if (!prenom || typeof prenom !== 'string') return '?';
    return prenom.charAt(0).toUpperCase();
  };

  const renderJournalier = () => (
    <FlatList
      data={historiqueGlobal}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.photoContainer}>
            {item.photo_entree_url && item.photo_entree_url !== 'pointage_standard' ? (
              <Image source={{ uri: item.photo_entree_url }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}><Text style={styles.photoEmoji}>📷</Text></View>
            )}
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.nom}>{item.utilisateurs?.prenom || 'Inconnu'} {item.utilisateurs?.nom || ''}</Text>
            <Text style={styles.role}>{item.utilisateurs?.role || '---'}</Text>
            <Text style={styles.date}>📅 {item.date_jour.split('-').reverse().join('/')}</Text>
            {item.statut === 'present' ? (
              <View style={styles.heuresRow}>
                <View style={styles.heureBadgeEntree}><Text style={styles.heureText}>🟢 Entrée : {formaterHeure(item.heure_entree)}</Text></View>
                {item.heure_sortie && <View style={styles.heureBadgeSortie}><Text style={styles.heureText}>🔴 Sortie : {formaterHeure(item.heure_sortie)}</Text></View>}
              </View>
            ) : (
              <View style={styles.badgeAbsence}>
                <Text style={styles.heureText}>🟠 Statut : {item.statut.toUpperCase()}</Text>
                {item.remarque && <Text style={{fontSize: 11, fontStyle: 'italic', marginTop: 3}}>"{item.remarque}"</Text>}
              </View>
            )}
          </View>
        </View>
      )}
    />
  );

  const renderMensuel = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthBtn} onPress={() => changerMois(-1)}><Text style={styles.monthBtnText}>◀</Text></TouchableOpacity>
          <Text style={styles.monthTitle}>{moisNoms[currentDate.getMonth()]} {currentDate.getFullYear()}</Text>
          <TouchableOpacity style={styles.monthBtn} onPress={() => changerMois(1)}><Text style={styles.monthBtnText}>▶</Text></TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 50 }} />
        ) : selectedEmploye ? (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedEmploye(null)}>
              <Text style={styles.backBtnText}>⬅ Retour à la liste du personnel</Text>
            </TouchableOpacity>
            
            <View style={styles.empHeaderCard}>
              <Text style={styles.empHeaderTitle}>{selectedEmploye.prenom || 'Inconnu'} {selectedEmploye.nom || ''}</Text>
              <Text style={styles.empHeaderSub}>Fiche de présence : {moisNoms[currentDate.getMonth()]}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
              {joursDuMois.map(jour => {
                const dayStat = getDayStatus(jour, selectedEmploye.id);
                const isPresent = dayStat.statut === 'present';
                const isAVenir = dayStat.statut === 'a_venir';

                return (
                  <View key={jour} style={styles.dayRow}>
                    <View style={styles.dayDateBox}>
                      <Text style={styles.dayDateText}>{jour.split('-').reverse().join('/')}</Text>
                    </View>
                    
                    <View style={styles.dayContentBox}>
                      {isPresent ? (
                        <>
                          <Text style={styles.statusPresent}>✅ Présent</Text>
                          <Text style={styles.timeText}>Entrée : {formaterHeure(dayStat.heure_entree)}</Text>
                          <Text style={styles.timeText}>Sortie : {formaterHeure(dayStat.heure_sortie)}</Text>
                        </>
                      ) : isAVenir ? (
                        <Text style={styles.statusFuture}>⏳ Jour à venir</Text>
                      ) : (
                        <>
                          <Text style={styles.statusAbsent}>🟠 {dayStat.statut === 'absent_injustifie' ? 'Non Pointé' : dayStat.statut.toUpperCase()}</Text>
                          {dayStat.remarque && <Text style={styles.remarqueText}>"{dayStat.remarque}"</Text>}
                        </>
                      )}
                    </View>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => ouvrirModaleJustif(jour)}>
                      <Text style={styles.actionBtnText}>{isPresent ? "Modifier" : "Justifier"}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <FlatList
            data={employes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const stats = calculStats(item.id);
              return (
                <TouchableOpacity style={styles.empStatsCard} onPress={() => setSelectedEmploye(item)}>
                  <View style={styles.empStatsHeader}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{getInitial(item.prenom)}</Text></View>
                    <View>
                      <Text style={styles.nom}>{item.prenom || 'Inconnu'} {item.nom || ''}</Text>
                      <Text style={styles.role}>{item.role}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{stats.totalJours}</Text>
                      <Text style={styles.statLabel}>Ouvrés</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#ECFDF5' }]}>
                      <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.presences}</Text>
                      <Text style={styles.statLabel}>Présent</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#FEF2F2' }]}>
                      <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.absences}</Text>
                      <Text style={styles.statLabel}>Absent</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
                      <Text style={[styles.statValue, { color: '#D97706' }]}>{stats.conges_feries}</Text>
                      <Text style={styles.statLabel}>Congés/Férié</Text>
                    </View>
                  </View>
                  <Text style={styles.cliquezIci}>Voir le détail du mois ➡</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, ongletActif === 'journalier' && styles.tabActive]} onPress={() => setOngletActif('journalier')}>
          <Text style={[styles.tabText, ongletActif === 'journalier' && styles.tabTextActive]}>Flux Journalier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, ongletActif === 'mensuel' && styles.tabActive]} onPress={() => setOngletActif('mensuel')}>
          <Text style={[styles.tabText, ongletActif === 'mensuel' && styles.tabTextActive]}>Rapport Mensuel</Text>
        </TouchableOpacity>
      </View>

      {ongletActif === 'journalier' ? renderJournalier() : renderMensuel()}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Statut du : {justifDate.split('-').reverse().join('/')}</Text>
            
            <Text style={styles.label}>Nature du jour</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={justifStatut} onValueChange={(val) => setJustifStatut(val)}>
                <Picker.Item label="Absence non justifiée" value="absent" />
                <Picker.Item label="Maladie" value="maladie" />
                <Picker.Item label="Congé approuvé" value="conge" />
                <Picker.Item label="Jour Férié / Repos exceptionnel" value="ferie" />
                <Picker.Item label="Corriger manuellement en 'Présent'" value="present" />
              </Picker>
            </View>

            <Text style={[styles.label, {marginTop: 15}]}>Motif ou Remarque (Optionnel)</Text>
            <TextInput 
              style={styles.input} 
              value={justifRemarque} 
              onChangeText={setJustifRemarque} 
              placeholder="Ex: Certificat médical reçu, Vacances annuelles..." 
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnTextWhite}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={sauvegarderJustification} disabled={savingJustif}>
                <Text style={styles.btnTextWhite}>{savingJustif ? "Sauvegarde..." : "Valider"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#4F46E5' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#4F46E5', fontWeight: '800' },
  list: { padding: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: '#FFF', elevation: 1 },
  monthBtn: { padding: 10, backgroundColor: '#F1F5F9', borderRadius: 8 },
  monthBtnText: { fontSize: 16, color: '#4F46E5', fontWeight: 'bold' },
  monthTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', textTransform: 'uppercase' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 2 },
  photoContainer: { marginRight: 15, justifyContent: 'center' },
  photo: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#E2E8F0' },
  photoPlaceholder: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  photoEmoji: { fontSize: 24 },
  infoContainer: { flex: 1 },
  nom: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  role: { fontSize: 12, color: '#64748B', textTransform: 'uppercase', fontWeight: '700', marginBottom: 5 },
  date: { fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 10 },
  heuresRow: { gap: 6 },
  heureBadgeEntree: { backgroundColor: '#ECFDF5', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start' },
  heureBadgeSortie: { backgroundColor: '#FEF2F2', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start' },
  heureText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  badgeAbsence: { backgroundColor: '#FFFBEB', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', alignSelf: 'flex-start' },
  empStatsCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  empStatsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', marginTop: 2, textAlign: 'center' },
  cliquezIci: { fontSize: 11, color: '#4F46E5', fontWeight: '700', textAlign: 'right', marginTop: 15 },
  backBtn: { padding: 15, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtnText: { color: '#4F46E5', fontWeight: 'bold' },
  empHeaderCard: { backgroundColor: '#1E293B', padding: 20, margin: 15, borderRadius: 16 },
  empHeaderTitle: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  empHeaderSub: { color: '#94A3B8', fontSize: 13, marginTop: 4, fontWeight: '600' },
  dayRow: { flexDirection: 'row', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 10, elevation: 1, alignItems: 'center' },
  dayDateBox: { backgroundColor: '#F1F5F9', padding: 10, borderRadius: 8, marginRight: 12 },
  dayDateText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  dayContentBox: { flex: 1 },
  statusPresent: { color: '#10B981', fontWeight: '800', fontSize: 13, marginBottom: 4 },
  statusAbsent: { color: '#D97706', fontWeight: '800', fontSize: 13, marginBottom: 4 },
  statusFuture: { color: '#94A3B8', fontWeight: '700', fontSize: 12 },
  timeText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  remarqueText: { fontSize: 11, color: '#64748B', fontStyle: 'italic' },
  actionBtn: { backgroundColor: '#F8FAFC', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnText: { color: '#4F46E5', fontSize: 11, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 20, textAlign: 'center' },
  pickerContainer: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A', minHeight: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 25 },
  button: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#94A3B8' },
  confirmButton: { backgroundColor: '#4F46E5' },
  btnTextWhite: { color: '#FFF', fontWeight: '900', fontSize: 14 }
});