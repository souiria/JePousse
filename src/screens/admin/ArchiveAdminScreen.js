import * as FileSystem from 'expo-file-system';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function ArchiveAdminScreen() {
  const buckets = ['documents_creche', 'menus_cantine', 'mur_medias', 'recus_paiements', 'photos_enfants'];
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [currentBucket, setCurrentBucket] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]); // Pour stocker les noms sélectionnés

  const listFiles = async (bucket) => {
    setLoading(true);
    setCurrentBucket(bucket);
    setSelectedFiles([]); // Reset sélection
    const { data, error } = await supabase.storage.from(bucket).list();
    if (error) Alert.alert("Erreur", error.message);
    else setFiles(data || []);
    setLoading(false);
  };

  const toggleSelect = (fileName) => {
    if (selectedFiles.includes(fileName)) {
      setSelectedFiles(selectedFiles.filter(f => f !== fileName));
    } else {
      setSelectedFiles([...selectedFiles, fileName]);
    }
  };

  const selectAll = () => setSelectedFiles(files.map(f => f.name));
  const unselectAll = () => setSelectedFiles([]);

  const processBatchArchive = async () => {
    if (selectedFiles.length === 0) return;

    Alert.alert("Archivage", `Archiver et supprimer ${selectedFiles.length} fichier(s) du cloud ?`, [
      { text: "Annuler" },
      { text: "Confirmer", onPress: async () => {
        setLoading(true);
        try {
          for (const fileName of selectedFiles) {
            // 1. Download
            const { data } = await supabase.storage.from(currentBucket).createSignedUrl(fileName, 60);
            const localUri = FileSystem.documentDirectory + fileName;
            await FileSystem.downloadAsync(data.signedUrl, localUri);
            
            // 2. Delete from Supabase
            await supabase.storage.from(currentBucket).remove([fileName]);
          }
          Alert.alert("Succès", "Fichiers téléchargés en local et supprimés du Cloud.");
          setSelectedFiles([]);
          listFiles(currentBucket);
        } catch (e) { Alert.alert("Erreur", e.message); }
        setLoading(false);
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Gestion de l'Archive</Text>
      
      {!currentBucket ? (
        <FlatList data={buckets} renderItem={({item}) => (
          <TouchableOpacity style={styles.bucketItem} onPress={() => listFiles(item)}>
            <Text>📁 {item}</Text>
          </TouchableOpacity>
        )} />
      ) : (
        <View style={{flex: 1}}>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={() => setCurrentBucket(null)}><Text style={{color: '#4F46E5'}}>← Retour</Text></TouchableOpacity>
            <TouchableOpacity onPress={selectAll}><Text style={styles.toolText}>Tout</Text></TouchableOpacity>
            <TouchableOpacity onPress={unselectAll}><Text style={styles.toolText}>Aucun</Text></TouchableOpacity>
            <TouchableOpacity onPress={processBatchArchive} style={[styles.toolBtn, {backgroundColor: '#EF4444'}]}>
              <Text style={{color: '#FFF'}}>⬇️ Archiver ({selectedFiles.length})</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator size="large" /> : (
            <FlatList data={files} renderItem={({item}) => {
              const isSelected = selectedFiles.includes(item.name);
              return (
                <TouchableOpacity style={[styles.fileRow, isSelected && styles.selectedRow]} onPress={() => toggleSelect(item.name)}>
                  <Text style={{fontSize: 18}}>{isSelected ? '✅' : '⬜'}</Text>
                  <Text style={{flex:1, marginLeft: 10}} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              );
            }} />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8FAFC' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  bucketItem: { padding: 20, backgroundColor: '#FFF', marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#FFF', marginBottom: 5, borderRadius: 8 },
  selectedRow: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5', borderWidth: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingHorizontal: 5 },
  toolText: { fontWeight: 'bold', color: '#374151' },
  toolBtn: { padding: 10, borderRadius: 8 },
  backBtn: { marginBottom: 15 }
});