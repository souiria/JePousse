import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function GestionUtilisateursScreen() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [ongletActif, setOngletActif] = useState('parents');

  // ÉTATS POUR L'ÉDITION D'UN UTILISATEUR EXISTANT
  const [modalVisible, setModalVisible] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [editNom, setEditNom] = useState('');
  const [editPrenom, setEditPrenom] = useState('');
  const [editRole, setEditRole] = useState('parent');
  const [editTelephone, setEditTelephone] = useState('');
  const [editPin, setEditPin] = useState('');

  // ÉTATS POUR L'AJOUT D'UN NOUVEL EMPLOYÉ
  const [modalAddVisible, setModalAddVisible] = useState(false);
  const [addNom, setAddNom] = useState('');
  const [addPrenom, setAddPrenom] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addTelephone, setAddTelephone] = useState('');
  const [addRole, setAddRole] = useState('personnel');
  const [addPin, setAddPin] = useState('');

  useEffect(() => {
    fetchUtilisateurs();
  }, []);

  const fetchUtilisateurs = async () => {
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('*')
      .order('date_creation', { ascending: false });
    
    if (!error && data) setUtilisateurs(data);
  };

  const genererPin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const ouvrirModalAjout = () => {
    setAddNom('');
    setAddPrenom('');
    setAddEmail('');
    setAddTelephone('');
    setAddRole('personnel');
    setAddPin(genererPin());
    setModalAddVisible(true);
  };

  const creerPersonnel = async () => {
    if (!addEmail || !addNom || !addPrenom) {
      Alert.alert("Erreur", "L'email, le nom et le prénom sont obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const tempPassword = "Staff@" + Math.floor(1000 + Math.random() * 9000);
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: addEmail.trim(),
        password: tempPassword,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          throw new Error("Cette adresse email est déjà utilisée.");
        }
        throw authError;
      }

      if (authData.user) {
        const { error: dbError } = await supabase.from('utilisateurs').upsert({
          id: authData.user.id,
          email: addEmail.trim(),
          nom: addNom.trim(),
          prenom: addPrenom.trim(),
          telephone: addTelephone.trim(),
          role: addRole,
          pin_pointage: addPin
        });

        if (dbError) throw dbError;

        Alert.alert(
          "Employé ajouté avec succès ✅", 
          `Un compte a été créé pour ${addPrenom}.\n\n🔑 Code PIN Pointage : ${addPin}\n🔒 Mot de passe temporaire (App) : ${tempPassword}`
        );
        
        setModalAddVisible(false);
        fetchUtilisateurs();
      }
    } catch (error) {
      Alert.alert("Erreur", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ouvrirModalEdition = (user) => {
    setEditUserId(user.id);
    setEditNom(user.nom || '');
    setEditPrenom(user.prenom || '');
    setEditRole(user.role || 'parent');
    setEditTelephone(user.telephone || '');
    setEditPin(user.pin_pointage || '1234');
    setModalVisible(true);
  };

  const sauvegarderUtilisateur = async () => {
    if ((editRole === 'admin' || editRole === 'personnel') && editPin.length < 4) {
      alert("Le code PIN de pointage doit faire exactement 4 chiffres.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('utilisateurs')
        .update({ 
          nom: editNom, 
          prenom: editPrenom, 
          role: editRole, 
          telephone: editTelephone,
          pin_pointage: editRole === 'parent' || editRole === 'suspendu' ? null : editPin
        })
        .eq('id', editUserId);

      if (error) {
        console.error("Erreur de modification :", error);
        throw new Error(error.message);
      }
      
      setModalVisible(false);
      fetchUtilisateurs();
    } catch (error) {
      Alert.alert("Erreur de base de données", error.message);
    } finally {
      setLoading(false);
    }
  };

  const approuverCompte = (id, prenom) => {
    if (Platform.OS === 'web') {
      const choix = window.confirm(`Cliquer sur OK pour approuver ${prenom} en tant que PARENT.\nAnnuler pour le mettre PERSONNEL.`);
      executerApprobation(id, choix ? 'parent' : 'personnel');
    } else {
      Alert.alert(
        "Approuver le compte",
        `En quel rôle voulez-vous accepter ${prenom} ?`,
        [
          { text: "👨‍👩‍👧 Parent", onPress: () => executerApprobation(id, 'parent') },
          { text: "👩‍🏫 Personnel", onPress: () => executerApprobation(id, 'personnel') },
          { text: "Annuler", style: "cancel" }
        ]
      );
    }
  };

  const executerApprobation = async (id, roleChoisi) => {
    setLoading(true);
    try {
      const updateData = { role: roleChoisi };
      if (roleChoisi === 'personnel') updateData.pin_pointage = genererPin();

      const { error } = await supabase.from('utilisateurs').update(updateData).eq('id', id);
      if (error) throw error;
      
      Alert.alert("Succès", `Le compte a été validé en tant que ${roleChoisi.toUpperCase()}.`);
      fetchUtilisateurs();
    } catch (error) {
      Alert.alert("Erreur d'approbation", error.message);
    } finally {
      setLoading(false);
    }
  };

  const rejeterCompte = async (id) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Êtes-vous sûr de vouloir supprimer définitivement cette demande d'inscription ?")) {
        executerRejet(id);
      }
    } else {
      Alert.alert("Rejeter le compte", "Voulez-vous supprimer définitivement ce compte ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => executerRejet(id) }
      ]);
    }
  };

  const executerRejet = async (id) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('utilisateurs').delete().eq('id', id);
      if (error) throw error;
      fetchUtilisateurs();
    } catch (error) {
      Alert.alert("Erreur", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------
  // 3. SUSPENSION ET SUPPRESSION DÉFINITIVE (PARENTS)
  // --------------------------------------------------------
  const confirmerSuspension = (id, willSuspend, prenom) => {
    const action = willSuspend ? "suspendre" : "rétablir";
    if (Platform.OS === 'web') {
      if (window.confirm(`Voulez-vous ${action} l'accès de ${prenom} à l'application ?`)) executerSuspension(id, willSuspend);
    } else {
      Alert.alert(
        `${willSuspend ? "Suspendre" : "Rétablir"} le compte`, 
        `Voulez-vous ${action} l'accès de ${prenom} à l'application ?`, 
        [
          { text: "Annuler", style: "cancel" },
          { text: "Oui", style: willSuspend ? "destructive" : "default", onPress: () => executerSuspension(id, willSuspend) }
        ]
      );
    }
  };

  const executerSuspension = async (id, willSuspend) => {
    setLoading(true);
    try {
      const newRole = willSuspend ? 'suspendu' : 'parent';
      const { error, data } = await supabase.from('utilisateurs').update({ role: newRole }).eq('id', id).select();
      
      if (error) {
        console.error("Erreur de suspension :", error);
        throw new Error(error.message);
      }
      
      Alert.alert("Succès", `Le compte a été ${willSuspend ? "suspendu 🚫" : "rétabli ✅"}`);
      fetchUtilisateurs();
    } catch (error) {
      Alert.alert("Erreur de Base de Données", "La mise à jour a été refusée par la base de données. Détail : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmerSuppressionParent = (user) => {
    const msg = `⚠️ ATTENTION : La suppression de ${user.prenom} supprimera DÉFINITIVEMENT :\n- Son compte\n- Sa famille associée\n- Le dossier de ses enfants\n- Les factures liées.\n\nÊtes-vous sûr ?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) executerSuppressionParent(user);
    } else {
      Alert.alert("Suppression DÉFINITIVE", msg, [
        { text: "Annuler", style: "cancel" },
        { text: "Oui, tout supprimer", style: "destructive", onPress: () => executerSuppressionParent(user) }
      ]);
    }
  };

  const executerSuppressionParent = async (user) => {
    setLoading(true);
    try {
      await supabase.from('paiements').delete().eq('parent_id', user.id);

      if (user.code_parent) {
        const { data: kids } = await supabase.from('enfants').select('id').eq('code_parent', user.code_parent);
        if (kids && kids.length > 0) {
          const kidIds = kids.map(k => k.id);
          await supabase.from('paiements').delete().in('enfant_id', kidIds);
        }
        await supabase.from('enfants').delete().eq('code_parent', user.code_parent);
        await supabase.from('familles').delete().eq('code_parent', user.code_parent);
      }

      const { error } = await supabase.from('utilisateurs').delete().eq('id', user.id);
      if (error) throw error;

      Alert.alert("Succès", "Le compte parent, sa famille et ses factures ont été supprimés.");
      fetchUtilisateurs();
    } catch (error) {
      Alert.alert("Erreur", "Impossible de supprimer la famille.\nDétail: " + error.message);
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------
  // 4. FILTRAGE ET AFFICHAGE
  // --------------------------------------------------------
  const utilisateursFiltres = utilisateurs.filter(user => {
    let matchOnglet = false;
    if (ongletActif === 'parents') matchOnglet = user.role === 'parent' || user.role === 'suspendu';
    if (ongletActif === 'personnel') matchOnglet = user.role === 'admin' || user.role === 'personnel';
    if (ongletActif === 'attente') matchOnglet = user.role === 'en_attente';
    
    const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
    const matchSearch = fullName.includes(searchQuery.toLowerCase());
    
    return matchOnglet && matchSearch;
  });

  const nombreEnAttente = utilisateurs.filter(u => u.role === 'en_attente').length;

  const renderHeader = () => {
    if (ongletActif === 'personnel') {
      return (
        <TouchableOpacity style={styles.addPersonnelBtn} onPress={ouvrirModalAjout}>
          <Text style={styles.addPersonnelBtnIcon}>➕</Text>
          <Text style={styles.addPersonnelBtnText}>Ajouter un membre du personnel</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderUtilisateur = ({ item }) => {
    const isStaff = item.role === 'admin' || item.role === 'personnel';
    const isAttente = item.role === 'en_attente';
    const isParent = item.role === 'parent' || item.role === 'suspendu';
    const isSuspended = item.role === 'suspendu';

    return (
      <View style={[styles.card, isStaff && styles.cardAdmin, isAttente && styles.cardAttente, isSuspended && styles.cardSuspended]}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, isStaff ? {backgroundColor: '#E91E63'} : isAttente ? {backgroundColor: '#F59E0B'} : isSuspended ? {backgroundColor: '#94A3B8'} : {backgroundColor: '#3B82F6'}]}>
            <Text style={styles.avatarText}>{item.prenom ? item.prenom.charAt(0).toUpperCase() : '👤'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, isSuspended && {color: '#94A3B8', textDecorationLine: 'line-through'}]}>{item.prenom} {item.nom}</Text>
            <Text style={[styles.userRole, isStaff ? {color: '#E91E63'} : isAttente ? {color: '#D97706'} : isSuspended ? {color: '#EF4444'} : {color: '#2563EB'}]}>
              {item.role === 'admin' ? '👑 Administrateur' : item.role === 'personnel' ? '👩‍🏫 Personnel' : isAttente ? '⏳ EN ATTENTE' : isSuspended ? '🚫 PARENT SUSPENDU' : '👥 Parent'}
            </Text>
          </View>
        </View>

        <View style={styles.contactInfo}>
          <Text style={styles.contactText}>📞 {item.telephone || 'Non renseigné'}</Text>
          <Text style={styles.contactText}>✉️ {item.email || 'Email non renseigné'}</Text>
          <Text style={styles.contactText}>🔑 Famille : {item.code_parent || 'Non lié'}</Text>
          {isStaff && (
            <Text style={styles.contactTextPin}>🔑 PIN Pointage : {item.pin_pointage || 'Non défini'}</Text>
          )}
        </View>

        {isAttente && (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => approuverCompte(item.id, item.prenom)}>
              <Text style={styles.btnTextWhite}>✅ Approuver</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.rejectBtn} onPress={() => rejeterCompte(item.id)}>
              <Text style={styles.btnTextWhite}>❌ Rejeter</Text>
            </TouchableOpacity>
          </View>
        )}

        {isStaff && (
          <TouchableOpacity style={styles.editBtn} onPress={() => ouvrirModalEdition(item)}>
            <Text style={styles.editBtnText}>✏️ Modifier le profil & PIN</Text>
          </TouchableOpacity>
        )}

        {isParent && (
          <View style={styles.parentActionsRow}>
            <TouchableOpacity style={styles.editBtnSmall} onPress={() => ouvrirModalEdition(item)}>
              <Text style={styles.editBtnTextSmall}>✏️ Éditer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.suspendBtn, isSuspended && styles.restoreBtn]} 
              onPress={() => confirmerSuspension(item.id, !isSuspended, item.prenom)}
            >
              <Text style={styles.btnTextWhite}>{isSuspended ? '✅ Rétablir' : '🚫 Suspendre'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.deleteParentBtn} onPress={() => confirmerSuppressionParent(item)}>
              <Text style={styles.btnTextWhite}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Annuaire & Accès</Text>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, ongletActif === 'parents' && styles.tabActive]} onPress={() => setOngletActif('parents')}>
          <Text style={[styles.tabText, ongletActif === 'parents' && styles.tabTextActive]}>Parents</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tab, ongletActif === 'personnel' && styles.tabActive]} onPress={() => setOngletActif('personnel')}>
          <Text style={[styles.tabText, ongletActif === 'personnel' && styles.tabTextActive]}>Personnel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tab, ongletActif === 'attente' && styles.tabActive]} onPress={() => setOngletActif('attente')}>
          <Text style={[styles.tabText, ongletActif === 'attente' && styles.tabTextActive]}>En Attente</Text>
          {nombreEnAttente > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{nombreEnAttente}</Text></View>}
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Chercher un nom..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      {loading && !modalVisible ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{marginTop: 50}} />
      ) : (
        <FlatList 
          data={utilisateursFiltres} 
          keyExtractor={(item) => item.id} 
          ListHeaderComponent={renderHeader}
          renderItem={renderUtilisateur} 
          contentContainerStyle={styles.listContainer} 
          ListEmptyComponent={<Text style={styles.emptyText}>Aucun compte trouvé dans cette catégorie.</Text>}
        />
      )}

      {/* MODAL 1 : ÉDITION D'UN COMPTE EXISTANT */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifier l'utilisateur</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Prénom</Text>
              <TextInput style={styles.input} value={editPrenom} onChangeText={setEditPrenom} />
              
              <Text style={styles.label}>Nom</Text>
              <TextInput style={styles.input} value={editNom} onChangeText={setEditNom} />
              
              <Text style={styles.label}>Téléphone</Text>
              <TextInput style={styles.input} value={editTelephone} onChangeText={setEditTelephone} keyboardType="phone-pad" />
              
              <Text style={styles.label}>Rôle d'accès</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={editRole} onValueChange={(val) => setEditRole(val)}>
                  <Picker.Item label="Parent (Espace Famille)" value="parent" />
                  <Picker.Item label="Parent (Suspendu temporairement)" value="suspendu" />
                  <Picker.Item label="Personnel (Staff & Pointage)" value="personnel" />
                  <Picker.Item label="Administrateur (Direction totale)" value="admin" />
                </Picker>
              </View>

              {(editRole === 'admin' || editRole === 'personnel') && (
                <>
                  <Text style={[styles.label, {marginTop: 20}]}>Code PIN de pointage (4 chiffres)</Text>
                  <TextInput 
                    style={[styles.input, styles.pinInput]} 
                    value={editPin} 
                    onChangeText={setEditPin} 
                    keyboardType="numeric" 
                    maxLength={4}
                    placeholder="Ex: 1234"
                  />
                  <Text style={styles.pinHint}>Ce code permettra à l'employé de badger sur la borne de pointage.</Text>
                </>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnTextWhite}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={sauvegarderUtilisateur} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2 : AJOUT D'UN NOUVEL EMPLOYÉ */}
      <Modal visible={modalAddVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouveau membre du personnel</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Prénom *</Text>
              <TextInput style={styles.input} value={addPrenom} onChangeText={setAddPrenom} placeholder="" />
              
              <Text style={styles.label}>Nom *</Text>
              <TextInput style={styles.input} value={addNom} onChangeText={setAddNom} placeholder="" />
              
              <Text style={styles.label}>Email professionnel *</Text>
              <TextInput style={styles.input} value={addEmail} onChangeText={setAddEmail} keyboardType="email-address" autoCapitalize="none" placeholder="" />
              
              <Text style={styles.label}>Téléphone</Text>
              <TextInput style={styles.input} value={addTelephone} onChangeText={setAddTelephone} keyboardType="phone-pad" />
              
              <Text style={styles.label}>Niveau d'accès</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={addRole} onValueChange={(val) => setAddRole(val)}>
                  <Picker.Item label="Personnel (Staff & Pointage)" value="personnel" />
                  <Picker.Item label="Administrateur (Direction totale)" value="admin" />
                </Picker>
              </View>

              <Text style={[styles.label, {marginTop: 20}]}>Code PIN auto-généré</Text>
              <View style={styles.pinGenerateContainer}>
                <TextInput 
                  style={[styles.input, styles.pinInput, {flex: 1}]} 
                  value={addPin} 
                  onChangeText={setAddPin} 
                  keyboardType="numeric" 
                  maxLength={4}
                />
                <TouchableOpacity style={styles.regenerateBtn} onPress={() => setAddPin(genererPin())}>
                  <Text style={styles.regenerateBtnIcon}>🔄</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.pinHint}>Vous pourrez communiquer ce PIN et l'email à l'employé pour la badgeuse.</Text>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setModalAddVisible(false)}>
                <Text style={styles.btnTextWhite}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.confirmAddButton]} onPress={creerPersonnel} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Créer le profil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, backgroundColor: '#FFF', paddingBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  
  tabsContainer: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#4F46E5' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#4F46E5', fontWeight: '800' },
  badge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 15, marginBottom: 15, paddingHorizontal: 15, borderRadius: 12, elevation: 1, height: 50, borderWidth: 1, borderColor: '#E2E8F0' },
  searchIcon: { fontSize: 18, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#334155' },

  listContainer: { paddingHorizontal: 15, paddingBottom: 20 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 30, fontStyle: 'italic', fontWeight: '500' },
  
  addPersonnelBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E91E63', padding: 16, borderRadius: 16, marginBottom: 20, justifyContent: 'center', elevation: 3, shadowColor: '#E91E63', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8 },
  addPersonnelBtnIcon: { fontSize: 18, color: '#FFF', marginRight: 8 },
  addPersonnelBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },

  card: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#3B82F6' },
  cardAdmin: { borderLeftColor: '#E91E63', backgroundColor: '#FDF2F8' },
  cardAttente: { borderLeftColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  cardSuspended: { borderLeftColor: '#94A3B8', backgroundColor: '#F8FAFC', opacity: 0.8 },
  
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  userRole: { fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  
  contactInfo: { backgroundColor: '#F1F5F9', padding: 12, borderRadius: 10, marginBottom: 15 },
  contactText: { fontSize: 13, color: '#475569', marginBottom: 4, fontWeight: '500' },
  contactTextPin: { fontSize: 13, color: '#E91E63', fontWeight: '800', marginTop: 6 },

  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  approveBtn: { flex: 1, backgroundColor: '#10B981', padding: 12, borderRadius: 10, alignItems: 'center', marginRight: 5 },
  rejectBtn: { flex: 1, backgroundColor: '#EF4444', padding: 12, borderRadius: 10, alignItems: 'center', marginLeft: 5 },
  btnTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  editBtn: { backgroundColor: '#F1F5F9', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  editBtnText: { color: '#4F46E5', fontWeight: '700', fontSize: 13 },

  parentActionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  editBtnSmall: { flex: 1, backgroundColor: '#F1F5F9', padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  editBtnTextSmall: { color: '#4F46E5', fontWeight: '700', fontSize: 13 },
  suspendBtn: { flex: 1, backgroundColor: '#F59E0B', padding: 10, borderRadius: 8, alignItems: 'center' },
  restoreBtn: { backgroundColor: '#10B981' },
  deleteParentBtn: { backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8, alignItems: 'center', width: 45, borderWidth: 1, borderColor: '#FECACA' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 15, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A', fontSize: 15 },
  
  pinGenerateContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinInput: { letterSpacing: 8, fontSize: 22, fontWeight: '900', textAlign: 'center', color: '#E91E63', backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  regenerateBtn: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  regenerateBtnIcon: { fontSize: 20 },
  pinHint: { fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  
  pickerContainer: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  button: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#94A3B8' },
  confirmButton: { backgroundColor: '#4F46E5' },
  confirmAddButton: { backgroundColor: '#E91E63' }
});