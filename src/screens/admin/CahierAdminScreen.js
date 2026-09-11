import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// 🚀 Mapping des logos dynamiques
const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

// 🎨 CONFIGURATION DES THÈMES DYNAMIQUES SELON LA CRÈCHE
const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC' },
  demo: { primary: '#2196F3', background: '#E3F2FD' }
};

export default function CahierAdminScreen() {
  const [enfants, setEnfants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClasse, setFilterClasse] = useState('Toutes');
  
  // 🌟 NOUVEAU : SÉLECTION MULTIPLE
  const [selectedKids, setSelectedKids] = useState([]);

  // États pour le modal du cahier
  const [modalVisible, setModalVisible] = useState(false);
  const [enfantActif, setEnfantActif] = useState(null); // Null = Saisie groupée
  const [dateJour] = useState(new Date().toISOString().split('T')[0]);

  const [repas, setRepas] = useState('');
  const [sieste, setSieste] = useState('');
  const [humeur, setHumeur] = useState('');
  const [toilettes, setToilettes] = useState('');
  const [remarques, setRemarques] = useState('');

  const [doudouPret, setDoudouPret] = useState(false);
  const [changePret, setChangePret] = useState(false);
  const [couchesPret, setCouchesPret] = useState(false);
  const [medicamentsPret, setMedicamentsPret] = useState(false);

  const [typeAlerte, setTypeAlerte] = useState('');
  const [commentaireAlerte, setCommentaireAlerte] = useState('');
  const [loadingAlerte, setLoadingAlerte] = useState(false);

  // 🌟 ÉTATS : GALERIE DES PROGRÈS
  const [modalProgresVisible, setModalProgresVisible] = useState(false);
  const [progresTitre, setProgresTitre] = useState('');
  const [progresDesc, setProgresDesc] = useState('');
  const [progresPhotoUri, setProgresPhotoUri] = useState(null);
  const [loadingProgres, setLoadingProgres] = useState(false);

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => { fetchEnfants(); }, []);

  const fetchEnfants = async () => {
    setLoading(true);
    const { data } = await supabase.from('enfants').select('id, prenom, nom, photo_url, classe, utilisateurs(expo_push_token, web_push_sub)').order('prenom', { ascending: true });
    if (data) setEnfants(data);
    setLoading(false);
  };

  // 🌟 NOUVEAU : GESTION DE LA SÉLECTION
  const toggleSelectEnfant = (id) => {
    if (selectedKids.includes(id)) {
      setSelectedKids(selectedKids.filter(kidId => kidId !== id));
    } else {
      setSelectedKids([...selectedKids, id]);
    }
  };

  const selectionnerTout = () => {
    const idsVisibles = enfantsFiltres.map(e => e.id);
    if (selectedKids.length === idsVisibles.length) {
      setSelectedKids([]); // Désélectionner
    } else {
      setSelectedKids(idsVisibles); // Tout sélectionner
    }
  };

  const ouvrirCahier = async (enfant = null) => {
    // Si enfant est null, c'est une saisie groupée (Batch)
    if (!enfant && selectedKids.length === 0) {
      Alert.alert("Sélection requise", "Veuillez sélectionner au moins un enfant pour la saisie groupée.");
      return;
    }

    setEnfantActif(enfant);
    
    // Réinitialisation globale (que ce soit solo ou groupé)
    setRepas(''); setSieste(''); setHumeur(''); setToilettes(''); setRemarques('');
    setDoudouPret(false); setChangePret(false); setCouchesPret(false); setMedicamentsPret(false);
    setTypeAlerte(''); setCommentaireAlerte('');

    // Si SOLO, on charge ses données existantes
    if (enfant) {
      const { data: cahierData } = await supabase.from('cahier_liaison').select('*').eq('enfant_id', enfant.id).eq('date_jour', dateJour).maybeSingle();
      if (cahierData) {
        setRepas(cahierData.repas || ''); setSieste(cahierData.sieste || ''); setHumeur(cahierData.humeur || ''); setToilettes(cahierData.toilettes || ''); setRemarques(cahierData.remarques || '');
      }

      const { data: checkData } = await supabase.from('checklist_depart').select('*').eq('enfant_id', enfant.id).eq('date_jour', dateJour).maybeSingle();
      if (checkData) {
        setDoudouPret(checkData.doudou_pret || false); setChangePret(checkData.change_pret || false); setCouchesPret(checkData.couches_pret || false); setMedicamentsPret(checkData.medicaments_pret || false);
      }
    }

    setModalVisible(true);
  };

  const envoyerNotificationPush = async (enfantId, title, body, tabRedirect) => {
    const enfant = enfants.find(e => e.id === enfantId);
    const nativeToken = enfant?.utilisateurs?.expo_push_token;
    const webPushSub = enfant?.utilisateurs?.web_push_sub;
    if (!nativeToken && !webPushSub) return;

    if (nativeToken) {
      const apiUrl = (Platform.OS === 'web' && !__DEV__) ? '/api/expo-push' : 'https://exp.host/--/api/v2/push/send';
      try {
        await fetch(apiUrl, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ to: nativeToken, sound: 'default', priority: 'high', title, body, data: { tab: tabRedirect } }) });
      } catch (e) {}
    }

    if (webPushSub) {
      try {
        const subObj = typeof webPushSub === 'string' ? JSON.parse(webPushSub) : webPushSub;
        await supabase.functions.invoke('send-web-push', { body: { subscriptions: [subObj], payload: { title, body, data: { tab: tabRedirect } } } });
      } catch (e) {}
    }
  };

  const declencherFlashMedical = async () => {
    if (!enfantActif) { Alert.alert("Action impossible", "Le flash médical se fait uniquement en mode individuel."); return; }
    if (!typeAlerte) { Alert.alert("Motif manquant", "Veuillez sélectionner un motif d'alerte médicale."); return; }
    setLoadingAlerte(true);
    try {
      const { error } = await supabase.from('alertes_medicales').insert([{ enfant_id: enfantActif.id, type_alerte: typeAlerte, commentaire: commentaireAlerte, statut_regle: false }]);
      if (error) throw error;

      await envoyerNotificationPush(enfantActif.id, `🚨 FLASH MÉDICAL : ${typeAlerte} 🩺`, `Urgent : Signalement santé pour ${enfantActif.prenom}.${commentaireAlerte ? ` Note : ${commentaireAlerte}` : ''}`, 'dossiers');
      Alert.alert("🚨 Alerte transmise", `Le flash santé a été notifié.`);
      setTypeAlerte(''); setCommentaireAlerte('');
    } catch (e) { Alert.alert("Erreur", "Impossible de transmettre le flash médical."); } finally { setLoadingAlerte(false); }
  };

  const sauvegarderCahier = async () => {
    const idsCibles = enfantActif ? [enfantActif.id] : selectedKids;
    
    try {
      // Préparation des données pour Upsert Batch
      const cahierRows = idsCibles.map(id => ({ enfant_id: id, date_jour: dateJour, repas, sieste, humeur, toilettes, remarques }));
      const checklistRows = idsCibles.map(id => ({ enfant_id: id, date_jour: dateJour, doudou_pret: doudouPret, change_pret: changePret, couches_pret: couchesPret, medicaments_pret: medicamentsPret }));

      await supabase.from('cahier_liaison').upsert(cahierRows, { onConflict: 'enfant_id, date_jour' });
      await supabase.from('checklist_depart').upsert(checklistRows, { onConflict: 'enfant_id, date_jour' });
      
      // Envoi des notifs
      for (const id of idsCibles) {
        await envoyerNotificationPush(id, 'Cahier de liaison mis à jour 📝', `Découvrez comment s'est passée la journée aujourd'hui !`, 'dossiers');
      }

      Alert.alert("Enregistré 🎉", `Le cahier a été validé pour ${idsCibles.length} enfant(s).`);
      setSelectedKids([]); // Reset de la sélection
      setModalVisible(false);
    } catch (error) { Alert.alert("Erreur", "Impossible de sauvegarder le dossier du jour."); }
  };

  const ouvrirModalProgres = () => {
    if (!enfantActif) { Alert.alert("Action impossible", "L'ajout d'un progrès se fait uniquement en mode individuel."); return; }
    setProgresTitre(''); setProgresDesc(''); setProgresPhotoUri(null);
    setModalProgresVisible(true);
  };

  const choisirPhotoProgres = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
    if (!result.canceled) setProgresPhotoUri(result.assets[0].uri);
  };

  const publierProgres = async () => {
    if (!progresTitre) { Alert.alert("Erreur", "Veuillez indiquer le titre de la compétence."); return; }
    setLoadingProgres(true);
    try {
      let photoUrlFinale = null;
      if (progresPhotoUri) {
        const response = await fetch(progresPhotoUri);
        const blob = await response.blob();
        const fileName = `progres_${enfantActif.id}_${Date.now()}.jpg`;
        await supabase.storage.from('photos_enfants').upload(fileName, blob);
        const { data: urlData } = supabase.storage.from('photos_enfants').getPublicUrl(fileName);
        photoUrlFinale = urlData.publicUrl;
      }

      const { error } = await supabase.from('progres_enfants').insert([{ enfant_id: enfantActif.id, titre_competence: progresTitre, description: progresDesc, photo_url: photoUrlFinale }]);
      if (error) throw error;

      await envoyerNotificationPush(enfantActif.id, '🌟 Nouveau Progrès !', `${enfantActif.prenom} a débloqué une nouvelle compétence : ${progresTitre} !`, 'dossiers');
      Alert.alert("Super ! 🌟", "Le progrès a été ajouté au portfolio de l'enfant.");
      setModalProgresVisible(false);
    } catch (error) { Alert.alert("Erreur", "Impossible de publier ce progrès."); } finally { setLoadingProgres(false); }
  };

  const BoutonRapide = ({ label, etatActuel, setEtat, emoji }) => (
    <TouchableOpacity style={[styles.quickBtn, etatActuel === label && [styles.quickBtnActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setEtat(label)}>
      <Text style={[styles.quickBtnText, etatActuel === label && styles.quickBtnTextActive]}>{emoji} {label}</Text>
    </TouchableOpacity>
  );

  const CheckboxPill = ({ label, value, setValue, emoji }) => (
    <TouchableOpacity style={[styles.checkPill, value === true && [styles.checkPillActive, { borderColor: currentTheme.primary }]]} onPress={() => setValue(!value)}>
      <Text style={[styles.checkPillText, value === true && { color: currentTheme.primary, fontWeight: '800' }]}>{value ? "✅ " : "⬜ "} {emoji} {label}</Text>
    </TouchableOpacity>
  );

  const classCounts = { Toutes: 0, Crèche: 0, TPS: 0, PS: 0, MS: 0, GS: 0 };
  enfants.forEach(e => { classCounts.Toutes++; const c = e.classe || 'Crèche'; if (classCounts[c] !== undefined) classCounts[c]++; });

  const enfantsFiltres = enfants.filter(e => {
    const matchClasse = filterClasse === 'Toutes' ? true : (e.classe || 'Crèche') === filterClasse;
    const matchTexte = e.prenom.toLowerCase().includes(searchQuery.toLowerCase()) || e.nom.toLowerCase().includes(searchQuery.toLowerCase());
    return matchClasse && matchTexte;
  });

  const renderFooter = () => <View style={styles.footer}><Text style={styles.footerText}>Developped by A S © 2026</Text></View>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topSection}>
        <View style={styles.topRow}>
          <Text style={styles.mainTitle}>Cahier de Liaison</Text>
          <Text style={[styles.dateText, { color: currentTheme.primary }]}>{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}><Text style={styles.searchIcon}>🔍</Text><TextInput style={styles.searchInput} placeholder="Chercher un enfant..." placeholderTextColor="#94A3B8" value={searchQuery} onChangeText={setSearchQuery} /></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
          {['Toutes', 'Crèche', 'TPS', 'PS', 'MS', 'GS'].map(classe => (
            <TouchableOpacity key={classe} style={[styles.filterPill, filterClasse === classe && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => { setFilterClasse(classe); setSelectedKids([]); }}>
              <Text style={[styles.filterPillText, filterClasse === classe && styles.filterPillTextActive]}>{classe} ({classCounts[classe]})</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 🌟 NOUVEAU : BARRE DE SÉLECTION MULTIPLE */}
      {enfantsFiltres.length > 0 && (
        <View style={styles.batchSelectionBar}>
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectionnerTout}>
            <Text style={styles.selectAllText}>
              {selectedKids.length === enfantsFiltres.length ? "🔲 Tout désélectionner" : "☑ Tout sélectionner"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.selectedCountText}>{selectedKids.length} sélectionné(s)</Text>
        </View>
      )}

      {loading ? (
        <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator size="large" color={currentTheme.primary} /></View>
      ) : (
        <FlatList 
          data={enfantsFiltres} 
          keyExtractor={item => item.id.toString()} 
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={renderFooter}
          renderItem={({item}) => {
            const isSelected = selectedKids.includes(item.id);
            return (
              <TouchableOpacity style={[styles.kidCard, isSelected && { borderColor: currentTheme.primary, backgroundColor: '#EEF2FF' }]} onPress={() => toggleSelectEnfant(item.id)}>
                <View style={styles.avatarContainer}>
                  {item.photo_url ? <Image source={{uri: item.photo_url}} style={styles.kidPhoto}/> : <View style={styles.kidPhotoPlaceholder}><Text style={{fontSize: 30}}>👦</Text></View>}
                  {isSelected && <View style={[styles.checkedBadge, {backgroundColor: currentTheme.primary}]}><Text style={styles.checkedText}>✓</Text></View>}
                </View>
                <Text style={styles.kidName} numberOfLines={1}>{item.prenom}</Text>
                <Text style={styles.kidClassText}>🏫 {item.classe || 'Crèche'}</Text>
                
                {/* 🌟 Remplir Individuellement (Optionnel si on veut un par un) */}
                {!isSelected && selectedKids.length === 0 && (
                   <TouchableOpacity style={styles.fillBtn} onPress={() => ouvrirCahier(item)}>
                     <Text style={[styles.fillBtnText, { color: currentTheme.primary }]}>Remplir cahier</Text>
                   </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* 🌟 NOUVEAU : BOUTON FLOTTANT DE SAISIE GROUPÉE */}
      {selectedKids.length > 0 && (
        <View style={styles.floatingActionBar}>
          <TouchableOpacity style={[styles.floatingActionBtn, {backgroundColor: currentTheme.primary}]} onPress={() => ouvrirCahier(null)}>
            <Text style={styles.floatingActionBtnText}>✍️ Remplir le cahier pour {selectedKids.length} enfant(s)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ==================================================== */}
      {/* ==================== MODAL CAHIER ================== */}
      {/* ==================================================== */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {enfantActif ? `Journée de ${enfantActif.prenom}` : `Saisie pour ${selectedKids.length} enfants`}
                </Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}><Text style={styles.closeBtnText}>✖️</Text></TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                
                {/* 🌟 PORTFOLIO & FLASH UNIQUEMENT SI 1 SEUL ENFANT */}
                {enfantActif && (
                  <>
                    <TouchableOpacity style={[styles.progressCallBtn, { borderColor: currentTheme.primary }]} onPress={ouvrirModalProgres}>
                      <Text style={styles.progressCallEmoji}>🌟</Text>
                      <View style={{flex: 1}}>
                        <Text style={[styles.progressCallTitle, { color: currentTheme.primary }]}>Ajouter au Portfolio</Text>
                        <Text style={styles.progressCallDesc}>Immortalisez un nouveau progrès ou compétence !</Text>
                      </View>
                      <Text style={styles.progressCallArrow}>➡️</Text>
                    </TouchableOpacity>

                    <View style={styles.alertMedicalBox}>
                      <Text style={styles.alertSectionTitle}>🚨 Flash Médical (Alerte Parents Immédiate)</Text>
                      <View style={styles.quickRow}>
                        {['Fièvre', 'Chute', 'Médicament', 'Autre'].map(type => (
                          <TouchableOpacity key={type} style={[styles.medicalTypeBtn, typeAlerte === type && styles.medicalTypeBtnActive]} onPress={() => setTypeAlerte(type)}>
                            <Text style={[styles.medicalTypeBtnText, typeAlerte === type && styles.medicalTypeBtnTextActive]}>{type === 'Fièvre' ? '🌡️ ' : type === 'Chute' ? '🤕 ' : type === 'Médicament' ? '💊 ' : '⚠️ '} {type}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput style={styles.medicalInputComment} placeholder="Précision (ex: Température à 38.8°C à 11h)" placeholderTextColor="#94A3B8" value={commentaireAlerte} onChangeText={setCommentaireAlerte} />
                      <TouchableOpacity style={styles.sendAlertBtn} onPress={declencherFlashMedical} disabled={loadingAlerte}>
                        {loadingAlerte ? <ActivityIndicator color="#FFF"/> : <Text style={styles.sendAlertBtnText}>🚀 Envoyer l'alerte immédiate</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* 🎒 CHECK-LIST AFFAIRES */}
                <Text style={styles.sectionLabel}>🎒 Affaires & Sac de départ</Text>
                <View style={styles.checklistContainer}>
                  <CheckboxPill label="Doudou" emoji="🧸" value={doudouPret} setValue={setDoudouPret} />
                  <CheckboxPill label="Vêtements" emoji="👕" value={changePret} setValue={setChangePret} />
                  <CheckboxPill label="Couches" emoji="👶" value={couchesPret} setValue={setCouchesPret} />
                  <CheckboxPill label="Médicaments" emoji="🍼" value={medicamentsPret} setValue={setMedicamentsPret} />
                </View>

                <Text style={styles.sectionLabel}>🍽️ Repas</Text>
                <View style={styles.quickRow}>
                  <BoutonRapide label="A tout mangé" emoji="😋" etatActuel={repas} setEtat={setRepas} />
                  <BoutonRapide label="A picoré" emoji="😐" etatActuel={repas} setEtat={setRepas} />
                  <BoutonRapide label="Rien mangé" emoji="🙅‍♂️" etatActuel={repas} setEtat={setRepas} />
                </View>

                <Text style={styles.sectionLabel}>💤 Sieste</Text>
                <View style={styles.quickRow}>
                  <BoutonRapide label="Bonne sieste" emoji="😴" etatActuel={sieste} setEtat={setSieste} />
                  <BoutonRapide label="Sieste courte" emoji="🥱" etatActuel={sieste} setEtat={setSieste} />
                  <BoutonRapide label="Pas dormi" emoji="👀" etatActuel={sieste} setEtat={setSieste} />
                </View>

                <Text style={styles.sectionLabel}>😊 Humeur</Text>
                <View style={styles.quickRow}>
                  <BoutonRapide label="Joyeux" emoji="😁" etatActuel={humeur} setEtat={setHumeur} />
                  <BoutonRapide label="Calme" emoji="🙂" etatActuel={humeur} setEtat={setHumeur} />
                  <BoutonRapide label="Grognon" emoji="😫" etatActuel={humeur} setEtat={setHumeur} />
                </View>

                <Text style={styles.sectionLabel}>🧻 Change / Toilettes</Text>
                <View style={styles.quickRow}>
                  <BoutonRapide label="Selles OK" emoji="💩" etatActuel={toilettes} setEtat={setToilettes} />
                  <BoutonRapide label="Urines" emoji="💧" etatActuel={toilettes} setEtat={setToilettes} />
                  <BoutonRapide label="R.A.S" emoji="👍" etatActuel={toilettes} setEtat={setToilettes} />
                </View>

                <Text style={styles.sectionLabel}>💬 Un petit mot pour les parents ?</Text>
                <TextInput style={styles.textArea} placeholder={enfantActif ? "Ex: Il a fait un beau dessin aujourd'hui !" : "Mot global pour ces enfants"} placeholderTextColor="#94A3B8" value={remarques} onChangeText={setRemarques} multiline />

                <TouchableOpacity style={styles.saveBtn} onPress={sauvegarderCahier}><Text style={styles.saveBtnText}>Valider le journal</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🌟 SOUS-MODAL POUR AJOUTER UN PROGRÈS */}
      <Modal visible={modalProgresVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '85%', backgroundColor: '#F8FAFC' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🌟 Portfolio de {enfantActif?.prenom}</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalProgresVisible(false)}><Text style={styles.closeBtnText}>✖️</Text></TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Quelle est la nouvelle compétence ?</Text>
                <View style={styles.quickRow}>
                  {['🎨 Créativité', '🏃 Motricité', '🗣️ Langage', '🧩 Autonomie', '🤝 Socialisation'].map(comp => (
                    <TouchableOpacity key={comp} style={[styles.medicalTypeBtn, progresTitre === comp && {backgroundColor: currentTheme.primary, borderColor: currentTheme.primary}]} onPress={() => setProgresTitre(comp)}>
                      <Text style={[styles.medicalTypeBtnText, progresTitre === comp && {color: '#FFF'}]}>{comp}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={[styles.inputProgres, {marginTop: 10}]} placeholder="Ou tapez un titre libre (ex: Apprend à marcher)" value={progresTitre} onChangeText={setProgresTitre} />

                <Text style={styles.label}>Description (optionnel)</Text>
                <TextInput style={[styles.inputProgres, { minHeight: 80 }]} placeholder="Racontez ce beau moment..." value={progresDesc} onChangeText={setProgresDesc} multiline />

                <Text style={styles.label}>Une belle photo ? 📸</Text>
                <TouchableOpacity style={styles.uploadProgresBtn} onPress={choisirPhotoProgres}>
                  {progresPhotoUri ? <Image source={{uri: progresPhotoUri}} style={styles.previewProgresImg} /> : <Text style={styles.uploadProgresText}>+ Ajouter une image</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.saveBtn, {backgroundColor: currentTheme.primary, marginTop: 20}]} onPress={publierProgres} disabled={loadingProgres}>
                  {loadingProgres ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Publier sur sa Timeline ✨</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topSection: { backgroundColor: '#FFFFFF', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', zIndex: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mainTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  dateText: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  searchRow: { flexDirection: 'row', marginBottom: 8 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 12, borderRadius: 10, height: 38 },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#334155' },
  pillsScroll: { flexDirection: 'row', marginTop: 2, paddingBottom: 2 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', height: 32, justifyContent: 'center' },
  filterPillActive: { },
  filterPillText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterPillTextActive: { color: '#FFFFFF' },
  
  // NOUVEAU BATCH SELECTION
  batchSelectionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  selectAllBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
  selectAllText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
  selectedCountText: { fontSize: 12, fontWeight: '800', color: '#E91E63' },

  listContainer: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 80 }, // paddingBottom augmenté pour le bouton flottant
  
  kidCard: { flex: 1, backgroundColor: '#FFFFFF', margin: 6, padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  avatarContainer: { position: 'relative' },
  kidPhoto: { width: 64, height: 64, borderRadius: 32, marginBottom: 8 },
  kidPhotoPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  checkedBadge: { position: 'absolute', bottom: 5, right: -5, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  checkedText: { color: '#FFF', fontSize: 12, fontWeight: '900' },

  kidName: { fontWeight: '800', fontSize: 14, color: '#0F172A' },
  kidClassText: { fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 10 },
  fillBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  fillBtnText: { fontWeight: '700', fontSize: 11 },

  // BOUTON FLOTTANT DE SAISIE GROUPÉE
  floatingActionBar: { position: 'absolute', bottom: 15, left: 15, right: 15, zIndex: 100 },
  floatingActionBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8 },
  floatingActionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', maxHeight: '92%', paddingHorizontal: 24, paddingTop: 24, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  closeBtn: { backgroundColor: '#E2E8F0', borderRadius: 15, padding: 8 },
  closeBtnText: { fontSize: 14 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#334155', marginTop: 18, marginBottom: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap' },
  quickBtn: { backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  quickBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  quickBtnText: { color: '#475569', fontSize: 14, fontWeight: '500' },
  quickBtnTextActive: { color: '#FFFFFF', fontWeight: '700' },
  checklistContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 },
  checkPill: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  checkPillActive: { backgroundColor: '#F0FDF4' },
  checkPillText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  alertMedicalBox: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FEB2B2', borderRadius: 20, padding: 16, marginTop: 10 },
  alertSectionTitle: { fontSize: 14, fontWeight: '900', color: '#C53030', marginBottom: 12 },
  medicalTypeBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8, marginBottom: 8 },
  medicalTypeBtnActive: { backgroundColor: '#E53E3E', borderColor: '#E53E3E' },
  medicalTypeBtnText: { fontSize: 13, color: '#475569', fontWeight: '700' },
  medicalTypeBtnTextActive: { color: '#FFFFFF' },
  medicalInputComment: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FED7D7', borderRadius: 10, padding: 12, fontSize: 14, color: '#2D3748', marginTop: 4, marginBottom: 12 },
  sendAlertBtn: { backgroundColor: '#E53E3E', padding: 12, borderRadius: 12, alignItems: 'center' },
  sendAlertBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  textArea: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', minHeight: 100, textAlignVertical: 'top', marginTop: 5, marginBottom: 25, fontSize: 15, color: '#334155' },
  saveBtn: { backgroundColor: '#10B981', padding: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4, marginBottom: 10 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
  
  // -- STYLES PORTFOLIO --
  progressCallBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 15, marginBottom: 10 },
  progressCallEmoji: { fontSize: 28, marginRight: 15 },
  progressCallTitle: { fontSize: 16, fontWeight: '900' },
  progressCallDesc: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  progressCallArrow: { fontSize: 18, color: '#94A3B8' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 15 },
  inputProgres: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 14 },
  uploadProgresBtn: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12, height: 120, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  uploadProgresText: { color: '#94A3B8', fontWeight: '700', fontSize: 14 },
  previewProgresImg: { width: '100%', height: '100%', resizeMode: 'cover' },

  footer: { alignItems: 'center', paddingVertical: 20, marginTop: 10 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' }
});