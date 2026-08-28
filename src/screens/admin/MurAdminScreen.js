import { Picker } from '@react-native-picker/picker';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser'; // 🚀 IMPORT AJOUTÉ POUR iOS
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

export default function MurAdminScreen() {
  const [publications, setPublications] = useState([]);
  const [textePost, setTextePost] = useState('');
  
  const [selectedMedias, setSelectedMedias] = useState([]); 
  const [driveUrlInput, setDriveUrlInput] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [expirationDays, setExpirationDays] = useState('0'); 

  const [modalVuesVisible, setModalVuesVisible] = useState(false);
  const [listePersonnesVues, setListePersonnesVues] = useState([]);

  useEffect(() => {
    fetchPublications();
    const sub = supabase.channel('public:publications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publications' }, () => fetchPublications())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const fetchPublications = async () => {
    const now = new Date().toISOString();
    
    const { data } = await supabase
      .from('publications')
      .select('*, vues_publications(date_vue, utilisateurs(prenom, nom))')
      .or(`date_expiration.is.null,date_expiration.gte.${now}`)
      .order('date_creation', { ascending: false });
      
    if (data) setPublications(data);
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
        const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,thumbnailLink)`;
        
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
      
      const { error } = await supabase.from('publications').insert([{ 
        texte: textePost, 
        media_url: mediaUrlFinale,
        date_expiration: date_expiration
      }]);
      
      if (error) throw error;
      await envoyerNotificationParents(textePost);
      
      setTextePost(''); setSelectedMedias([]); setExpirationDays('0');
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

  const renderHeader = () => (
    <View>
      <View style={styles.headerContainer}>
        <View style={styles.logoCircle}><Text style={styles.logoIcon}>📸</Text></View>
        <Text style={styles.mainTitle}>Mur d'Actualités</Text>
        <Text style={styles.subtitle}>Partagez les moments forts</Text>
      </View>

      <View style={styles.createPostContainer}>
        <Text style={styles.createTitle}>Nouvelle publication</Text>
        <TextInput style={styles.input} placeholder="Quoi de neuf à la crèche ?" placeholderTextColor="#94A3B8" value={textePost} onChangeText={setTextePost} multiline />
        
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
    
    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.postHeaderLeft}>
            <View style={styles.avatar}><Text style={styles.avatarText}>🏫</Text></View>
            <View>
              <Text style={styles.postAuthor}>{item.auteur || 'La Direction'}</Text>
              <Text style={styles.postTime}>{formaterDate(item.date_creation)}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => demanderSuppression(item.id, item.media_url)}>
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        </View>
        
        {imageUrls.length > 0 && (
          <View style={styles.multiImageContainer}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={true}>
              {imageUrls.map((url, idx) => {
                const isVideo = url.startsWith('video:');
                const cleanUrl = isVideo ? url.replace('video:', '') : url;

                if (isVideo) {
                  // 🚀 MAGIE : On extrait l'ID de la vidéo Drive pour générer sa miniature
                  const videoIdMatch = cleanUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
                  const videoId = videoIdMatch ? videoIdMatch[1] : null;
                  const thumbnailUrl = videoId ? `https://drive.google.com/thumbnail?id=${videoId}&sz=w800` : null;

                  return (
                    // 🚀 NOUVELLE FONCTION SUR LE ONPRESS
                    <TouchableOpacity key={idx} activeOpacity={0.9} onPress={() => ouvrirVideoDrive(cleanUrl)}>
                      <View style={{position: 'relative'}}>
                        {thumbnailUrl ? (
                          <Image source={{ uri: thumbnailUrl }} style={styles.postMultiImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.postMultiImage, { backgroundColor: '#1E293B' }]} />
                        )}
                        {/* CALQUE AVEC BOUTON PLAY AU MILIEU */}
                        <View style={styles.playOverlay}>
                          <View style={styles.playCircle}>
                            <Text style={styles.playTriangle}>▶</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                // SI C'EST UNE IMAGE CLASSIQUE
                return (
                  <Image key={idx} source={{ uri: url }} style={styles.postMultiImage} resizeMode="contain" />
                );
              })}
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
        
        {item.texte ? <Text style={styles.postText}>{item.texte}</Text> : null}

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
      <Text style={styles.footerText}>Developped by Abderrahim S © 2026</Text>
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
  deleteBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 12 },
  deleteBtnText: { fontSize: 14 },
  
  multiImageContainer: { position: 'relative', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }, 
  postMultiImage: { width: screenWidth - 32, height: 300 }, 
  
  // 🚀 NOUVEAUX STYLES POUR LA MINIATURE VIDÉO
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  playTriangle: { color: '#FFFFFF', fontSize: 26, marginLeft: 4 }, // marginLeft pour centrer optiquement le triangle

  multiBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  multiBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  expirationBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(231, 76, 60, 0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  expirationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  postText: { fontSize: 15, color: '#334155', paddingHorizontal: 15, marginTop: 15, lineHeight: 24 },
  
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