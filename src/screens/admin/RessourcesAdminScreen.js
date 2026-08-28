import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function RessourcesAdminScreen() {
  const [activeTab, setActiveTab] = useState('menus'); // 'menus' ou 'documents'
  const [loading, setLoading] = useState(false);

  // États pour les Menus
  const [menus, setMenus] = useState([]);
  const [semaineDu, setSemaineDu] = useState('');
  const [descMenu, setDescMenu] = useState('');
  const [menuImageBase64, setMenuImageBase64] = useState(null);
  const [menuImageUri, setMenuImageUri] = useState(null);
  const [modalMenu, setModalMenu] = useState(false);

  // États pour les Documents
  const [documents, setDocuments] = useState([]);
  const [titreDoc, setTitreDoc] = useState('');
  const [docImageBase64, setDocImageBase64] = useState(null);
  const [docImageUri, setDocImageUri] = useState(null);
  const [modalDoc, setModalDoc] = useState(false);

  useEffect(() => {
    fetchMenus();
    fetchDocuments();
  }, []);

  const fetchMenus = async () => {
    const { data } = await supabase.from('menus_cantine').select('*').order('semaine_du', { ascending: false });
    if (data) setMenus(data);
  };

  const fetchDocuments = async () => {
    const { data } = await supabase.from('documents_utiles').select('*').order('date_ajout', { ascending: false });
    if (data) setDocuments(data);
  };

  const choisirImage = async (type) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      if (type === 'menu') {
        setMenuImageUri(result.assets[0].uri);
        setMenuImageBase64(result.assets[0].base64);
      } else {
        setDocImageUri(result.assets[0].uri);
        setDocImageBase64(result.assets[0].base64);
      }
    }
  };

  const notifierTousLesParents = async (titre, bodyMessage) => {
    try {
      const { data: parents } = await supabase
        .from('utilisateurs')
        .select('expo_push_token')
        .eq('role', 'parent')
        .not('expo_push_token', 'is', null);

      if (!parents || parents.length === 0) return;

      const messagesPush = parents.map(p => ({
        to: p.expo_push_token,
        sound: 'default',
        priority: 'high',
        title: titre,
        body: bodyMessage,
        data: { tab: 'ressources' }
      }));

      const apiUrl = (Platform.OS === 'web' && !__DEV__) 
        ? '/api/expo-push' 
        : 'https://exp.host/--/api/v2/push/send';

      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagesPush),
      });
    } catch (error) {
      console.log("Erreur lors de l'envoi de la notification globale :", error);
    }
  };

  const sauvegarderMenu = async () => {
    if (!semaineDu) return alert("Veuillez indiquer la date (ex: 15 au 19 Mai).");
    setLoading(true);
    let imageUrl = null;

    try {
      if (menuImageBase64) {
        const fileName = `menu_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('menus_cantine').upload(fileName, decode(menuImageBase64), { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('menus_cantine').getPublicUrl(fileName);
        imageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from('menus_cantine').insert([{ semaine_du: new Date().toISOString().split('T')[0], description: `Semaine du ${semaineDu} - ${descMenu}`, image_url: imageUrl }]);
      if (error) throw error;

      await notifierTousLesParents(
        "Nouveau Menu Cantine 🍽️", 
        `Le menu de la semaine du ${semaineDu} est disponible !`
      );

      Alert.alert("Succès", "Menu ajouté et parents notifiés !");
      setModalMenu(false); setSemaineDu(''); setDescMenu(''); setMenuImageUri(null); setMenuImageBase64(null);
      fetchMenus();
    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoading(false); }
  };

  const sauvegarderDocument = async () => {
    if (!titreDoc || !docImageBase64) return alert("Veuillez mettre un titre et une photo du document.");
    setLoading(true);

    try {
      const fileName = `doc_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('documents_creche').upload(fileName, decode(docImageBase64), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      
      const { data: publicUrlData } = supabase.storage.from('documents_creche').getPublicUrl(fileName);
      
      const { error } = await supabase.from('documents_utiles').insert([{ titre: titreDoc, fichier_url: publicUrlData.publicUrl }]);
      if (error) throw error;

      await notifierTousLesParents(
        "Nouveau Document 📂", 
        `Un nouveau document a été ajouté : ${titreDoc}`
      );

      Alert.alert("Succès", "Document ajouté et parents notifiés !");
      setModalDoc(false); setTitreDoc(''); setDocImageUri(null); setDocImageBase64(null);
      fetchDocuments();
    } catch (error) { Alert.alert("Erreur", error.message); } finally { setLoading(false); }
  };

  // --- CORRECTION : Logique de suppression compatible Web ---
  const executerSuppression = async (table, id, imageUrl) => {
    try {
      if (imageUrl) {
        const bucket = table === 'menus_cantine' ? 'menus_cantine' : 'documents_creche';
        const fileName = imageUrl.split('/').pop();
        await supabase.storage.from(bucket).remove([fileName]);
      }
      await supabase.from(table).delete().eq('id', id);
      
      if (table === 'menus_cantine') {
        fetchMenus();
      } else {
        fetchDocuments();
      }
    } catch (error) {
      console.log("Erreur lors de la suppression:", error);
    }
  };

  const supprimerItem = (table, id, imageUrl) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Voulez-vous vraiment supprimer cet élément ?")) {
        executerSuppression(table, id, imageUrl);
      }
    } else {
      Alert.alert("Confirmation", "Voulez-vous supprimer cet élément ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => executerSuppression(table, id, imageUrl) }
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ressources Familles</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'menus' && styles.tabActive]} onPress={() => setActiveTab('menus')}>
            <Text style={[styles.tabText, activeTab === 'menus' && styles.tabTextActive]}>🍽️ Menus</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'documents' && styles.tabActive]} onPress={() => setActiveTab('documents')}>
            <Text style={[styles.tabText, activeTab === 'documents' && styles.tabTextActive]}>📂 Documents</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'menus' ? (
          <>
            <TouchableOpacity style={styles.addBtn} onPress={() => setModalMenu(true)}><Text style={styles.addBtnText}>+ Ajouter un Menu</Text></TouchableOpacity>
            <FlatList data={menus} keyExtractor={item => item.id.toString()} renderItem={({item}) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.description}</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => supprimerItem('menus_cantine', item.id, item.image_url)}>
                    <Text style={{fontSize: 16}}>🗑️</Text>
                  </TouchableOpacity>
                </View>
                {item.image_url && <Image source={{uri: item.image_url}} style={styles.cardImage} />}
              </View>
            )} />
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.addBtn, {backgroundColor: '#8E44AD'}]} onPress={() => setModalDoc(true)}><Text style={styles.addBtnText}>+ Ajouter un Document</Text></TouchableOpacity>
            <FlatList data={documents} keyExtractor={item => item.id.toString()} renderItem={({item}) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.titre}</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => supprimerItem('documents_utiles', item.id, item.fichier_url)}>
                    <Text style={{fontSize: 16}}>🗑️</Text>
                  </TouchableOpacity>
                </View>
                {item.fichier_url && <Image source={{uri: item.fichier_url}} style={styles.cardImage} />}
              </View>
            )} />
          </>
        )}
      </View>

      {/* MODAL MENU */}
      <Modal visible={modalMenu} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Nouveau Menu de la Semaine</Text>
                <Text style={styles.label}>Dates (ex: 15 au 19 Mai)</Text>
                <TextInput style={styles.input} value={semaineDu} onChangeText={setSemaineDu} />
                <Text style={styles.label}>Description courte (optionnel)</Text>
                <TextInput style={styles.input} value={descMenu} onChangeText={setDescMenu} />
                <TouchableOpacity style={styles.uploadBtn} onPress={() => choisirImage('menu')}>
                  <Text style={styles.uploadBtnText}>📸 {menuImageUri ? "Changer la photo du menu" : "Ajouter une photo du menu"}</Text>
                </TouchableOpacity>
                {menuImageUri && <Image source={{uri: menuImageUri}} style={styles.previewImage}/>}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalMenu(false)}>
                    <Text style={styles.buttonTextWhite}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={sauvegarderMenu} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonTextWhite}>Publier</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DOCUMENT */}
      <Modal visible={modalDoc} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Nouveau Document</Text>
                <Text style={styles.label}>Titre (ex: Règlement Intérieur)</Text>
                <TextInput style={styles.input} value={titreDoc} onChangeText={setTitreDoc} />
                <TouchableOpacity style={styles.uploadBtn} onPress={() => choisirImage('doc')}>
                  <Text style={styles.uploadBtnText}>📸 {docImageUri ? "Changer la photo" : "Prendre en photo le document"}</Text>
                </TouchableOpacity>
                {docImageUri && <Image source={{uri: docImageUri}} style={styles.previewImage}/>}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalDoc(false)}>
                    <Text style={styles.buttonTextWhite}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, {backgroundColor: '#8E44AD'}]} onPress={sauvegarderDocument} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonTextWhite}>Publier</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  header: { backgroundColor: '#2C3E50', paddingTop: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginHorizontal: 20, marginBottom: 15 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#34495E', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabActive: { backgroundColor: '#2C3E50', borderBottomWidth: 3, borderBottomColor: '#3498DB' },
  tabText: { color: '#BDC3C7', fontWeight: 'bold', fontSize: 14 },
  tabTextActive: { color: '#FFF' },
  content: { flex: 1, padding: 15 },
  addBtn: { backgroundColor: '#3498DB', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15, elevation: 2 },
  addBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  card: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', flex: 1, paddingRight: 10 },
  deleteBtn: { backgroundColor: '#FEF2F2', padding: 8, borderRadius: 8 },
  
  // CORRECTION : resizeMode = contain et hauteur augmentée pour voir le doc entier
  cardImage: { width: '100%', height: 350, borderRadius: 8, resizeMode: 'contain', backgroundColor: '#F8FAFC', marginTop: 10 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 25, borderTopRightRadius: 25, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  label: { fontSize: 13, color: '#34495E', marginBottom: 5, fontWeight: 'bold' },
  input: { backgroundColor: '#F9FAFC', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 15 },
  uploadBtn: { backgroundColor: '#EAEDED', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#BDC3C7', borderStyle: 'dashed' },
  uploadBtnText: { color: '#2C3E50', fontWeight: 'bold' },
  
  // CORRECTION : resizeMode = contain pour la preview dans le modal
  previewImage: { width: '100%', height: 300, borderRadius: 10, resizeMode: 'contain', marginBottom: 15, backgroundColor: '#F8FAFC' },
  
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  button: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#95A5A6' },
  confirmButton: { backgroundColor: '#27AE60' },
  buttonTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 15 }
});