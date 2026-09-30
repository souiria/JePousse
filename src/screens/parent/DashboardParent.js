import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
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

const windowWidth = Dimensions.get('window').width;
const isDesktop = Platform.OS === 'web' && windowWidth > 600;
const APP_MAX_WIDTH = 600;
const DYNAMIC_CARD_WIDTH = isDesktop ? APP_MAX_WIDTH - 60 : windowWidth - 30;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC', buttonText: '#FFFFFF' },
  demo: { primary: '#2196F3', background: '#E3F2FD', buttonText: '#FFFFFF' }
};

const moisNomsCal = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const PostImageCarousel = ({ imageUrls, onImagePress, onVideoPress }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const IMAGE_WIDTH = DYNAMIC_CARD_WIDTH - 4;

  const handleScroll = (event) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / IMAGE_WIDTH);
    if (slide !== activeIndex && slide >= 0 && slide < imageUrls.length) {
      setActiveIndex(slide);
    }
  };

  const renderCarouselItem = ({ item: url }) => {
    const isVideo = url.startsWith('video:');
    const cleanUrl = isVideo ? url.replace('video:', '') : url;

    if (isVideo) {
      const videoIdMatch = cleanUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      const thumbnailUrl = videoId ? `https://drive.google.com/thumbnail?id=${videoId}&sz=w800` : null;

      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onVideoPress(cleanUrl)}>
          <View style={{ position: 'relative', width: IMAGE_WIDTH }}>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={[styles.postMultiImage, { width: IMAGE_WIDTH }]} resizeMode="cover" />
            ) : (
              <View style={[styles.postMultiImage, { backgroundColor: '#1E293B', width: IMAGE_WIDTH }]} />
            )}
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Text style={styles.playTriangle}>▶</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => onImagePress(url)}>
        <Image source={{ uri: url }} style={[styles.postMultiImage, { width: IMAGE_WIDTH }]} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.multiImageContainer}>
      <FlatList
        data={imageUrls}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderCarouselItem}
        horizontal
        snapToInterval={IMAGE_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={(_, index) => ({
          length: IMAGE_WIDTH,
          offset: IMAGE_WIDTH * index,
          index,
        })}
      />
      {imageUrls.length > 1 && (
        <View style={styles.multiBadge}>
          <Text style={styles.multiBadgeText}>
            {activeIndex + 1} / {imageUrls.length} ➡️
          </Text>
        </View>
      )}
    </View>
  );
};

