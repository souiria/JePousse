import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function MessagerieScreen() {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingBroadcast, setLoadingBroadcast] = useState(false);

  // Vue Admin : Liste des contacts
  const [contacts, setContacts] = useState([]);
  const [isBroadcastModalVisible, setIsBroadcastModalVisible] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  
  // Vue Chat (Commun)
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const flatListRef = useRef();

  useEffect(() => {
    initialiserMessagerie();
  }, []);

  const marquerMessagesCommeLus = async (userId) => {
    try {
      await supabase
        .from('utilisateurs')
        .update({ derniere_lecture_messagerie: new Date().toISOString() })
        .eq('id', userId);
    } catch (error) {
      console.log("Erreur silencieuse (marquer lu):", error);
    }
  };

  const initialiserMessagerie = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profil } = await supabase.from('utilisateurs').select('*').eq('id', user.id).maybeSingle();
      if (!profil) return;
      
      setCurrentUser(profil);
      setRole(profil.role);

      if (profil.role === 'admin') {
        const { data: parents } = await supabase.from('utilisateurs').select('*').eq('role', 'parent').order('prenom');
        
        const derniereLecture = profil.derniere_lecture_messagerie || '2000-01-01T00:00:00.000Z';
        const { data: unreadMsgs } = await supabase
          .from('messages')
          .select('expediteur_id')
          .eq('destinataire_id', profil.id)
          .gt('date_creation', derniereLecture);

        const unreadSenderIds = new Set(unreadMsgs?.map(m => m.expediteur_id) || []);

        const contactsWithUnread = (parents || []).map(p => ({
          ...p,
          hasUnread: unreadSenderIds.has(p.id)
        }));

        contactsWithUnread.sort((a, b) => (b.hasUnread === a.hasUnread ? 0 : b.hasUnread ? 1 : -1));

        setContacts(contactsWithUnread);
        marquerMessagesCommeLus(user.id);

      } else {
        const { data: adminData } = await supabase.from('utilisateurs').select('*').eq('role', 'admin').limit(1).maybeSingle();
        if (adminData) setActiveChatUser(adminData);
        marquerMessagesCommeLus(user.id);
      }
    } catch (error) {
      console.log("Erreur de chargement messagerie :", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Fonction de diffusion à tous les parents ---
  const envoyerMessageGlobal = async () => {
    if (!broadcastText.trim()) return;
    setLoadingBroadcast(true);

    try {
      const messagesDB = [];
      const messagesPush = [];
      const maintenant = new Date().toISOString();

      contacts.forEach(parent => {
        messagesDB.push({
          expediteur_id: currentUser.id,
          destinataire_id: parent.id,
          texte: broadcastText,
          date_creation: maintenant
        });

        if (parent.expo_push_token) {
          messagesPush.push({
            to: parent.expo_push_token,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            title: 'Message de la Direction 📢',
            body: broadcastText,
            data: { screen: 'Messagerie' }
          });
        }
      });

      // 1. Insertion en base de données
      await supabase.from('messages').insert(messagesDB);

      // 2. Envoi Push en masse (Solution ultime sans proxy externe)
      if (messagesPush.length > 0) {
        const apiUrli = (Platform.OS === 'web' && !__DEV__) 
          ? '/api/expo-push/' 
          : 'https://exp.host/--/api/v2/push/send';

        await fetch(apiUrli, {
          method: 'POST',
          headers: { 
            'Accept': 'application/json', 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(messagesPush),
        });
      }

      Alert.alert("Succès", "Message envoyé à tous les parents !");
      setIsBroadcastModalVisible(false);
      setBroadcastText('');
    } catch (err) {
      Alert.alert("Erreur", "Une erreur est survenue lors de la diffusion.");
      console.log(err);
    } finally {
      setLoadingBroadcast(false);
    }
  };

  useEffect(() => {
    if (!currentUser || !activeChatUser) return;

    const chargerMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(expediteur_id.eq.${currentUser.id},destinataire_id.eq.${activeChatUser.id}),and(expediteur_id.eq.${activeChatUser.id},destinataire_id.eq.${currentUser.id})`)
        .order('date_creation', { ascending: true });
      
      if (data) setMessages(data);
    };

    chargerMessages();

    const channelName = `chat_${currentUser.id}_${activeChatUser.id}`;
    const messageListener = supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        if (
          (msg.expediteur_id === currentUser.id && msg.destinataire_id === activeChatUser.id) ||
          (msg.expediteur_id === activeChatUser.id && msg.destinataire_id === currentUser.id)
        ) {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(messageListener); };
  }, [currentUser, activeChatUser]);

  const envoyerMessage = async () => {
    if (!newMessage.trim() || !currentUser || !activeChatUser) return;
    const texte = newMessage.trim();
    setNewMessage(''); 
    
    const msgAEnvoyer = { expediteur_id: currentUser.id, destinataire_id: activeChatUser.id, texte: texte };
    const msgLocal = { ...msgAEnvoyer, id: Date.now().toString(), date_creation: new Date().toISOString() };
    setMessages(prev => [...prev, msgLocal]);

    await supabase.from('messages').insert([msgAEnvoyer]);

    if (activeChatUser.expo_push_token) {
      const nomExpediteur = role === 'admin' ? 'La Direction (Crèche)' : `${currentUser.prenom} ${currentUser.nom}`;
      try {
        const apiUrli = (Platform.OS === 'web' && !__DEV__) 
          ? '/api/expo-push/' 
          : 'https://exp.host/--/api/v2/push/send';

        await fetch(apiUrli, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: activeChatUser.expo_push_token,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            title: `Nouveau message de ${nomExpediteur}`,
            body: texte,
            data: { screen: 'Messagerie' },
          }),
        });
      } catch (err) { console.log("Erreur push :", err); }
    }
  };

  const ouvrirConversation = (contact) => {
    setContacts(prev => prev.map(c => c.id === contact.id ? {...c, hasUnread: false} : c));
    setActiveChatUser(contact);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3498DB" /></View>;

  if (role === 'admin' && !activeChatUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages Privés</Text>
          <Text style={styles.headerSubtitle}>Sélectionnez un parent pour discuter</Text>
          
          <TouchableOpacity style={styles.broadcastBtn} onPress={() => setIsBroadcastModalVisible(true)}>
             <Text style={styles.broadcastBtnText}>📢 Diffuser à tous les parents</Text>
          </TouchableOpacity>
        </View>

        <FlatList 
          data={contacts}
          keyExtractor={item => item.id}
          contentContainerStyle={{padding: 15}}
          renderItem={({item}) => (
            <TouchableOpacity 
              style={[styles.contactCard, item.hasUnread && styles.contactCardUnread]} 
              onPress={() => ouvrirConversation(item)}
            >
              <View style={styles.avatarContact}>
                <Text style={{fontSize: 20}}>👨‍👩‍👧</Text>
                {item.hasUnread && <View style={styles.redDot} />}
              </View>
              <View style={{flex: 1}}>
                <Text style={[styles.contactName, item.hasUnread && {color: '#E74C3C', fontWeight: '900'}]}>
                  {item.prenom} {item.nom}
                </Text>
                {item.hasUnread ? <Text style={{color: '#E74C3C', fontSize: 13, fontWeight: 'bold'}}>Nouveau message !</Text> : <Text style={styles.contactPhone}>{item.telephone || 'Pas de téléphone'}</Text>}
              </View>
              <Text style={{fontSize: 20}}>💬</Text>
            </TouchableOpacity>
          )}
        />

        {/* MODAL DIFFUSION */}
        <Modal visible={isBroadcastModalVisible} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <Text style={styles.modalTitle}>Diffuser à tous</Text>
               <TextInput style={styles.input} value={broadcastText} onChangeText={setBroadcastText} placeholder="Votre message..." multiline />
               <View style={styles.modalButtons}>
                 <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsBroadcastModalVisible(false)}><Text style={styles.buttonTextWhite}>Annuler</Text></TouchableOpacity>
                 <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={envoyerMessageGlobal} disabled={loadingBroadcast}>{loadingBroadcast ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextWhite}>Envoyer à tous</Text>}</TouchableOpacity>
               </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatHeader}>
        {role === 'admin' && (
          <TouchableOpacity onPress={() => setActiveChatUser(null)} style={{paddingRight: 15}}><Text style={{fontSize: 20, color: '#FFF'}}>⬅️</Text></TouchableOpacity>
        )}
        <View>
          <Text style={styles.chatTitle}>{role === 'admin' ? `${activeChatUser?.prenom} ${activeChatUser?.nom}` : 'La Direction'}</Text>
          <Text style={styles.chatSubtitle}>Conversation privée</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.expediteur_id === currentUser?.id;
            return (
              <View style={[styles.bubbleWrapper, isMe ? styles.bubbleWrapperMe : styles.bubbleWrapperOther]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>{item.texte}</Text>
                  <Text style={[styles.bubbleDate, isMe ? styles.bubbleDateMe : styles.bubbleDateOther]}>
                    {new Date(item.date_creation).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Écrivez votre message..." value={newMessage} onChangeText={setNewMessage} multiline />
          <TouchableOpacity style={styles.sendBtn} onPress={envoyerMessage}><Text style={styles.sendBtnText}>Envoyer</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#2C3E50', padding: 20, paddingTop: 30, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF' },
  headerSubtitle: { color: '#BDC3C7', fontSize: 14, marginTop: 5 },
  broadcastBtn: { backgroundColor: '#E74C3C', padding: 12, borderRadius: 10, marginTop: 15, alignItems: 'center' },
  broadcastBtnText: { color: '#FFF', fontWeight: 'bold' },
  contactCard: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', elevation: 2 },
  contactCardUnread: { borderColor: '#E74C3C', borderWidth: 2, backgroundColor: '#FDEDEC' },
  avatarContact: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#EAEDED', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  contactName: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  contactPhone: { fontSize: 13, color: '#7F8C8D', marginTop: 2 },
  redDot: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E74C3C', width: 14, height: 14, borderRadius: 7 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3498DB', padding: 15, paddingTop: 20 },
  chatTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  chatSubtitle: { fontSize: 12, color: '#EAF2F8' },
  chatContainer: { padding: 15, paddingBottom: 20 },
  bubbleWrapper: { marginBottom: 15, flexDirection: 'row' },
  bubbleWrapperMe: { justifyContent: 'flex-end' },
  bubbleWrapperOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 15 },
  bubbleMe: { backgroundColor: '#27AE60', borderBottomRightRadius: 0 }, 
  bubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 0, elevation: 1 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMe: { color: '#FFF' },
  bubbleTextOther: { color: '#2C3E50' },
  bubbleDate: { fontSize: 10, marginTop: 5, alignSelf: 'flex-end', color: '#95A5A6' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#FFF', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#F9FAFC', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: '#EAEDED' },
  sendBtn: { backgroundColor: '#3498DB', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 15, marginLeft: 10, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  button: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  cancelButton: { backgroundColor: '#95A5A6', marginRight: 10 },
  confirmButton: { backgroundColor: '#E74C3C' },
  buttonTextWhite: { color: '#FFF', fontWeight: 'bold' }
});