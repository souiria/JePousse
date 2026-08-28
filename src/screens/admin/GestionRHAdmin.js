import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function GestionRHAdminScreen() {
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  
  // États formulaire
  const [titre, setTitre] = useState('');
  const [montant, setMontant] = useState('');
  const [categorie, setCategorie] = useState('Salaire');

  useEffect(() => { fetchDepenses(); }, []);

  const fetchDepenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('depenses')
      .select('*')
      .order('date_creation', { ascending: false });
    if (data) setDepenses(data);
    setLoading(false);
  };

  const ajouterDepense = async () => {
    if (!titre || !montant) { Alert.alert("Erreur", "Remplissez tous les champs."); return; }
    
    setLoading(true);
    const { error } = await supabase.from('depenses').insert([{
      titre,
      montant: parseFloat(montant),
      categorie
    }]);

    if (error) { Alert.alert("Erreur", error.message); }
    else {
      Alert.alert("Succès", "Dépense enregistrée");
      setModalVisible(false);
      setTitre(''); setMontant('');
      fetchDepenses();
    }
    setLoading(false);
  };

  const total = depenses.reduce((acc, curr) => acc + parseFloat(curr.montant), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestion RH & Dépenses</Text>
        <Text style={styles.totalText}>Total : {total.toFixed(2)} Dhs</Text>
      </View>

      <FlatList
        data={depenses}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.cardTitle}>{item.titre}</Text>
              <Text style={styles.cardCat}>{item.categorie}</Text>
            </View>
            <Text style={styles.cardMontant}>{item.montant} Dhs</Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ Ajouter</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouvelle Dépense</Text>
            <TextInput style={styles.input} placeholder="Libellé (ex: Salaire Nounou)" value={titre} onChangeText={setTitre} />
            <TextInput style={styles.input} placeholder="Montant" value={montant} onChangeText={setMontant} keyboardType="numeric" />
            
            <View style={styles.catRow}>
              {['Salaire', 'Loyer', 'Nourriture', 'Fournitures', 'Autre'].map(c => (
                <TouchableOpacity key={c} style={[styles.catBtn, categorie === c && styles.catBtnActive]} onPress={() => setCategorie(c)}>
                  <Text style={categorie === c ? styles.catTextActive : styles.catText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={ajouterDepense} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Valider</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E2E8F0' },
  title: { fontSize: 22, fontWeight: 'bold' },
  totalText: { fontSize: 18, color: '#E91E63', fontWeight: 'bold', marginTop: 5 },
  card: { backgroundColor: '#FFF', margin: 10, padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardTitle: { fontWeight: 'bold', fontSize: 16 },
  cardCat: { color: '#64748B', fontSize: 12 },
  cardMontant: { fontWeight: 'bold', fontSize: 16, color: '#10B981' },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#E91E63', padding: 20, borderRadius: 30, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', padding: 12, borderRadius: 8, marginBottom: 15 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  catBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F1F5F9', marginRight: 5, marginBottom: 5 },
  catBtnActive: { backgroundColor: '#E91E63' },
  catText: { fontSize: 12 },
  catTextActive: { color: '#FFF', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#E91E63', padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold' },
  cancelText: { textAlign: 'center', marginTop: 15, color: '#64748B' }
});