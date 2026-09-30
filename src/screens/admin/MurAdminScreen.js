import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const { width: screenWidth } = Dimensions.get('window');

// 🔑 METTEZ VOTRE CLÉ API GOOGLE ICI
const GOOGLE_API_KEY = 'AIzaSyBT-Becxcsmwwf-c2-NGlgsYUkNQGhWF00';

// 🚀 FONCTION POUR OUVRIR LA VIDÉO CORRECTEMENT SELON L'OS
const ouvrirVideoDrive = async (url) => {
  try {
    if (Platform.OS === 'ios') {
      await WebBrowser.openBrowserAsync(url);
    } else {
      Linking.openURL(url);
    }
  } catch (error) {
    Linking.openURL(url);
  }
};

// Alignement parfait avec la largeur définie dans StyleSheet (screenWidth - 32)
const CARD_IMAGE_WIDTH = screenWidth - 32;

const PostImageCarousel = ({ imageUrls, onImagePress, onVideoPress }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (event) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / CARD_IMAGE_WIDTH);
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
          <View style={{ position: 'relative', width: CARD_IMAGE_WIDTH }}>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.postMultiImage} resizeMode="cover" />
            ) : (
              <View style={[styles.postMultiImage, { backgroundColor: '#1E293B' }]} />
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
        <Image source={{ uri: url }} style={styles.postMultiImage} resizeMode="cover" />
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
        snapToInterval={CARD_IMAGE_WIDTH}
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
          length: CARD_IMAGE_WIDTH,
          offset: CARD_IMAGE_WIDTH * index,
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

export default function MurAdminScreen() {
  const [publications, setPublications] = useState([]);
  const [textePost, setTextePost] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  
  const [postType, setPostType] = useState('standard');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [eventDate, setEventDate] = useState(new Date());
  const [eventDeadline, setEventDeadline] = useState(new Date());
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const [selectedMedias, setSelectedMedias] = useState([]); 
  const [driveUrlInput, setDriveUrlInput] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [expirationDays, setExpirationDays] = useState('0'); 

  const [modalVuesVisible, setModalVuesVisible] = useState(false);
  const [listePersonnesVues, setListePersonnesVues] = useState([]);

  // ÉTATS POUR L'ÉVÉNEMENT (RSVP)
  const [modalRSVPVisible, setModalRSVPVisible] = useState(false);
  const [currentEventRSVP, setCurrentEventRSVP] = useState([]);

  // ÉTATS POUR LE SONDAGE DÉTAILLÉ
  const [modalVotesVisible, setModalVotesVisible] = useState(false);
  const [currentPollOptionVotes, setCurrentPollOptionVotes] = useState([]);
  const [currentPollOptionText, setCurrentPollOptionText] = useState('');

  // NOUVEAUX ÉTATS POUR LIKES ET COMMENTAIRES
  const [modalCommentairesVisible, setModalCommentairesVisible] = useState(false);
  const [postActifCommentaires, setPostActifCommentaires] = useState(null);
  const [nouveauCommentaire, setNouveauCommentaire] = useState('');
  const [modalLikesVisible, setModalLikesVisible] = useState(false);
  const [listePersonnesLikes, setListePersonnesLikes] = useState([]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    fetchUser();

    fetchPublications();
    const sub = supabase.channel('public:publications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publications' }, () => fetchPublications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sondages_options' }, () => fetchPublications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sondages_votes' }, () => fetchPublications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participations' }, () => fetchPublications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes_publications' }, () => fetchPublications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commentaires_publications' }, () => fetchPublications())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const fetchPublications = async () => {
    const now = new Date().toISOString();
    
    try {
      const { data, error } = await supabase
        .from('publications')
        .select(`
          *, 
          vues_publications(date_vue, utilisateurs(prenom, nom)),
          sondages_options(id, texte_option, sondages_votes(id, utilisateurs!parent_id(prenom, nom))),
          participations(id, statut, enfants(prenom, nom)),
          likes_publications(parent_id, utilisateurs(prenom, nom)),
          commentaires_publications(id, texte, date_creation, auteur_id, utilisateurs(prenom, nom))
        `)
        .or(`date_expiration.is.null,date_expiration.gte.${now}`)
        .order('date_creation', { ascending: false });
        
      if (error) throw error;

      if (data) {
        const sortedData = data.sort((a, b) => {
          if (a.epingle && !b.epingle) return -1;
          if (!a.epingle && b.epingle) return 1;
          return new Date(b.date_creation) - new Date(a.date_creation);
        });
        setPublications(sortedData);

        if (postActifCommentaires) {
          const postMisAJour = sortedData.find(p => p.id === postActifCommentaires.id);
          if (postMisAJour) setPostActifCommentaires(postMisAJour);
        }
      }
    } catch (err) {
      console.log("Erreur fetch publications:", err);
    }
  };

  const toggleLike = async (publicationId, estLike) => {
    try {
      if (!currentUserId) return;
      if (estLike) {
        await supabase.from('likes_publications').delete().match({ publication_id: publicationId, parent_id: currentUserId });
      } else {
        await supabase.from('likes_publications').insert({ publication_id: publicationId, parent_id: currentUserId });
      }
      fetchPublications();
    } catch (e) { console.log(e); }
  };

  const envoyerCommentaire = async () => {
    if (!nouveauCommentaire.trim() || !postActifCommentaires || !currentUserId) return;
    try {
      const { error } = await supabase.from('commentaires_publications').insert({
        publication_id: postActifCommentaires.id,
        auteur_id: currentUserId,
        texte: nouveauCommentaire.trim()
      });
      if (error) throw error;
      setNouveauCommentaire('');
      fetchPublications();
    } catch (error) { Alert.alert("Erreur", "Impossible d'ajouter le commentaire."); }
  };

  const supprimerCommentaire = async (commentId) => {
    if(Platform.OS === 'web') {
      if(window.confirm("En tant qu'Admin, voulez-vous vraiment supprimer ce commentaire ?")) {
        await supabase.from('commentaires_publications').delete().eq('id', commentId);
        fetchPublications();
      }
    } else {
      Alert.alert("Modération", "Supprimer ce commentaire ?", [
        {text: "Annuler", style: "cancel"},
        {text: "Supprimer", style: "destructive", onPress: async () => {
          await supabase.from('commentaires_publications').delete().eq('id', commentId);
          fetchPublications();
        }}
      ]);
    }
  };

  const ouvrirCommentaires = (post) => {
    setPostActifCommentaires(post);
    setModalCommentairesVisible(true);
  };

  const ouvrirModalLikes = (likesArray) => {
    setListePersonnesLikes(likesArray || []);
    setModalLikesVisible(true);
  };

  const ouvrirModalVotes = (optText, votes) => {
    setCurrentPollOptionText(optText);
    setCurrentPollOptionVotes(votes || []);
    setModalVotesVisible(true);
  };

  const toggleEpinglePublication = async (post) => {
    try {
      const nouvelEtat = !post.epingle;
      const { error } = await supabase
        .from('publications')
        .update({ epingle: nouvelEtat })
        .eq('id', post.id);

      if (error) throw error;
      fetchPublications();
    } catch (err) {
      Alert.alert("Erreur", "Impossible de modifier l'épingle.");
    }
  };

  const choisirPhotos = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsMultipleSelection: true, 
      selectionLimit: 5, 
      quality: 0.8,
      base64: true, 
    });

    if (!result.canceled) {
      const nouveauxMedias = result.assets.map(asset => ({
        type: 'local',
        uri: asset.uri,
        base64: asset.base64
      }));
      setSelectedMedias([...selectedMedias, ...nouveauxMedias]);
    }
  };

  const ajouterLienDrive = async () => {
    const urlClean = driveUrlInput.trim();
    if (!urlClean) return;

    if (!GOOGLE_API_KEY) {
      Alert.alert("Configuration requise", "Clé API Google manquante.");
      return;
    }

    const folderRegex = /folders\/([a-zA-Z0-9_-]{25,})/;
    const matchFolder = urlClean.match(folderRegex);

    if (matchFolder && matchFolder[1]) {
      const folderId = matchFolder[1];
      setLoadingDrive(true);
      try {
        const query = `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/')`;
        const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,thumbnailLink)&pageSize=100`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        if (data.files && data.files.length > 0) {
          const driveMedias = data.files.map(file => {
            const isVideo = file.mimeType.includes('video');
            if (isVideo) {
              const driveUrl = `https://drive.google.com/file/d/${file.id}/preview`;
              return { type: 'drive_video', uri: `video:${driveUrl}`, id: file.id, thumbnail: file.thumbnailLink };
            } else {
              const driveUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
              const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(driveUrl)}&w=800&fit=contain`;
              return { type: 'drive_image', uri: proxyUrl, id: file.id };
            }
          });

          setSelectedMedias([...selectedMedias, ...driveMedias]);
          setDriveUrlInput('');
          Alert.alert("Succès", `${driveMedias.length} fichier(s) importé(s) (Photos/Vidéos) ! 📸`);
        } else {
          Alert.alert("Dossier vide", "Aucune image ou vidéo publique trouvée.");
        }
      } catch (err) {
        Alert.alert("Erreur Drive", "Impossible de lire le dossier. Est-il 'Public' ?");
        console.error(err);
      } finally {
        setLoadingDrive(false);
      }
      return;
    }

    const fileIdRegex = /(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]{25,})/;
    const matchFile = urlClean.match(fileIdRegex);

    if (matchFile && matchFile[1]) {
      const fileId = matchFile[1];
      setLoadingDrive(true);
      try {
        const fileApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${GOOGLE_API_KEY}&fields=id,name,mimeType,thumbnailLink`;
        const response = await fetch(fileApiUrl);
        const file = await response.json();

        if (file.error) throw new Error(file.error.message);

        const isVideo = file.mimeType.includes('video');
        if (isVideo) {
          const driveUrl = `https://drive.google.com/file/d/${file.id}/preview`;
          setSelectedMedias([...selectedMedias, { type: 'drive_video', uri: `video:${driveUrl}`, id: file.id, thumbnail: file.thumbnailLink }]);
        } else {
          const driveUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(driveUrl)}&w=800&fit=contain`;
          setSelectedMedias([...selectedMedias, { type: 'drive_image', uri: proxyUrl, id: file.id }]);
        }
        setDriveUrlInput('');
      } catch (err) {
        Alert.alert("Erreur", "Impossible de lire le fichier. Est-il public ?");
      } finally {
        setLoadingDrive(false);
      }
    } else {
      Alert.alert("Lien inconnu", "Ce lien ne ressemble ni à un dossier, ni à un fichier Drive valide.");
    }
  };

  const removeSelectedMedia = (indexToRemove) => {
    setSelectedMedias(selectedMedias.filter((_, index) => index !== indexToRemove));
  };

  const updatePollOption = (text, index) => {
    const newOptions = [...pollOptions];
    newOptions[index] = text;
    setPollOptions(newOptions);
  };
  const addPollOption = () => { if (pollOptions.length < 4) setPollOptions([...pollOptions, '']); };
  const removePollOption = (index) => { if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== index)); };

  const envoyerNotificationParents = async (texte) => {
    try {
      const { data: utilisateurs, error } = await supabase
        .from('utilisateurs')
        .select('expo_push_token, web_push_sub')
        .eq('role', 'parent'); 

      if (error || !utilisateurs || utilisateurs.length === 0) return;

      const messagesPush = [];
      const webSubscriptions = [];

      const notificationTitle = 'Nouvelle publication ! 📸';
      const notificationBody = texte 
        ? `La crèche a publié : ${texte.length > 40 ? texte.substring(0, 40) + '...' : texte}` 
        : 'De nouveaux médias (photos/vidéos) ont été ajoutés sur le mur.';

      utilisateurs.forEach(u => {
        if (u.expo_push_token) {
          messagesPush.push({
            to: u.expo_push_token,
            sound: 'default',
            priority: 'high',
            title: notificationTitle,
            body: notificationBody,
            data: { tab: 'mur' }
          });
        }
        if (u.web_push_sub) {
          try {
            const subObj = typeof u.web_push_sub === 'string' ? JSON.parse(u.web_push_sub) : u.web_push_sub;
            webSubscriptions.push(subObj);
          } catch (e) {}
        }
      });

      if (messagesPush.length > 0) {
        const apiUrli = (Platform.OS === 'web' && !__DEV__) ? '/api/expo-push' : 'https://exp.host/--/api/v2/push/send';
        await fetch(apiUrli, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(messagesPush),
        });
      }

      if (webSubscriptions.length > 0) {
        await supabase.functions.invoke('send-web-push', {
          body: { subscriptions: webSubscriptions, payload: { title: notificationTitle, body: notificationBody, data: { tab: 'mur' } } }
        });
      }
    } catch (err) {
      console.log("Erreur d'envoi notifs:", err);
    }
  };

  const publier = async () => {
    if (!textePost && selectedMedias.length === 0) {
      alert("Vous devez au moins écrire un texte ou ajouter un média.");
      return;
    }
    
    setLoading(true);
    let mediaUrls = [];
    
    try {
      if (selectedMedias.length > 0) {
        for (const media of selectedMedias) {
          if (media.type === 'local') {
            const fileName = `post_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const { error: uploadError } = await supabase.storage.from('mur_medias').upload(fileName, decode(media.base64), { contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const { data: publicUrlData } = supabase.storage.from('mur_medias').getPublicUrl(fileName);
            mediaUrls.push(publicUrlData.publicUrl);
          } else if (media.type.includes('drive')) {
            mediaUrls.push(media.uri);
          }
        }
      }
      
      const mediaUrlFinale = mediaUrls.length > 0 ? mediaUrls.join(',') : null;
      let date_expiration = null;
      
      if (expirationDays !== '0') {
        const dateExp = new Date();
        dateExp.setDate(dateExp.getDate() + parseInt(expirationDays));
        date_expiration = dateExp.toISOString();
      }
      
      const postPayload = { 
        texte: textePost, 
        media_url: mediaUrlFinale,
        date_expiration: date_expiration,
        type_post: postType,
        date_evenement: postType === 'evenement' ? eventDate.toISOString() : null,
        date_limite_reponse: postType === 'evenement' ? eventDeadline.toISOString() : null,
      };

      const { data: insertedPost, error } = await supabase.from('publications').insert([postPayload]).select().single();
      if (error) throw error;

      if (postType === 'sondage' && insertedPost) {
        const validOptions = pollOptions.filter(o => o.trim()).map(opt => ({
          publication_id: insertedPost.id,
          texte_option: opt.trim()
        }));
        await supabase.from('sondages_options').insert(validOptions);
      }
      
      await envoyerNotificationParents(textePost);
      
      setTextePost(''); setSelectedMedias([]); setExpirationDays('0'); setPostType('standard'); setPollOptions(['', '']);
      Alert.alert("Succès", "La publication est en ligne ! 🎉");
    } catch (error) {
      alert("Erreur lors de la publication : " + error.message);
    } finally {
      fetchPublications();
      setLoading(false); 
    }
  };

  const demanderSuppression = (postId, mediaUrlStr) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Voulez-vous vraiment supprimer cette publication définitivement ?")) executerSuppression(postId, mediaUrlStr);
    } else {
      Alert.alert("Suppression", "Voulez-vous vraiment supprimer cette publication ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => executerSuppression(postId, mediaUrlStr) }
      ]);
    }
  };

  const executerSuppression = async (postId, mediaUrlStr) => {
    try {
      if (mediaUrlStr) {
        const urls = mediaUrlStr.split(',');
        const fileNamesToRemove = urls.filter(url => url.includes('supabase.co')).map(url => {
            const parts = url.split('/');
            return parts[parts.length - 1];
          }).filter(name => name);
        if (fileNamesToRemove.length > 0) {
          await supabase.storage.from('mur_medias').remove(fileNamesToRemove);
        }
      }
      const { error } = await supabase.from('publications').delete().eq('id', postId);
      if (error) throw error;
      fetchPublications();
    } catch (error) {
      alert("Erreur lors de la suppression : " + error.message);
    }
  };

  const ouvrirModalVues = (vuesArray) => {
    setListePersonnesVues(vuesArray || []);
    setModalVuesVisible(true);
  };

  const formaterDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ' à');
  };

  const formaterDateCom = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ' à');
  };

  const renderHeader = () => (
    <View>
      <View style={styles.headerContainer}>
        <View style={styles.logoCircle}><Text style={styles.logoIcon}>📸</Text></View>
        <Text style={styles.mainTitle}>Mur d'Actualités</Text>
        <Text style={styles.subtitle}>Partagez les moments forts</Text>
      </View>

      <View style={styles.createPostContainer}>
        <Text style={styles.createTitle}>Nouvelle publication</Text>
        
        <View style={styles.postTypeRow}>
          <TouchableOpacity style={[styles.typeBtn, postType === 'standard' && styles.typeBtnActive]} onPress={() => setPostType('standard')}>
            <Text style={[styles.typeText, postType === 'standard' && styles.typeTextActive]}>📝 Standard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeBtn, postType === 'sondage' && styles.typeBtnActive]} onPress={() => setPostType('sondage')}>
            <Text style={[styles.typeText, postType === 'sondage' && styles.typeTextActive]}>📊 Sondage</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeBtn, postType === 'evenement' && styles.typeBtnActive]} onPress={() => setPostType('evenement')}>
            <Text style={[styles.typeText, postType === 'evenement' && styles.typeTextActive]}>📅 Événement</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={styles.input} placeholder={postType === 'sondage' ? "Posez votre question ici..." : postType === 'evenement' ? "Description de l'événement et consignes..." : "Quoi de neuf à la crèche ?"} placeholderTextColor="#94A3B8" value={textePost} onChangeText={setTextePost} multiline />
        
        {postType === 'sondage' && (
          <View style={styles.pollContainer}>
            {pollOptions.map((opt, index) => (
              <View key={index} style={styles.pollOptionRow}>
                <TextInput style={styles.pollInput} placeholder={`Option ${index + 1}`} value={opt} onChangeText={(text) => updatePollOption(text, index)} />
                {index > 1 && (
                  <TouchableOpacity style={styles.removePollBtn} onPress={() => removePollOption(index)}><Text style={{color:'#FFF', fontWeight:'bold'}}>X</Text></TouchableOpacity>
                )}
              </View>
            ))}
            {pollOptions.length < 4 && (
              <TouchableOpacity style={styles.addPollBtn} onPress={addPollOption}><Text style={styles.addPollBtnText}>+ Ajouter une option</Text></TouchableOpacity>
            )}
          </View>
        )}

        {postType === 'evenement' && (
          <View style={styles.eventContainer}>
            <Text style={styles.labelOption}>Date de l'événement :</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={eventDate.toISOString().split('T')[0]} onChange={(e) => setEventDate(new Date(e.target.value))} style={{ ...styles.webDatePicker, outline: 'none' }} />
            ) : (
              <View>
                <TouchableOpacity style={styles.dateSelector} onPress={() => setShowEventDatePicker(true)}><Text style={styles.dateSelectorText}>📅 {eventDate.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                {showEventDatePicker && <DateTimePicker value={eventDate} mode="date" display="default" minimumDate={new Date()} onChange={(e, date) => { setShowEventDatePicker(false); if(date) setEventDate(date); }} />}
              </View>
            )}

            <Text style={[styles.labelOption, {marginTop: 10}]}>Date limite de réponse :</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={eventDeadline.toISOString().split('T')[0]} onChange={(e) => setEventDeadline(new Date(e.target.value))} style={{ ...styles.webDatePicker, outline: 'none' }} />
            ) : (
              <View>
                <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDeadlinePicker(true)}><Text style={styles.dateSelectorText}>⏳ {eventDeadline.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                {showDeadlinePicker && <DateTimePicker value={eventDeadline} mode="date" display="default" minimumDate={new Date()} onChange={(e, date) => { setShowDeadlinePicker(false); if(date) setEventDeadline(date); }} />}
              </View>
            )}
          </View>
        )}

        <View style={styles.driveInputRow}>
          <TextInput style={styles.driveInput} placeholder="Lien de dossier OU fichier Drive..." placeholderTextColor="#94A3B8" value={driveUrlInput} onChangeText={setDriveUrlInput} />
          <TouchableOpacity style={styles.addDriveBtn} onPress={ajouterLienDrive} disabled={loadingDrive}>
            {loadingDrive ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.addDriveBtnText}>+ Scan Drive</Text>}
          </TouchableOpacity>
        </View>
        
        {selectedMedias.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
            {selectedMedias.map((media, index) => {
              const isVid = media.type === 'drive_video';
              const sourceUri = isVid ? (media.thumbnail || 'https://via.placeholder.com/150/0F172A/FFFFFF?text=Video') : media.uri;
              return (
                <View key={index} style={styles.previewImageWrapper}>
                  <Image source={{ uri: sourceUri }} style={styles.previewImage} resizeMode="cover" />
                  {media.type.includes('drive') && (
                    <View style={[styles.driveBadge, isVid && {backgroundColor: '#EF4444'}]}>
                      <Text style={styles.driveBadgeText}>{isVid ? 'Drive 🎥' : 'Drive 📸'}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removeSelectedMedia(index)}>
                    <Text style={styles.removePhotoText}>✖</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
        
        <View style={styles.optionsRow}>
          <Text style={styles.labelOption}>Suppression auto :</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={expirationDays} onValueChange={(val) => setExpirationDays(val)} style={styles.picker}>
              <Picker.Item label="Jamais (Permanent)" value="0" />
              <Picker.Item label="Après 1 jour" value="1" />
              <Picker.Item label="Après 3 jours" value="3" />
              <Picker.Item label="Après 7 jours" value="7" />
              <Picker.Item label="Après 30 jours" value="30" />
            </Picker>
          </View>
        </View>
        
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.photoBtn} onPress={choisirPhotos}>
            <Text style={styles.photoBtnText}>🖼️ Galerie Locale</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.publishBtn} onPress={publier} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.publishBtnText}>Publier</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderPost = ({ item }) => {
    const imageUrls = item.media_url ? item.media_url.split(',') : [];
    const vuesCount = item.vues_publications ? item.vues_publications.length : 0;
    
    let totalVotes = 0;
    if (item.type_post === 'sondage' && item.sondages_options) {
      totalVotes = item.sondages_options.reduce((acc, opt) => acc + (opt.sondages_votes?.length || 0), 0);
    }

    let presents = [];
    let absents = [];
    if (item.type_post === 'evenement' && item.participations) {
      presents = item.participations.filter(p => p.statut === 'present');
      absents = item.participations.filter(p => p.statut === 'absent');
    }

    const likes = item.likes_publications || [];
    const commentaires = item.commentaires_publications || [];
    const monLike = likes.some(l => l.parent_id === currentUserId);

    return (
      <View style={[styles.postCard, item.epingle && { borderColor: '#4F46E5', borderWidth: 2 }]}>
        <View style={styles.postHeader}>
          <View style={styles.postHeaderLeft}>
            <View style={[styles.avatar, item.type_post === 'evenement' && {backgroundColor:'#FEF3C7'}, item.type_post === 'sondage' && {backgroundColor:'#E0E7FF'}]}>
              <Text style={styles.avatarText}>{item.type_post === 'evenement' ? '📅' : item.type_post === 'sondage' ? '📊' : '🏫'}</Text>
            </View>
            <View>
              <Text style={styles.postAuthor}>{item.type_post === 'evenement' ? 'Événement à venir' : item.type_post === 'sondage' ? 'Sondage aux parents' : item.auteur || 'La Direction'}</Text>
              <Text style={styles.postTime}>{formaterDate(item.date_creation)}</Text>
            </View>
          </View>
          
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity style={styles.pinBtn} onPress={() => toggleEpinglePublication(item)}>
              <Text style={styles.pinBtnText}>{item.epingle ? '📌' : '📍'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => demanderSuppression(item.id, item.media_url)}>
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {imageUrls.length > 0 && (
          <PostImageCarousel imageUrls={imageUrls} onImagePress={() => {}} onVideoPress={(cleanUrl) => ouvrirVideoDrive(cleanUrl)} />
        )}
        
        <View style={styles.instagramActionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(item.id, monLike)}>
            <Text style={styles.actionIcon}>{monLike ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => ouvrirCommentaires(item)}>
            <Text style={styles.actionIcon}>💬</Text>
          </TouchableOpacity>
        </View>

        {likes.length > 0 && (
          <TouchableOpacity onPress={() => ouvrirModalLikes(likes)}>
            <Text style={styles.likesCount}>{likes.length} J'aime (Voir qui)</Text>
          </TouchableOpacity>
        )}
        
        {commentaires.length > 0 && (
          <TouchableOpacity onPress={() => ouvrirCommentaires(item)}>
            <Text style={styles.commentsCount}>Voir les {commentaires.length} commentaire(s) (Modérer)</Text>
          </TouchableOpacity>
        )}

        {item.texte ? <Text style={styles.postText}>{item.texte}</Text> : null}

        {item.type_post === 'sondage' && item.sondages_options && (
          <View style={styles.pollResultsContainer}>
            {item.sondages_options.map((opt) => {
              const votesOpt = opt.sondages_votes?.length || 0;
              const percent = totalVotes > 0 ? Math.round((votesOpt / totalVotes) * 100) : 0;
              return (
                <View key={opt.id} style={styles.pollResultRow}>
                  <View style={styles.pollResultHeader}>
                    <Text style={styles.pollResultText}>{opt.texte_option}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={styles.pollResultPercent}>{percent}% ({votesOpt})</Text>
                      {/* 🚀 BOUTON POUR VOIR QUI A VOTÉ POUR CETTE OPTION */}
                      <TouchableOpacity onPress={() => ouvrirModalVotes(opt.texte_option, opt.sondages_votes)} style={{marginLeft: 10}}>
                        <Text style={{fontSize: 12, color: '#94A3B8', textDecorationLine: 'underline'}}>Voir qui</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.pollResultBarBg}>
                    <View style={[styles.pollResultBarFill, { width: `${percent}%` }]} />
                  </View>
                </View>
              );
            })}
            <Text style={styles.pollTotalVotes}>{totalVotes} vote(s) au total</Text>
          </View>
        )}

        {item.type_post === 'evenement' && (
          <View style={styles.eventInfoContainer}>
            <View style={styles.eventDatesBox}>
              <Text style={styles.eventDateText}>📅 A lieu le : <Text style={{fontWeight:'900'}}>{item.date_evenement ? new Date(item.date_evenement).toLocaleDateString('fr-FR') : 'À venir'}</Text></Text>
              <Text style={styles.eventDeadlineText}>⏳ Réponse max : {item.date_limite_reponse ? new Date(item.date_limite_reponse).toLocaleDateString('fr-FR') : 'Non définie'}</Text>
            </View>
            <View style={styles.rsvpStatsRow}>
              <View style={styles.rsvpStatBox}><Text style={{fontSize:24}}>✅</Text><Text style={styles.rsvpStatNum}>{presents.length}</Text><Text style={styles.rsvpStatLabel}>Présents</Text></View>
              <View style={styles.rsvpStatBox}><Text style={{fontSize:24}}>❌</Text><Text style={styles.rsvpStatNum}>{absents.length}</Text><Text style={styles.rsvpStatLabel}>Absents</Text></View>
            </View>
            <TouchableOpacity style={styles.viewRsvpBtn} onPress={() => { setCurrentEventRSVP(item.participations || []); setModalRSVPVisible(true); }}>
              <Text style={styles.viewRsvpBtnText}>📋 Voir les réponses détaillées</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.date_expiration && (
           <View style={styles.expirationBadge}>
             <Text style={styles.expirationText}>
               ⏳ Disparaît le {new Date(item.date_expiration).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'})}
             </Text>
           </View>
        )}

        <View style={styles.vuesContainer}>
          <TouchableOpacity style={styles.vuesBtn} onPress={() => ouvrirModalVues(item.vues_publications)}>
            <Text style={styles.vuesText}>👁️ Vu par {vuesCount} parent(s)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFooter = () => (
    <View style={styles.footer}>
      <Text style={styles.footerText}>Developped by A S © 2026</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList 
          data={publications} 
          keyExtractor={item => item.id.toString()} 
          renderItem={renderPost} 
          ListHeaderComponent={renderHeader()}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContent} 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>

      <Modal visible={modalCommentairesVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlayComments}>
            <View style={styles.modalContentComments}>
              <View style={styles.commentHeaderBar}>
                <Text style={styles.modalTitleComments}>Modération des Commentaires</Text>
                <TouchableOpacity onPress={() => setModalCommentairesVisible(false)} style={styles.closeCommentBtn}><Text style={styles.closeCommentBtnText}>✖</Text></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.commentsList}>
                {postActifCommentaires?.commentaires_publications?.length === 0 ? (
                  <Text style={styles.emptyText}>Aucun commentaire pour l'instant.</Text>
                ) : (
                  postActifCommentaires?.commentaires_publications?.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={styles.commentAvatar}><Text>👤</Text></View>
                      <View style={styles.commentTextBubble}>
                        <Text style={styles.commentAuthor}>{c.utilisateurs?.prenom} {c.utilisateurs?.nom} <Text style={styles.commentDate}>• {formaterDateCom(c.date_creation)}</Text></Text>
                        <Text style={styles.commentText}>{c.texte}</Text>
                      </View>
                      <TouchableOpacity onPress={() => supprimerCommentaire(c.id)} style={{marginLeft: 10, justifyContent: 'center'}}><Text style={{color: '#EF4444', fontSize: 12, fontWeight:'bold'}}>Supprimer</Text></TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
              <View style={styles.commentInputContainer}>
                <TextInput style={styles.commentInput} placeholder="Écrire en tant que Direction..." value={nouveauCommentaire} onChangeText={setNouveauCommentaire} multiline />
                <TouchableOpacity style={styles.commentSendBtn} onPress={envoyerCommentaire} disabled={!nouveauCommentaire.trim()}>
                  <Text style={[styles.commentSendText, !nouveauCommentaire.trim() && {color: '#94A3B8'}]}>Publier</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalLikesVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ils aiment cette publication :</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {listePersonnesLikes.length === 0 ? (
                <Text style={styles.emptyText}>Aucun like.</Text>
              ) : (
                listePersonnesLikes.map((like, idx) => (
                  <View key={idx} style={styles.vueRow}>
                    <Text style={styles.vueNom}>❤️ {like.utilisateurs?.prenom} {like.utilisateurs?.nom}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalLikesVisible(false)}><Text style={styles.closeModalBtnText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🚀 MODALE POUR VOIR QUI A VOTÉ AU SONDAGE */}
      <Modal visible={modalVotesVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ont voté pour : "{currentPollOptionText}"</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {currentPollOptionVotes.length === 0 ? (
                <Text style={styles.emptyText}>Aucun parent n'a voté pour cette option.</Text>
              ) : (
                currentPollOptionVotes.map((vote, idx) => (
                  <View key={idx} style={styles.vueRow}>
                    <Text style={styles.vueNom}>✅ {vote.utilisateurs?.prenom} {vote.utilisateurs?.nom}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVotesVisible(false)}><Text style={styles.closeModalBtnText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVuesVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ils ont vu cette publication :</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {listePersonnesVues.length === 0 ? (
                <Text style={styles.emptyText}>Aucun parent n'a encore vu cette publication.</Text>
              ) : (
                listePersonnesVues.map((vue, idx) => (
                  <View key={idx} style={styles.vueRow}>
                    <Text style={styles.vueNom}>👤 {vue.utilisateurs?.prenom} {vue.utilisateurs?.nom}</Text>
                    <Text style={styles.vueHeure}>{formaterDate(vue.date_vue)}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVuesVisible(false)}>
              <Text style={styles.closeModalBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🚀 MODALE POUR VOIR LES RÉPONSES AUX ÉVÉNEMENTS */}
      <Modal visible={modalRSVPVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {maxHeight: '80%'}]}>
            <Text style={styles.modalTitle}>Détails des participations</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {currentEventRSVP.length === 0 ? (
                <Text style={styles.emptyText}>Aucune réponse pour le moment.</Text>
              ) : (
                currentEventRSVP.map((rsvp, idx) => (
                  <View key={idx} style={styles.vueRow}>
                    <Text style={styles.vueNom}>{rsvp.statut === 'present' ? '✅ Présent(e) :' : '❌ Absent(e) :'} {rsvp.enfants?.prenom} {rsvp.enfants?.nom}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalRSVPVisible(false)}><Text style={styles.closeModalBtnText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { paddingBottom: 20 },
  headerContainer: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#FFFFFF', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 3, zIndex: 10, marginBottom: 15 },
  logoCircle: { width: 60, height: 60, backgroundColor: '#EEF2FF', borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  logoIcon: { fontSize: 30 },
  mainTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#4F46E5', fontWeight: '600', marginTop: 4 },
  
  createPostContainer: { backgroundColor: '#FFFFFF', marginHorizontal: 15, padding: 18, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  createTitle: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 12 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, color: '#334155' },
  
  postTypeRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  typeBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  typeText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  typeTextActive: { color: '#4F46E5', fontWeight: '900' },

  pollContainer: { marginTop: 15, backgroundColor: '#F8FAFC', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pollInput: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 8, fontSize: 14 },
  removePollBtn: { backgroundColor: '#EF4444', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  addPollBtn: { alignItems: 'center', marginTop: 5 },
  addPollBtnText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 14 },

  eventContainer: { marginTop: 15, backgroundColor: '#FFFBEB', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  dateSelector: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FCD34D', padding: 12, borderRadius: 8, marginTop: 5 },
  dateSelectorText: { fontSize: 14, fontWeight: 'bold', color: '#B45309' },
  webDatePicker: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FCD34D', padding: 10, borderRadius: 8, marginTop: 5, fontSize: 14, color: '#B45309' },

  driveInputRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  driveInput: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 13, color: '#334155', marginRight: 8 },
  addDriveBtn: { backgroundColor: '#10B981', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', minWidth: 100, alignItems: 'center' },
  addDriveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  driveBadge: { position: 'absolute', bottom: 5, left: 5, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  driveBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  previewScroll: { marginTop: 15 },
  previewImageWrapper: { position: 'relative', marginRight: 10 },
  previewImage: { width: 100, height: 100, borderRadius: 12 },
  removePhotoBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(15, 23, 42, 0.7)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  removePhotoText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  
  optionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, justifyContent: 'space-between' },
  labelOption: { fontSize: 14, color: '#475569', fontWeight: '600' },
  pickerContainer: { flex: 1, marginLeft: 15, backgroundColor: '#F1F5F9', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  picker: { height: 40 },
  
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  photoBtn: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, flex: 1, marginRight: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  photoBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  publishBtn: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 12, flex: 1, marginLeft: 8, alignItems: 'center', elevation: 3 },
  publishBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },

  postCard: { backgroundColor: '#FFFFFF', marginHorizontal: 15, marginBottom: 20, borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, overflow: 'hidden' },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 12 },
  postHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20 },
  postAuthor: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  postTime: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  
  pinBtn: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pinBtnText: { fontSize: 14 },
  deleteBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 12 },
  deleteBtnText: { fontSize: 14 },
  
  multiImageContainer: { position: 'relative', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }, 
  postMultiImage: { width: CARD_IMAGE_WIDTH, height: 300 }, 
  
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  playTriangle: { color: '#FFFFFF', fontSize: 26, marginLeft: 4 }, 

  multiBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  multiBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  expirationBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(231, 76, 60, 0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  expirationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  postText: { fontSize: 15, color: '#334155', paddingHorizontal: 15, marginTop: 15, lineHeight: 24 },

  sondageQuestion: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 10, paddingHorizontal: 15 },
  pollResultsContainer: { paddingHorizontal: 15, marginTop: 10 },
  pollResultRow: { marginBottom: 12 },
  pollResultHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  pollResultText: { fontSize: 14, fontWeight: '700', color: '#334155', flex: 1 },
  pollResultPercent: { fontSize: 13, fontWeight: 'bold', color: '#4F46E5', marginLeft: 10 },
  pollResultBarBg: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  pollResultBarFill: { height: '100%', backgroundColor: '#4F46E5', borderRadius: 5 },
  pollTotalVotes: { fontSize: 12, color: '#94A3B8', textAlign: 'right', fontStyle: 'italic', marginTop: 5 },

  eventInfoContainer: { marginHorizontal: 15, marginTop: 15, padding: 15, backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  eventDatesBox: { marginBottom: 15 },
  eventDateText: { fontSize: 14, color: '#B45309', marginBottom: 4 },
  eventDeadlineText: { fontSize: 12, color: '#D97706', fontWeight: 'bold' },
  rsvpStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  rsvpStatBox: { alignItems: 'center', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, minWidth: 80, elevation: 1 },
  rsvpStatNum: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginVertical: 4 },
  rsvpStatLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' },
  viewRsvpBtn: { backgroundColor: '#F59E0B', padding: 12, borderRadius: 8, alignItems: 'center' },
  viewRsvpBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  
  instagramActionBar: { flexDirection: 'row', paddingHorizontal: 15, marginTop: 15, alignItems: 'center' },
  actionBtn: { marginRight: 15 },
  actionIcon: { fontSize: 24 },
  likesCount: { fontWeight: 'bold', paddingHorizontal: 15, marginTop: 8, color: '#0F172A', fontSize: 14 },
  commentsCount: { color: '#64748B', paddingHorizontal: 15, marginTop: 4, fontSize: 14, fontWeight: '500' },

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
  commentInputContainer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 15, marginTop: 10 },
  commentInput: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, maxHeight: 100, color: '#0F172A' },
  commentSendBtn: { marginLeft: 15 },
  commentSendText: { color: '#2196F3', fontWeight: '800', fontSize: 15 },

  vuesContainer: { paddingHorizontal: 15, marginTop: 15, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  vuesBtn: { alignSelf: 'flex-start', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  vuesText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 13 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 15, textAlign: 'center' },
  vueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  vueNom: { fontSize: 15, fontWeight: '600', color: '#334155' },
  vueHeure: { fontSize: 12, color: '#94A3B8' },
  closeModalBtn: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  closeModalBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 15 },
  emptyText: { textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', marginVertical: 20 },

  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' }
});