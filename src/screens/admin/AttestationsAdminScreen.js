import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

// 🚀 Mapping des logos dynamiques pour l'impression native
const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

export default function AttestationsAdminScreen() {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [anneeActive, setAnneeActive] = useState('2025-2026');
  const [nomDirecteur, setNomDirecteur] = useState('Le Directeur');
  const [nomCreche, setNomCreche] = useState('La Crèche');

  // --- ÉTATS POUR L'IMPRESSION MANUELLE ---
  const [modalEnfantsVisible, setModalEnfantsVisible] = useState(false);
  const [tousLesEnfants, setTousLesEnfants] = useState([]);
  const [searchEnfantQuery, setSearchEnfantQuery] = useState('');
  const [loadingEnfants, setLoadingEnfants] = useState(false);

  useEffect(() => {
    chargerDemandes();
    chargerParametres();
  }, []);

  const chargerParametres = async () => {
    const { data, error } = await supabase
      .from('parametres')
      .select('cle, valeur')
      .in('cle', ['annee_active', 'nom_directeur', 'nom_creche']);

    if (data && !error) {
      data.forEach(param => {
        if (param.cle === 'annee_active') setAnneeActive(param.valeur);
        if (param.cle === 'nom_directeur') setNomDirecteur(param.valeur);
        if (param.cle === 'nom_creche') setNomCreche(param.valeur);
      });
    }
  };

  const chargerDemandes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('demandes_attestation')
      .select('*, enfants(nom, prenom, date_naissance, classe, familles(pere_nom, pere_prenom, mere_nom, mere_prenom)), utilisateurs(nom, prenom, expo_push_token)')
      .order('date_demande', { ascending: false });

    if (error) {
      console.log("Erreur chargement demandes :", error);
    } else if (data) {
      setDemandes(data);
    }
    setLoading(false);
  };

  // 🚀 CHARGER TOUS LES ENFANTS POUR L'IMPRESSION MANUELLE
  const ouvrirModalImpressionManuelle = async () => {
    setModalEnfantsVisible(true);
    setSearchEnfantQuery('');
    if (tousLesEnfants.length === 0) {
      setLoadingEnfants(true);
      const { data, error } = await supabase
        .from('enfants')
        .select('*, familles(pere_nom, pere_prenom, mere_nom, mere_prenom)')
        .order('nom', { ascending: true });
        
      if (data && !error) setTousLesEnfants(data);
      setLoadingEnfants(false);
    }
  };

  const envoyerNotificationParent = async (demande) => {
    const token = demande.utilisateurs?.expo_push_token;
    if (!token) return;

    const message = {
      to: token,
      sound: 'default',
      priority: 'high',
      title: 'Attestation prête 📄',
      body: `L'attestation de scolarité pour ${demande.enfants?.prenom || 'votre enfant'} est imprimée et prête à être récupérée à la direction.`,
      data: { tab: 'documents' }
    };

    const apiUrl = (Platform.OS === 'web' && !__DEV__) 
      ? '/api/expo-push/' 
      : 'https://exp.host/--/api/v2/push/send';

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (e) {
      console.log("Erreur lors de l'envoi de la notification:", e);
    }
  };

  const formatClassePourImpression = (classeCourte) => {
    if (!classeCourte) return 'Non classée';
    const mapping = {
      'TPS': 'Toute Petite Section',
      'PS': 'Petite Section',
      'MS': 'Moyenne Section',
      'GS': 'Grande Section',
      'Crèche': 'Crèche'
    };
    return mapping[classeCourte] || classeCourte;
  };

  // 🚀 MISE À JOUR : La fonction prend maintenant un enfant directement.
  // Si c'est suite à une demande parent, on passe la demande en 2ème argument.
  const genererPDF = async (enfant, demandeAssociee = null) => {
    const dateJour = new Date().toLocaleDateString('fr-FR');
    const dateNaissance = enfant.date_naissance 
        ? new Date(enfant.date_naissance).toLocaleDateString('fr-FR') 
        : '.../.../......';
    
    const familles = enfant.familles;
    const pereFullName = familles && (familles.pere_nom || familles.pere_prenom) 
      ? `${familles.pere_nom || ''} ${familles.pere_prenom || ''}`.trim() 
      : '...................................';
      
    const mereFullName = familles && (familles.mere_nom || familles.mere_prenom)
      ? `${familles.mere_nom || ''} ${familles.mere_prenom || ''}`.trim() 
      : '...................................';

    const classeFormatee = formatClassePourImpression(enfant.classe);

    let logoUri = '';
    const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
    const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;

    try {
      const asset = Asset.fromModule(selectedLogo);
      await asset.downloadAsync();
      
      if (Platform.OS === 'web') {
        logoUri = asset.uri;
        if (logoUri.startsWith('/')) {
            logoUri = window.location.origin + logoUri;
        }
      } else {
        logoUri = asset.localUri || asset.uri;
      }
    } catch (e) {
      console.log("❌ Échec de la récupération du logo :", e);
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Attestation de Scolarité</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            @media print {
              @page { margin: 0; }
              body { margin: 25mm !important; }
            }
            body { 
              font-family: 'Times New Roman', serif; 
              color: #000; 
              padding: 20px;
              margin: 25mm; 
            }
            .header-container { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start; 
              margin-bottom: 80px; 
            }
            .logo { 
              width: 120px; 
              height: 120px; 
              object-fit: contain;
            }
            .date-text { 
              font-size: 18px; 
              margin-top: 20px;
            }
            .title { 
              text-align: center; 
              font-size: 26px; 
              font-weight: bold; 
              text-decoration: underline; 
              margin-bottom: 70px; 
            }
            .content { 
              font-size: 20px; 
              text-align: justify; 
              line-height: 2.2; 
            }
            .footer-text { 
              font-size: 20px; 
              margin-top: 50px; 
              text-align: justify;
            }
            .signature { 
              text-align: right; 
              margin-top: 80px; 
              font-size: 20px; 
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            ${logoUri ? `<img src="${logoUri}" class="logo" alt="Logo" />` : `<div style="width:120px; height:120px; border:1px solid #000; text-align:center; align-items:center; display:flex; justify-content:center;">LOGO<br>MANQUANT</div>`}
            
            <div class="date-text">Kénitra, le ${dateJour}</div>
          </div>

          <div class="title">Attestation de scolarité</div>

          <div class="content">
            Je soussigné, <strong>${nomDirecteur}</strong>, Directeur de la crèche-maternelle <strong>'${nomCreche.toUpperCase()}'</strong>, atteste par la présente que l'enfant : <strong>${(enfant.nom || '').toUpperCase()} ${enfant.prenom || ''}</strong> né(e) le <strong>${dateNaissance}</strong>, fille/fils de M. <strong>${pereFullName.toUpperCase()}</strong> et MME <strong>${mereFullName.toUpperCase()}</strong>, est inscrit(e) en classe de <strong>${classeFormatee}</strong> au sein de notre établissement pour l'année scolaire <strong>${anneeActive}</strong>.
          </div>

          <div class="footer-text">
            Cette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.
          </div>
          
          <div class="signature">
            La Direction
          </div>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
              if (demandeAssociee) marquerCommeImprime(demandeAssociee);
            }, 1000);
          }, 500); 
        };

        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();

      } else {
        await Print.printAsync({ html });
        if (demandeAssociee) await marquerCommeImprime(demandeAssociee);
        Alert.alert("Succès", "L'attestation a été imprimée avec succès.");
      }
    } catch (error) {
      if (error.message !== 'Print canceled') {
        console.log("Erreur d'impression", error);
      }
    }
  };

  const marquerCommeImprime = async (demande) => {
    const etaitDejaImprime = demande.statut === 'imprime';
    await supabase.from('demandes_attestation').update({ statut: 'imprime' }).eq('id', demande.id);
    
    if (!etaitDejaImprime) {
      await envoyerNotificationParent(demande);
    }
    chargerDemandes(); 
  };

  const enfantsFiltres = tousLesEnfants.filter(e => {
    const q = searchEnfantQuery.toLowerCase();
    const nomComplet = `${e.prenom || ''} ${e.nom || ''}`.toLowerCase();
    return nomComplet.includes(q);
  });

  const renderItemDemande = ({ item }) => {
    const isAttente = item.statut === 'en_attente';
    const familles = item.enfants?.familles;
    
    const pereDisplay = familles && (familles.pere_nom || familles.pere_prenom) ? `${familles.pere_prenom || ''} ${familles.pere_nom || ''}`.trim() : 'N/A';
    const mereDisplay = familles && (familles.mere_nom || familles.mere_prenom) ? `${familles.mere_prenom || ''} ${familles.mere_nom || ''}`.trim() : 'N/A';

    return (
      <View style={[styles.card, !isAttente && styles.cardDone]}>
        <View style={styles.cardInfo}>
          <Text style={styles.enfantName}>{item.enfants?.nom} {item.enfants?.prenom}</Text>
          <Text style={styles.parentName}>Parents: {pereDisplay} & {mereDisplay}</Text>
          <Text style={styles.date}>Demandé le : {new Date(item.date_demande).toLocaleDateString('fr-FR')}</Text>
          <Text style={[styles.statusBadge, isAttente ? styles.statusWait : styles.statusDone]}>
            {isAttente ? '⏳ À imprimer' : '✅ Déjà imprimé'}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.printBtn, !isAttente && styles.printBtnDone]} 
          onPress={() => genererPDF(item.enfants, item)}
        >
          <Text style={styles.printBtnText}>🖨️ Imprimer A4</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Attestations</Text>
        <TouchableOpacity style={styles.manualPrintBtn} onPress={ouvrirModalImpressionManuelle}>
          <Text style={styles.manualPrintBtnText}>+ Imprimer (Manuel)</Text>
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{marginTop: 50}} />
      ) : demandes.length === 0 ? (
        <Text style={styles.emptyText}>Aucune demande d'attestation pour le moment.</Text>
      ) : (
        <FlatList
          data={demandes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItemDemande}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 🚀 MODAL POUR LA RECHERCHE ET L'IMPRESSION MANUELLE */}
      <Modal visible={modalEnfantsVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Sélectionnez un enfant</Text>
              <TouchableOpacity onPress={() => setModalEnfantsVisible(false)}>
                <Text style={styles.closeIcon}>✖</Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={styles.searchInput} 
              placeholder="🔍 Rechercher par prénom ou nom..." 
              value={searchEnfantQuery}
              onChangeText={setSearchEnfantQuery}
            />

            {loadingEnfants ? (
              <ActivityIndicator size="large" color="#4F46E5" style={{marginTop: 20}} />
            ) : (
              <FlatList
                data={enfantsFiltres}
                keyExtractor={item => item.id.toString()}
                renderItem={({item}) => (
                  <View style={styles.enfantRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.enfantRowName}>{item.prenom} {item.nom}</Text>
                      <Text style={styles.enfantRowClass}>Classe : {item.classe || 'Non classé'}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.printBtnSmall} 
                      onPress={() => {
                        genererPDF(item, null); // null car ce n'est pas une demande parent
                        setModalEnfantsVisible(false);
                      }}
                    >
                      <Text style={styles.printBtnTextSmall}>🖨️ Générer</Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>Aucun enfant trouvé.</Text>}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: Platform.OS === 'ios' ? 10 : 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0F172A' },
  manualPrintBtn: { backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, elevation: 2 },
  manualPrintBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  card: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 5, borderLeftColor: '#EF4444' },
  cardDone: { borderLeftColor: '#10B981', opacity: 0.8 },
  cardInfo: { flex: 1 },
  enfantName: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  parentName: { fontSize: 13, color: '#64748B', marginTop: 2 },
  date: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  statusBadge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 11, fontWeight: 'bold', overflow: 'hidden' },
  statusWait: { backgroundColor: '#FEE2E2', color: '#DC2626' },
  statusDone: { backgroundColor: '#D1FAE5', color: '#059669' },
  printBtn: { backgroundColor: '#4F46E5', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, marginLeft: 10 },
  printBtnDone: { backgroundColor: '#94A3B8' },
  printBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontStyle: 'italic' },

  // --- STYLES MODAL MANUELLE ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: '85%' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  closeIcon: { fontSize: 20, color: '#64748B', padding: 5 },
  searchInput: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 15, color: '#334155', marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  
  enfantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  enfantRowName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  enfantRowClass: { fontSize: 12, color: '#64748B', marginTop: 2 },
  printBtnSmall: { backgroundColor: '#4F46E5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  printBtnTextSmall: { color: '#FFF', fontWeight: 'bold', fontSize: 12 }
});