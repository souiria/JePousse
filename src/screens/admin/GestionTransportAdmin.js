import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

export default function GestionTransportAdminScreen() {
  const [enfantsTransport, setEnfantsTransport] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const moisNoms = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];
  const moisNomsCal = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const moisActuelStr = moisNomsCal[new Date().getMonth()]; 
  
  const [moisSaisi, setMoisSaisi] = useState(moisNoms.includes(moisActuelStr) ? moisActuelStr : 'Septembre');
  const [nomCreche, setNomCreche] = useState('La Crèche');
  
  const [modalEditVisible, setModalEditVisible] = useState(false);
  const [selectedEnfant, setSelectedEnfant] = useState(null);
  const [editHeure, setEditHeure] = useState('');
  const [editPoint, setEditPoint] = useState('');
  const [editStatus, setEditStatus] = useState(true);
  const [saving, setSaving] = useState(false);

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;

  useEffect(() => {
    fetchParametres();
    chargerDonneesTransport();
  }, [moisSaisi]);

  const fetchParametres = async () => {
    try {
      const { data } = await supabase.from('parametres').select('valeur').eq('cle', 'nom_creche').single();
      if (data) setNomCreche(data.valeur);
    } catch (e) { console.log(e); }
  };

  const chargerDonneesTransport = async () => {
    setLoading(true);
    try {
      // 1. Extraction stricte des factures de transport du mois
      const { data: facturesData, error: facturesError } = await supabase
        .from('paiements')
        .select('id, enfant_id, statut')
        .ilike('titre', `Transport - ${moisSaisi}%`);

      if (facturesError) throw facturesError;

      if (!facturesData || facturesData.length === 0) {
        setEnfantsTransport([]);
        setLoading(false);
        return;
      }

      const enfantIdsAvecFacture = facturesData.map(f => f.enfant_id);

      // 2. On cible UNIQUEMENT les enfants facturés
      const { data: enfantsData, error: enfantsError } = await supabase
        .from('enfants')
        .select('id, prenom, nom, classe, point_ramassage, heure_ramassage, inscrit_transport')
        .in('id', enfantIdsAvecFacture)
        .order('heure_ramassage', { ascending: true });

      if (enfantsError) throw enfantsError;

      const enfantIds = enfantsData.map(e => e.id);

      // 🚀 3. NOUVEAU : Récupération des absences prévues à partir d'aujourd'hui
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: absencesData } = await supabase
        .from('planning_presences')
        .select('enfant_id, date_absence')
        .in('enfant_id', enfantIds)
        .gte('date_absence', todayStr)
        .order('date_absence', { ascending: true });

      // 4. Fusion des données
      const donneesFusionnees = enfantsData.map(enfant => {
        const factureMois = facturesData.find(f => f.enfant_id === enfant.id);
        
        // Extraction des dates d'absence pour cet enfant
        const absencesEnfant = absencesData?.filter(a => a.enfant_id === enfant.id).map(a => a.date_absence.split('-').reverse().join('/')) || [];
        const absencesTexte = absencesEnfant.length > 0 ? absencesEnfant.join(', ') : null;
        
        let statutPaiement = 'Impayé';
        let statutColor = '#EF4444'; 

        if (factureMois) {
          if (factureMois.statut === 'paye') {
            statutPaiement = 'Payé';
            statutColor = '#10B981';
          } else if (factureMois.statut === 'en_verification') {
            statutPaiement = 'Vérification 👀';
            statutColor = '#8B5CF6';
          }
        }

        return { ...enfant, statutPaiement, statutColor, absencesTexte };
      });

      setEnfantsTransport(donneesFusionnees);
    } catch (error) {
      console.log("Erreur logistique transport filtré :", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ouvrirConfiguration = (enfant) => {
    setSelectedEnfant(enfant);
    setEditHeure(enfant.heure_ramassage ? enfant.heure_ramassage.slice(0, 5) : '07:30');
    setEditPoint(enfant.point_ramassage || '');
    setEditStatus(enfant.inscrit_transport);
    setModalEditVisible(true);
  };

  const sauvegarderLogistique = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('enfants')
        .update({
          heure_ramassage: editHeure ? `${editHeure}:00` : null,
          point_ramassage: editPoint || null,
          inscrit_transport: editStatus
        })
        .eq('id', selectedEnfant.id);

      if (error) throw error;
      
      Alert.alert("Succès ✅", "Logistique mise à jour.");
      setModalEditVisible(false);
      chargerDonneesTransport();
    } catch (e) {
      Alert.alert("Erreur", "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  };

  const imprimerListeChauffeur = async () => {
    if (enfantsTransport.length === 0) return;
    try {
      let logoUri = '';
      try {
        const asset = Asset.fromModule(selectedLogo);
        await asset.downloadAsync();
        logoUri = asset.localUri || asset.uri;
        if (Platform.OS === 'web' && logoUri.startsWith('/')) logoUri = window.location.origin + logoUri;
      } catch (e) {}

      // 🚀 INJECTION DES ABSENCES DANS LE PDF A4
      const rowsHtml = enfantsTransport.map(enfant => `
        <tr>
          <td style="padding:12px; border:1px solid #CBD5E1; font-weight:bold;">${enfant.heure_ramassage ? enfant.heure_ramassage.slice(0, 5) : '--:--'}</td>
          <td style="padding:12px; border:1px solid #CBD5E1;">
            <b>${enfant.prenom} ${enfant.nom}</b><br>
            <small style="color:#64748B">${enfant.classe || 'Crèche'}</small>
            ${enfant.absencesTexte ? `<br><span style="color:#EF4444; font-weight:bold; font-size:11px;">🚨 Absent le : ${enfant.absencesTexte}</span>` : ''}
          </td>
          <td style="padding:12px; border:1px solid #CBD5E1; color:#334155;">${enfant.point_ramassage || 'Non configuré'}</td>
          <td style="padding:12px; border:1px solid #CBD5E1; color:${enfant.statutColor}; font-weight:bold; font-size:11px;">${enfant.statutPaiement.toUpperCase()}</td>
          <td style="border:1px solid #CBD5E1; text-align:center; font-size:18px; color:#CBD5E1;">${enfant.absencesTexte ? '❌' : '☐'}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:30px;color:#0F172A;}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #3F51B5;padding-bottom:15px;}table{width:100%;border-collapse:collapse;margin-top:25px;}th{background-color:#F1F5F9;color:#1E293B;font-weight:bold;padding:12px;border:1px solid #CBD5E1;font-size:11px;text-transform:uppercase;text-align:left;}</style></head>
        <body>
          <div class="header">
            <div><h2>${nomCreche.toUpperCase()}</h2><p style="color:#64748B; margin:0;">Circuit de Transport - Fiche Chauffeur</p></div>
            <div style="text-align:right;"><h3>MOIS : ${moisSaisi.toUpperCase()}</h3></div>
          </div>
          <table>
            <thead><tr><th width="12%">Heure</th><th width="33%">Élève</th><th width="35%">Point de Ramassage</th><th width="12%">Finances</th><th width="8%" style="text-align:center;">Pris</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const pWin = window.open('', '_blank');
        if (pWin) { pWin.document.write(htmlContent); pWin.document.close(); pWin.focus(); setTimeout(() => { pWin.print(); pWin.close(); }, 300); }
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        await Sharing.shareAsync(uri);
      }
    } catch (e) { Alert.alert("Erreur", "Impression échouée."); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transport Scolaire</Text>
        <Text style={styles.headerSub}>Analyse financière & Logistique des bus</Text>
      </View>

      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Sélection du mois :</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={moisSaisi} onValueChange={setMoisSaisi} style={styles.picker}>
            {moisNoms.map(m => <Picker.Item key={m} label={m} value={m} />)}
          </Picker>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3F51B5" /></View>
      ) : enfantsTransport.length === 0 ? (
        <View style={styles.center}>
          <Text style={{fontSize: 45, marginBottom: 10}}>🚌</Text>
          <Text style={styles.emptyText}>Aucun abonné actif trouvé pour le mois de {moisSaisi}.</Text>
        </View>
      ) : (
        <View style={{flex: 1}}>
          <FlatList
            data={enfantsTransport}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}><Text style={{fontSize: 20}}>👶</Text></View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.nomEnfant}>{item.prenom} {item.nom}</Text>
                    <Text style={styles.classeEnfant}>Classe: {item.classe || 'Crèche'}</Text>
                    
                    {/* 🚀 AFFICHAGE DE L'ABSENCE DANS L'APP ADMIN */}
                    {item.absencesTexte && (
                      <Text style={styles.absenceAlert}>🚨 Absent le: {item.absencesTexte}</Text>
                    )}
                  </View>
                  
                  <TouchableOpacity style={styles.btnEditConfig} onPress={() => ouvrirConfiguration(item)}>
                    <Text style={{fontSize: 16}}>✏️</Text>
                  </TouchableOpacity>

                  <View style={[styles.badgePaiement, { backgroundColor: item.statutColor + '15' }]}>
                    <Text style={[styles.badgeTextPaiement, { color: item.statutColor }]}>{item.statutPaiement}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.logistiqueRow}>
                  <View style={styles.logistiqueBox}>
                    <Text style={styles.logistiqueLabel}>Heure Tournée</Text>
                    <Text style={styles.logistiqueValue}>⏰ {item.heure_ramassage ? item.heure_ramassage.slice(0, 5) : '--:--'}</Text>
                  </View>
                  <View style={[styles.logistiqueBox, { flex: 1.5, marginLeft: 10 }]}>
                    <Text style={styles.logistiqueLabel}>Point de ralliement</Text>
                    <Text style={styles.logistiqueValue} numberOfLines={2}>📍 {item.point_ramassage || 'Non configuré'}</Text>
                  </View>
                </View>
              </View>
            )}
          />
          <View style={styles.footerPrint}>
            <TouchableOpacity style={styles.printBtn} onPress={imprimerListeChauffeur}>
              <Text style={styles.printBtnText}>🖨️ Générer le PDF Chauffeur ({moisSaisi})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODALE DE RE-CONFIGURATION LOGISTIQUE */}
      <Modal visible={modalEditVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: Platform.OS === 'ios' ? 40 : 20 }]}>
              <Text style={styles.modalTitle}>Configuration Logistique</Text>
              <Text style={styles.modalSubtitle}>🧒 {selectedEnfant?.prenom} {selectedEnfant?.nom}</Text>
              
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Heure de ramassage (Format HH:MM)</Text>
                <TextInput style={styles.input} value={editHeure} onChangeText={setEditHeure} placeholder="Ex: 07:45" placeholderTextColor="#94A3B8" maxLength={5} />

                <Text style={styles.label}>Point de RDV / Ramassage</Text>
                <TextInput style={[styles.input, {minHeight: 60}]} value={editPoint} onChangeText={setEditPoint} placeholder="Ex: Devant la pharmacie Al-Amal..." placeholderTextColor="#94A3B8" multiline />

                <Text style={styles.label}>Statut d'inscription au bus</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={editStatus} onValueChange={(val) => setEditStatus(val)}>
                    <Picker.Item label="🟢 Actif (Prend le bus)" value={true} />
                    <Picker.Item label="🔴 Désactivé (Pas de transport)" value={false} />
                  </Picker>
                </View>
              </ScrollView>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#94A3B8' }]} onPress={() => setModalEditVisible(false)}>
                  <Text style={styles.btnTextWhite}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#3F51B5' }]} onPress={sauvegarderLogistique} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Enregistrer</Text>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { backgroundColor: '#FFFFFF', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  headerSub: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 2 },
  filtersContainer: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center' },
  filterLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginRight: 10 },
  pickerWrapper: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8, height: 40, justifyContent: 'center' },
  picker: { height: 40 },
  listContainer: { padding: 15, paddingBottom: 100 },
  emptyText: { fontSize: 14, color: '#64748B', fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  nomEnfant: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  classeEnfant: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  absenceAlert: { fontSize: 11, color: '#EF4444', fontWeight: 'bold', marginTop: 4 },
  btnEditConfig: { padding: 10, backgroundColor: '#F1F5F9', borderRadius: 10, marginRight: 10 },
  badgePaiement: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTextPaiement: { fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  logistiqueRow: { flexDirection: 'row' },
  logistiqueBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  logistiqueLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  logistiqueValue: { fontSize: 13, color: '#0F172A', fontWeight: 'bold' },
  footerPrint: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  printBtn: { backgroundColor: '#3F51B5', padding: 16, borderRadius: 14, alignItems: 'center' },
  printBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },

  // Styles modale
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#64748B', fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, color: '#0F172A' },
  pickerContainer: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  btnTextWhite: { color: '#FFF', fontWeight: 'bold' }
});