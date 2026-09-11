import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function ReglagesAdminScreen() {
  const [banques, setBanques] = useState([]);
  const [nomBanque, setNomBanque] = useState('');
  const [rib, setRib] = useState('');

  const [modalAnneeVisible, setModalAnneeVisible] = useState(false);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [loadingGeneration, setLoadingGeneration] = useState(false);
  
  const [tousLesEnfants, setTousLesEnfants] = useState([]);
  const [enfantsSelectionnes, setEnfantsSelectionnes] = useState([]); 

  const [anneeActive, setAnneeActive] = useState('');
  const [loadingAnnee, setLoadingAnnee] = useState(false);

  // Générer une liste d'années pour le menu déroulant (Picker)
  const anneesDisponibles = Array.from(new Array(6), (val, index) => {
    const year = new Date().getFullYear() - 2 + index; // Ex: 2024, 2025, 2026...
    return `${year}-${year + 1}`;
  });

  useEffect(() => { 
    fetchBanques(); 
    fetchAnneeActive(); 
    
    // Par défaut, l'année de génération est l'année prochaine
    const currentYear = new Date().getFullYear();
    setAnneeScolaire(`${currentYear}-${currentYear + 1}`);
  }, []);

  const fetchAnneeActive = async () => {
    const { data } = await supabase.from('parametres').select('valeur').eq('cle', 'annee_active').maybeSingle();
    if (data) {
      setAnneeActive(data.valeur);
    } else {
      setAnneeActive(anneesDisponibles[2]); // Année en cours par défaut
    }
  };

  const sauvegarderAnneeActive = async () => {
    if (!anneeActive) return;
    setLoadingAnnee(true);
    try {
      const { error } = await supabase.from('parametres').upsert({ cle: 'annee_active', valeur: anneeActive });
      if (error) throw error;
      Alert.alert("Succès", `L'année active est maintenant ${anneeActive}. Les tableaux de bord utiliseront cette année.`);
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setLoadingAnnee(false);
    }
  };

  const fetchBanques = async () => {
    const { data } = await supabase.from('comptes_bancaires').select('*');
    if (data) setBanques(data);
  };

  const ajouterBanque = async () => {
    if (!nomBanque || !rib) return alert("Remplissez tous les champs.");
    const { error } = await supabase.from('comptes_bancaires').insert([{ nom_banque: nomBanque, rib: rib }]);
    if (!error) { setNomBanque(''); setRib(''); fetchBanques(); Alert.alert("Succès", "Compte bancaire ajouté !"); }
  };

  const supprimerBanque = async (id) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Voulez-vous vraiment supprimer ce compte bancaire ?")) {
        await supabase.from('comptes_bancaires').delete().eq('id', id);
        fetchBanques();
      }
    } else {
      Alert.alert(
        "Suppression",
        "Voulez-vous vraiment supprimer ce compte bancaire ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Supprimer", style: "destructive", onPress: async () => {
              await supabase.from('comptes_bancaires').delete().eq('id', id);
              fetchBanques();
          }}
        ]
      );
    }
  };

  const ouvrirModalNouvelleAnnee = async () => {
    setModalAnneeVisible(true);
    const { data } = await supabase.from('enfants').select('id, prenom, nom').order('nom', { ascending: true });
    if (data) {
      setTousLesEnfants(data);
      setEnfantsSelectionnes(data.map(e => e.id));
    }
  };

  const toggleEnfant = (id) => {
    if (enfantsSelectionnes.includes(id)) setEnfantsSelectionnes(enfantsSelectionnes.filter(eId => eId !== id)); 
    else setEnfantsSelectionnes([...enfantsSelectionnes, id]); 
  };

  const toutCocherDecocher = () => {
    if (enfantsSelectionnes.length === tousLesEnfants.length) setEnfantsSelectionnes([]); 
    else setEnfantsSelectionnes(tousLesEnfants.map(e => e.id)); 
  };

  // --- NOUVEAU : FONCTION DE CALCUL DE LA CLASSE ---
  const calculerClasse = (dateString, anneeSco) => {
    if (!dateString || dateString.length !== 10 || !anneeSco || !anneeSco.includes('-')) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const year = parseInt(parts[2], 10);

    const birthDate = new Date(year, month, day);
    if (isNaN(birthDate.getTime())) return null;

    const endYear = parseInt(anneeSco.split('-')[1], 10);
    const refDate = new Date(endYear, 2, 31);

    let ageInMonths = (refDate.getFullYear() - birthDate.getFullYear()) * 12;
    ageInMonths -= birthDate.getMonth();
    ageInMonths += refDate.getMonth();
    
    if (refDate.getDate() < birthDate.getDate()) {
      ageInMonths--;
    }

    if (ageInMonths < 24) return 'Crèche'; 
    if (ageInMonths >= 24 && ageInMonths < 36) return 'TPS'; 
    if (ageInMonths >= 36 && ageInMonths < 48) return 'PS'; 
    if (ageInMonths >= 48 && ageInMonths < 60) return 'MS'; 
    if (ageInMonths >= 60) return 'GS'; 
    
    return 'Crèche';
  };

  const genererNouvelleAnnee = async () => {
    if (!anneeScolaire) return alert("Veuillez choisir l'année à générer.");
    if (enfantsSelectionnes.length === 0) return alert("Veuillez sélectionner au moins un enfant.");

    setLoadingGeneration(true);
    try {
      // 1. Récupérer les données actuelles des enfants
      const { data: enfantsData, error: enfantsErr } = await supabase.from('enfants').select('*').in('id', enfantsSelectionnes); 
      if (enfantsErr) throw enfantsErr;

      // 2. DUPLIQUER les profils pour la nouvelle année et MISE À JOUR DE LA CLASSE
      const nouveauxEnfants = enfantsData.map(enfant => {
        // On retire l'ancien ID et la date de création pour que Supabase génère une NOUVELLE ligne
        const { id, date_creation, ...enfantSansId } = enfant; 
        
        // Calcul automatique de la nouvelle classe
        const nouvelleClasse = calculerClasse(enfant.date_naissance, anneeScolaire) || enfant.classe || 'Crèche';

        return {
          ...enfantSansId,
          annee_scolaire: anneeScolaire, // On assigne la nouvelle année
          classe: nouvelleClasse // On assigne la classe recalculée
        };
      });

      // 3. Insérer ces nouvelles "lignes" dans la base de données
      const { data: enfantsInseres, error: insertErr } = await supabase
        .from('enfants')
        .insert(nouveauxEnfants)
        .select(); 

      if (insertErr) throw insertErr;

      // 4. Générer les factures en utilisant les NOUVEAUX IDs
      let paiementsAGenerer = [];
      const moisScolaires = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];

      enfantsInseres.forEach(enfant => {
        if (enfant.tarif_inscription > 0) paiementsAGenerer.push({ parent_id: enfant.parent_id, enfant_id: enfant.id, titre: `Frais de Réinscription (${anneeScolaire})`, montant: enfant.tarif_inscription, type: 'inscription', statut: 'en_attente' });
        moisScolaires.forEach(mois => {
          if (enfant.tarif_mensuel > 0) paiementsAGenerer.push({ parent_id: enfant.parent_id, enfant_id: enfant.id, titre: `Scolarité - ${mois} (${anneeScolaire})`, mois: mois, montant: enfant.tarif_mensuel, type: 'scolarite', statut: 'en_attente' });
          if (enfant.tarif_cantine > 0) paiementsAGenerer.push({ parent_id: enfant.parent_id, enfant_id: enfant.id, titre: `Cantine - ${mois} (${anneeScolaire})`, mois: mois, montant: enfant.tarif_cantine, type: 'cantine', statut: 'en_attente' });
          if (enfant.tarif_transport > 0) paiementsAGenerer.push({ parent_id: enfant.parent_id, enfant_id: enfant.id, titre: `Transport - ${mois} (${anneeScolaire})`, mois: mois, montant: enfant.tarif_transport, type: 'transport', statut: 'en_attente' });
        });
      });

      // 5. Sauvegarder toutes les nouvelles factures liées aux nouveaux profils
      if (paiementsAGenerer.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < paiementsAGenerer.length; i += chunkSize) {
          const chunk = paiementsAGenerer.slice(i, i + chunkSize);
          const { error } = await supabase.from('paiements').insert(chunk);
          if (error) throw error;
        }
      }

      Alert.alert("✅ Succès !", `Les enfants ont bien été transférés pour l'année ${anneeScolaire} et leurs classes ont été mises à jour automatiquement en fonction de leur âge !`);
      setModalAnneeVisible(false);

    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoadingGeneration(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      
      {/* EN-TÊTE PREMIUM */}
      <View style={styles.headerContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoIcon}>⚙️</Text>
        </View>
        <Text style={styles.mainTitle}>Paramètres</Text>
        <Text style={styles.subtitle}>Configuration globale de la crèche</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* SECTION : ANNÉE ACTIVE */}
        <Text style={styles.sectionTitle}>📅 Année Scolaire Active</Text>
        <View style={styles.card}>
          <Text style={styles.cardInfo}>Choisissez l'année en cours. Cela permet de filtrer les affichages pour n'afficher que les historiques de l'année sélectionnée.</Text>
          <View style={styles.rowAlign}>
            
            <View style={[styles.pickerContainerWrapper, styles.inputFlex]}>
              <Picker
                selectedValue={anneeActive}
                onValueChange={(itemValue) => setAnneeActive(itemValue)}
                style={styles.picker}
              >
                {anneesDisponibles.map(annee => (
                  <Picker.Item key={annee} label={annee} value={annee} />
                ))}
              </Picker>
            </View>

            <TouchableOpacity style={styles.saveBtnActive} onPress={sauvegarderAnneeActive} disabled={loadingAnnee}>
              {loadingAnnee ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION : GÉNÉRATION NOUVELLE ANNÉE */}
        <Text style={[styles.sectionTitle, {color: '#8B5CF6'}]}>🚀 Préparer la rentrée prochaine</Text>
        <View style={[styles.card, {borderColor: '#8B5CF6', borderWidth: 1, backgroundColor: '#F9F5FF'}]}>
          <Text style={[styles.cardTitle, {color: '#6D28D9'}]}>Transférer les enfants vers une nouvelle année</Text>
          <Text style={styles.cardInfo}>Cela mettra à jour l'année scolaire et la classe des enfants sélectionnés et créera automatiquement leurs factures (Scolarité, Cantine, Transport) de Septembre à Juillet.</Text>
          <TouchableOpacity style={styles.generateBtn} onPress={ouvrirModalNouvelleAnnee}>
            <Text style={styles.generateBtnText}>Lancer la préparation de l'année</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION : COMPTES BANCAIRES */}
        <Text style={styles.sectionTitle}>🏦 Paramètres Bancaires (RIB)</Text>
        <View style={styles.card}>
          <TextInput 
            style={styles.input} 
            placeholder="Nom de la banque (Ex: CIH, Attijari...)" 
            placeholderTextColor="#94A3B8"
            value={nomBanque} 
            onChangeText={setNomBanque} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="Numéro de RIB (24 chiffres)" 
            placeholderTextColor="#94A3B8"
            value={rib} 
            onChangeText={setRib} 
            keyboardType="numeric" 
          />
          <TouchableOpacity style={styles.addBtn} onPress={ajouterBanque}>
            <Text style={styles.addBtnText}>+ Ajouter ce compte</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subLabel}>Comptes actuels (visibles par les parents) :</Text>
        {banques.map((item) => (
          <View key={item.id} style={styles.bankCard}>
            <View style={styles.bankInfo}>
              <Text style={styles.bankName}>{item.nom_bank || item.nom_banque}</Text>
              <Text style={styles.bankRib}>{item.rib}</Text>
            </View>
            <TouchableOpacity style={styles.deleteBankBtn} onPress={() => supprimerBanque(item.id)}>
              <Text style={styles.deleteBankText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Developped by A S © 2026</Text>
        </View>

      </ScrollView>

      {/* MODAL GÉNÉRATION ANNÉE */}
      <Modal visible={modalAnneeVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              
              <Text style={styles.modalTitle}>Préparation de l'année</Text>
              
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Transférer vers l'année :</Text>
                
                <View style={[styles.pickerContainerWrapper, styles.modalInputYearWrapper]}>
                  <Picker
                    selectedValue={anneeScolaire}
                    onValueChange={(itemValue) => setAnneeScolaire(itemValue)}
                    style={styles.pickerModal}
                  >
                    {anneesDisponibles.map(annee => (
                      <Picker.Item key={annee} label={annee} value={annee} />
                    ))}
                  </Picker>
                </View>
              </View>
              
              <View style={styles.selectionHeader}>
                <Text style={styles.selectionLabel}>Sélection ({enfantsSelectionnes.length}/{tousLesEnfants.length})</Text>
                <TouchableOpacity onPress={toutCocherDecocher}>
                  <Text style={styles.selectionToggleBtn}>Tout (dé)cocher</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.listContainerWrap}>
                <FlatList 
                  data={tousLesEnfants} 
                  keyExtractor={item => item.id.toString()} 
                  renderItem={({item}) => {
                    const isSelected = enfantsSelectionnes.includes(item.id);
                    return (
                      <TouchableOpacity 
                        style={[styles.enfantRow, isSelected ? styles.enfantSelected : styles.enfantUnselected]} 
                        onPress={() => toggleEnfant(item.id)}
                      >
                        <Text style={styles.checkIcon}>{isSelected ? '✅' : '⬜'}</Text>
                        <Text style={[styles.enfantNameText, isSelected ? styles.enfantNameTextSelected : null]}>
                          {item.prenom} {item.nom}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                  showsVerticalScrollIndicator={true}
                />
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalAnneeVisible(false)}>
                  <Text style={styles.buttonTextWhite}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={genererNouvelleAnnee} disabled={loadingGeneration}>
                  {loadingGeneration ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextWhite}>Générer l'année</Text>}
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
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // -- EN-TÊTE PREMIUM --
  headerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10,
    marginBottom: 20,
  },
  logoCircle: {
    width: 60,
    height: 60,
    backgroundColor: '#EEF2FF',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  logoIcon: {
    fontSize: 30,
  },
  mainTitle: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -0.5,
  },
  subtitle: { 
    fontSize: 14, 
    color: '#4F46E5', 
    fontWeight: '600',
    marginTop: 4,
  },

  // -- TITRES DE SECTIONS --
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#0F172A', 
    marginBottom: 12,
    marginTop: 10,
  },
  subLabel: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#475569', 
    marginBottom: 10, 
    marginTop: 10 
  },

  // -- CARTES GLOBALES --
  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 18, 
    borderRadius: 16, 
    elevation: 2, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardInfo: { 
    color: '#64748B', 
    fontSize: 13, 
    marginBottom: 15,
    lineHeight: 18,
  },

  // -- INPUTS & BOUTONS STANDARDS --
  rowAlign: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  input: { 
    backgroundColor: '#F8FAFC', 
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    marginBottom: 12,
    fontSize: 15,
    color: '#0F172A'
  },
  inputFlex: { 
    flex: 1, 
    marginRight: 10 
  },
  
  pickerContainerWrapper: {
    backgroundColor: '#F8FAFC', 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  picker: {
    height: 48,
    color: '#4F46E5',
    fontWeight: 'bold',
  },
  pickerModal: {
    height: 48,
    color: '#8B5CF6',
    fontWeight: 'bold',
  },

  saveBtnActive: { 
    backgroundColor: '#10B981', 
    paddingVertical: 14, 
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveBtnText: { 
    color: '#FFFFFF', 
    fontWeight: '700',
    fontSize: 14,
  },
  generateBtn: { 
    backgroundColor: '#8B5CF6', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  generateBtnText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold',
    fontSize: 15,
  },
  addBtn: { 
    backgroundColor: '#3B82F6', 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 5,
  },
  addBtnText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold',
    fontSize: 15, 
  },

  // -- CARTES BANCAIRES --
  bankCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 16, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12, 
    borderLeftWidth: 5, 
    borderLeftColor: '#3B82F6',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: { 
    fontWeight: '800', 
    fontSize: 16,
    color: '#0F172A',
  },
  bankRib: { 
    color: '#475569', 
    marginTop: 4,
    letterSpacing: 1,
    fontWeight: '500',
  },
  deleteBankBtn: {
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  deleteBankText: { 
    fontSize: 16 
  },

  // -- MODAL --
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.6)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalTitle: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#0F172A', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  modalRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  modalLabel: { 
    fontWeight: '700', 
    flex: 1,
    color: '#334155'
  },
  modalInputYearWrapper: { 
    flex: 1.5, 
    backgroundColor: '#F9F5FF',
    borderColor: '#D8B4E2',
  },
  
  selectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 10, 
    backgroundColor: '#F1F5F9', 
    padding: 12, 
    borderRadius: 10 
  },
  selectionLabel: { 
    fontWeight: '800', 
    color: '#0F172A' 
  },
  selectionToggleBtn: { 
    color: '#3B82F6', 
    fontWeight: '700' 
  },
  listContainerWrap: {
    flex: 1,
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  enfantRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9' 
  },
  enfantSelected: { 
    backgroundColor: '#F9F5FF' 
  },
  enfantUnselected: { 
    backgroundColor: '#FFFFFF' 
  },
  checkIcon: { 
    fontSize: 20, 
    marginRight: 15 
  },
  enfantNameText: { 
    fontSize: 15, 
    color: '#64748B', 
    fontWeight: '500' 
  },
  enfantNameTextSelected: {
    color: '#0F172A',
    fontWeight: '700',
  },

  modalButtons: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
  },
  button: { 
    flex: 1, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginHorizontal: 5 
  },
  cancelButton: { 
    backgroundColor: '#94A3B8' 
  },
  confirmButton: { 
    backgroundColor: '#8B5CF6' 
  },
  buttonTextWhite: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: 15 
  },

  // -- FOOTER --
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  }
});