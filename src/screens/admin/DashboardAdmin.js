import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants'; // 🚀 REQUIRED FOR DYNAMIC CONFIG
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// 🚀 Mapping des logos dynamiques
const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

// 🎨 CONFIGURATION DES THÈMES DYNAMIQUES SELON LA CRÈCHE
const themes = {
  jeupousse: {
    primary: '#E91E63',     // Magenta
    background: '#F8FAFC',  // Light Grey
  },
  demo: {
    primary: '#2196F3',     // Blue
    background: '#E3F2FD',  // Light Blue
  }
};

export default function DashboardAdmin({ navigation }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [attestationsCount, setAttestationsCount] = useState(0);
  const [paiementsCount, setPaiementsCount] = useState(0); 
  const [anneeActive, setAnneeActive] = useState('Chargement...');
  const [nomCreche, setNomCreche] = useState(Constants.expoConfig?.name || 'Ma Crèche');

  // 🚀 ÉTATS POUR LES ANNIVERSAIRES
  const [birthdayCount, setBirthdayCount] = useState(0);
  const [birthdayKids, setBirthdayKids] = useState([]);
  const [modalBirthdayVisible, setModalBirthdayVisible] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  // 🚀 ÉTATS : ABSENCES ET RECHERCHE AVANCÉE
  const [absencesCount, setAbsencesCount] = useState(0);
  const [listeAbsences, setListeAbsences] = useState([]);
  const [modalAbsencesVisible, setModalAbsencesVisible] = useState(false);
  const [searchAbsence, setSearchAbsence] = useState('');
  const [filterClasseAbsence, setFilterClasseAbsence] = useState('Toutes');

  // 🚀 ÉTATS : CODES SOS, FILTRES ET HISTORIQUE TRAÇABILITÉ
  const [modalSOSVisible, setModalSOSVisible] = useState(false);
  const [inputCodeSOS, setInputCodeSOS] = useState('');
  const [sosResult, setSosResult] = useState(null);
  const [loadingSOS, setLoadingSOS] = useState(false);
  const [showSOSHistory, setShowSOSHistory] = useState(false);
  const [listeSOSHistory, setListeSOSHistory] = useState([]);
  const [searchSOS, setSearchSOS] = useState('');
  const [filterClasseSOS, setFilterClasseSOS] = useState('Toutes');

  // 🚀 Configuration Dynamique du thème et logo
  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;
  const currentTheme = themes[crecheId] || themes.jeupousse;

  const classesList = ['Toutes', 'Crèche', 'TPS', 'PS', 'MS', 'GS'];

  // 🚀 CENTRALISATION DU RAFRAÎCHISSEMENT GLOBAL
  const rafraichirDonnees = () => {
    calculerMessagesNonLus();
    calculerAttestationsEnAttente();
    calculerPaiementsAVerifier();
    calculerAnniversairesProchains();
    calculerAbsencesDuMois();
    chargerHistoriqueSOS();
    fetchParametres();
  };

  useFocusEffect(
    React.useCallback(() => {
      rafraichirDonnees();
    }, [])
  );

  useEffect(() => {
    const channelId = 'admin_global_channel_' + Date.now();
    const realtimeChannel = supabase.channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        calculerMessagesNonLus();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_attestation' }, () => {
        calculerAttestationsEnAttente();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paiements' }, () => {
        calculerPaiementsAVerifier();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enfants' }, () => {
        calculerAnniversairesProchains();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_presences' }, () => {
        calculerAbsencesDuMois();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recuperations_sos' }, () => {
        chargerHistoriqueSOS();
      })
      .subscribe((status) => {
        console.log("🔌 Statut connexion Realtime Admin :", status);
      });

    return () => { if (realtimeChannel) supabase.removeChannel(realtimeChannel); };
  }, []);

  const handleLogout = async () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Oui", style: "destructive", onPress: async () => { await supabase.auth.signOut(); navigation.replace('Login'); } }
    ]);
  };

  const fetchParametres = async () => {
    try {
      const { data } = await supabase.from('parametres').select('cle, valeur').in('cle', ['annee_active', 'nom_creche']);
      if (data) {
        data.forEach(p => {
          if (p.cle === 'annee_active') setAnneeActive(p.valeur);
          if (p.cle === 'nom_creche') setNomCreche(p.valeur);
        });
      }
    } catch (e) { setAnneeActive('2025-2026'); }
  };

  const calculerAbsencesDuMois = async () => {
    try {
      const { data, error } = await supabase.from('planning_presences').select('*, enfants(prenom, nom, classe, photo_url)').order('date_absence', { ascending: false });
      if (error) throw error;
      if (data) {
        setListeAbsences(data);
        setAbsencesCount(data.filter(a => a.statut === 'Prévu').length);
      }
    } catch(err) { console.log(err.message); }
  };

  const ouvrirModalAbsences = async () => {
    setModalAbsencesVisible(true);
    const nonVues = listeAbsences.filter(a => a.statut === 'Prévu').map(a => a.id);
    if (nonVues.length > 0) {
      await supabase.from('planning_presences').update({ statut: 'Vu' }).in('id', nonVues);
      setAbsencesCount(0); 
      calculerAbsencesDuMois(); 
    }
  };

  const chargerHistoriqueSOS = async () => {
    try {
      const { data } = await supabase.from('recuperations_sos').select('*, enfants(prenom, nom, classe, photo_url)').not('date_validation', 'is', null).order('date_validation', { ascending: false });
      if (data) setListeSOSHistory(data);
    } catch (e) { console.log(e); }
  };

  const verifierCodeSOS = async () => {
    if (!inputCodeSOS) return;
    setLoadingSOS(true);
    setSosResult(null);
    try {
      const { data, error } = await supabase.from('recuperations_sos').select('*, enfants(prenom, nom, photo_url, classe)').eq('code_unique', inputCodeSOS.trim().toUpperCase()).maybeSingle();
      if (error) throw error;
      if (data && !data.date_validation) {
        setSosResult(data);
      } else if (data && data.date_validation) {
        Alert.alert("Attention ⚠️", "Ce code SOS sécurisé a déjà été consommé et validé.");
      } else {
        Alert.alert("Code Invalide ❌", "Ce code de sécurité n'existe pas.");
      }
    } catch(e) { Alert.alert("Erreur", "Problème lors du contrôle."); } finally { setLoadingSOS(false); }
  };

  const validerSortieSOS = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error = null } = await supabase.from('recuperations_sos').update({ date_validation: new Date().toISOString(), valide_par_admin_id: user.id }).eq('id', sosResult.id);
      if (error) throw error;
      Alert.alert("Sécurité Validée ✅", `Sortie de ${sosResult.enfants.prenom} enregistrée.`);
      setSosResult(null); setInputCodeSOS('');
      chargerHistoriqueSOS();
    } catch (e) { Alert.alert("Erreur", "Validation échouée."); }
  };

  const calculerAnniversairesProchains = async () => {
    try {
      const { data, error } = await supabase.from('enfants').select('id, prenom, nom, date_naissance, photo_url, parent_id, utilisateurs(expo_push_token)');
      if (error) throw error;
      if (data) {
        const aujourdhui = new Date();
        aujourdhui.setHours(0, 0, 0, 0);

        const listeAnniversaires = data.filter(enfant => {
          if (!enfant.date_naissance) return false;
          const separateur = enfant.date_naissance.includes('-') ? '-' : '/';
          const parts = enfant.date_naissance.split(separateur);
          let eJour, eMois;
          if (separateur === '-') {
            if (parts[0].length === 4) { eJour = parseInt(parts[2], 10); eMois = parseInt(parts[1], 10); } 
            else { eJour = parseInt(parts[0], 10); eMois = parseInt(parts[1], 10); }
          } else { eJour = parseInt(parts[0], 10); eMois = parseInt(parts[1], 10); }

          const dateAnniversaire = new Date(aujourdhui.getFullYear(), eMois - 1, eJour);
          if (dateAnniversaire < aujourdhui && dateAnniversaire.getTime() !== aujourdhui.getTime()) {
            dateAnniversaire.setFullYear(aujourdhui.getFullYear() + 1);
          }
          const diffTime = dateAnniversaire - aujourdhui;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          enfant.diffDays = diffDays;
          return diffDays >= 0 && diffDays <= 15;
        }).sort((a, b) => a.diffDays - b.diffDays);
        setBirthdayKids(listeAnniversaires); setBirthdayCount(listeAnniversaires.length);
      }
    } catch (err) { console.log(err.message); }
  };

  const envoyerSouhaitAnniversaire = async (enfant) => {
    if (!enfant.parent_id) { Alert.alert("Dossier incomplet", "Cet enfant n'est pas lié à un parent."); return; }
    setSendingId(enfant.id);
    try {
      const debutAnnee = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data: msgs } = await supabase.from('messages').select('id').eq('destinataire_id', enfant.parent_id).ilike('texte', `%Anniversaire%`).ilike('texte', `%${enfant.prenom}%`).gte('date_creation', debutAnnee);
      if (msgs && msgs.length > 0) { Alert.alert("Déjà envoyé", `Un message a déjà été envoyé pour ${enfant.prenom}.`); setSendingId(null); return; }

      const messageNotif = `Toute l'équipe de ${nomCreche} souhaite un merveilleux anniversaire à ${enfant.prenom} ! Passer une excellente journée ! 🎈✨`;
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('messages').insert([{ expediteur_id: user.id, destinataire_id: enfant.parent_id, texte: `🎁 *Message Spécial Anniversaire* 🎁\n\n${messageNotif}` }]);
      const parentToken = Array.isArray(enfant.utilisateurs) ? enfant.utilisateurs[0]?.expo_push_token : enfant.utilisateurs?.expo_push_token;

      if (parentToken) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: parentToken, sound: 'default', priority: 'high', title: `🎉 Joyeux Anniversaire ! 🎂`, body: messageNotif, data: { tab: 'messages' } }),
        });
      }
      Alert.alert("Envoyé 🎈", `Souhait transmis !`);
    } catch (err) {} finally { setSendingId(null); }
  };

  const calculerAttestationsEnAttente = async () => {
    const { count } = await supabase.from('demandes_attestation').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente');
    setAttestationsCount(count || 0);
  };

  const calculerPaiementsAVerifier = async () => {
    const { count } = await supabase.from('paiements').select('*', { count: 'exact', head: true }).eq('statut', 'en_verification');
    setPaiementsCount(count || 0);
  };

  const calculerMessagesNonLus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userData } = await supabase.from('utilisateurs').select('derniere_lecture_messagerie').eq('id', user.id).single();
      const derniereLecture = userData?.derniere_lecture_messagerie || '2000-01-01T00:00:00.000Z';
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('destinataire_id', user.id).gt('date_creation', derniereLecture);
      setUnreadCount(count || 0);
    } catch (error) {}
  };

  const absencesFiltrees = listeAbsences.filter(abs => {
    const matchClasse = filterClasseAbsence === 'Toutes' || (abs.enfants?.classe || 'Crèche') === filterClasseAbsence;
    const searchLow = searchAbsence.toLowerCase().trim();
    const matchText = !searchLow || abs.enfants?.prenom.toLowerCase().includes(searchLow) || abs.enfants?.nom.toLowerCase().includes(searchLow) || abs.motif.toLowerCase().includes(searchLow);
    return matchClasse && matchText;
  });

  const sosFiltrees = listeSOSHistory.filter(sos => {
    const matchClasse = filterClasseSOS === 'Toutes' || (sos.enfants?.classe || 'Crèche') === filterClasseSOS;
    const searchLow = searchSOS.toLowerCase().trim();
    const matchText = !searchLow || sos.enfants?.prenom.toLowerCase().includes(searchLow) || sos.enfants?.nom.toLowerCase().includes(searchLow) || sos.nom_tierce_personne.toLowerCase().includes(searchLow);
    return matchClasse && matchText;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            <Image source={selectedLogo} style={styles.headerLogo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mainTitle} numberOfLines={1}>{nomCreche}</Text>
              <Text style={[styles.subtitle, { color: currentTheme.primary }]}>Année {anneeActive}</Text>
            </View>
          </View>
          
          <View style={styles.headerButtonsRow}>
            <TouchableOpacity style={styles.refreshBtn} onPress={rafraichirDonnees}>
              <Text style={styles.refreshIcon}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutIcon}>🚪</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#FF5722' }]} onPress={() => setModalBirthdayVisible(true)}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#FBE9E7' }]}><Text style={styles.cardIcon}>🎂</Text></View>
              {birthdayCount > 0 && <View style={[styles.badgeContainer, { backgroundColor: '#FF5722' }]}><Text style={styles.badgeText}>{birthdayCount}</Text></View>}
            </View>
            <Text style={styles.cardTitle}>Anniversaires</Text>
            <Text style={styles.cardDesc}>{birthdayCount > 0 ? `${birthdayCount} à venir 🎉` : "Aucun à venir"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#607D8B' }]} onPress={() => navigation.navigate('TerminalPointageEmployes')}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECEFF1' }]}><Text style={styles.cardIcon}>🕙</Text></View>
            <Text style={styles.cardTitle}>Pointage Staff</Text>
            <Text style={styles.cardDesc}>Présence employés</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#4CAF50' }]} onPress={() => navigation.navigate('HistoriquePointage')}>
            <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}><Text style={styles.cardIcon}>📋</Text></View>
            <Text style={styles.cardTitle}>Historique Présences</Text>
            <Text style={styles.cardDesc}>Voir les heures du staff</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#D84315' }]} onPress={() => setModalSOSVisible(true)}>
            <View style={[styles.iconCircle, { backgroundColor: '#FBE9E7' }]}><Text style={styles.cardIcon}>🛡️</Text></View>
            <Text style={styles.cardTitle}>Contrôle Sortie SOS</Text>
            <Text style={styles.cardDesc}>Sécurité & Traçabilité</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#673AB7' }]} onPress={ouvrirModalAbsences}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#EDE7F6' }]}><Text style={styles.cardIcon}>📅</Text></View>
              {absencesCount > 0 && <View style={[styles.badgeContainer, { backgroundColor: '#673AB7' }]}><Text style={styles.badgeText}>{absencesCount}</Text></View>}
            </View>
            <Text style={styles.cardTitle}>Plannings Absences</Text>
            <Text style={styles.cardDesc}>{absencesCount > 0 ? `${absencesCount} nouvelle(s)` : "Gérer les présences"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#8BC34A' }]} onPress={() => navigation.navigate('CahierAdmin')}><View style={[styles.iconCircle, { backgroundColor: '#F1F8E9' }]}><Text style={styles.cardIcon}>📝</Text></View><Text style={styles.cardTitle}>Cahier Quotidien</Text><Text style={styles.cardDesc}>Repas, siestes, suivi</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#FF9800' }]} onPress={() => navigation.navigate('GestionFamillesScreen')}><View style={[styles.iconCircle, { backgroundColor: '#FFF3E0' }]}><Text style={styles.cardIcon}>👥</Text></View><Text style={styles.cardTitle}>Familles</Text><Text style={styles.cardDesc}>Parents & Enfants</Text></TouchableOpacity>
          
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#FFC107' }]} onPress={() => navigation.navigate('PaiementsAdmin')}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#FFF8E1' }]}><Text style={styles.cardIcon}>💰</Text></View>
              {paiementsCount > 0 && <View style={[styles.badgeContainer, { backgroundColor: currentTheme.primary }]}><Text style={styles.badgeText}>{paiementsCount > 99 ? '99+' : paiementsCount}</Text></View>}
            </View>
            <Text style={styles.cardTitle}>Finances</Text><Text style={styles.cardDesc}>Factures & reçus</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#3F51B5' }]} onPress={() => navigation.navigate('GestionTransportAdmin')}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#E8EAF6' }]}><Text style={styles.cardIcon}>🚌</Text></View>
            </View>
            <Text style={styles.cardTitle}>Transport Bus</Text>
            <Text style={styles.cardDesc}>Abonnés & Listes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#E91E63' }]} onPress={() => navigation.navigate('GestionCantineAdmin')}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#FCE4EC' }]}><Text style={styles.cardIcon}>🍽️</Text></View>
            </View>
            <Text style={styles.cardTitle}>Cantine</Text>
            <Text style={styles.cardDesc}>Repas & Allergies</Text>
          </TouchableOpacity>

          {/* 🚀 NOUVEAU : TILES MENU DE LA SEMAINE & PROGRAMME PEDAGOGIQUE */}
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#009688' }]} onPress={() => navigation.navigate('MenuProgrammeAdmin')}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0F2F1' }]}><Text style={styles.cardIcon}>🗓️</Text></View>
            <Text style={styles.cardTitle}>Menu & Programme</Text>
            <Text style={styles.cardDesc}>Cantine & Pédagogie</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { borderBottomColor: '#00BCD4' }]} onPress={() => navigation.navigate('AttestationsAdminScreen')}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#E0F7FA' }]}><Text style={styles.cardIcon}>📜</Text></View>
              {attestationsCount > 0 && <View style={[styles.badgeContainer, { backgroundColor: '#FF9800' }]}><Text style={styles.badgeText}>{attestationsCount > 99 ? '99+' : attestationsCount}</Text></View>}
            </View>
            <Text style={styles.cardTitle}>Attestations</Text><Text style={styles.cardDesc}>Certificats Scolarité</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#4CAF50' }]} onPress={() => navigation.navigate('MurAdmin')}><View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}><Text style={styles.cardIcon}>📸</Text></View><Text style={styles.cardTitle}>Mur Crèche</Text><Text style={styles.cardDesc}>Publier des photos</Text></TouchableOpacity>
          
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#2196F3' }]} onPress={() => navigation.navigate('Messagerie')}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}><Text style={styles.cardIcon}>💬</Text></View>
              {unreadCount > 0 && <View style={[styles.badgeContainer, { backgroundColor: currentTheme.primary }]}><Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
            </View>
            <Text style={styles.cardTitle}>Messagerie</Text><Text style={styles.cardDesc}>Contacter les parents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#9C27B0' }]} onPress={() => navigation.navigate('RessourcesAdmin')}><View style={[styles.iconCircle, { backgroundColor: '#F3E5F5' }]}><Text style={styles.cardIcon}>📂</Text></View><Text style={styles.cardTitle}>Ressources</Text><Text style={styles.cardDesc}>Menus & Documents</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#F44336' }]} onPress={() => navigation.navigate('GestionUtilisateurs')}><View style={[styles.iconCircle, { backgroundColor: '#FFEBEE' }]}><Text style={styles.cardIcon}>🛡️</Text></View><Text style={styles.cardTitle}>Sécurité</Text><Text style={styles.cardDesc}>Comptes en attente</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#009688' }]} onPress={() => navigation.navigate('EngagementAdminScreen')}><View style={[styles.iconCircle, { backgroundColor: '#E0F2F1' }]}><Text style={styles.cardIcon}>📊</Text></View><Text style={styles.cardTitle}>Engagement</Text><Text style={styles.cardDesc}>Activité des parents</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#607D8B' }]} onPress={() => navigation.navigate('ReglagesAdminScreen')}><View style={[styles.iconCircle, { backgroundColor: '#ECEFF1' }]}><Text style={styles.cardIcon}>⚙️</Text></View><Text style={styles.cardTitle}>Paramètres</Text><Text style={styles.cardDesc}>Année, Comptes (RIB)</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderBottomColor: '#9E9E9E' }]} onPress={() => navigation.navigate('ArchiveAdminScreen')}><View style={[styles.iconCircle, { backgroundColor: '#F5F5F5' }]}><Text style={styles.cardIcon}>📦</Text></View><Text style={styles.cardTitle}>Archive & Espace</Text><Text style={styles.cardDesc}>Archiver & libérer</Text></TouchableOpacity>

        </View>
        <View style={styles.footer}><Text style={styles.footerText}>Developped by A S © 2026</Text></View>
      </ScrollView>

      {/* MODAL 1 : ANNIVERSAIRES */}
      <Modal visible={modalBirthdayVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalEmojiHeader}>🎈 🎉 🎂</Text>
            <Text style={styles.modalTitle}>Prochains Anniversaires</Text>
            <Text style={styles.modalSubtitle}>Prévus dans les 15 prochains jours</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {birthdayKids.length === 0 ? <View style={styles.emptyContainer}><Text style={styles.emptyText}>Aucun anniversaire prévu prochainement.</Text></View> : (
                birthdayKids.map(kid => (
                  <View key={kid.id} style={styles.kidRow}>
                    {kid.photo_url ? <Image source={{ uri: kid.photo_url }} style={styles.kidAvatar} /> : <View style={styles.kidAvatarPlaceholder}><Text style={{fontSize: 22}}>👶</Text></View>}
                    <View style={styles.kidInfoContainer}>
                      <Text style={styles.kidName}>{kid.prenom} {kid.nom}</Text>
                      <Text style={{color: kid.diffDays === 0 ? '#E91E63' : '#64748B', fontWeight: 'bold', fontSize: 12}}>
                        {kid.diffDays === 0 ? "Aujourd'hui ! 🎂" : kid.diffDays === 1 ? "Demain" : `Dans ${kid.diffDays} jours`}
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.wishBtn, { backgroundColor: currentTheme.primary }]} onPress={() => envoyerSouhaitAnniversaire(kid)} disabled={sendingId === kid.id || !kid.parent_id}>
                      {sendingId === kid.id ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.wishBtnText}>🎁 Souhaiter</Text>}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalBirthdayVisible(false)}><Text style={styles.closeModalBtnText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🚀 MODAL 2 : CONTRÔLEUR SOS */}
      <Modal visible={modalSOSVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%' }]}>
              <Text style={styles.modalEmojiHeader}>🛡️</Text>
              <Text style={styles.modalTitle}>Sécurité & Sorties</Text>

              <View style={styles.tabsRow}>
                <TouchableOpacity onPress={() => setShowSOSHistory(false)} style={[styles.tabBtn, !showSOSHistory ? [styles.tabBtnActiveSOS, { backgroundColor: currentTheme.primary }] : styles.tabBtnInactive]}>
                  <Text style={!showSOSHistory ? styles.tabTextActive : styles.tabTextInactive}>Field Control</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSOSHistory(true)} style={[styles.tabBtn, showSOSHistory ? [styles.tabBtnActiveSOS, { backgroundColor: currentTheme.primary }] : styles.tabBtnInactive]}>
                  <Text style={showSOSHistory ? styles.tabTextActive : styles.tabTextInactive}>Trace Logs</Text>
                </TouchableOpacity>
              </View>

              {showSOSHistory ? (
                <View style={{ flexShrink: 1, width: '100%' }}> 
                  <View style={styles.searchBarContainer}>
                    <Text style={{fontSize: 14}}>🔍</Text>
                    <TextInput style={styles.searchBarInput} placeholder="Filtrer par nom d'enfant ou accompagnant..." value={searchSOS} onChangeText={setSearchSOS} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                    {classesList.map(c => (
                      <TouchableOpacity key={c} style={[styles.filterPill, filterClasseSOS === c && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFilterClasseSOS(c)}>
                        <Text style={[styles.filterPillText, filterClasseSOS === c && styles.filterPillTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{marginTop: 10, maxHeight: 260}}>
                    {sosFiltrees.length === 0 ? <Text style={styles.emptyText}>Aucun enregistrement trouvé dans l'historique.</Text> : sosFiltrees.map(sos => (
                      <View key={sos.id} style={styles.historyCard}>
                        <Text style={styles.historyDate}>✅ Sortie enregistrée le {new Date(sos.date_validation).toLocaleDateString()} à {new Date(sos.date_validation).toLocaleTimeString().slice(0,5)}</Text>
                        <Text style={styles.historyTextBold}>🧒 {sos.enfants?.prenom} {sos.enfants?.nom} ({sos.enfants?.classe || 'Crèche'})</Text>
                        <Text style={styles.historyTextLight}>👤 Pris en charge par : {sos.nom_tierce_personne} (CIN: {sos.cin_tierce})</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalSubtitle}>Saisissez le code unique généré par le parent</Text>
                  <View style={styles.sosSearchBoxRow}>
                    <TextInput style={styles.sosCodeInput} placeholder="SOS-XXXXXX" placeholderTextColor="#94A3B8" value={inputCodeSOS} onChangeText={setInputCodeSOS} autoCapitalize="characters" />
                    <TouchableOpacity style={[styles.sosCheckBtn, {backgroundColor: currentTheme.primary}]} onPress={verifierCodeSOS} disabled={loadingSOS}>
                      {loadingSOS ? <ActivityIndicator color="#FFF"/> : <Text style={styles.sosCheckBtnText}>Vérifier</Text>}
                    </TouchableOpacity>
                  </View>
                  {sosResult && (
                    <View style={styles.sosResultCardContainer}>
                      <View style={styles.sosKidHeaderRow}>
                        {sosResult.enfants?.photo_url ? <Image source={{uri: sosResult.enfants.photo_url}} style={styles.sosKidAvatar}/> : <View style={styles.sosKidAvatarPlaceholder}><Text style={{fontSize: 18}}>👶</Text></View>}
                        <View>
                          <Text style={styles.sosKidName}>Enfant : {sosResult.enfants?.prenom} {sosResult.enfants?.nom}</Text>
                          <Text style={styles.sosKidClass}>Classe : {sosResult.enfants?.classe || 'Crèche'}</Text>
                        </View>
                      </View>
                      <View style={styles.sosDivider}/>
                      <Text style={styles.sosLabelData}>Personne autorisée à quai :</Text>
                      <Text style={styles.sosValueData}>👤 {sosResult.nom_tierce_personne}</Text>
                      <Text style={styles.sosValueData}>🪪 Numéro de CIN : {sosResult.cin_tierce}</Text>
                      <TouchableOpacity style={styles.confirmSOSReleaseBtn} onPress={validerSortieSOS}>
                        <Text style={styles.confirmSOSReleaseBtnText}>🔒 Confirmer l'identité & Libérer l'enfant</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setModalSOSVisible(false); setSosResult(null); setInputCodeSOS(''); setShowSOSHistory(false); }}><Text style={styles.closeModalBtnText}>Fermer</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🚀 MODAL 3 : ABSENCES */}
      <Modal visible={modalAbsencesVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%' }]}>
              <Text style={styles.modalEmojiHeader}>📅</Text>
              <Text style={styles.modalTitle}>Absences Signalées</Text>
              <Text style={styles.modalSubtitle}>Suivi logistique global en temps réel</Text>

              <View style={styles.searchBarContainer}>
                <Text style={{fontSize: 14}}>🔍</Text>
                <TextInput style={styles.searchBarInput} placeholder="Chercher un élève ou un motif..." value={searchAbsence} onChangeText={setSearchAbsence} />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                {classesList.map(c => (
                  <TouchableOpacity key={c} style={[styles.filterPill, filterClasseAbsence === c && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFilterClasseAbsence(c)}>
                    <Text style={[styles.filterPillText, filterClasseAbsence === c && styles.filterPillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView style={[styles.modalScroll, {marginTop: 15}]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {absencesFiltrees.length === 0 ? (
                  <View style={styles.emptyContainer}><Text style={styles.emptyText}>Aucune absence enregistrée pour cette sélection.</Text></View>
                ) : (
                  absencesFiltrees.map(abs => (
                    <View key={abs.id} style={styles.kidRow}>
                      {abs.enfants?.photo_url ? <Image source={{ uri: abs.enfants.photo_url }} style={styles.kidAvatar} /> : <View style={styles.kidAvatarPlaceholder}><Text style={{fontSize: 22}}>👶</Text></View>}
                      <View style={styles.kidInfoContainer}>
                        <Text style={styles.kidName}>{abs.enfants?.prenom} {abs.enfants?.nom} ({abs.enfants?.classe || 'Crèche'})</Text>
                        <Text style={styles.absenceDateBadge}>🗓️ Date de l'absence : {abs.date_absence.split('-').reverse().join('/')}</Text>
                        <Text style={styles.absenceReasonText}>💬 Raison : "{abs.motif}"</Text>
                      </View>
                      <View style={[styles.statusAbsencePill, abs.statut === 'Vu' ? {backgroundColor: '#E2E8F0'} : {backgroundColor: '#FFF3E0'}]}>
                        <Text style={[styles.statusAbsencePillText, abs.statut === 'Vu' ? {color: '#64748B'} : {color: '#D84315'}]}>{abs.statut}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalAbsencesVisible(false)}>
                <Text style={styles.closeModalBtnText}>Fermer la liste</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLogo: { width: 50, height: 50, borderRadius: 12, marginRight: 15 },
  mainTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  logoutBtn: { backgroundColor: '#FFF3E0', padding: 10, borderRadius: 12 },
  logoutIcon: { fontSize: 18 },
  
  // -- STYLES DES BOUTONS DE L'EN-TÊTE ACCOLÉS --
  headerButtonsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  refreshBtn: { backgroundColor: '#E0F2FE', padding: 10, borderRadius: 12 },
  refreshIcon: { fontSize: 18 },

  scrollContent: { paddingHorizontal: 15, paddingBottom: 20, paddingTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { backgroundColor: '#FFFFFF', width: '48%', paddingVertical: 20, borderRadius: 20, marginBottom: 16, borderBottomWidth: 5, borderColor: '#F1F5F9', alignItems: 'center', elevation: 3 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  cardDesc: { fontSize: 11, color: '#64748B', textAlign: 'center', fontWeight: '500', marginTop: 4 },
  iconContainer: { position: 'relative' },
  badgeContainer: { position: 'absolute', top: -5, right: -10, borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalEmojiHeader: { fontSize: 32, textAlign: 'center', marginBottom: 5 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', fontWeight: '500', marginBottom: 20 },
  modalScroll: { maxHeight: 400 },
  emptyContainer: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontStyle: 'italic', fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 20 },
  
  kidRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', justifyContent: 'space-between' },
  kidAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  kidAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF8E1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  kidInfoContainer: { flex: 1 },
  kidName: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  parentStatusText: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  wishBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  wishBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  closeModalBtn: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 20 },
  closeModalBtnText: { color: '#475569', fontWeight: '800', fontSize: 14 },

  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, height: 40, marginBottom: 10 },
  searchBarInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#334155' },
  pillsScroll: { flexDirection: 'row', maxHeight: 35, flexGrow: 0 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center' },
  filterPillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  filterPillText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterPillTextActive: { color: '#FFFFFF' },

  tabsRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 15 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActiveSOS: { shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabBtnInactive: { backgroundColor: 'transparent' },
  tabTextActive: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  tabTextInactive: { color: '#64748B', fontWeight: '600', fontSize: 14 },

  historyCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: '#10B981' },
  historyDate: { fontSize: 12, color: '#10B981', fontWeight: '800', marginBottom: 4 },
  historyTextBold: { fontSize: 14, color: '#0F172A', fontWeight: 'bold' },
  historyTextLight: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },

  sosSearchBoxRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  sosCodeInput: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 15, fontSize: 16, fontWeight: '900', color: '#0F172A', letterSpacing: 1 },
  sosCheckBtn: { paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sosCheckBtnText: { color: '#FFFFFF', fontWeight: 'bold' },

  sosResultCardContainer: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFCCBC', borderRadius: 16, padding: 16, marginTop: 10 },
  sosKidHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sosKidAvatar: { width: 44, height: 44, borderRadius: 22 },
  sosKidAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  sosKidName: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  sosKidClass: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  sosDivider: { height: 1, backgroundColor: '#FFCCBC', marginVertical: 12 },
  sosLabelData: { fontSize: 11, fontWeight: '700', color: '#7A1A1A', textTransform: 'uppercase' },
  sosValueData: { fontSize: 14, color: '#270505', fontWeight: '800', marginTop: 5 },
  confirmSOSReleaseBtn: { backgroundColor: '#10B981', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  confirmSOSReleaseBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },

  absenceDateBadge: { fontSize: 12, color: '#673AB7', fontWeight: 'bold', marginTop: 3 },
  absenceReasonText: { fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 2, fontWeight: '500' },
  statusAbsencePill: { backgroundColor: '#EDE7F6', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  statusAbsencePillText: { color: '#673AB7', fontSize: 11, fontWeight: '700' },

  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' }
});