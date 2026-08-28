import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function TerminalPointageEmployesScreen({ navigation }) {
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);

  // États de la modale de pointage
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEmploye, setSelectedEmploye] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [processing, setSaving] = useState(false);

  useEffect(() => {
    chargerEmployes();
  }, []);

  const chargerEmployes = async () => {
    setLoading(true);
    try {
      // On récupère le personnel actif (on exclut le rôle admin ou parent pur)
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, prenom, nom, role')
        .not('role', 'eq', 'parent')
        .order('prenom', { ascending: true });

      if (error) throw error;

      // On récupère les pointages déjà effectués aujourd'hui
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: pointagesToday } = await supabase
        .from('pointage_personnel')
        .select('employe_id, heure_entree, heure_sortie')
        .eq('date_jour', todayStr);

      // Fusion des états
      const listeComplete = data.map(emp => {
        const pt = pointagesToday?.find(p => p.employe_id === emp.id);
        return {
          ...emp,
          dejaArrive: !!pt?.heure_entree,
          dejaParti: !!pt?.heure_sortie,
          pointageId: pt?.id || null
        };
      });

      setEmployes(listeComplete);
    } catch (e) {
      Alert.alert("Erreur", "Impossible de charger la liste du personnel.");
    } finally {
      setLoading(false);
    }
  };

  const declencherPointage = (employe) => {
    if (employe.dejaArrive && employe.dejaParti) {
      Alert.alert("Info", "Votre journée est déjà clôturée.");
      return;
    }
    setSelectedEmploye(employe);
    setPinInput('');
    setModalVisible(true);
  };

  const executerPointageBdd = async () => {
    if (pinInput.length < 4) return;
    setSaving(true);

    try {
      // 1. Vérification du code PIN en direct
      const { data: userValid, error: pinError } = await supabase
        .from('utilisateurs')
        .select('id')
        .eq('id', selectedEmploye.id)
        .eq('pin_pointage', pinInput.trim())
        .maybeSingle();

      if (pinError || !userValid) {
        Alert.alert("Code PIN Incorrect ❌", "Veuillez saisir votre code à 4 chiffres valide.");
        setSaving(false);
        return;
      }

      // Formatage de la date et de l'heure exacte
      const exactTimeNow = new Date().toISOString(); 
      const todayStr = exactTimeNow.split('T')[0];

      if (!selectedEmploye.dejaArrive) {
        // --- 🟢 CAS 1 : ARRIVÉE (CLOCK-IN) ---
        const { error } = await supabase
          .from('pointage_personnel')
          .insert([{ 
            employe_id: selectedEmploye.id,
            date_jour: todayStr,
            heure_entree: exactTimeNow, // 🚀 Heure d'entrée enregistrée ici
            photo_entree_url: 'pointage_standard',
            statut: 'present'
          }]);

        if (error) {
           console.log("Erreur INSERT pointage :", error);
           throw new Error(error.message);
        }
        Alert.alert("Bonjour ! 👋", `Pointage d'entrée validé pour ${selectedEmploye.prenom}.`);

      } else {
        // --- 🔴 CAS 2 : DÉPART (CLOCK-OUT) ---
        const { error } = await supabase
          .from('pointage_personnel')
          .update({ heure_sortie: exactTimeNow }) // 🚀 Heure de sortie enregistrée ici
          .eq('employe_id', selectedEmploye.id)
          .eq('date_jour', todayStr);

        if (error) {
           console.log("Erreur UPDATE pointage :", error);
           throw new Error(error.message);
        }
        Alert.alert("Bonne soirée ! 🏠", `Pointage de sortie validé pour ${selectedEmploye.prenom}.`);
      }

      setModalVisible(false);
      chargerEmployes();
    } catch (err) {
      Alert.alert("Erreur base de données", err.message || "Le serveur de pointage n'a pas pu répondre.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terminal de Pointage</Text>
        <Text style={styles.headerSub}>Sélectionnez votre profil pour badger</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#4CAF50" /></View>
      ) : (
        <FlatList
          data={employes}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            let statusText = "🔴 Absent (Badgez)";
            let statusColor = "#EF4444";

            if (item.dejaArrive) {
              statusText = "🟢 En Service";
              statusColor = "#10B981";
            }
            if (item.dejaParti) {
              statusText = "⚪ Journée Finie";
              statusColor = "#64748B";
            }

            return (
              <TouchableOpacity style={styles.employeeCard} onPress={() => declencherPointage(item)}>
                <View style={styles.avatarCircle}><Text style={{fontSize: 22}}>👩‍🏫</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.empName}>{item.prenom} {item.nom}</Text>
                  <Text style={styles.empRole}>Poste : {item.role.toUpperCase()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODALE CLAVIER PIN ANTI-TRICHE */}
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Validation de présence</Text>
              <Text style={styles.modalSub}>{selectedEmploye?.prenom} {selectedEmploye?.nom}</Text>
              
              <Text style={styles.pinLabel}>Entrez votre code secret PIN :</Text>
              <TextInput 
                style={styles.pinInput}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="••••"
                placeholderTextColor="#CBD5E1"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
              />

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#94A3B8' }]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.btnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.btn, { backgroundColor: selectedEmploye?.dejaArrive ? '#EF4444' : '#10B981' }]} 
                  onPress={executerPointageBdd}
                  disabled={processing || pinInput.length < 4}
                >
                  {processing ? <ActivityIndicator color="#FFF"/> : <Text style={styles.btnText}>{selectedEmploye?.dejaArrive ? 'Signaler Sortie 🚪' : 'Confirmer Entrée 🔒'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 24, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  headerSub: { fontSize: 13, color: '#94A3B8', marginTop: 4, fontWeight: '600' },
  listContainer: { padding: 20 },
  employeeCard: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  avatarCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  empName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  empRole: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  modalSub: { fontSize: 15, fontWeight: '700', color: '#4F46E5', marginTop: 2, marginBottom: 15 },
  pinLabel: { fontSize: 13, color: '#64748B', fontWeight: '700', marginBottom: 10 },
  pinInput: { backgroundColor: '#F8FAFC', width: '60%', textAlign: 'center', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: 10, marginBottom: 20 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14 }
});