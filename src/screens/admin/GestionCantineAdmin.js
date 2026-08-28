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

export default function GestionCantineAdminScreen() {
  const [enfantsCantine, setEnfantsCantine] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const moisNoms = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];
  const moisNomsCal = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const moisActuelStr = moisNomsCal[new Date().getMonth()]; 
  
  const [moisSaisi, setMoisSaisi] = useState(moisNoms.includes(moisActuelStr) ? moisActuelStr : 'Septembre');
  const [nomCreche, setNomCreche] = useState('La Crèche');
  
  const [modalEditVisible, setModalEditVisible] = useState(false);
  const [selectedEnfant, setSelectedEnfant] = useState(null);
  const [editAllergie, setEditAllergie] = useState('');
  const [saving, setSaving] = useState(false);

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;

  useEffect(() => {
    fetchParametres();
    chargerDonneesCantine();
  }, [moisSaisi]);

  const fetchParametres = async () => {
    try {
      const { data } = await supabase.from('parametres').select('valeur').eq('cle', 'nom_creche').single();
      if (data) setNomCreche(data.valeur);
    } catch (e) { console.log(e); }
  };

  const chargerDonneesCantine = async () => {
    setLoading(true);
    try {
      const { data: facturesData, error: facturesError } = await supabase
        .from('paiements')
        .select('id, enfant_id, statut')
        .ilike('titre', `Cantine - ${moisSaisi}%`);

      if (facturesError) throw facturesError;

      if (!facturesData || facturesData.length === 0) {
        setEnfantsCantine([]);
        setLoading(false);
        return;
      }

      const enfantIdsAvecFacture = facturesData.map(f => f.enfant_id);

      const { data: enfantsData, error: enfantsError } = await supabase
        .from('enfants')
        .select('id, prenom, nom, classe, details_allergie, remarques_medicales')
        .in('id', enfantIdsAvecFacture)
        .order('classe', { ascending: true });

      if (enfantsError) throw enfantsError;

      // 🚀 NOUVEAU : Récupération des absences prévues à partir d'aujourd'hui
      const enfantIds = enfantsData.map(e => e.id);
      const todayStr = new Date().toISOString().split('T')[0];
      
      const { data: absencesData } = await supabase
        .from('planning_presences')
        .select('enfant_id, date_absence')
        .in('enfant_id', enfantIds)
        .gte('date_absence', todayStr)
        .order('date_absence', { ascending: true });

      const donneesFusionnees = enfantsData.map(enfant => {
        const factureMois = facturesData.find(f => f.enfant_id === enfant.id);
        
        // Extraction des dates d'absence
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

      setEnfantsCantine(donneesFusionnees);
    } catch (error) {
      console.log("Erreur chargement cantine :", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ouvrirConfiguration = (enfant) => {
    setSelectedEnfant(enfant);
    setEditAllergie(enfant.details_allergie || enfant.remarques_medicales || '');
    setModalEditVisible(true);
  };

  const sauvegarderLogistique = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('enfants')
        .update({
          details_allergie: editAllergie || null,
          a_allergie: editAllergie.length > 0
        })
        .eq('id', selectedEnfant.id);

      if (error) throw error;
      
      Alert.alert("Mis à jour ✅", "Le profil de restauration a bien été modifié.");
      setModalEditVisible(false);
      chargerDonneesCantine();
    } catch (e) {
      Alert.alert("Erreur", "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  };

  const imprimerListeCuisine = async () => {
    if (enfantsCantine.length === 0) return;
    try {
      let logoUri = '';
      try {
        const asset = Asset.fromModule(selectedLogo);
        await asset.downloadAsync();
        logoUri = asset.localUri || asset.uri;
        if (Platform.OS === 'web' && logoUri.startsWith('/')) logoUri = window.location.origin + logoUri;
      } catch (e) {}

      // 🚀 INJECTION DES ABSENCES DANS LE PDF DE CANTINE
      const rowsHtml = enfantsCantine.map(enfant => `
        <tr>
          <td style="padding:12px; border:1px solid #CBD5E1;">
            <b>${enfant.prenom} ${enfant.nom}</b>
            ${enfant.absencesTexte ? `<br><span style="color:#EF4444; font-weight:bold; font-size:11px;">🚨 Absent le : ${enfant.absencesTexte}</span>` : ''}
          </td>
          <td style="padding:12px; border:1px solid #CBD5E1; font-weight: bold; color:#475569;">${enfant.classe || 'Crèche'}</td>
          <td style="padding:12px; border:1px solid #CBD5E1; color:${enfant.details_allergie ? '#DC2626' : '#1E293B'}; font-weight:${enfant.details_allergie ? 'bold' : 'normal'};">
            ${enfant.details_allergie || '⚠️ Aucun régime spécifique'}
          </td>
          <td style="padding:12px; border:1px solid #CBD5E1; color:${enfant.statutColor}; font-weight:bold; font-size:11px;">${enfant.statutPaiement.toUpperCase()}</td>
          <td style="border:1px solid #CBD5E1; text-align:center; font-size:18px; color:#CBD5E1;">${enfant.absencesTexte ? '❌' : '☐'}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:30px;color:#0F172A;}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #E91E63;padding-bottom:15px;}table{width:100%;border-collapse:collapse;margin-top:25px;}th{background-color:#F1F5F9;color:#1E293B;font-weight:bold;padding:12px;border:1px solid #CBD5E1;font-size:11px;text-transform:uppercase;text-align:left;}</style></head>
        <body>
          <div class="header">
            <div><h2>${nomCreche.toUpperCase()}</h2><p style="color:#64748B; margin:0;">Registre Restauration & Cantine</p></div>
            <div style="text-align:right;"><h3>MOIS : ${moisSaisi.toUpperCase()}</h3></div>
          </div>
          <table>
            <thead><tr><th width="30%">Élève</th><th width="15%">Classe</th><th width="35%">Régime / Allergies</th><th width="12%">Finances</th><th width="8%" style="text-align:center;">Servi</th></tr></thead>
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
        <Text style={styles.headerTitle}>Restauration & Cantine</Text>
        <Text style={styles.headerSub}>Suivi des abonnés repas du midi</Text>
      </View>

      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Filtrer par mois :</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={moisSaisi} onValueChange={setMoisSaisi} style={styles.picker}>
            {moisNoms.map(m => <Picker.Item key={m} label={m} value={m} />)}
          </Picker>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#E91E63" /></View>
      ) : enfantsCantine.length === 0 ? (
        <View style={styles.center}>
          <Text style={{fontSize: 45, marginBottom: 10}}>🍽️</Text>
          <Text style={styles.emptyText}>Aucun rationnaire actif trouvé pour {moisSaisi}.</Text>
        </View>
      ) : (
        <View style={{flex: 1}}>
          <FlatList
            data={enfantsCantine}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, { backgroundColor: '#FCE4EC' }]}><Text style={{fontSize: 20}}>🍲</Text></View>
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
                <View style={styles.logistiqueBox}>
                  <Text style={styles.logistiqueLabel}>Régime spécifique & Sécurité alimentaire</Text>
                  <Text style={[styles.logistiqueValue, { color: item.details_allergie ? '#EF4444' : '#1E293B' }]}>
                    ⚠️ {item.details_allergie || 'Aucune contre-indication signalée'}
                  </Text>
                </View>
              </View>
            )}
          />
          <View style={styles.footerPrint}>
            <TouchableOpacity style={[styles.printBtn, { backgroundColor: '#E91E63' }]} onPress={imprimerListeCuisine}>
              <Text style={styles.printBtnText}>🖨️ Liste Émargement Cuisine ({moisSaisi})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODALE DE RE-CONFIGURATION REPAS / ALLERGIES */}
      <Modal visible={modalEditVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: Platform.OS === 'ios' ? 40 : 20 }]}>
              <Text style={styles.modalTitle}>Régime Alimentaire</Text>
              <Text style={styles.modalSubtitle}>🧒 {selectedEnfant?.prenom} {selectedEnfant?.nom}</Text>
              
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Consignes de cuisine, allergies ou restrictions :</Text>
                <TextInput 
                  style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]} 
                  value={editAllergie} 
                  onChangeText={setEditAllergie} 
                  placeholder="Ex: Pas de viande (Végétarien), Sans sel, Sans arachides..." 
                  placeholderTextColor="#94A3B8" 
                  multiline 
                />
              </ScrollView>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#94A3B8' }]} onPress={() => setModalEditVisible(false)}>
                  <Text style={styles.btnTextWhite}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E91E63' }]} onPress={sauvegarderLogistique} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Sauvegarder</Text>}
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
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  nomEnfant: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  classeEnfant: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  absenceAlert: { fontSize: 11, color: '#EF4444', fontWeight: 'bold', marginTop: 4 },
  btnEditConfig: { padding: 10, backgroundColor: '#F1F5F9', borderRadius: 10, marginRight: 10 },
  badgePaiement: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTextPaiement: { fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  logistiqueBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  logistiqueLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  logistiqueValue: { fontSize: 13, fontWeight: 'bold', lineHeight: 18 },
  footerPrint: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  printBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  printBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#64748B', fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, color: '#0F172A' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  btnTextWhite: { color: '#FFF', fontWeight: 'bold' }
});