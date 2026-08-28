import { useFocusEffect } from '@react-navigation/native';
import { decode } from 'base64-arraybuffer';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// Helper pour décoder base64
const decodeBase64 = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper pour les clés VAPID (Web Push PWA)
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
    
    // On garde l'enregistrement Expo INTACT pour Android / iOS Natif
    if (Platform.OS !== 'web') {
      enregistrerNotificationsNatives();
    }
  }, []);

  useFocusEffect(React.useCallback(() => { calculerMessagesNonLus(); }, []));

  // --- 1. NOTIFICATIONS NATIVES (EXPO - INTACT) ---
  const enregistrerNotificationsNatives = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log("Permission refusée par l'utilisateur.");
        return;
      }
      
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ 
          projectId: 'fd75764c-a292-4621-92c4-f0e764845de5',
          applicationId: 'com.souiria.CrecheApp'
        });
        
        const token = tokenData.data;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('utilisateurs').update({ expo_push_token: token }).eq('id', user.id);
        }
      } catch (error) { 
        console.log("Erreur token natif:", error.message);
      }
    }
  };

  // --- 2. NOTIFICATIONS WEB (SAFARI iOS PWA & CHROME) ---
  const demanderNotificationsWeb = async () => {
    try {
      // Détection stricte d'iOS et du mode d'affichage (PWA vs Safari classique)
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

      // Safari bloque les notifications si ce n'est pas installé sur l'écran d'accueil
      if (isIos && !isStandalone) {
        window.alert("🍎 Pour activer les notifications sur iPhone, vous devez ajouter cette page à votre écran d'accueil (Partager -> Sur l'écran d'accueil), puis l'ouvrir depuis là.");
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        window.alert("Les notifications Web ne sont pas supportées sur ce navigateur.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        window.alert("Permission refusée pour les notifications.");
        return;
      }

      // Enregistrement du Service Worker
      const registration = await navigator.serviceWorker.register('/custom-service-worker.js');

      // Clé Publique VAPID
      const PUBLIC_VAPID_KEY = 'BMoEmfnBAMNj17YLZsgTyh6a-eYccHXgZy5KqMZ8Vc9lh1rvl1NV6uc-7JUn2DjcKC0U55XipmxIFOnHBNcxBdU';

      // Création de l'abonnement Web Push pur (Compatible Apple)
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
      });

      // Sauvegarde dans la nouvelle colonne Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('utilisateurs').update({ 
          web_push_sub: pushSubscription // Sauvegarde le JSON brut
        }).eq('id', user.id);
        
        window.alert("✅ Notifications Safari/Chrome activées avec succès !");
      }
    } catch (error) { 
      console.log("Erreur Web Push:", error); 
      window.alert("Impossible d'activer les notifications : " + error.message);
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
      const { data, error } = await supabase.from('publications').select('*').order('date_creation', { ascending: false });
      if (error) throw error;
      if (data) {
        const now = new Date();
        const publicationsValides = data.filter(post => {
          if (!post.date_expiration) return true; 
          return new Date(post.date_expiration) >= now; 
        });
        setPublications(publicationsValides);
      }
    } catch (e) {
      console.log("Erreur chargement mur:", e.message);
    }
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

        const { data: attestations } = await supabase
          .from('demandes_attestation')
          .select('*')
          .in('enfant_id', enfantIds)
          .order('date_demande', { ascending: false }); 

        if (attestations) {
          const attMap = {};
          attestations.forEach(att => {
            if (!attMap[att.enfant_id]) {
              attMap[att.enfant_id] = att.statut;
            }
          });
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
      
    } catch (error) { 
      console.error("Erreur Dashboard:", error); 
    } finally { 
      setLoading(false); 
    }
  };

  const ouvrirModalMedical = (enfant) => {
    setEnfantSelectionne(enfant);
    setRemarqueTemp(enfant.details_allergie || enfant.remarques_medicales || '');
    setModalMedicalVisible(true);
  };

  const sauvegarderMedical = async () => {
    setLoading(true);
    try {
      await supabase.from('enfants').update({ 
        remarques_medicales: remarqueTemp,
        details_allergie: remarqueTemp,
        a_allergie: remarqueTemp.length > 0 
      }).eq('id', enfantSelectionne.id);
      
      const { data: admin } = await supabase.from('utilisateurs').select('id').eq('role', 'admin').single();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (admin) {
        await supabase.from('messages').insert([{
          expediteur_id: user.id,
          destinataire_id: admin.id,
          texte: `Le parent a mis à jour les informations médicales de ${enfantSelectionne.prenom} ${enfantSelectionne.nom}. Nouveau dossier : ${remarqueTemp}`
        }]);
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

      const { data: existante } = await supabase.from('demandes_attestation')
        .select('id').eq('enfant_id', enfant.id).eq('statut', 'en_attente');
      
      if (existante && existante.length > 0) {
         Alert.alert("Info", "Une attestation est déjà en cours de préparation pour cet enfant.");
         setLoading(false);
         return;
      }

      await supabase.from('demandes_attestation').insert([{
        enfant_id: enfant.id,
        parent_id: user.id,
        statut: 'en_attente'
      }]);

      const { data: admin } = await supabase.from('utilisateurs').select('id').eq('role', 'admin').single();
      if (admin) {
        await supabase.from('messages').insert([{
          expediteur_id: user.id,
          destinataire_id: admin.id,
          texte: `📄 J'ai fait une demande d'attestation de scolarité pour ${enfant.prenom} ${enfant.nom}.`
        }]);
      }

      setStatutAttestations(prev => ({ ...prev, [enfant.id]: 'en_attente' }));
      Alert.alert("Succès", "Votre demande a été envoyée. L'attestation sera bientôt prête.");
    } catch (error) { 
      Alert.alert("Erreur", error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  const choisirRecu = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      quality: 0.6,
      base64: true 
    });
    if (!result.canceled) {
      setRecuUri(result.assets[0].uri);
      setRecuBase64(result.assets[0].base64); 
    }
  };

  const envoyerRecu = async () => {
    if (!recuBase64) { alert("Veuillez d'abord sélectionner la photo de votre reçu."); return; }
    setUploadingRecu(true);
    
    try {
      const fileName = `recu_${factureAPayer.id}_${Date.now()}.jpg`;
      const binaryData = decodeBase64(recuBase64);
      const { error: uploadError } = await supabase.storage.from('recus_paiements').upload(fileName, binaryData, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('recus_paiements').getPublicUrl(fileName);
      
      const { error: updateError } = await supabase.from('paiements').update({ statut: 'en_verification', recu_url: publicUrlData.publicUrl }).eq('id', factureAPayer.id);
      if (updateError) throw updateError;

      Alert.alert("Merci !", "Votre reçu a été envoyé. La direction va le valider sous peu.");
      setModalPaiementVisible(false);
      chargerDonneesParent();
    } catch (error) { alert("Erreur lors de l'envoi : " + error.message); } finally { setUploadingRecu(false); }
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
        await Sharing.shareAsync(uri, { 
          mimeType: 'image/jpeg', 
          dialogTitle: 'Enregistrer ou Partager la photo',
          UTI: 'public.jpeg' 
        });
      } else {
        Alert.alert('Erreur', "Le partage/enregistrement n'est pas disponible sur cet appareil.");
      }
    } catch (error) {
      Alert.alert("Erreur", "Impossible de télécharger l'image : " + error.message);
    } finally {
      setLoadingDownload(false);
    }
  };

  if (loading && enfants.length === 0) return <View style={styles.center}><ActivityIndicator size="large" color="#3498DB" /></View>;

  const facturesEnAttente = factures.filter(f => f.statut === 'en_attente');
  const facturesEnVerification = factures.filter(f => f.statut === 'en_verification');
  const facturesPayees = factures.filter(f => f.statut === 'paye');
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
              <Text style={{color: '#E74C3C', fontWeight: 'bold', marginBottom: Platform.OS === 'web' ? 8 : 0}}>Déconnexion</Text>
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
                  <View style={styles.postContainer}>
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
                              onPress={() => { setImageView(url); setModalImageVisible(true); }}
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

                        {item.date_expiration && (
                          <View style={styles.expirationBadge}>
                            <Text style={styles.expirationText}>
                              ⏳ Disparaît le {new Date(item.date_expiration).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'})}
                            </Text>
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
                  <View key={enfant.id} style={styles.dossierCard}>
                    <View style={styles.dossierHeader}>
                      {enfant.photo_url ? <Image source={{ uri: enfant.photo_url }} style={styles.dossierPhoto} /> : <View style={styles.dossierPhotoPlaceholder}><Text style={{fontSize: 25}}>👦</Text></View>}
                      <View style={{flex: 1}}><Text style={styles.dossierName}>{enfant.prenom} {enfant.nom}</Text><Text style={styles.dossierCode}>Code : {enfant.code_parent}</Text></View>
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
                            statutCertif === 'en_attente' ? {backgroundColor: '#F39C12'} : 
                            statutCertif === 'imprime' ? {backgroundColor: '#27AE60'} : 
                            {backgroundColor: '#3498DB'}
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
                  activeRessourceTab === 'menus' ? { backgroundColor: '#E67E22', elevation: 3 } : { backgroundColor: '#FDEBD0', borderWidth: 1, borderColor: '#F5B041' }
                ]}
              >
                <Text style={[styles.rTabText, { color: activeRessourceTab === 'menus' ? '#FFF' : '#D35400' }]}>🍽️ Menus Cantine</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => setActiveRessourceTab('documents')} 
                style={[
                  styles.rTabBtn, 
                  activeRessourceTab === 'documents' ? { backgroundColor: '#8E44AD', elevation: 3 } : { backgroundColor: '#F4ECF7', borderWidth: 1, borderColor: '#D2B4DE' }
                ]}
              >
                <Text style={[styles.rTabText, { color: activeRessourceTab === 'documents' ? '#FFF' : '#5B2C6F' }]}>📂 Documents Utiles</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop: 10}}>
              {activeRessourceTab === 'menus' ? (
                menus.length === 0 ? <Text style={styles.emptyText}>Aucun menu de cantine publié pour le moment.</Text> :
                menus.map(item => (
                  <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#E67E22' }]}>
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
                  <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#8E44AD' }]}>
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
            <Text style={styles.sectionTitle}>🔴 À régler ({facturesEnAttente.length})</Text>
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
                <Text style={[styles.sectionTitle, {color: '#8E44AD'}]}>🟣 En cours de vérification ({facturesEnVerification.length})</Text>
                {facturesEnVerification.map(item => (
                  <View key={item.id.toString()} style={[styles.facturePayeeCard, {borderLeftColor: '#8E44AD'}]}>
                    <View style={styles.factureHeader}><View><Text style={styles.factureTitrePayee}>{item.titre}</Text></View><Text style={[styles.factureMontantPayee, {color: '#8E44AD'}]}>{item.montant} Dhs</Text></View>
                    <Text style={{color: '#8E44AD', fontSize: 12, fontStyle: 'italic', marginTop: 5}}>⏳ En attente de validation par la direction</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, {marginTop: 30, color: '#27AE60'}]}>🟢 Historique payé ({facturesPayees.length})</Text>
            {facturesPayees.length === 0 ? <Text style={styles.emptyText}>Aucun historique de paiement pour l'instant.</Text> :
              facturesPayees.map(item => (
                <View key={item.id.toString()} style={styles.facturePayeeCard}>
                  <View style={styles.factureHeader}><View><Text style={styles.factureTitrePayee}>{item.titre}</Text></View><Text style={styles.factureMontantPayee}>{item.montant} Dhs</Text></View>
                  <Text style={styles.datePaiementText}>✅ Validé le {new Date(item.date_paiement).toLocaleDateString('fr-FR')}</Text>
                </View>
              ))
            }
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('mur')}><Text style={[styles.navIcon, activeTab === 'mur' && styles.navIconActive]}>🏠</Text><Text style={[styles.navText, activeTab === 'mur' && styles.navTextActive]}>Le Mur</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('dossiers')}><Text style={[styles.navIcon, activeTab === 'dossiers' && styles.navIconActive]}>🎒</Text><Text style={[styles.navText, activeTab === 'dossiers' && styles.navTextActive]}>Dossiers</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('ressources')}><Text style={[styles.navIcon, activeTab === 'ressources' && styles.navIconActive]}>📂</Text><Text style={[styles.navText, activeTab === 'ressources' && styles.navTextActive]}>Infos</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('factures')}><View><Text style={[styles.navIcon, activeTab === 'factures' && styles.navIconActive]}>💳</Text>{facturesEnRetard > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{facturesEnRetard}</Text></View>}</View><Text style={[styles.navText, activeTab === 'factures' && styles.navTextActive]}>Paiements</Text></TouchableOpacity>
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
                    <Text style={{fontWeight: 'bold', color: '#34495E'}}>{b.nom_banque}</Text>
                    <Text selectable={true} style={{color: '#7F8C8D', fontSize: 16, marginTop: 5, letterSpacing: 1}}>{b.rib}</Text>
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

                <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={envoyerRecu} disabled={uploadingRecu}>
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
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFF', padding: 20, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 2 },
  
  webNotifyBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  webNotifyText: { fontSize: 11, color: '#4F46E5', fontWeight: 'bold' },

  relanceBanner: { backgroundColor: '#E74C3C', padding: 15, alignItems: 'center', justifyContent: 'center' },
  relanceText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  content: { flex: 1, padding: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, marginTop: 10 },
  
  postContainer: { backgroundColor: '#FFF', borderRadius: 15, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, justifyContent: 'space-between' },
  avatarCreche: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAEDED', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  postAuthor: { fontWeight: 'bold', color: '#2C3E50', fontSize: 15 },
  postDate: { color: '#7F8C8D', fontSize: 12 },
  
  multiImageContainer: { position: 'relative', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }, 
  postMultiImage: { width: screenWidth - 30, height: 350 },
  multiBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  multiBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  expirationBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(231, 76, 60, 0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  expirationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  postBody: { padding: 15 },
  postDescription: { color: '#34495E', fontSize: 15, lineHeight: 22 },

  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20, zIndex: 10 },
  closeImageText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  fullScreenImage: { width: '100%', height: '80%' },
  downloadBtn: { position: 'absolute', bottom: 40, backgroundColor: '#3498DB', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  downloadBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  dossierCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2 },
  dossierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dossierPhoto: { width: 60, height: 60, borderRadius: 30, marginRight: 15 },
  dossierPhotoPlaceholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EAEDED', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  dossierName: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  dossierCode: { fontSize: 13, color: '#8E44AD', fontWeight: 'bold', marginTop: 2 },
  medicalBox: { backgroundColor: '#FEF9E7', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#F1C40F' },
  medicalTitle: { fontWeight: 'bold', color: '#D35400', marginBottom: 5 },
  medicalText: { color: '#34495E', fontSize: 14, marginBottom: 10, fontStyle: 'italic' },
  editMedicalBtn: { backgroundColor: '#F39C12', padding: 10, borderRadius: 8, alignItems: 'center' },
  editMedicalText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  cahierBox: { backgroundColor: '#F4ECF7', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#D7BDE2' },
  cahierTitle: { fontSize: 15, fontWeight: 'bold', color: '#8E44AD', marginBottom: 10 },
  cahierGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cahierItem: { width: '48%', backgroundColor: '#FFF', padding: 10, borderRadius: 8, marginBottom: 10, elevation: 1 },
  cahierLabel: { fontSize: 11, color: '#7F8C8D', marginBottom: 2 },
  cahierValue: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50' },
  cahierMotDoux: { backgroundColor: '#FFF', padding: 10, borderRadius: 8, marginTop: 5, borderLeftWidth: 3, borderLeftColor: '#8E44AD' },
  
  rTabContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  rTabBtn: { flex: 0.48, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  rTabText: { fontWeight: 'bold', fontSize: 14 },
  ressourceCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2 },
  ressourceTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 10 },
  ressourceImage: { width: '100%', height: 400, borderRadius: 10, backgroundColor: '#F9FAFC' },
  emptyText: { textAlign: 'center', color: '#95A5A6', fontStyle: 'italic', marginTop: 30 },
  
  factureCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#E74C3C' },
  factureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  factureTitre: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  factureEnfant: { fontSize: 13, color: '#7F8C8D', marginTop: 4 },
  factureMontant: { fontSize: 18, fontWeight: 'bold', color: '#E74C3C' },
  payButton: { backgroundColor: '#3498DB', padding: 12, borderRadius: 8, alignItems: 'center' },
  payButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  facturePayeeCard: { backgroundColor: '#F9FAFC', padding: 15, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#EAEDED', borderLeftWidth: 5, borderLeftColor: '#27AE60' },
  factureTitrePayee: { fontSize: 16, fontWeight: 'bold', color: '#7F8C8D', textDecorationLine: 'line-through' },
  factureMontantPayee: { fontSize: 18, fontWeight: 'bold', color: '#27AE60' },
  datePaiementText: { color: '#27AE60', fontSize: 12, fontStyle: 'italic', marginTop: 5, backgroundColor: '#EAFAF1', padding: 8, borderRadius: 5, overflow: 'hidden' },

  bottomNav: { flexDirection: 'row', backgroundColor: '#FFF', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0', elevation: 10, zIndex: 100 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 22, color: '#BDC3C7', marginBottom: 2 },
  navIconActive: { color: '#3498DB' },
  navText: { fontSize: 10, color: '#BDC3C7', fontWeight: 'bold' },
  navTextActive: { color: '#3498DB' },
  badge: { position: 'absolute', top: -5, right: -10, backgroundColor: '#E74C3C', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  
  emptyStateContainer: { alignItems: 'center', marginTop: 50 },
  emptyStateText: { color: '#95A5A6', fontSize: 15, marginTop: 10, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center', marginBottom: 15 },
  factureMontantCenter: { fontSize: 24, fontWeight: '900', color: '#E74C3C', textAlign: 'center', marginBottom: 20 },
  banqueCard: { backgroundColor: '#F9FAFC', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 10 },
  uploadBtn: { backgroundColor: '#EAEDED', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#BDC3C7', borderStyle: 'dashed' },
  uploadBtnText: { color: '#2C3E50', fontWeight: 'bold' },
  previewRecu: { width: '100%', height: 150, borderRadius: 10, resizeMode: 'cover', marginBottom: 15 },

  label: { fontSize: 13, color: '#34495E', marginBottom: 10 },
  input: { backgroundColor: '#F9FAFC', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  button: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#95A5A6' },
  confirmButton: { backgroundColor: '#27AE60' },
  buttonTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 15 }
});