export default function DashboardParentScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('mur'); 
  const [parentNom, setParentNom] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [nomCreche, setNomCreche] = useState(Constants.expoConfig?.name || 'Ma Crèche');
  const [publications, setPublications] = useState([]);
  const [enfants, setEnfants] = useState([]);
  const [factures, setFactures] = useState([]); 
  const [banques, setBanques] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [loadingDownload, setLoadingDownload] = useState(false); 
  const [unreadCount, setUnreadCount] = useState(0);
  const [cahiersJour, setCahiersJour] = useState({}); 
  const [statutAttestations, setStatutAttestations] = useState({});

  const [alertesMedicales, setAlertesMedicales] = useState([]);
  const [recuperationsSOS, setRecuperationsSOS] = useState({});
  const [absencesKids, setAbsencesKids] = useState({}); 
  const [progresKids, setProgresKids] = useState({});

  const [modalAbsenceVisible, setModalAbsenceVisible] = useState(false);
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceDateObj, setAbsenceDateObj] = useState(new Date());
  const [showAbsenceDatePicker, setShowAbsenceDatePicker] = useState(false);
  const [absenceMotif, setAbsenceMotif] = useState('');
  
  const [modalSOSVisible, setModalSOSVisible] = useState(false);
  const [sosNom, setSosNom] = useState('');
  const [sosCin, setSosCin] = useState('');

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

  const [notifTokenStatus, setNotifTokenStatus] = useState('Vérification...');
  const [syncLoading, setSyncLoading] = useState(false);

  const [demandesFournitures, setDemandesFournitures] = useState([]);

  // 🚀 ÉTATS POUR LES COMMENTAIRES (Lecture seule pour les parents)
  const [modalCommentairesVisible, setModalCommentairesVisible] = useState(false);
  const [postActifCommentaires, setPostActifCommentaires] = useState(null);

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => { 
    chargerParametres(); 
    chargerDonneesParent(); 
    chargerMur(); 
    chargerBanques(); 
    chargerRessources(); 
    verifierTokenStatus();
    if (Platform.OS !== 'web') enregistrerNotificationsNatives();

    const uniqueChannelName = `parent_realtime_${Date.now()}`;
    const realtimeChannel = supabase.channel(uniqueChannelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertes_medicales' }, () => { chargerDonneesParent(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cahier_liaison' }, () => { chargerDonneesParent(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progres_enfants' }, () => { chargerDonneesParent(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enfants' }, () => { chargerDonneesParent(); }) 
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publications' }, () => { chargerMur(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sondages_options' }, () => { chargerMur(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sondages_votes' }, () => { chargerMur(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participations' }, () => { chargerMur(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_fournitures' }, () => { chargerDonneesParent(); })
      // 🚀 ÉCOUTEURS DES LIKES ET COMMENTAIRES EN TEMPS RÉEL
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes_publications' }, () => { chargerMur(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commentaires_publications' }, () => { chargerMur(); })
      .subscribe();

    return () => { 
      if (realtimeChannel) supabase.removeChannel(realtimeChannel); 
    };
  }, []);
  
  useFocusEffect(React.useCallback(() => { calculerMessagesNonLus(); }, []));

  const chargerParametres = async () => {
    try {
      const { data } = await supabase.from('parametres').select('cle, valeur').in('cle', ['nom_creche']);
      if (data) { const nom = data.find(p => p.cle === 'nom_creche')?.valeur; if (nom) setNomCreche(nom); }
    } catch (e) { console.log(e); }
  };

  const verifierTokenStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('utilisateurs').select('expo_push_token, web_push_sub').eq('id', user.id).single();
      if (Platform.OS === 'web') setNotifTokenStatus(data?.web_push_sub ? '🟢 Web Push Actif' : '❌ Non configuré');
      else setNotifTokenStatus(data?.expo_push_token ? '🟢 Mobile Push Actif' : '❌ Non configuré');
    } catch (e) { setNotifTokenStatus('⚠️ Indisponible'); }
  };

  const enregistrerNotificationsNatives = async () => {
    if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
      setNotifTokenStatus('⚠️ Expo Go (Push désactivé)');
      return;
    }

    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX });
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
      if (finalStatus !== 'granted') { setNotifTokenStatus('❌ Permissions refusées'); return; }
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: projectId });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { await supabase.from('utilisateurs').update({ expo_push_token: tokenData.data }).eq('id', user.id); setNotifTokenStatus('🟢 Mobile Push Actif'); }
      } catch (error) { setNotifTokenStatus('❌ Échec génération'); }
    } else { setNotifTokenStatus('💻 Simulateur (Pas de Push)'); }
  };

  const forcerSynchronisationAppareil = async () => {
    setSyncLoading(true);
    try {
      if (Platform.OS === 'web') await demanderNotificationsWeb(); else await enregistrerNotificationsNatives();
      await verifierTokenStatus(); Alert.alert("Synchronisation réussie", "Votre téléphone actuel a été correctement enregistré pour recevoir les alertes de la crèche.");
    } catch (e) { Alert.alert("Erreur", "La resynchronisation a échoué."); } finally { setSyncLoading(false); }
  };

  const handleSecureLogout = async () => {
    const executerDeconnexion = async () => {
      try {
        setLoading(true); const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('utilisateurs').update({ expo_push_token: null, web_push_sub: null }).eq('id', user.id);
        await supabase.auth.signOut(); navigation.replace('Login'); 
      } catch (error) { if (Platform.OS === 'web') window.alert("Erreur de déconnexion"); else Alert.alert("Erreur", "Impossible de se déconnecter."); setLoading(false); }
    };
    if (Platform.OS === 'web') { if (window.confirm("Voulez-vous vraiment vous déconnecter ?")) executerDeconnexion(); } 
    else { Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [{ text: "Annuler", style: "cancel" }, { text: "Oui", style: "destructive", onPress: executerDeconnexion }]); }
  };

  const demanderNotificationsWeb = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return Alert.alert("Permission", "Veuillez autoriser les notifications.");
      const registration = await navigator.serviceWorker.register('/custom-service-worker.js');
      const PUBLIC_VAPID_KEY = 'BI_Tzccj4plYD_YX6ssnZ3K5PMpgo4pEjd-DOMNG1vriOzJo_Dvs45Q4la7UhCqRWjWxfQdOVlLSaYLK8tryZwY'; 
      const pushSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY) });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { await supabase.from('utilisateurs').update({ web_push_sub: JSON.stringify(pushSubscription) }).eq('id', user.id); setNotifTokenStatus('🟢 Web Push Actif'); }
    } catch (error) { Alert.alert("Erreur", error.message); }
  };

  const chargerRessources = async () => {
    const { data: menusData } = await supabase.from('menus_cantine').select('*').order('semaine_du', { ascending: false }); if (menusData) setMenus(menusData);
    const { data: docsData } = await supabase.from('documents_utiles').select('*').order('date_ajout', { ascending: false }); if (docsData) setDocuments(docsData);
  };

  const calculerMessagesNonLus = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: userData = {} } = await supabase.from('utilisateurs').select('derniere_lecture_messagerie').eq('id', user.id).single();
    const derniereLecture = userData?.derniere_lecture_messagerie || '2000-01-01T00:00:00.000Z';
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('destinataire_id', user.id).gt('date_creation', derniereLecture);
    setUnreadCount(count || 0);
  };

  const marquerCommeVu = async (publicationId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = currentUserId || user?.id;
      if (!uid) return;
      const { data: vueExistante } = await supabase.from('vues_publications').select('id').eq('publication_id', publicationId).eq('utilisateur_id', uid).maybeSingle(); 
      if (!vueExistante) await supabase.from('vues_publications').insert([{ publication_id: publicationId, utilisateur_id: uid }]);
    } catch (error) { console.log("Erreur vue silencieuse :", error.message); }
  };

  const chargerMur = async () => {
    try {
      const { data, error } = await supabase
        .from('publications')
        .select(`
          *,
          sondages_options (id, texte_option, sondages_votes(id, parent_id)),
          participations (id, enfant_id, statut),
          likes_publications (parent_id),
          commentaires_publications (id, texte, date_creation, auteur_id, utilisateurs(prenom, nom))
        `)
        .order('date_creation', { ascending: false });

      if (data) {
        const now = new Date();
        const publicationsValides = data.filter(post => !post.date_expiration || new Date(post.date_expiration) >= now);
        
        const publicationsTriees = publicationsValides.sort((a, b) => {
          if (a.epingle && !b.epingle) return -1;
          if (!a.epingle && b.epingle) return 1;
          return new Date(b.date_creation) - new Date(a.date_creation);
        });

        setPublications([...publicationsTriees]);

        // Mettre à jour les commentaires en direct si la modale est ouverte
        if (postActifCommentaires) {
          const postMisAJour = publicationsTriees.find(p => p.id === postActifCommentaires.id);
          if (postMisAJour) setPostActifCommentaires(postMisAJour);
        }
      }
    } catch (e) { console.log("Catch mur :", e.message); }
  };

  // 🚀 FONCTION POUR LIKER / UNLIKER (Les parents peuvent toujours Liker)
  const toggleLike = async (publicationId, estLike) => {
    try {
      if (!currentUserId) return;
      if (estLike) {
        await supabase.from('likes_publications').delete().match({ publication_id: publicationId, parent_id: currentUserId });
      } else {
        await supabase.from('likes_publications').insert({ publication_id: publicationId, parent_id: currentUserId });
      }
      chargerMur();
    } catch (e) { console.log(e); }
  };

  const ouvrirCommentaires = (post) => {
    setPostActifCommentaires(post);
    setModalCommentairesVisible(true);
  };

  const formaterDateCom = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ' à');
  };

  const voterSondage = async (publicationId, optionId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = currentUserId || user?.id;
      if (!uid) {
        if (Platform.OS === 'web') window.alert("Veuillez vous reconnecter.");
        else Alert.alert("Erreur", "Veuillez vous reconnecter.");
        return;
      }

      const { error } = await supabase.from('sondages_votes').insert({
        publication_id: publicationId,
        option_id: optionId,
        parent_id: uid
      });

      if (error) {
        if (error.code === '23505') {
          if (Platform.OS === 'web') window.alert("Vous avez déjà voté à ce sondage.");
          else Alert.alert("Info", "Vous avez déjà voté à ce sondage.");
        }
      }
      chargerMur();
    } catch (error) {
      if (Platform.OS === 'web') window.alert("Erreur lors du vote : " + error.message);
      else Alert.alert("Erreur", error.message);
    }
  };

  const repondreEvenement = async (publicationId, enfantId, statut) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = currentUserId || user?.id;
      if (!uid) {
        if (Platform.OS === 'web') window.alert("Veuillez vous reconnecter.");
        else Alert.alert("Erreur", "Veuillez vous reconnecter.");
        return;
      }

      const { error } = await supabase.from('participations').upsert({
        publication_id: publicationId,
        enfant_id: String(enfantId),
        parent_id: uid,
        statut: statut,
        date_reponse: new Date().toISOString()
      }, { onConflict: 'publication_id,enfant_id' });
      
      if (error) throw error;
      chargerMur();
    } catch (error) { 
      if (Platform.OS === 'web') window.alert("Erreur d'enregistrement : " + error.message);
      else Alert.alert("Erreur", error.message);
    }
  };

  const chargerBanques = async () => { const { data } = await supabase.from('comptes_bancaires').select('*'); if (data) setBanques(data); };

  const chargerDonneesParent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
      setCurrentUserId(user.id);

      const { data: profil } = await supabase.from('utilisateurs').select('prenom').eq('id', user.id).single(); if (profil) setParentNom(profil.prenom);
      
      const { data: mesEnfants } = await supabase.from('enfants').select('*, inscrit_transport, heure_ramassage, point_ramassage').eq('parent_id', user.id);
      let enfantIds = [];
      
      if (mesEnfants && mesEnfants.length > 0) {
        setEnfants(mesEnfants); enfantIds = mesEnfants.map(e => e.id); const dateJour = new Date().toISOString().split('T')[0];
        
        const { data: cahiers } = await supabase.from('cahier_liaison').select('*').in('enfant_id', enfantIds).eq('date_jour', dateJour);
        if (cahiers) { const cahiersMap = {}; cahiers.forEach(c => { cahiersMap[c.enfant_id] = c; }); setCahiersJour(cahiersMap); }

        const { data: alertes } = await supabase.from('alertes_medicales').select('*, enfants(prenom)').in('enfant_id', enfantIds).eq('statut_regle', false);
        if (alertes) setAlertesMedicales(alertes);

        const { data: fournitures } = await supabase.from('demandes_fournitures').select('*, enfants(prenom)').in('enfant_id', enfantIds).eq('statut', 'en_attente');
        if (fournitures) setDemandesFournitures(fournitures);

        const { data: sosActive } = await supabase.from('recuperations_sos').select('*').in('enfant_id', enfantIds).is('date_validation', null);
        if (sosActive) { const sosMap = {}; sosActive.forEach(s => { sosMap[s.enfant_id] = s; }); setRecuperationsSOS(sosMap); }

        const { data: absences } = await supabase.from('planning_presences').select('*').in('enfant_id', enfantIds).order('date_absence', { ascending: false });
        if (absences) { const absMap = {}; absences.forEach(a => { if (!absMap[a.enfant_id]) absMap[a.enfant_id] = []; absMap[a.enfant_id].push(a); }); setAbsencesKids(absMap); }

        const ilYa24Heures = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: progres } = await supabase
          .from('progres_enfants')
          .select('*')
          .in('enfant_id', enfantIds)
          .gte('date_creation', ilYa24Heures)
          .order('date_creation', { ascending: false });

        if (progres) { 
          const progMap = {}; 
          progres.forEach(p => { if (!progMap[p.enfant_id]) progMap[p.enfant_id] = []; progMap[p.enfant_id].push(p); }); 
          setProgresKids(progMap); 
        }

        const { data: attestations } = await supabase.from('demandes_attestation').select('*').in('enfant_id', enfantIds).order('date_demande', { ascending: false }); 
        if (attestations) { const attMap = {}; attestations.forEach(att => { if (!attMap[att.enfant_id]) attMap[att.enfant_id] = att.statut; }); setStatutAttestations(attMap); }
      }

      let queryFactures = supabase.from('paiements').select('*, enfants(prenom)').order('date_creation', { ascending: false });
      if (enfantIds.length > 0) queryFactures = queryFactures.or(`parent_id.eq.${user.id},enfant_id.in.(${enfantIds.join(',')})`); else queryFactures = queryFactures.eq('parent_id', user.id);
      const { data: mesFactures } = await queryFactures; if (mesFactures) setFactures(mesFactures);
    } catch (error) { } finally { setLoading(false); }
  };

  const fermerAlerteMedicale = async (alerteId) => {
    try { await supabase.from('alertes_medicales').update({ statut_regle: true }).eq('id', alerteId); setAlertesMedicales(prev => prev.filter(a => a.id !== alerteId)); } catch (e) {}
  };

  const validerFourniture = async (fournitureId) => {
    try {
      await supabase.from('demandes_fournitures').update({ statut: 'fourni', date_resolution: new Date().toISOString() }).eq('id', fournitureId);
      setDemandesFournitures(prev => prev.filter(f => f.id !== fournitureId));
    } catch (e) {}
  };

  const handleAbsenceDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowAbsenceDatePicker(false);
    if (selectedDate) {
      setAbsenceDateObj(selectedDate);
      const y = selectedDate.getFullYear(); const m = String(selectedDate.getMonth() + 1).padStart(2, '0'); const d = String(selectedDate.getDate()).padStart(2, '0');
      setAbsenceDate(`${y}-${m}-${d}`);
    }
  };

  const déclarerAbsence = async () => {
    if (!absenceDate || !absenceMotif) { Alert.alert("Champs requis", "Veuillez sélectionner la date et le motif de l'absence."); return; }
    try {
      const { error } = await supabase.from('planning_presences').insert([{ enfant_id: enfantSelectionne.id, date_absence: absenceDate, motif: absenceMotif, statut: 'Prévu' }]);
      if (error) throw error;
      Alert.alert("Absence enregistrée", `L'absence de ${enfantSelectionne.prenom} a été déclarée.`);
      setModalAbsenceVisible(false); setAbsenceDate(''); setAbsenceMotif(''); setAbsenceDateObj(new Date()); chargerDonneesParent(); 
    } catch(e) { Alert.alert("Erreur", "Une absence est déjà déclarée pour ce jour."); }
  };

  const genererCodeSOS = async () => {
    if (!sosNom || !sosCin) { Alert.alert("Champs requis", "Veuillez saisir le nom complet et la CIN."); return; }
    try {
      const codeUnique = 'SOS-' + Math.floor(100000 + Math.random() * 900000);
      await supabase.from('recuperations_sos').insert([{ enfant_id: enfantSelectionne.id, nom_tierce_personne: sosNom, cin_tierce: sosCin, code_unique: codeUnique }]);
      Alert.alert("Code SOS Créé 🛡️", `Le code sécurisé est : ${codeUnique}\nDonnez ce code à la personne choisie.`);
      setModalSOSVisible(false); setSosNom(''); setSosCin(''); chargerDonneesParent();
    } catch(e) {}
  };

  const ouvrirModalMedical = (enfant) => { setEnfantSelectionne(enfant); setRemarqueTemp(enfant.details_allergie || enfant.remarques_medicales || ''); setModalMedicalVisible(true); };
  const sauvegarderMedical = async () => {
    setLoading(true);
    try {
      await supabase.from('enfants').update({ remarques_medicales: remarqueTemp, details_allergie: remarqueTemp, a_allergie: remarqueTemp.length > 0 }).eq('id', enfantSelectionne.id);
      const { data: admin } = await supabase.from('utilisateurs').select('id').eq('role', 'admin').single();
      const uid = currentUserId;
      if (admin && uid) await supabase.from('messages').insert([{ expediteur_id: uid, destinataire_id: admin.id, texte: `Le parent a mis à jour les informations de régime alimentaire/santé de ${enfantSelectionne.prenom}.` }]);
      Alert.alert("Succès", "Informations mises à jour."); setModalMedicalVisible(false); chargerDonneesParent();
    } catch (error) {} finally { setLoading(false); }
  };

  const envoyerDemandeScolarite = async (enfant) => {
    setLoading(true);
    try {
      const uid = currentUserId;
      if (!uid) return;
      const { data: existante } = await supabase.from('demandes_attestation').select('id').eq('enfant_id', enfant.id).eq('statut', 'en_attente');
      if (existante && existante.length > 0) { Alert.alert("Info", "Demande déjà en cours."); setLoading(false); return; }
      
      await supabase.from('demandes_attestation').insert([{ enfant_id: enfant.id, parent_id: uid, statut: 'en_attente' }]);
      setStatutAttestations(prev => ({ ...prev, [enfant.id]: 'en_attente' })); Alert.alert("Succès", "Demande envoyée.");
    } catch (error) {} finally { setLoading(false); }
  };

  const choisirRecu = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
    if (!result.canceled) { setRecuUri(result.assets[0].uri); setRecuBase64(result.assets[0].base64); }
  };

  const envoyerRecu = async () => {
    if (!recuBase64) { alert("Veuillez sélectionner un reçu."); return; }
    setUploadingRecu(true);
    try {
      const fileName = `recu_${factureAPayer.id}_${Date.now()}.jpg`;
      const binaryData = decodeBase64(recuBase64);
      await supabase.storage.from('recus_paiements').upload(fileName, binaryData, { contentType: 'image/jpeg' });
      const { data: publicUrlData } = supabase.storage.from('recus_paiements').getPublicUrl(fileName);
      await supabase.from('paiements').update({ statut: 'en_verification', recu_url: publicUrlData.publicUrl }).eq('id', factureAPayer.id);
      Alert.alert("Merci !", "Reçu envoyé."); setModalPaiementVisible(false); chargerDonneesParent();
    } catch (error) {} finally { setUploadingRecu(false); }
  };

  const telechargerPhotoOriginale = async (url) => {
    if (Platform.OS === 'web') { Linking.openURL(url); return; }
    setLoadingDownload(true);
    try {
      const fileName = `photo_creche_${Date.now()}.jpg`;
      const localUri = FileSystem.documentDirectory + fileName;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    } catch (error) {} finally { setLoadingDownload(false); }
  };

  if (loading && enfants.length === 0) { return (<View style={[styles.center, { backgroundColor: currentTheme.background }]}><ActivityIndicator size="large" color={currentTheme.primary} /></View>); }

  const trierFactures = (a, b) => {
    const aIsInsc = a.type === 'inscription' || (a.titre || '').toLowerCase().includes("inscription");
    const bIsInsc = b.type === 'inscription' || (b.titre || '').toLowerCase().includes("inscription");
    if (aIsInsc && !bIsInsc) return -1;
    if (!aIsInsc && bIsInsc) return 1;

    const ordreMoisScolaire = {
      'Septembre': 1, 'Octobre': 2, 'Novembre': 3, 'Décembre': 4,
      'Janvier': 5, 'Février': 6, 'Mars': 7, 'Avril': 8, 'Mai': 9,
      'Juin': 10, 'Juillet': 11, 'Août': 12
    };
    const ordreA = ordreMoisScolaire[a.mois] || 99;
    const ordreB = ordreMoisScolaire[b.mois] || 99;
    if (ordreA !== ordreB) return ordreA - ordreB;

    return (a.titre || '').localeCompare(b.titre || '');
  };

  const facturesEnAttente = factures.filter(f => f.statut === 'en_attente').sort(trierFactures);
  const facturesEnVerification = factures.filter(f => f.statut === 'en_verification').sort(trierFactures);
  const facturesPayees = factures.filter(f => f.statut === 'paye').sort(trierFactures);

  let countRetard = 0;
  let countAPayer = 0;

  facturesEnAttente.forEach(facture => {
    let anneeScolaire = null;
    const matchYear = facture.titre?.match(/\((\d{4}-\d{4})\)/);
    if (matchYear && matchYear[1]) {
      anneeScolaire = matchYear[1];
    } else if (facture.enfants?.annee_scolaire) {
      anneeScolaire = facture.enfants.annee_scolaire;
    } else {
      const d = new Date(facture.date_creation);
      anneeScolaire = (d.getMonth() + 1) >= 8 ? `${d.getFullYear()}-${d.getFullYear()+1}` : `${d.getFullYear()-1}-${d.getFullYear()}`;
    }

    if (!anneeScolaire || !anneeScolaire.includes('-')) {
      countAPayer++;
      return;
    }

    const startYear = parseInt(anneeScolaire.split('-')[0], 10);
    const moisIndexZero = moisNomsCal.indexOf(facture.mois); 
    if (moisIndexZero === -1) {
      countAPayer++; 
      return;
    }

    const factureYear = moisIndexZero >= 8 ? startYear : startYear + 1;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();

    if (factureYear < currentYear) {
      countRetard++;
    } else if (factureYear > currentYear) {
      // Future
    } else {
      if (moisIndexZero < currentMonth) {
        countRetard++;
      } else if (moisIndexZero === currentMonth) {
        if (currentDay > 5) countRetard++;
        else countAPayer++;
      }
    }
  });

  const totalAlertes = countRetard + countAPayer;

  return (
    <SafeAreaView style={[styles.rootContainer, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={isDesktop ? styles.desktopWrapper : styles.mobileWrapper}>
        <View style={styles.header}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Image source={selectedLogo} style={{width: 50, height: 50, marginRight: 15, borderRadius: 10}} />
              <View>
                <Text style={[styles.crecheTitle, { color: currentTheme.primary }]}>{nomCreche}</Text>
                <Text style={styles.subtitle}>Bonjour {parentNom} 👋</Text>
              </View>
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <TouchableOpacity onPress={handleSecureLogout}><Text style={{color: currentTheme.primary, fontWeight: 'bold'}}>Déconnexion</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        {alertesMedicales.length > 0 && (
          <View style={styles.globalAlertBanner}>
            {alertesMedicales.map(al => (
              <View key={al.id} style={styles.alertRow}>
                <Text style={styles.globalAlertBannerText}>⚠️ FLASH SANTE - {al.enfants?.prenom} : {al.type_alerte} {al.commentaire ? `(${al.commentaire})` : ''}</Text>
                <TouchableOpacity style={styles.dismissAlertBtn} onPress={() => fermerAlerteMedicale(al.id)}><Text style={styles.dismissAlertText}>✖</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {demandesFournitures.length > 0 && (
          <View style={[styles.globalAlertBanner, { shadowColor: '#E040FB' }]}>
            {demandesFournitures.map(fourniture => (
              <View key={fourniture.id} style={[styles.alertRow, { backgroundColor: '#E040FB', borderBottomColor: '#AB47BC' }]}>
                <View style={{flex: 1}}>
                  <Text style={styles.globalAlertBannerText}>
                    📦 IL MANQUE : {fourniture.type_fourniture.toUpperCase()} pour {fourniture.enfants?.prenom}
                  </Text>
                  {fourniture.commentaire ? <Text style={styles.fournitureCommentaire}>{fourniture.commentaire}</Text> : null}
                </View>
                <TouchableOpacity style={styles.btnCheckFourniture} onPress={() => validerFourniture(fourniture.id)}>
                  <Text style={styles.btnCheckFournitureText}>✅ Pris en compte</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {activeTab !== 'factures' && (countRetard > 0 || countAPayer > 0) && (
          <TouchableOpacity 
            style={[
              styles.relanceBanner, 
              countRetard > 0 ? { backgroundColor: '#EF4444' } : { backgroundColor: '#F59E0B' }
            ]} 
            onPress={() => setActiveTab('factures')}
          >
            <Text style={styles.relanceText}>
              {countRetard > 0 ? `⚠️ Vous avez ${countRetard} facture(s) en retard.` :
               countAPayer > 0 ? `⏳ Vous avez ${countAPayer} facture(s) à payer.` :
               `✅ Vos paiements sont à jour.`}
            </Text>
          </TouchableOpacity>
        )}
        {activeTab !== 'factures' && countRetard === 0 && countAPayer === 0 && factures.length > 0 && (
          <TouchableOpacity style={[styles.relanceBanner, { backgroundColor: '#10B981' }]} onPress={() => setActiveTab('factures')}>
             <Text style={styles.relanceText}>✅ Vos paiements sont à jour.</Text>
          </TouchableOpacity>
        )}

        <View style={styles.content}>
          
          {/* ONGLET 1: LE MUR */}
          {activeTab === 'mur' && (
            publications.length === 0 ? (
              <View style={styles.emptyStateContainer}><Text style={{fontSize: 40}}>📭</Text><Text style={styles.emptyStateText}>Aucune publication sur le mur pour le moment.</Text></View>
            ) : (
              <FlatList 
                data={publications} 
                keyExtractor={(item) => item.id.toString()} 
                showsVerticalScrollIndicator={false}
                renderItem={({item}) => {
                  const imageUrls = item.media_url ? item.media_url.split(',') : [];
                  
                  const isSondage = item.type_post === 'sondage';
                  const optionsSondage = item.sondages_options || [];
                  const monVote = optionsSondage.find(o => o.sondages_votes?.some(v => v.parent_id === currentUserId));
                  const totalVotesSondage = optionsSondage.reduce((acc, o) => acc + (o.sondages_votes?.length || 0), 0);

                  const isEvent = item.type_post === 'evenement';
                  const isEventClosed = isEvent && item.date_limite_reponse ? new Date() > new Date(item.date_limite_reponse) : false;

                  // 🚀 INSTAGRAM STATS
                  const likes = item.likes_publications || [];
                  const commentaires = item.commentaires_publications || [];
                  const monLike = likes.some(l => l.parent_id === currentUserId);

                  return (
                    <View style={[styles.postContainer, {borderLeftColor: currentTheme.primary, borderLeftWidth: 4}]}>
                      <View style={styles.postHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <View style={[styles.avatarCreche, isEvent && {backgroundColor:'#FEF3C7'}, isSondage && {backgroundColor:'#E0E7FF'}]}>
                            <Text style={{fontSize: 18}}>{isEvent ? '📅' : isSondage ? '📊' : '🏫'}</Text>
                          </View>
                          <View>
                            <Text style={[styles.postAuthor, { color: currentTheme.primary }]}>
                              {item.epingle ? '📌 ' : ''}{isEvent ? 'Événement à venir' : isSondage ? 'Sondage aux parents' : item.auteur || 'La Direction'}
                            </Text>
                            <Text style={styles.postDate}>{new Date(item.date_creation).toLocaleDateString()}</Text>
                          </View>
                        </View>
                      </View>

                      {item.texte ? <Text style={[styles.postDescription, isSondage && styles.sondageQuestion]}>{item.texte}</Text> : null}

                      {/* SONDAGE */}
                      {isSondage && (
                        <View style={styles.pollContainerParent}>
                          {optionsSondage.length === 0 ? (
                            <Text style={{fontStyle:'italic', color:'#94A3B8'}}>Chargement des options...</Text>
                          ) : (
                            optionsSondage.map((opt) => {
                              const votesOpt = opt.sondages_votes?.length || 0;
                              const percent = totalVotesSondage > 0 ? Math.round((votesOpt / totalVotesSondage) * 100) : 0;
                              const isMyChoice = monVote?.id === opt.id;

                              if (monVote) {
                                return (
                                  <View key={opt.id} style={styles.pollResultRow}>
                                    <View style={styles.pollResultHeader}>
                                      <Text style={[styles.pollResultText, isMyChoice && {color: '#4F46E5', fontWeight:'900'}]}>
                                        {isMyChoice ? '✓ ' : ''}{opt.texte_option}
                                      </Text>
                                      <Text style={styles.pollResultPercent}>{percent}%</Text>
                                    </View>
                                    <View style={styles.pollResultBarBg}>
                                      <View style={[styles.pollResultBarFill, { width: `${percent}%`, backgroundColor: isMyChoice ? '#4F46E5' : '#94A3B8' }]} />
                                    </View>
                                  </View>
                                );
                              } else {
                                return (
                                  <TouchableOpacity key={opt.id} style={styles.pollVoteBtn} onPress={() => voterSondage(item.id, opt.id)}>
                                    <Text style={styles.pollVoteBtnText}>{opt.texte_option}</Text>
                                  </TouchableOpacity>
                                );
                              }
                            })
                          )}
                          {monVote && <Text style={styles.pollTotalVotes}>{totalVotesSondage} participant(s)</Text>}
                        </View>
                      )}

                      {/* ÉVÉNEMENT & RSVP */}
                      {isEvent && (
                        <View style={styles.eventContainerParent}>
                          <View style={styles.eventDatesBox}>
                            <Text style={styles.eventDateText}>📅 Date de l'événement : <Text style={{fontWeight:'900'}}>{item.date_evenement ? new Date(item.date_evenement).toLocaleDateString('fr-FR') : 'À venir'}</Text></Text>
                            <Text style={styles.eventDeadlineText}>⏳ Répondez avant le : {item.date_limite_reponse ? new Date(item.date_limite_reponse).toLocaleDateString('fr-FR') : 'Non définie'}</Text>
                          </View>
                          
                          {isEventClosed ? (
                            <View style={styles.eventClosedBox}><Text style={styles.eventClosedText}>Les réponses sont clôturées pour cet événement.</Text></View>
                          ) : (
                            enfants.map(enfant => {
                              const participation = item.participations?.find(p => String(p.enfant_id) === String(enfant.id));
                              const isPresent = participation?.statut === 'present';
                              const isAbsent = participation?.statut === 'absent';

                              return (
                                <View key={enfant.id} style={styles.rsvpChildRow}>
                                  <Text style={styles.rsvpChildName}>👦 {enfant.prenom}</Text>
                                  <View style={styles.rsvpButtons}>
                                    <TouchableOpacity 
                                      style={[styles.rsvpBtn, isPresent ? styles.rsvpBtnOuiActive : styles.rsvpBtnDefault, { marginRight: 6 }]} 
                                      onPress={() => repondreEvenement(item.id, enfant.id, 'present')}
                                    >
                                      <Text style={[styles.rsvpBtnText, isPresent && {color: '#FFFFFF'}]}>✅ Oui</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                      style={[styles.rsvpBtn, isAbsent ? styles.rsvpBtnNonActive : styles.rsvpBtnDefault]} 
                                      onPress={() => repondreEvenement(item.id, enfant.id, 'absent')}
                                    >
                                      <Text style={[styles.rsvpBtnText, isAbsent && {color: '#FFFFFF'}]}>❌ Non</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })
                          )}
                        </View>
                      )}
                      
                      {imageUrls.length > 0 && (
                        <View style={{marginTop: 5}}>
                          <PostImageCarousel imageUrls={imageUrls} onImagePress={(url) => { setImageView(url); setModalImageVisible(true); marquerCommeVu(item.id); }} onVideoPress={(cleanUrl) => { Linking.openURL(cleanUrl); marquerCommeVu(item.id); }} />
                        </View>
                      )}

                      {/* 🚀 BARRE INSTAGRAM (Likes & Commentaires) */}
                      <View style={styles.instagramActionBar}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(item.id, monLike)}>
                          <Text style={styles.actionIcon}>{monLike ? '❤️' : '🤍'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => ouvrirCommentaires(item)}>
                          <Text style={styles.actionIcon}>💬</Text>
                        </TouchableOpacity>
                      </View>
                      
                      {likes.length > 0 && (
                        <Text style={styles.likesCount}>{likes.length} J'aime</Text>
                      )}
                      
                      {commentaires.length > 0 && (
                        <TouchableOpacity onPress={() => ouvrirCommentaires(item)}>
                          <Text style={styles.commentsCount}>Voir les {commentaires.length} message(s) de la direction</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ height: 15 }} />

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
                  const activeSOS = recuperationsSOS[enfant.id];
                  const statutCertif = statutAttestations[enfant.id];
                  const listeAbsencesKid = absencesKids[enfant.id] || []; 
                  const listeProgresKid = progresKids[enfant.id] || [];

                  return (
                    <View key={enfant.id} style={[styles.dossierCard, {borderLeftWidth: 4, borderLeftColor: '#8BC34A'}]}>
                      
                      <View style={styles.dossierHeader}>
                        {enfant.photo_url ? <Image source={{ uri: enfant.photo_url }} style={styles.dossierPhoto} /> : <View style={styles.dossierPhotoPlaceholder}><Text style={{fontSize: 25}}>👦</Text></View>}
                        <View style={{flex: 1}}>
                          <Text style={styles.dossierName}>{enfant.prenom} {enfant.nom}</Text>
                          <Text style={styles.dossierCode}>🎂 Né(e) le : {enfant.date_naissance ? enfant.date_naissance.split('-').reverse().join('/') : 'Non renseigné'}</Text>
                          <Text style={styles.classeText}>🏫 Classe : {enfant.classe || 'Non définie'}</Text>
                          <Text style={[styles.dossierCode, {marginTop: 6}]}>Code : {enfant.code_parent}</Text>
                        </View>
                      </View>

                      {enfant.inscrit_transport && (
                        <View style={styles.transportReadOnlyBox}>
                          <Text style={styles.transportReadOnlyTitle}>🚌 Transport Scolaire</Text>
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 5}}>
                            <Text style={styles.transportLabel}>⏰ {enfant.heure_ramassage ? enfant.heure_ramassage.slice(0,5) : '--:--'}</Text>
                            <Text style={styles.transportLabel} numberOfLines={1}>📍 {enfant.point_ramassage || 'À définir'}</Text>
                          </View>
                          <Text style={styles.transportHelpText}>* Contactez la direction pour modifier le trajet.</Text>
                        </View>
                      )}
                      
                      {listeProgresKid.length > 0 && (
                        <View style={[styles.timelineBox, { borderColor: currentTheme.primary }]}>
                          <Text style={[styles.timelineMainTitle, { color: currentTheme.primary }]}>🌟 Fil des Réussites (Dernières 24h)</Text>
                          <View style={styles.timelineContainer}>
                            {listeProgresKid.map((progres) => (
                              <View key={progres.id} style={styles.timelineItem}>
                                <View style={[styles.timelineDot, { backgroundColor: currentTheme.primary }]} />
                                <View style={styles.timelineContent}>
                                  <Text style={[styles.timelineTitle, { color: currentTheme.primary }]}>{progres.titre_competence}</Text>
                                  <Text style={styles.timelineDate}>{new Date(progres.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                                  {progres.description ? <Text style={styles.timelineDesc}>{progres.description}</Text> : null}
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

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
                      ) : <Text style={{color: '#95A5A6', fontStyle: 'italic', marginBottom: 15, fontSize: 12, paddingLeft: 5}}>Le résumé de la journée n'est pas encore disponible.</Text>}

                      {listeAbsencesKid.length > 0 && (
                        <View style={styles.absencesTrackingBox}>
                          <Text style={styles.absencesTrackingTitle}>📅 Historique des Absences ({listeAbsencesKid.length})</Text>
                          {listeAbsencesKid.map(abs => (
                            <View key={abs.id} style={styles.absenceTrackRow}>
                              <Text style={styles.absenceTrackDate}>🗓️ {abs.date_absence.split('-').reverse().join('/')}</Text>
                              <Text style={styles.absenceTrackMotif} numberOfLines={1}>💬 {abs.motif}</Text>
                              <View style={styles.absenceTrackBadge}><Text style={styles.absenceTrackBadgeText}>{abs.statut}</Text></View>
                            </View>
                          ))}
                        </View>
                      )}

                      {activeSOS && (
                        <View style={styles.sosStatusActiveCard}>
                          <Text style={styles.sosStatusTitle}>🛡️ Sortie SOS Active</Text>
                          <Text style={styles.sosStatusText}>Prévu pour : {activeSOS.nom_tierce_personne} (CIN: {activeSOS.cin_tierce})</Text>
                          <Text style={styles.sosCodeDisplay}>Code : {activeSOS.code_unique}</Text>
                        </View>
                      )}

                      <View style={styles.medicalBox}>
                        <Text style={styles.medicalTitle}>🍽️ Régime spécifique & Santé :</Text>
                        <Text style={[styles.medicalText, !enfant.details_allergie && !enfant.remarques_medicales && {color: '#10B981', fontStyle: 'italic'}]}>
                          {enfant.details_allergie || enfant.remarques_medicales || "✅ Aucune contre-indication signalée."}
                        </Text>
                        
                        <TouchableOpacity style={[styles.editMedicalBtn, {width: '100%', marginBottom: 10}]} onPress={() => ouvrirModalMedical(enfant)}>
                          <Text style={styles.editMedicalText}>✏️ Modifier Régime / Santé</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.editMedicalBtn, {backgroundColor: '#673AB7', width: '100%', marginBottom: 10}]} onPress={() => { setEnfantSelectionne(enfant); setModalAbsenceVisible(true); }}>
                          <Text style={styles.editMedicalText}>📅 Signaler une Absence</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.editMedicalBtn, {backgroundColor: '#FF5722', width: '100%'}]} onPress={() => { setEnfantSelectionne(enfant); setModalSOSVisible(true); }}>
                          <Text style={styles.editMedicalText}>🛡️ Générer Code Sortie SOS</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.attestationBlock}>
                        <View style={styles.attestationHeader}>
                          <Text style={styles.attestationTitleText}>📄 Attestation de scolarité</Text>
                          {(!statutCertif || statutCertif === 'annule' || statutCertif === 'imprime') && (
                            <TouchableOpacity style={styles.btnDemanderAttestation} onPress={() => envoyerDemandeScolarite(enfant)}>
                              <Text style={styles.btnDemanderAttestationText}>
                                {statutCertif === 'imprime' ? 'Nouvelle demande' : 'Demander'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {statutCertif === 'en_attente' && (
                          <Text style={styles.attestationStatusWarning}>⏳ En cours de préparation par l'administration</Text>
                        )}
                        {statutCertif === 'imprime' && (
                          <Text style={styles.attestationStatusSuccess}>✅ Prête, vous pouvez la récupérer à l'administration</Text>
                        )}
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
              <TouchableOpacity 
                style={[styles.weeklyMenuCard, { borderColor: currentTheme.primary }]} 
                onPress={() => navigation.navigate('MenuProgrammeParent')}
              >
                <Text style={styles.weeklyMenuEmoji}>🗓️</Text>
                <View style={{flex: 1}}>
                  <Text style={[styles.weeklyMenuTitle, { color: currentTheme.primary }]}>Menu & Programme Hebdo</Text>
                  <Text style={styles.weeklyMenuDesc}>Découvrez les repas et activités de la semaine !</Text>
                </View>
                <Text style={styles.weeklyMenuArrow}>➡️</Text>
              </TouchableOpacity>

              <View style={styles.rTabContainer}>
                <TouchableOpacity onPress={() => setActiveRessourceTab('menus')} style={[styles.rTabBtn, activeRessourceTab === 'menus' ? { backgroundColor: '#FF9800', elevation: 3 } : { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FFE0B2' }]}><Text style={[styles.rTabText, { color: activeRessourceTab === 'menus' ? '#FFF' : '#E65100' }]}>🍽️ Menus Cantine</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveRessourceTab('documents')} style={[styles.rTabBtn, activeRessourceTab === 'documents' ? { backgroundColor: '#9C27B0', elevation: 3 } : { backgroundColor: '#F3E5F5', borderWidth: 1, borderColor: '#E1BEE7' }]}><Text style={[styles.rTabText, { color: activeRessourceTab === 'documents' ? '#FFF' : '#4A148C' }]}>📂 Documents Utiles</Text></TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop: 10}}>
                {activeRessourceTab === 'menus' ? (
                  menus.length === 0 ? <Text style={styles.emptyText}>Aucun ancien menu publié pour le moment.</Text> :
                  menus.map(item => (
                    <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#FF9800' }]}>
                      <Text style={styles.ressourceTitle}>{item.description}</Text>
                      {item.image_url && <TouchableOpacity activeOpacity={0.9} onPress={() => { setImageView(item.image_url); setModalImageVisible(true); }}><Image source={{uri: item.image_url}} style={styles.ressourceImage} resizeMode="contain" /></TouchableOpacity>}
                    </View>
                  ))
                ) : (
                  documents.length === 0 ? <Text style={styles.emptyText}>Aucun document publié pour le moment.</Text> :
                  documents.map(item => (
                    <View key={item.id.toString()} style={[styles.ressourceCard, { borderTopWidth: 4, borderTopColor: '#9C27B0' }]}>
                      <Text style={styles.ressourceTitle}>📎 {item.titre}</Text>
                      {item.fichier_url && <TouchableOpacity activeOpacity={0.9} onPress={() => { setImageView(item.fichier_url); setModalImageVisible(true); }}><Image source={{uri: item.fichier_url}} style={styles.ressourceImage} resizeMode="contain" /></TouchableOpacity>}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}
          
          {/* ONGLET 4: FACTURES */}
          {activeTab === 'factures' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.sectionTitle, {color: currentTheme.primary}]}>💳 Mes Factures & Paiements ({facturesEnAttente.length})</Text>
              {facturesEnAttente.length === 0 ? <Text style={styles.emptyText}>Aucune facture en attente de paiement. 🎉</Text> : 
                facturesEnAttente.map(item => {
                  const moisIndexZero = moisNomsCal.indexOf(item.mois);
                  let borderColor = '#E2E8F0';
                  let textColor = '#1E293B';
                  
                  if (moisIndexZero !== -1) {
                    const today = new Date();
                    const currentMonth = today.getMonth();
                    const currentDay = today.getDate();
                    const currentYear = today.getFullYear();
                    
                    let factureYear = currentYear;
                    const matchYear = item.titre?.match(/\((\d{4}-\d{4})\)/);
                    if (matchYear && matchYear[1]) {
                      const startYear = parseInt(matchYear[1].split('-')[0], 10);
                      factureYear = moisIndexZero >= 8 ? startYear : startYear + 1;
                    } else if (item.enfants?.annee_scolaire) {
                      const startYear = parseInt(item.enfants.annee_scolaire.split('-')[0], 10);
                      factureYear = moisIndexZero >= 8 ? startYear : startYear + 1;
                    }

                    if (factureYear < currentYear || (factureYear === currentYear && moisIndexZero < currentMonth) || (factureYear === currentYear && moisIndexZero === currentMonth && currentDay > 5)) {
                      borderColor = '#EF4444';
                      textColor = '#EF4444'; 
                    } else if (factureYear === currentYear && moisIndexZero === currentMonth && currentDay <= 5) {
                      borderColor = '#F59E0B';
                      textColor = '#F59E0B'; 
                    }
                  }

                  return (
                    <View key={item.id.toString()} style={[styles.factureCard, { borderLeftColor: borderColor }]}>
                      <View style={styles.factureHeader}>
                        <View style={{flex: 1, paddingRight: 10}}>
                          <Text style={[styles.factureTitre, {color: textColor}]} numberOfLines={2}>{item.titre}</Text>
                          <Text style={styles.factureEnfant}>👦 {item.enfants?.prenom}</Text>
                        </View>
                        <Text style={[styles.factureMontant, {color: textColor}]}>{item.montant} Dhs</Text>
                      </View>
                      <TouchableOpacity style={[styles.payButton, { backgroundColor: '#0F172A' }]} onPress={() => {setFactureAPayer(item); setRecuUri(null); setRecuBase64(null); setModalPaiementVisible(true);}}>
                        <Text style={styles.payButtonText}>Régler par Virement</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              }
            </ScrollView>
          )}
        </View>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('mur')}><Text style={[styles.navIcon, activeTab === 'mur' && {color: currentTheme.primary}]}>🏠</Text><Text style={[styles.navText, activeTab === 'mur' && {color: currentTheme.primary}]}>Le Mur</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('dossiers')}><Text style={[styles.navIcon, activeTab === 'dossiers' && {color: '#8BC34A'}]}>🎒</Text><Text style={[styles.navText, activeTab === 'dossiers' && {color: '#8BC34A'}]}>Dossiers</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('ressources')}><Text style={[styles.navIcon, activeTab === 'ressources' && {color: '#9C27B0'}]}>📂</Text><Text style={[styles.navText, activeTab === 'ressources' && {color: '#9C27B0'}]}>Infos</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('factures')}><View><Text style={[styles.navIcon, activeTab === 'factures' && {color: '#FF9800'}]}>💳</Text>{totalAlertes > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{totalAlertes}</Text></View>}</View><Text style={[styles.navText, activeTab === 'factures' && {color: '#FF9800'}]}>Paiements</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Messagerie')}><View><Text style={styles.navIcon}>💬</Text>{unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}</View><Text style={styles.navText}>Messages</Text></TouchableOpacity>
        </View>
      </View>

      {/* 🚀 MODALE DES COMMENTAIRES INSTAGRAM (LECTURE SEULE) */}
      <Modal visible={modalCommentairesVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlayComments}>
            <View style={styles.modalContentComments}>
              <View style={styles.commentHeaderBar}>
                <Text style={styles.modalTitleComments}>Messages de la direction</Text>
                <TouchableOpacity onPress={() => setModalCommentairesVisible(false)} style={styles.closeCommentBtn}><Text style={styles.closeCommentBtnText}>✖</Text></TouchableOpacity>
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false} style={styles.commentsList}>
                {postActifCommentaires?.commentaires_publications?.length === 0 ? (
                  <Text style={styles.emptyText}>Aucun message de la direction pour l'instant.</Text>
                ) : (
                  postActifCommentaires?.commentaires_publications?.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={styles.commentAvatar}><Text>👤</Text></View>
                      <View style={styles.commentTextBubble}>
                        <Text style={styles.commentAuthor}>
                          {(c.utilisateurs?.prenom?.trim() || c.utilisateurs?.nom?.trim()) ? `${c.utilisateurs?.prenom || ''} ${c.utilisateurs?.nom || ''}`.trim() : 'La Direction'} 
                          <Text style={styles.commentDate}> • {formaterDateCom(c.date_creation)}</Text>
                        </Text>
                        <Text style={styles.commentText}>{c.texte}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              
              {/* Note: La zone de saisie (TextInput et bouton Envoyer) a été retirée pour empêcher les parents de créer des commentaires. */}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

      <Modal visible={modalAbsenceVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {maxHeight: '90%'}]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Déclarer une absence pour {enfantSelectionne?.prenom}</Text>
                <Text style={styles.label}>Date de l'absence</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '14px', outlineStyle: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
                ) : (
                  <View>
                    <TouchableOpacity style={styles.datePickerSelectorRow} onPress={() => setShowAbsenceDatePicker(true)}>
                      <Text style={styles.datePickerSelectorRowText}>📅 {absenceDate ? absenceDate.split('-').reverse().join('/') : "Sélectionner la date"}</Text>
                    </TouchableOpacity>
                    {showAbsenceDatePicker && <DateTimePicker value={absenceDateObj} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleAbsenceDateChange} minimumDate={new Date()} />}
                  </View>
                )}
                <Text style={styles.label}>Motif de l'absence</Text>
                <TextInput style={[styles.input, {minHeight: 60}]} placeholder="Ex: Consultation médicale, Voyage..." value={absenceMotif} onChangeText={setAbsenceMotif} multiline />
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => { setModalAbsenceVisible(false); setShowAbsenceDatePicker(false); }}><Text style={styles.buttonTextWhite}>Fermer</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.button, { backgroundColor: '#673AB7' }]} onPress={déclarerAbsence}><Text style={styles.buttonTextWhite}>Signaler</Text></TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalSOSVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {maxHeight: '90%'}]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Générer un Code de Récupération SOS</Text>
                <Text style={styles.labelDesc}>Utilisez ceci si une tierce personne vient chercher l'enfant aujourd'hui.</Text>
                <Text style={styles.label}>Nom complet de la personne autorisée</Text>
                <TextInput style={styles.input} placeholder="Ex: Amina Alami (Grand-mère)" value={sosNom} onChangeText={setSosNom} />
                <Text style={styles.label}>Numéro de CIN (Carte d'identité)</Text>
                <TextInput style={styles.input} placeholder="Ex: G765432" value={sosCin} onChangeText={setSosCin} autoCapitalize="characters" />
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalSOSVisible(false)}><Text style={styles.buttonTextWhite}>Annuler</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.button, { backgroundColor: '#FF5722' }]} onPress={genererCodeSOS}><Text style={styles.buttonTextWhite}>Générer le Code</Text></TouchableOpacity>
                </View>
              </ScrollView>
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
              {banques.map(b => (
                <View key={b.id.toString()} style={styles.banqueCard}>
                  <Text style={{fontWeight: '900', color: '#0F172A'}}>{b.nom_banque}</Text>
                  <Text selectable={true} style={{color: '#64748B', fontSize: 16, marginTop: 5, letterSpacing: 1}}>{b.rib}</Text>
                </View>
              ))}
              <Text style={styles.sectionTitle}>2. Envoyer la preuve de virement</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={choisirRecu}><Text style={styles.uploadBtnText}>📸 {recuUri ? "Changer l'image" : "Photographier le reçu"}</Text></TouchableOpacity>
              {recuUri && <Image source={{ uri: recuUri }} style={styles.previewRecu} />}
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalPaiementVisible(false)}><Text style={styles.buttonTextWhite}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.button, {backgroundColor: currentTheme.primary}]} onPress={envoyerRecu} disabled={uploadingRecu}>
                  {uploadingRecu ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextWhite}>Envoyer le reçu</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalImageVisible} transparent={true} animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={styles.closeImageBtn} onPress={() => setModalImageVisible(false)}><Text style={styles.closeImageText}>✖ Fermer</Text></TouchableOpacity>
          {imageView && <Image source={{ uri: imageView }} style={styles.fullScreenImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0} />}
          <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: currentTheme.primary }]} onPress={() => telechargerPhotoOriginale(imageView)} disabled={loadingDownload}>
            {loadingDownload ? <ActivityIndicator color="#FFF" /> : <Text style={styles.downloadBtnText}>⬇️ Télécharger / Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  desktopWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5
  },
  mobileWrapper: {
    flex: 1,
    width: '100%',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFFFFF', padding: 20, paddingTop: Platform.OS === 'ios' ? 40 : 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 4 },
  crecheTitle: { fontSize: 20, fontWeight: '900' },
  subtitle: { fontSize: 16, color: '#E91E63', marginTop: 2, fontWeight: '700' },
  
  webNotifyBtn: { backgroundColor: '#E0F7FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#B2EBF2' },
  webNotifyText: { fontSize: 12, color: '#00BCD4', fontWeight: '800' },

  // 🚀 STYLE DU BANDEAU DE RELANCE FACTURE
  relanceBanner: { padding: 15, alignItems: 'center', justifyContent: 'center', marginTop: 15, marginHorizontal: 15, borderRadius: 12 },
  relanceText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },

  content: { flex: 1, padding: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 15, marginTop: 10 },
  
  postContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 20, elevation: 3, overflow: 'hidden' },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, justifyContent: 'space-between' },
  avatarCreche: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FCE4EC', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  postAuthor: { fontWeight: '800', color: '#E91E63', fontSize: 16 },
  postDate: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  postDescription: { color: '#334155', fontSize: 15, lineHeight: 22, fontWeight: '500', paddingHorizontal: 15, marginBottom: 10 },

  // 🚀 STYLES INSTAGRAM BAR
  instagramActionBar: { flexDirection: 'row', paddingHorizontal: 15, marginTop: 10, alignItems: 'center' },
  actionBtn: { marginRight: 15 },
  actionIcon: { fontSize: 24 },
  likesCount: { fontWeight: 'bold', paddingHorizontal: 15, marginTop: 8, color: '#0F172A', fontSize: 14 },
  commentsCount: { color: '#64748B', paddingHorizontal: 15, marginTop: 4, fontSize: 14, fontWeight: '500' },

  // 🚀 STYLES MODALE COMMENTAIRES
  modalOverlayComments: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContentComments: { backgroundColor: '#FFFFFF', height: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  commentHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 15, marginBottom: 15 },
  modalTitleComments: { fontSize: 16, fontWeight: '800', color: '#0F172A', textAlign: 'center', flex: 1 },
  closeCommentBtn: { padding: 5 },
  closeCommentBtnText: { fontSize: 18, color: '#64748B', fontWeight: 'bold' },
  commentsList: { flex: 1 },
  commentRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  commentTextBubble: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, borderTopLeftRadius: 4 },
  commentAuthor: { fontWeight: '800', fontSize: 13, color: '#0F172A', marginBottom: 3 },
  commentDate: { fontWeight: 'normal', color: '#94A3B8', fontSize: 11 },
  commentText: { color: '#334155', fontSize: 14, lineHeight: 20 },

  sondageQuestion: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 15 },
  pollContainerParent: { paddingHorizontal: 15, paddingBottom: 15 },
  pollVoteBtn: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center' },
  pollVoteBtnText: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  pollResultRow: { marginBottom: 12 },
  pollResultHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  pollResultText: { fontSize: 14, fontWeight: '600', color: '#334155', flex: 1 },
  pollResultPercent: { fontSize: 13, fontWeight: 'bold', color: '#4F46E5', marginLeft: 10 },
  pollResultBarBg: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  pollResultBarFill: { height: '100%', borderRadius: 5 },
  pollTotalVotes: { fontSize: 12, color: '#94A3B8', textAlign: 'right', fontStyle: 'italic', marginTop: 5 },

  eventContainerParent: { marginHorizontal: 15, marginBottom: 15, padding: 15, backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  eventDatesBox: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#FCD34D', paddingBottom: 10 },
  eventDateText: { fontSize: 14, color: '#B45309', marginBottom: 4 },
  eventDeadlineText: { fontSize: 12, color: '#D97706', fontWeight: 'bold' },
  eventClosedBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, alignItems: 'center' },
  eventClosedText: { color: '#EF4444', fontWeight: 'bold', fontSize: 13 },
  rsvpChildRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8, elevation: 1 },
  rsvpChildName: { fontSize: 14, fontWeight: '800', color: '#0F172A', flex: 1 },
  rsvpButtons: { flexDirection: 'row' },
  rsvpBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  rsvpBtnDefault: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  rsvpBtnOuiActive: { backgroundColor: '#10B981', borderWidth: 1, borderColor: '#059669' },
  rsvpBtnNonActive: { backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#DC2626' },
  rsvpBtnText: { fontSize: 12, fontWeight: 'bold', color: '#475569' },

  multiImageContainer: { position: 'relative', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }, 
  postMultiImage: { height: 350 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  playTriangle: { color: '#FFFFFF', fontSize: 26, marginLeft: 4 }, 
  multiBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  multiBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', elevation: 10, zIndex: 100 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 24, color: '#CBD5E1', marginBottom: 2 },
  navText: { fontSize: 10, color: '#94A3B8', fontWeight: '800' },
  badge: { position: 'absolute', top: -5, right: -10, backgroundColor: '#F44336', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  emptyStateContainer: { alignItems: 'center', marginTop: 50 },
  emptyStateText: { color: '#94A3B8', fontSize: 15, marginTop: 10, fontStyle: 'italic', fontWeight: '500' },

  globalAlertBanner: { 
    marginHorizontal: 15, 
    marginTop: 15, 
    borderRadius: 12, 
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  alertRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#EF4444',
    padding: 14, 
    borderBottomWidth: 1,
    borderBottomColor: '#B91C1C'
  },
  globalAlertBannerText: { 
    color: '#FFFFFF', 
    fontWeight: '900', 
    fontSize: 13, 
    flex: 1, 
    marginRight: 10,
    lineHeight: 18,
  },
  fournitureCommentaire: {
    color: '#F3E5F5',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4
  },
  dismissAlertBtn: { 
    backgroundColor: 'rgba(255, 255, 255, 0.25)', 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  dismissAlertText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  btnCheckFourniture: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  btnCheckFournitureText: {
    color: '#E040FB',
    fontWeight: 'bold',
    fontSize: 12
  },

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
  actionBtnSecondary: { padding: 12, borderRadius: 10, alignItems: 'center', flex: 1 },
  
  cahierBox: { backgroundColor: '#F3E5F5', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E1BEE7' },
  cahierTitle: { fontSize: 15, fontWeight: '800', color: '#9C27B0', marginBottom: 10 },
  cahierGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cahierItem: { width: '48%', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cahierLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 2, fontWeight: '700' },
  cahierValue: { fontSize: 14, fontWeight: '900', color: '#1E293B' },
  cahierMotDoux: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 10, marginTop: 5, borderLeftWidth: 4, borderLeftColor: '#9C27B0' },
  
  transportReadOnlyBox: { backgroundColor: '#EEF2FF', padding: 12, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#C7D2FE' },
  transportReadOnlyTitle: { fontSize: 13, fontWeight: '800', color: '#3F51B5' },
  transportLabel: { fontSize: 13, fontWeight: 'bold', color: '#1E293B', flex: 1 },
  transportHelpText: { fontSize: 10, color: '#64748B', fontStyle: 'italic', marginTop: 8 },

  timelineBox: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderTopWidth: 4 },
  timelineMainTitle: { fontSize: 14, fontWeight: '900', marginBottom: 15 },
  timelineContainer: { paddingLeft: 20, borderLeftWidth: 2, borderColor: '#E2E8F0', marginLeft: 10 },
  timelineItem: { position: 'relative', marginBottom: 20 },
  timelineDot: { position: 'absolute', left: -27, top: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF' },
  timelineContent: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  timelineTitle: { fontWeight: '800', fontSize: 14, marginBottom: 2 },
  timelineDate: { fontSize: 11, color: '#94A3B8', marginBottom: 6, fontWeight: '600' },
  timelineDesc: { fontSize: 13, color: '#475569', fontStyle: 'italic', lineHeight: 18 },
  timelineImage: { width: '100%', height: 160, borderRadius: 12, marginTop: 10, backgroundColor: '#E2E8F0', resizeMode: 'cover' },

  weeklyMenuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 2, borderRadius: 16, padding: 15, marginBottom: 15, elevation: 2 },
  weeklyMenuEmoji: { fontSize: 28, marginRight: 15 },
  weeklyMenuTitle: { fontSize: 16, fontWeight: '900' },
  weeklyMenuDesc: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },
  weeklyMenuArrow: { fontSize: 18, color: '#94A3B8' },

  rTabContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  rTabBtn: { flex: 0.48, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  rTabText: { fontWeight: '800', fontSize: 14 },
  ressourceCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2 },
  ressourceTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  ressourceImage: { width: '100%', height: 400, borderRadius: 10, backgroundColor: '#F8FAFC' },
  
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
  buttonTextWhite: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  
  datePickerSelectorRow: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 10, justifyContent: 'center' },
  datePickerSelectorRowText: { fontSize: 14, fontWeight: '700', color: '#673AB7' },

  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20, zIndex: 10 },
  closeImageText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  fullScreenImage: { width: '100%', height: '80%' },
  downloadBtn: { position: 'absolute', bottom: 40, backgroundColor: '#00BCD4', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  downloadBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // --- STYLES HISTORIQUE ABSENCES ET SOS ---
  absencesTrackingBox: { backgroundColor: '#F5F3FF', padding: 12, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#DDD6FE' },
  absencesTrackingTitle: { fontSize: 13, fontWeight: '800', color: '#673AB7', marginBottom: 8 },
  absenceEmptyText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', paddingLeft: 4 },
  absenceTrackRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  absenceTrackDate: { fontSize: 12, fontWeight: '800', color: '#0F172A', width: '30%' },
  absenceTrackMotif: { fontSize: 12, color: '#475569', flex: 1, paddingHorizontal: 5 },
  absenceTrackBadge: { backgroundColor: '#EDE7F6', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
  absenceTrackBadgeText: { color: '#673AB7', fontSize: 10, fontWeight: '700' },

  sosStatusActiveCard: { backgroundColor: '#FFF5F5', borderLeftWidth: 4, borderLeftColor: '#FF5722', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#FFCCBC' },
  sosStatusTitle: { fontSize: 13, fontWeight: '900', color: '#D84315' },
  sosStatusText: { fontSize: 12, color: '#5D4037', marginTop: 3, fontWeight: '500' },
  sosCodeDisplay: { fontSize: 18, fontWeight: '900', color: '#FF5722', marginTop: 5, letterSpacing: 1 },

  // --- STYLES BLOC ATTESTATION ---
  attestationBlock: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'column' },
  attestationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attestationTitleText: { fontSize: 14, fontWeight: '800', color: '#334155' },
  btnDemanderAttestation: { backgroundColor: '#00BCD4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnDemanderAttestationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  attestationStatusWarning: { color: '#D97706', fontSize: 12, fontWeight: '700', marginTop: 10, backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, overflow: 'hidden', textAlign: 'center' },
  attestationStatusSuccess: { color: '#059669', fontSize: 12, fontWeight: '700', marginTop: 10, backgroundColor: '#D1FAE5', padding: 10, borderRadius: 8, overflow: 'hidden', textAlign: 'center' }
});