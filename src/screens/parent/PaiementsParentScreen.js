import { useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const decodeBase64 = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const { width: screenWidth } = Dimensions.get('window');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 🚀 MAPPING POUR LE TRI CHRONOLOGIQUE DES FACTURES
const ordreMoisScolaire = {
  'Septembre': 1, 'Octobre': 2, 'Novembre': 3, 'Décembre': 4,
  'Janvier': 5, 'Février': 6, 'Mars': 7, 'Avril': 8, 'Mai': 9,
  'Juin': 10, 'Juillet': 11, 'Août': 12
};

export default function DashboardParentScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('mur'); 
  const [parentNom, setParentNom] = useState('');
  const [publications, setPublications] = useState([]);
  const [enfants, setEnfants] = useState([]);
  const [factures, setFactures] = useState([]); 
  const [banques, setBanques] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [loadingDownload, setLoadingDownload] = useState(false); 
  const [unreadCount, setUnreadCount] = useState(0);
  const [cahiersJour, setCahiersJour] = useState({}); 
  const [statutAttestations, setStatutAttestations] = useState({});

  // 🙈 MASQUÉ POUR LE MOMENT : Affaires et Sac de départ
  // const [checklistsJour, setChecklistsJour] = useState({});

  const [menus, setMenus] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activeRessourceTab, setActiveRessourceTab] = useState('menus'); 

  const [modalMedicalVisible, setModalMedicalVisible] = useState(false);
  const [enfantSelectionne, setEnfantSelectionne] = useState(null);
  const [remarqueTemp, setRemarqueTemp] = useState('');

  const [modalPaiementVisible, setModalPaiementVisible] = useState(false);
  const [factureAPayer, setFactureAPayer] = useState(null);
  const [recuUri, setRecuUri] = useState(null);
  const [recuBase64, setRecuBase64] = useState(null);
  const [uploadingRecu, setUploadingRecu] = useState(false);

  const [modalImageVisible, setModalImageVisible] = useState(false);
  const [imageView, setImageView] = useState(null);

  useEffect(() => { 
    chargerDonneesParent(); 
    chargerMur(); 
    chargerBanques(); 
    chargerRessources(); 
    
    if (Platform.OS !== 'web') {
      enregistrerNotificationsNatives();
    }
  }, []);

  useFocusEffect(React.useCallback(() => { calculerMessagesNonLus(); }, []));

  const enregistrerNotificationsNatives = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') return;
      
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: 'fd75764c-a292-4621-92c4-f0e764845de5', applicationId: 'com.souiria.CrecheApp' });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('utilisateurs').update({ expo_push_token: tokenData.data }).eq('id', user.id);
        }
      } catch (error) { 
        console.warn("La génération du jeton natif a échoué : " + error.message);
      }
    }
  };

  const demanderNotificationsWeb = async () => {
    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

      if (isIos && !isStandalone) {
        Alert.alert("🍎 Action Requise sur iPhone", "Les notifications Safari/Chrome sur iOS ne fonctionnent QUE si l'application est ajoutée à votre écran d'accueil.\n\n1. Appuyez sur le bouton 'Partager'.\n2. Choisissez 'Sur l'écran d'accueil'.\n3. Ouvrez l'application depuis votre écran d'accueil pour activer les notifications.", [{ text: "Compris" }]);
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        Alert.alert("Erreur", "Les notifications Web ne sont pas supportées sur ce navigateur.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return Alert.alert("Permission requise", "Veuillez autoriser les notifications dans les paramètres de votre navigateur.");

      const registration = await navigator.serviceWorker.register('/custom-service-worker.js');
      const PUBLIC_VAPID_KEY = 'BI_Tzccj4plYD_YX6ssnZ3K5PMpgo4pEjd-DOMNG1vriOzJo_Dvs45Q4la7UhCqRWjWxfQdOVlLSaYLK8tryZwY'; 

      const pushSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY) });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('utilisateurs').update({ web_push_sub: JSON.stringify(pushSubscription) }).eq('id', user.id);
        Alert.alert("✅ Succès", "Notifications activées avec succès sur cet appareil !");
      }
    } catch (error) { 
      Alert.alert("Erreur", "Impossible d'activer les notifications : " + error.message);
    }
  };

  const chargerRessources = async () => {
    const { data: menusData } = await supabase.from('menus_cantine').select('*').order('semaine_du', { ascending: false });
    if (menusData) setMenus(menusData);

    const { data: docsData } = await supabase.from('documents_utiles').select('*').order('date_ajout', { ascending: false });
    if (docsData) setDocuments(docsData);
  };

  const calculerMessagesNonLus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from('utilisateurs').select('derniere_lecture_messagerie').eq('id', user.id).single();
    const derniereLecture = userData?.derniere_lecture_messagerie || '2000-01-01T00:00:00.000Z';
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('destinataire_id', user.id).gt('date_creation', derniereLecture);
    setUnreadCount(count || 0);
  };

  const chargerMur = async () => {
    try {
      const { data } = await supabase.from('publications').select('*').order('date_creation', { ascending: false });
      if (data) {
        const now = new Date();
        const publicationsValides = data.filter(post => !post.date_expiration || new Date(post.date_expiration) >= now);
        setPublications(publicationsValides);
      }
    } catch (e) { console.log(e.message); }
  };

  const chargerBanques = async () => {
    const { data } = await supabase.from('comptes_bancaires').select('*');
    if (data) setBanques(data);
  };

  const chargerDonneesParent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profil } = await supabase.from('utilisateurs').select('prenom').eq('id', user.id).single();
      if (profil) setParentNom(profil.prenom);
      
      const { data: mesEnfants } = await supabase.from('enfants').select('*').eq('parent_id', user.id);
      let enfantIds = [];
      
      if (mesEnfants && mesEnfants.length > 0) {
        setEnfants(mesEnfants);
        enfantIds = mesEnfants.map(e => e.id);
        const dateJour = new Date().toISOString().split('T')[0];
        
        const { data: cahiers } = await supabase.from('cahier_liaison').select('*').in('enfant_id', enfantIds).eq('date_jour', dateJour);
        if (cahiers) {
          const cahiersMap = {};
          cahiers.forEach(c => { cahiersMap[c.enfant_id] = c; });
          setCahiersJour(cahiersMap);
        }

        // 🙈 MASQUÉ : Optimisation, on ne charge plus la checklist
        // const { data: checklists } = await supabase.from('checklist_depart').select('*').in('enfant_id', enfantIds).eq('date_jour', dateJour);
        // if (checklists) { const checksMap = {}; checklists.forEach(ch => { checksMap[ch.enfant_id] = ch; }); setChecklistsJour(checksMap); }

        const { data: attestations } = await supabase.from('demandes_attestation').select('*').in('enfant_id', enfantIds).order('date_demande', { ascending: false }); 
        if (attestations) {
          const attMap = {};
          attestations.forEach(att => { if (!attMap[att.enfant_id]) attMap[att.enfant_id] = att.statut; });
          setStatutAttestations(attMap);
        }
      }

      let queryFactures = supabase.from('paiements').select('*, enfants(prenom)').order('date_creation', { ascending: false });
      if (enfantIds.length > 0) {
        queryFactures = queryFactures.or(`parent_id.eq.${user.id},enfant_id.in.(${enfantIds.join(',')})`);
      } else {
        queryFactures = queryFactures.eq('parent_id', user.id);
      }

      const { data: mesFactures } = await queryFactures;
      if (mesFactures) setFactures(mesFactures);
      
    } catch (error) { console.error("Erreur Dashboard:", error); } finally { setLoading(false); }
  };

  const ouvrirModalMedical = (enfant) => {
    setEnfantSelectionne(enfant);
    setRemarqueTemp(enfant.details_allergie || enfant.remarques_medicales || '');
    setModalMedicalVisible(true);
  };

  const sauvegarderMedical = async () => {
    setLoading(true);
    try {
      await supabase.from('enfants').update({ remarques_medicales: remarqueTemp, details_allergie: remarqueTemp, a_allergie: remarqueTemp.length > 0 }).eq('id', enfantSelectionne.id);
      
      const { data: admin } = await supabase.from('utilisateurs').select('id').eq('role', 'admin').single();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (admin) {
        await supabase.from('messages').insert([{ expediteur_id: user.id, destinataire_id: admin.id, texte: `Le parent a mis à jour les informations médicales de ${enfantSelectionne.prenom} ${enfantSelectionne.nom}. Nouveau dossier : ${remarqueTemp}` }]);
      }

      Alert.alert("Succès", "Informations mises à jour et la direction a été notifiée.");
      setModalMedicalVisible(false);
      chargerDonneesParent();
    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoading(false); }
  };

  const envoyerDemandeScolarite = async (enfant) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: existante } = await supabase.from('demandes_attestation').select('id').eq('enfant_id', enfant.id).eq('statut', 'en_attente');
      if (existante && existante.length > 0) { Alert.alert("Info", "Une attestation est déjà en cours de préparation."); setLoading(false); return; }

      await supabase.from('demandes_attestation').insert([{ enfant_id: enfant.id, parent_id: user.id, statut: 'en_attente' }]);

      const { data: admin } = await supabase.from('utilisateurs').select('id').eq('role', 'admin').single();
      if (admin) {
        await supabase.from('messages').insert([{ expediteur_id: user.id, destinataire_id: admin.id, texte: `📄 J'ai fait une demande d'attestation de scolarité pour ${enfant.prenom} ${enfant.nom}.` }]);
      }

      setStatutAttestations(prev => ({ ...prev, [enfant.id]: 'en_attente' }));
      Alert.alert("Succès", "Votre demande a été envoyée.");
    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoading(false); }
  };

  const choisirRecu = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
    if (!result.canceled) {
      setRecuUri(result.assets[0].uri);
      setRecuBase64(result.assets[0].base64); 
    }
  };

  const envoyerRecu = async () => {
    if (!recuBase64) { alert("Veuillez sélectionner la photo de votre reçu."); return; }
    setUploadingRecu(true);
    
    try {
      const fileName = `recu_${factureAPayer.id}_${Date.now()}.jpg`;
      const binaryData = decodeBase64(recuBase64);
      const { error: uploadError } = await supabase.storage.from('recus_paiements').upload(fileName, binaryData, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('recus_paiements').getPublicUrl(fileName);
      await supabase.from('paiements').update({ statut: 'en_verification', recu_url: publicUrlData.publicUrl }).eq('id', factureAPayer.id);

      Alert.alert("Merci !", "Votre reçu a été envoyé.");
      setModalPaiementVisible(false);
      chargerDonneesParent();
    } catch (error) { alert("Erreur : " + error.message); } finally { setUploadingRecu(false); }
  };

  const telechargerPhotoOriginale = async (url) => {
    if (Platform.OS === 'web') {
      Linking.openURL(url);
      return;
    }

    setLoadingDownload(true);
    try {
      const fileName = `photo_creche_${Date.now()}.jpg`;
      const localUri = FileSystem.documentDirectory + fileName;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Enregistrer la photo', UTI: 'public.jpeg' });
      } else {
        Alert.alert('Erreur', "Le partage n'est pas disponible.");
      }
    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoadingDownload(false); }
  };

  const marquerCommeVu = async (postId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('vues_publications').upsert({ publication_id: postId, utilisateur_id: user.id }, { onConflict: 'publication_id, utilisateur_id' });
    } catch (e) { console.log(e); }
  };

  if (loading && enfants.length === 0) return <View style={styles.center}><ActivityIndicator size="large" color="#E91E63" /></View>;

  // 🚀 FONCTION DE TRI CHRONOLOGIQUE
  const trierFactures = (a, b) => {
    const aIsInsc = a.type === 'inscription' || (a.titre || '').toLowerCase().includes("inscription");
    const bIsInsc = b.type === 'inscription' || (b.titre || '').toLowerCase().includes("inscription");
    if (aIsInsc && !bIsInsc) return -1;
    if (!aIsInsc && bIsInsc) return 1;

    const ordreA = ordreMoisScolaire[a.mois] || 99;
    const ordreB = ordreMoisScolaire[b.mois] || 99;
    if (ordreA !== ordreB) return ordreA - ordreB;

    return (a.titre || '').localeCompare(b.titre || '');
  };

  const facturesEnAttente = factures.filter(f => f.statut === 'en_attente').sort(trierFactures);
  const facturesEnVerification = factures.filter(f => f.statut === 'en_verification').sort(trierFactures);
  const facturesPayees = factures.filter(f => f.statut === 'paye').sort(trierFactures);
  const facturesEnRetard = facturesEnAttente.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View>
            <Text style={styles.greeting}>Espace Famille</Text>
            <Text style={styles.subtitle}>Bonjour {parentNom} 👋</Text>
          </View>
          <View style={{alignItems: 'flex-end'}}>
            <TouchableOpacity onPress={async () => { await supabase.auth.signOut(); navigation.replace('Login'); }}>
              <Text style={{color: '#E91E63', fontWeight: 'bold', marginBottom: Platform.OS === 'web' ? 8 : 0}}>Déconnexion</Text>
            </TouchableOpacity>
            
            {Platform.OS === 'web' && (
              <TouchableOpacity onPress={demanderNotificationsWeb} style={styles.webNotifyBtn}>
                <Text style={styles.webNotifyText}>🔔 Activer Notifications</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {facturesEnRetard > 0 && activeTab !== 'factures' && (
        <TouchableOpacity style={styles.relanceBanner} onPress={() => setActiveTab('factures')}>
          <Text style={styles.relanceText}>URGENT ⚠️ Vous avez {facturesEnRetard} facture(s) impayée(s). Cliquez ici.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        
        {/* ONGLET 1: LE MUR */}
        {activeTab === 'mur' && (
          publications.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={{fontSize: 40}}>📭</Text>
              <Text style={styles.emptyStateText}>Aucune publication sur le mur pour le moment.</Text>
            </View>
          ) : (
            <FlatList 
              data={publications} 
              keyExtractor={(item) => item.id.toString()} 
              showsVerticalScrollIndicator={false}
              renderItem={({item}) => {
                const imageUrls = item.media_url ? item.media_url.split(',') : [];
                return (
                  <View style={[styles.postContainer, {borderLeftColor: '#E91E63', borderLeftWidth: 4}]}>
                    <View style={styles.postHeader}>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={styles.avatarCreche}><Text style={{fontSize: 18}}>🏫</Text></View>
                        <View>
                          <Text style={styles.postAuthor}>{item.auteur || 'La Direction'}</Text>
                          <Text style={styles.postDate}>{new Date(item.date_creation).toLocaleDateString()}</Text>
                        </View>
                      </View>
                    </View>
                    
                    {imageUrls.length > 0 && (
                      <View style={styles.multiImageContainer}>
                        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={true}>
                          {imageUrls.map((url, idx) => (
                            <TouchableOpacity 
                              key={idx} 
                              activeOpacity={0.9} 
                              onPress={() => { 
                                setImageView(url); 
                                setModalImageVisible(true); 
                                marquerCommeVu(item.id); 
                              }}
                            >
                              <Image source={{ uri: url }} style={styles.postMultiImage} resizeMode="contain" />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        
                        {imageUrls.length > 1 && (
                          <View style={styles.multiBadge}>
                            <Text style={styles.multiBadgeText}>1 / {imageUrls.length} ➡️</Text>
                          </View>
                        )}
                      </View>
                    )}
                    
                    <View style={styles.postBody}>
                      {item.texte ? <Text style={styles.postDescription}>{item.texte}</Text> : null}
                    </View>
                  </View>
                );
              }} 
            />
          )
        )}
        
        {/* ONGLET 2: DOSSIERS & CAHIER DE LIAISON */}
        {activeTab === 'dossiers' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Dossiers de mes enfants</Text>
            {enfants.length === 0 ? (
               <Text style={styles.emptyText}>Aucun dossier enfant rattaché à votre compte.</Text>
            ) : (
              enfants.map(enfant => {
                const cahier = cahiersJour[enfant.id]; 
                const statutCertif = statutAttestations[enfant.id];

                return (
                  <View key={enfant.id} style={[styles.dossierCard, {borderLeftWidth: 4, borderLeftColor: '#8BC34A'}]}>
                    <View style={styles.dossierHeader}>
                      {enfant.photo_url ? <Image source={{ uri: enfant.photo_url }} style={styles.dossierPhoto} /> : <View style={styles.dossierPhotoPlaceholder}><Text style={{fontSize: 25}}>👦</Text></View>}
                      <View style={{flex: 1}}>
                        <Text style={styles.dossierName}>{enfant.prenom} {enfant.nom}</Text>
                        <Text style={styles.dossierCode}>🎂 Né(e) le : {enfant.date_naissance || 'Non renseigné'}</Text>
                        <Text style={styles.classeText}>🏫 Classe : {enfant.classe || 'Non définie'}</Text>
                        <Text style={[styles.dossierCode, {marginTop: 6}]}>Code : {enfant.code_parent}</Text>
                      </View>
                    </View>
                    
                    {cahier ? (
                      <View style={styles.cahierBox}>
                        <Text style={styles.cahierTitle}>📝 La journée d'aujourd'hui</Text>
                        <View style={styles.cahierGrid}>
                          <View style={styles.cahierItem}><Text style={styles.cahierLabel}>🍽️ Repas</Text><Text style={styles.cahierValue}>{cahier.repas || '-'}</Text></View>
                          <View style={styles.cahierItem}><Text style={styles.cahierLabel}>💤 Sieste</Text><Text style={styles.cahierValue}>{cahier.sieste || '-'}</Text></View>
                          <View style={styles.cahierItem}><Text style={styles.cahierLabel}>😊 Humeur</Text><Text style={styles.cahierValue}>{cahier.humeur || '-'}</Text></View>
                          <View style={styles.cahierItem}><Text style={styles.cahierLabel}>🧻 Change</Text><Text style={styles.cahierValue}>{cahier.toilettes || '-'}</Text></View>
                        </View>
                        {cahier.remarques ? (
                          <View style={styles.cahierMotDoux}><Text style={{fontStyle: 'italic', color: '#2C3E50'}}>"{cahier.remarques}"</Text></View>
                        ) : null}
                      </View>
                    ) : <Text style={{color: '#95A5A6', fontStyle: 'italic', marginBottom: 15, fontSize: 12}}>Le résumé de la journée n'est pas encore disponible.</Text>}

                    <View style={styles.medicalBox}>
                      <Text style={styles.medicalTitle}>🩺 Dossier Médical :</Text>
                      <Text style={styles.medicalText}>{enfant.details_allergie || enfant.remarques_medicales || "Aucune remarque médicale renseignée."}</Text>
                      
                      <View style={{flexDirection: 'row', gap: 10}}>
                        <TouchableOpacity style={[styles.editMedicalBtn, {flex: 1}]} onPress={() => ouvrirModalMedical(enfant)}>
                          <Text style={styles.editMedicalText}>✏️ Santé</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={[
                            styles.editMedicalBtn, 
                            {flex: 1}, 
                            statutCertif === 'en_attente' ? {backgroundColor: '#FF9800'} : 
                            statutCertif === 'imprime' ? {backgroundColor: '#8BC34A'} : 
                            {backgroundColor: '#00BCD4'}
                          ]} 
                          onPress={() => envoyerDemandeScolarite(enfant)}
                          disabled={statutCertif === 'en_attente'} 
                        >
                          <Text style={styles.editMedicalText}>
                            {statutCertif === 'en_attente' ? '⏳ En cours...' : 
                             statutCertif === 'imprime' ? '✅ Prêt (Direction)-Nouveau certificat' : 
                             '📄 Certificat'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ONGLET 3: RESSOURCES */}
        {activeTab === 'ressources' && (
          <View style={{flex: 1}}>
            <View style={styles.rTabContainer}>
              <TouchableOpacity 
                onPress={() => setActiveRessourceTab('menus')} 
                style={[
                  styles.rTabBtn, 
                  activeRessourceTab === 'menus' ? { backgroundColor: '#FF9800', elevation: 3 } : { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FFE0B2' }
                ]}
              >
                <Text style={[styles.rTabText, { color: activeRessourceTab === 'menus' ? '#FFF' : '#E65100' }]}>🍽️ Menus Cantine</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => setActiveRessourceTab('documents')} 
                style={[
                  styles.rTabBtn, 
                  activeRessourceTab === 'documents' ? { backgroundColor: '#9C27B0', elevation: 3 } : { backgroundColor: '#F3E5F5', borderWidth: 1, borderColor: '#E1BEE7' }
                ]}
              >
                <Text style={[styles.rTabText, { color: activeRessourceTab === 'documents' ? '#FFF' : '#4A148C' }]}>📂 Documents Utiles</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop: 10}}>
              {activeRessourceTab === 'menus' ? (
                menus.length === 0 ? <Text style={styles.emptyText}>Aucun menu de cantine publié pour le moment.</Text> :
                menus.map(item => (
                  <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#FF9800' }]}>
                    <Text style={styles.ressourceTitle}>{item.description}</Text>
                    {item.image_url && (
                      <TouchableOpacity activeOpacity={0.9} onPress={() => { setImageView(item.image_url); setModalImageVisible(true); }}>
                        <Image source={{uri: item.image_url}} style={styles.ressourceImage} resizeMode="contain" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              ) : (
                documents.length === 0 ? <Text style={styles.emptyText}>Aucun document publié pour le moment.</Text> :
                documents.map(item => (
                  <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#9C27B0' }]}>
                    <Text style={styles.ressourceTitle}>📎 {item.titre}</Text>
                    {item.fichier_url && (
                      <TouchableOpacity activeOpacity={0.9} onPress={() => { setImageView(item.fichier_url); setModalImageVisible(true); }}>
                        <Image source={{uri: item.fichier_url}} style={styles.ressourceImage} resizeMode="contain" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
        
        {/* ONGLET 4: FACTURES */}
        {activeTab === 'factures' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, {color: '#F44336'}]}>🔴 À régler ({facturesEnAttente.length})</Text>
            {facturesEnAttente.length === 0 ? <Text style={styles.emptyText}>Aucune facture en attente de paiement. 🎉</Text> : 
              facturesEnAttente.map(item => (
                <View key={item.id.toString()} style={styles.factureCard}>
                  <View style={styles.factureHeader}><View><Text style={styles.factureTitre}>{item.titre}</Text><Text style={styles.factureEnfant}>👦 {item.enfants?.prenom}</Text></View><Text style={styles.factureMontant}>{item.montant} Dhs</Text></View>
                  <TouchableOpacity style={styles.payButton} onPress={() => {setFactureAPayer(item); setRecuUri(null); setRecuBase64(null); setModalPaiementVisible(true);}}>
                    <Text style={styles.payButtonText}>Régler par Virement</Text>
                  </TouchableOpacity>
                </View>
              ))
            }

            {facturesEnVerification.length > 0 && (
              <View style={{marginTop: 20}}>
                <Text style={[styles.sectionTitle, {color: '#9C27B0'}]}>🟣 En cours de vérification ({facturesEnVerification.length})</Text>
                {facturesEnVerification.map(item => (
                  <View key={item.id.toString()} style={[styles.facturePayeeCard, {borderLeftColor: '#9C27B0'}]}>
                    <View style={styles.factureHeader}><View><Text style={styles.factureTitrePayee}>{item.titre}</Text></View><Text style={[styles.factureMontantPayee, {color: '#9C27B0'}]}>{item.montant} Dhs</Text></View>
                    <Text style={{color: '#9C27B0', fontSize: 12, fontStyle: 'italic', marginTop: 5}}>⏳ En attente de validation par la direction</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, {marginTop: 30, color: '#4CAF50'}]}>🟢 Historique payé ({facturesPayees.length})</Text>
            {facturesPayees.length === 0 ? <Text style={styles.emptyText}>Aucun historique de paiement pour l'instant.</Text> :
              facturesPayees.map(item => (
                <View key={item.id.toString()} style={[styles.facturePayeeCard, {borderLeftColor: '#4CAF50'}]}>
                  <View style={styles.factureHeader}><View><Text style={styles.factureTitrePayee}>{item.titre}</Text></View><Text style={[styles.factureMontantPayee, {color: '#4CAF50'}]}>{item.montant} Dhs</Text></View>
                  <Text style={styles.datePaiementText}>✅ Validé le {new Date(item.date_paiement).toLocaleDateString('fr-FR')}</Text>
                </View>
              ))
            }
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('mur')}><Text style={[styles.navIcon, activeTab === 'mur' && {color: '#E91E63'}]}>🏠</Text><Text style={[styles.navText, activeTab === 'mur' && {color: '#E91E63'}]}>Le Mur</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('dossiers')}><Text style={[styles.navIcon, activeTab === 'dossiers' && {color: '#8BC34A'}]}>🎒</Text><Text style={[styles.navText, activeTab === 'dossiers' && {color: '#8BC34A'}]}>Dossiers</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('ressources')}><Text style={[styles.navIcon, activeTab === 'ressources' && {color: '#9C27B0'}]}>📂</Text><Text style={[styles.navText, activeTab === 'ressources' && {color: '#9C27B0'}]}>Infos</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('factures')}><View><Text style={[styles.navIcon, activeTab === 'factures' && {color: '#FF9800'}]}>💳</Text>{facturesEnRetard > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{facturesEnRetard}</Text></View>}</View><Text style={[styles.navText, activeTab === 'factures' && {color: '#FF9800'}]}>Paiements</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Messagerie')}><View><Text style={styles.navIcon}>💬</Text>{unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}</View><Text style={styles.navText}>Messages</Text></TouchableOpacity>
      </View>

      <Modal visible={modalMedicalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {maxHeight: '90%'}]}>
              <Text style={styles.modalTitle}>Dossier Médical de {enfantSelectionne?.prenom}</Text>
              <Text style={styles.label}>Signalez toute allergie, traitement en cours, ou consigne particulière :</Text>
              <TextInput style={[styles.input, styles.textArea]} value={remarqueTemp} onChangeText={setRemarqueTemp} multiline={true} placeholder="Ex: Allergique aux arachides..." />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalMedicalVisible(false)}>
                  <Text style={styles.buttonTextWhite}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={sauvegarderMedical}>
                  <Text style={styles.buttonTextWhite}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      <Modal visible={modalPaiementVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}> 
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.modalTitle}>Régler : {factureAPayer?.titre}</Text>
              <Text style={styles.factureMontantCenter}>{factureAPayer?.montant} Dhs</Text>

              <Text style={styles.sectionTitle}>1. Nos coordonnées bancaires</Text>
              {banques.length === 0 ? <Text style={{fontStyle: 'italic', marginBottom: 15, textAlign: 'center'}}>Aucun compte bancaire configuré.</Text> : 
                banques.map(b => (
                  <View key={b.id.toString()} style={styles.banqueCard}>
                    <Text style={{fontWeight: '900', color: '#0F172A'}}>{b.nom_banque}</Text>
                    <Text selectable={true} style={{color: '#64748B', fontSize: 16, marginTop: 5, letterSpacing: 1}}>{b.rib}</Text>
                  </View>
                ))
              }

              <Text style={styles.sectionTitle}>2. Envoyer la preuve de virement</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={choisirRecu}>
                <Text style={styles.uploadBtnText}>📸 {recuUri ? "Changer l'image" : "Photographier le reçu"}</Text>
              </TouchableOpacity>
              
              {recuUri && <Image source={{ uri: recuUri }} style={styles.previewRecu} />}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalPaiementVisible(false)}>
                  <Text style={styles.buttonTextWhite}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, {backgroundColor: '#2196F3'}]} onPress={envoyerRecu} disabled={uploadingRecu}>
                  {uploadingRecu ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextWhite}>Envoyer le reçu</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalImageVisible} transparent={true} animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={styles.closeImageBtn} onPress={() => setModalImageVisible(false)}>
            <Text style={styles.closeImageText}>✖ Fermer</Text>
          </TouchableOpacity>
          {imageView && (
            <Image source={{ uri: imageView }} style={styles.fullScreenImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.downloadBtn} onPress={() => telechargerPhotoOriginale(imageView)} disabled={loadingDownload}>
            {loadingDownload ? <ActivityIndicator color="#FFF" /> : <Text style={styles.downloadBtnText}>⬇️ Télécharger / Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFFFFF', padding: 20, paddingTop: Platform.OS === 'ios' ? 40 : 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 4 },
  greeting: { fontSize: 24, fontWeight: '900', color: '#4A148C' },
  subtitle: { fontSize: 16, color: '#E91E63', marginTop: 2, fontWeight: '700' },
  
  webNotifyBtn: { backgroundColor: '#E0F7FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#B2EBF2' },
  webNotifyText: { fontSize: 12, color: '#00BCD4', fontWeight: '800' },

  relanceBanner: { backgroundColor: '#F44336', padding: 15, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  relanceText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  content: { flex: 1, padding: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 15, marginTop: 10 },
  
  postContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, justifyContent: 'space-between' },
  avatarCreche: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FCE4EC', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  postAuthor: { fontWeight: '800', color: '#E91E63', fontSize: 16 },
  postDate: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  
  multiImageContainer: { position: 'relative', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }, 
  postMultiImage: { width: screenWidth - 30, height: 350 },
  multiBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  multiBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  expirationBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(231, 76, 60, 0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  expirationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  postBody: { padding: 15 },
  postDescription: { color: '#334155', fontSize: 15, lineHeight: 22, fontWeight: '500' },

  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20, zIndex: 10 },
  closeImageText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  fullScreenImage: { width: '100%', height: '80%' },
  downloadBtn: { position: 'absolute', bottom: 40, backgroundColor: '#00BCD4', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  downloadBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  dossierCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 3, borderWidth: 1, borderColor: '#F1F8E9' },
  dossierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dossierPhoto: { width: 64, height: 64, borderRadius: 32, marginRight: 15 },
  dossierPhotoPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  dossierName: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  dossierCode: { fontSize: 13, color: '#FF9800', fontWeight: '700', marginTop: 2 },
  
  classeText: { fontSize: 13, color: '#00BCD4', fontWeight: '800', marginTop: 4 },
  
  medicalBox: { backgroundColor: '#FFF3E0', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#FFE0B2' },
  medicalTitle: { fontWeight: '800', color: '#E65100', marginBottom: 5 },
  medicalText: { color: '#D84315', fontSize: 14, marginBottom: 10, fontStyle: 'italic', fontWeight: '500' },
  editMedicalBtn: { padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#FF9800' },
  editMedicalText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  
  cahierBox: { backgroundColor: '#F3E5F5', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E1BEE7' },
  cahierTitle: { fontSize: 15, fontWeight: '800', color: '#9C27B0', marginBottom: 10 },
  cahierGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cahierItem: { width: '48%', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cahierLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 2, fontWeight: '700' },
  cahierValue: { fontSize: 14, fontWeight: '900', color: '#1E293B' },
  cahierMotDoux: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 10, marginTop: 5, borderLeftWidth: 4, borderLeftColor: '#9C27B0' },
  
  rTabContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  rTabBtn: { flex: 0.48, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  rTabText: { fontWeight: '800', fontSize: 14 },
  ressourceCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2 },
  ressourceTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  ressourceImage: { width: '100%', height: 400, borderRadius: 10, backgroundColor: '#F8FAFC' },
  emptyText: { textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', marginTop: 30, fontWeight: '500' },
  
  factureCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 15, elevation: 3, borderLeftWidth: 5, borderLeftColor: '#F44336' },
  factureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  factureTitre: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  factureEnfant: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '600' },
  factureMontant: { fontSize: 18, fontWeight: '900', color: '#F44336' },
  payButton: { backgroundColor: '#2196F3', padding: 14, borderRadius: 10, alignItems: 'center' },
  payButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  
  facturePayeeCard: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 5 },
  factureTitrePayee: { fontSize: 16, fontWeight: '800', color: '#94A3B8', textDecorationLine: 'line-through' },
  factureMontantPayee: { fontSize: 18, fontWeight: '900' },
  datePaiementText: { color: '#4CAF50', fontSize: 12, fontStyle: 'italic', marginTop: 5, backgroundColor: '#E8F5E9', padding: 8, borderRadius: 6, overflow: 'hidden', fontWeight: '600' },

  bottomNav: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', elevation: 10, zIndex: 100 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 24, color: '#CBD5E1', marginBottom: 2 },
  navText: { fontSize: 10, color: '#94A3B8', fontWeight: '800' },
  badge: { position: 'absolute', top: -5, right: -10, backgroundColor: '#F44336', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  
  emptyStateContainer: { alignItems: 'center', marginTop: 50 },
  emptyStateText: { color: '#94A3B8', fontSize: 15, marginTop: 10, fontStyle: 'italic', fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: 15 },
  factureMontantCenter: { fontSize: 28, fontWeight: '900', color: '#F44336', textAlign: 'center', marginBottom: 20 },
  banqueCard: { backgroundColor: '#F8FAFC', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  uploadBtn: { backgroundColor: '#F1F5F9', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed' },
  uploadBtnText: { color: '#475569', fontWeight: '800' },
  previewRecu: { width: '100%', height: 150, borderRadius: 12, resizeMode: 'cover', marginBottom: 15 },

  label: { fontSize: 14, color: '#475569', marginBottom: 10, fontWeight: '600' },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, color: '#1E293B' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  button: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#94A3B8' },
  confirmButton: { backgroundColor: '#8BC34A' },
  buttonTextWhite: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 }
});