import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function MesEnfantsScreen() {
  const [enfants, setEnfants] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [enfantEditId, setEnfantEditId] = useState(null);
  const [enfantPrenom, setEnfantPrenom] = useState(''); 
  const [remarquesEdit, setRemarquesEdit] = useState('');

  useEffect(() => { fetchMesEnfants(); }, []);

  const fetchMesEnfants = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Chercher d'abord les enfants directement liés par 'parent_id'
      const { data: enfantsDirects } = await supabase
        .from('enfants')
        .select('*')
        .eq('parent_id', user.id);

      // 2. Chercher le code attribué au parent
      const { data: parentData } = await supabase
        .from('utilisateurs')
        .select('code_parent')
        .eq('id', user.id)
        .maybeSingle();

      // 3. Construire une requête très large pour ne rater aucun frère/soeur
      let conditionsOr = [`parent_id.eq.${user.id}`];

      if (parentData?.code_parent) {
        conditionsOr.push(`code_parent.eq.${parentData.code_parent}`);
      }

      // La magie opère ici : On utilise les infos d'Adam pour trouver Amine
      if (enfantsDirects && enfantsDirects.length > 0) {
        enfantsDirects.forEach(enfant => {
          if (enfant.famille_id) conditionsOr.push(`famille_id.eq.${enfant.famille_id}`);
          if (enfant.code_parent) conditionsOr.push(`code_parent.eq.${enfant.code_parent}`);
        });
      }

      // Nettoyage des doublons dans la chaîne de recherche
      const finalOrString = [...new Set(conditionsOr)].join(',');

      // 4. Requête finale à Supabase
      const { data: tousLesEnfants, error } = await supabase
        .from('enfants')
        .select('*')
        .or(finalOrString);

      if (!error && tousLesEnfants) {
        // Sécurité frontend : empêcher qu'un enfant n'apparaisse deux fois à l'écran
        const enfantsUniques = tousLesEnfants.reduce((acc, current) => {
          const exists = acc.find(item => item.id === current.id);
          if (!exists) return acc.concat([current]);
          return acc;
        }, []);
        
        setEnfants(enfantsUniques);
      } else {
        console.error("Erreur requête enfants:", error);
      }

    } catch (error) { 
      console.error("Erreur chargement enfants :", error); 
    } finally { 
      setLoading(false); 
    }
  };

  const ouvrirModalEdition = (enfant) => {
    setEnfantEditId(enfant.id);
    setEnfantPrenom(enfant.prenom); 
    setRemarquesEdit(enfant.remarques_medicales || '');
    setModalVisible(true);
  };

  const sauvegarderRemarques = async () => {
    try {
      const valeurFinale = remarquesEdit.trim() === '' ? null : remarquesEdit;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Vous n'êtes pas connecté.");
      
      await supabase.from('enfants').update({ remarques_medicales: valeurFinale }).eq('id', enfantEditId);

      const { data: adminData } = await supabase.from('utilisateurs').select('*').eq('role', 'admin').limit(1).maybeSingle();

      if (adminData) {
        const messagesDB = [];
        const messagesPush = [];

        messagesDB.push({
          expediteur_id: user.id,
          destinataire_id: adminData.id,
          texte: `⚠️ [Alerte Automatique] Mise à jour médicale pour ${enfantPrenom} :\n\n${valeurFinale ? valeurFinale : 'Dossier vidé (Aucune consigne).'}`
        });

        if (adminData.expo_push_token) {
          messagesPush.push({
            to: adminData.expo_push_token,
            sound: 'default',
            title: 'Dossier Médical Modifié ⚠️',
            body: `Les parents de ${enfantPrenom} ont mis à jour les consignes de santé.`,
            data: { tab: 'messagerie' }
          });
        }

        if (messagesDB.length > 0) {
          const { error: msgErr } = await supabase.from('messages').insert(messagesDB);
          if (msgErr) console.log("Erreur BD:", msgErr);
        }

        if (messagesPush.length > 0) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messagesPush),
          });
        }
      }

      setModalVisible(false);
      fetchMesEnfants();

      if (Platform.OS === 'web') {
        window.alert("Succès : Le dossier a été mis à jour et la direction a été notifiée !");
      } else {
        Alert.alert("Succès", "Dossier mis à jour et direction notifiée par message !");
      }

    } catch (error) { 
      if (Platform.OS === 'web') {
        window.alert("Erreur : Impossible de mettre à jour le dossier.");
      } else {
        Alert.alert("Erreur", "Impossible de mettre à jour le dossier."); 
      }
    }
  };

  const renderEnfant = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.headerCard}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}><Text style={styles.iconEnfant}>👦</Text></View>
        )}
        <View style={styles.infoName}>
          <Text style={styles.nom}>{item.prenom} {item.nom}</Text>
          <Text style={styles.date}>🎂 Né(e) le : {item.date_naissance || 'Non renseigné'}</Text>
          {/* NOUVEAU : Affichage de la classe de l'enfant */}
          <Text style={styles.classeText}>🏫 Classe : {item.classe || 'Non définie'}</Text>
        </View>
      </View>

      {item.remarques_medicales ? (
        <View style={styles.medicalBox}>
          <Text style={styles.medicalTitle}>⚠️ Remarques / Allergies :</Text>
          <Text style={styles.medicalText}>{item.remarques_medicales}</Text>
          <TouchableOpacity style={styles.editBtn} onPress={() => ouvrirModalEdition(item)}>
            <Text style={styles.editBtnText}>✏️ Mettre à jour</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.okBox}>
          <Text style={styles.okText}>✅ Aucune consigne médicale.</Text>
          <TouchableOpacity style={styles.editBtnOk} onPress={() => ouvrirModalEdition(item)}>
            <Text style={styles.editBtnTextOk}>+ Signaler</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      <Text style={styles.footerText}>Developped by Abderrahim S © 2026</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      
      <View style={styles.headerContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoIcon}>🎒</Text>
        </View>
        <Text style={styles.title}>Dossier Enfants</Text>
        <Text style={styles.subtitle}>Gérez les informations médicales</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 50 }} />
      ) : enfants.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={styles.emptyText}>Aucun enfant n'est encore lié à votre compte.</Text>
        </View>
      ) : (
        <FlatList 
          data={enfants} 
          keyExtractor={item => item.id.toString()} 
          renderItem={renderEnfant} 
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={renderFooter}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Dossier Médical</Text>
              <Text style={styles.label}>Allergies, médicaments, ou recommandations :</Text>
              
              <TextInput 
                style={styles.input} 
                value={remarquesEdit} 
                onChangeText={setRemarquesEdit} 
                multiline 
                placeholder="Laissez vide s'il n'y a aucune remarque" 
                placeholderTextColor="#94A3B8"
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.buttonTextWhite}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={sauvegarderRemarques}>
                  <Text style={styles.buttonTextWhite}>Enregistrer</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerContainer: { alignItems: 'center', marginBottom: 20, paddingTop: 20 },
  logoCircle: { width: 60, height: 60, backgroundColor: '#EEF2FF', borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 10, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  logoIcon: { fontSize: 30 },
  title: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 2 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  emptyText: { textAlign: 'center', color: '#94A3B8', fontSize: 16, fontStyle: 'italic' },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  headerCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  photo: { width: 60, height: 60, borderRadius: 30, marginRight: 15 },
  photoPlaceholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  iconEnfant: { fontSize: 30 },
  infoName: { flex: 1 },
  nom: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  date: { fontSize: 13, color: '#64748B', marginTop: 4 },
  
  // -- NOUVEAU STYLE POUR LA CLASSE --
  classeText: { fontSize: 13, color: '#8B5CF6', fontWeight: '700', marginTop: 4 },
  
  medicalBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  medicalTitle: { fontSize: 13, fontWeight: 'bold', color: '#B91C1C', marginBottom: 4 },
  medicalText: { fontSize: 14, color: '#991B1B', marginBottom: 12 },
  editBtn: { alignSelf: 'flex-end', backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  editBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  okBox: { backgroundColor: '#ECFDF5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  okText: { flex: 1, fontSize: 13, color: '#059669', fontWeight: '500' },
  editBtnOk: { backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  editBtnTextOk: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 15, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '500', color: '#475569', marginBottom: 10 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, minHeight: 120, textAlignVertical: 'top', fontSize: 15, color: '#334155' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  button: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#94A3B8' },
  confirmButton: { backgroundColor: '#4F46E5' },
  buttonTextWhite: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' }
});