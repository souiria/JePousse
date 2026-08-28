import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

export default function PaiementsAdminScreen() {
  const [activeTab, setActiveTab] = useState('familles'); 
  
  const [paiements, setPaiements] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRelance, setLoadingRelance] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [familleSelectionnee, setFamilleSelectionnee] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [modalForcePaymentVisible, setModalForcePaymentVisible] = useState(false);
  const [factureAForcer, setFactureAForcer] = useState(null);
  const [selectedForPrint, setSelectedForPrint] = useState([]); 

  const [modalAddFactureVisible, setModalAddFactureVisible] = useState(false);
  const [enfantsFamille, setEnfantsFamille] = useState([]);
  const [factTypeSaisie, setFactTypeSaisie] = useState('mensuel'); 
  const [factEnfantId, setFactEnfantId] = useState('');
  
  // 🚀 NOUVEAU: On remplace "factMois" par un tableau pour les sélections multiples
  const [selectedMoisList, setSelectedMoisList] = useState([]);
  
  const [factService, setFactService] = useState('Cantine');
  const [factTitreExtra, setFactTitreExtra] = useState('');
  const [factMontant, setFactMontant] = useState('');

  const [modalDepenseVisible, setModalDepenseVisible] = useState(false);
  const [titreDepense, setTitreDepense] = useState('');
  const [montantDepense, setMontantDepense] = useState('');
  const [categorieDepense, setCategorieDepense] = useState('salaire'); 

  const [anneeActive, setAnneeActive] = useState('');
  const [nomCreche, setNomCreche] = useState('La Crèche');
  
  const moisScolaires = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août'];
  const moisNomsCal = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const moisActuelStr = moisNomsCal[new Date().getMonth()]; 
  
  const ordreMoisScolaire = {
    'Septembre': 1, 'Octobre': 2, 'Novembre': 3, 'Décembre': 4,
    'Janvier': 5, 'Février': 6, 'Mars': 7, 'Avril': 8, 'Mai': 9,
    'Juin': 10, 'Juillet': 11, 'Août': 12
  };

  const anneesDisponibles = Array.from(new Array(6), (val, index) => {
    const year = new Date().getFullYear() - 2 + index;
    return `${year}-${year + 1}`;
  });

  const rafraichirDonnees = async () => {
    setLoading(true);
    await fetchParametres(); 
    await fetchPaiements(); 
    await fetchDepenses();
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      rafraichirDonnees();
      setSelectedMoisList([moisScolaires.includes(moisActuelStr) ? moisActuelStr : 'Septembre']);
    }, [])
  );

  const fetchParametres = async () => {
    try {
      const { data } = await supabase
        .from('parametres')
        .select('cle, valeur')
        .in('cle', ['annee_active', 'nom_creche']);

      if (data && data.length > 0) {
        data.forEach(param => {
          if (param.cle === 'annee_active') setAnneeActive(param.valeur);
          if (param.cle === 'nom_creche') setNomCreche(param.valeur);
        });
      } else {
        setAnneeActive(anneesDisponibles[2]); 
        setNomCreche(Constants.expoConfig?.name || "La Crèche"); 
      }
    } catch (err) {
      setAnneeActive(anneesDisponibles[2]);
      setNomCreche(Constants.expoConfig?.name || "La Crèche");
    }
  };

  const fetchPaiements = async () => {
    try {
      let allData = [];
      let from = 0;
      const step = 1000;
      let keepFetching = true;

      while (keepFetching) {
        const { data, error } = await supabase.from('paiements').select(`
          *, 
          enfants ( 
            id, prenom, nom, famille_id, code_parent, parent_id, annee_scolaire, classe,
            familles (id, pere_nom, pere_prenom, mere_nom, mere_prenom, epingle)
          )
        `)
        .order('date_creation', { ascending: false })
        .range(from, from + step - 1);

        if (error) {
          console.error("Erreur de pagination:", error);
          break;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < step) {
            keepFetching = false; 
          } else {
            from += step; 
          }
        } else {
          keepFetching = false;
        }
      }

      setPaiements(allData);

      const paiementsToFix = allData.filter(p => p.parent_id === null && p.enfants?.parent_id);
      if (paiementsToFix.length > 0) {
        paiementsToFix.forEach(p => {
          supabase.from('paiements').update({ parent_id: p.enfants.parent_id }).eq('id', p.id).then();
        });
      }

    } catch (err) {
      console.error("Catch fetchPaiements:", err);
    }
  };

  const fetchDepenses = async () => {
    try {
      const { data } = await supabase.from('depenses').select('*').order('date_creation', { ascending: false });
      if (data) setDepenses(data);
    } catch (err) {
      console.error(err);
    }
  };

  const filtrerParAnnee = (item, anneeFiltre) => {
    if (item.statut !== 'paye') return true; 
    if (!anneeFiltre || anneeFiltre === 'Toutes') return true;

    let anneeScolaire = null;
    const matchYear = item.titre?.match(/\((\d{4}-\d{4})\)/);
    if (matchYear && matchYear[1]) {
      anneeScolaire = matchYear[1];
    } else if (item.enfants?.annee_scolaire) {
      anneeScolaire = item.enfants.annee_scolaire;
    } else if (item.date_creation) {
      const d = new Date(item.date_creation);
      const y = d.getFullYear();
      const m = d.getMonth() + 1; 
      anneeScolaire = m >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
    }
    return anneeScolaire === anneeFiltre;
  };

  const filtrerDepenseParAnnee = (item, anneeFiltre) => {
    if (!anneeFiltre || anneeFiltre === 'Toutes') return true;
    const d = new Date(item.date_creation);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const anneeScolaire = m >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
    return anneeScolaire === anneeFiltre;
  };

  const paiementsFiltres = paiements.filter(p => filtrerParAnnee(p, anneeActive));
  const depensesFiltres = depenses.filter(d => filtrerDepenseParAnnee(d, anneeActive));

  const ouvrirModalFamille = async (item) => {
    setFamilleSelectionnee(item);
    setSelectedForPrint([]); 
    
    try {
      let query = supabase.from('enfants').select('id, prenom, nom');
      if (item.codeFamille) {
        query = query.eq('code_parent', item.codeFamille);
      } else if (item.familleId) {
        query = query.eq('famille_id', item.familleId);
      } else if (item.originalParentId) {
        query = query.eq('parent_id', item.originalParentId);
      }

      const { data: enfantsData } = await query;
      if (enfantsData && enfantsData.length > 0) {
        setEnfantsFamille(enfantsData);
        setFactEnfantId(enfantsData[0].id);
      } else {
        setEnfantsFamille([]);
      }
    } catch (e) {
      setEnfantsFamille([]);
    }
    setModalVisible(true);
  };

  const toggleEpingleFamille = async (famille) => {
    try {
      const nouvelEtat = !famille.epingle;
      if (famille.familleId) {
        await supabase.from('familles').update({ epingle: nouvelEtat }).eq('id', famille.familleId);
        rafraichirDonnees();
      } else {
        alert("Impossible d'épingler ce dossier (ID famille manquant).");
      }
    } catch (err) {
      alert("Erreur lors de l'épingle.");
    }
  };

  // 🚀 NOUVELLE FONCTION POUR SÉLECTION MULTIPLE DES MOIS
  const toggleMoisSelection = (mois) => {
    if (selectedMoisList.includes(mois)) {
      setSelectedMoisList(selectedMoisList.filter(m => m !== mois));
    } else {
      setSelectedMoisList([...selectedMoisList, mois]);
    }
  };

  const validerAjoutFacture = async () => {
    if (!factMontant) return alert("Veuillez indiquer un montant.");
    if (factTypeSaisie === 'mensuel' && selectedMoisList.length === 0) return alert("Veuillez sélectionner au moins un mois.");
    
    setLoading(true);
    const anneePourTitre = anneeActive === 'Toutes' ? anneesDisponibles[2] : anneeActive;
    let typeBase = factTypeSaisie === 'mensuel' ? factService.toLowerCase() : 'extra';

    try {
      const payloads = [];

      // 🚀 CRÉATION DE PLUSIEURS FACTURES EN MÊME TEMPS
      if (factTypeSaisie === 'mensuel') {
        selectedMoisList.forEach(mois => {
          payloads.push({
            enfant_id: factEnfantId,
            titre: `${factService} - ${mois} (${anneePourTitre})`,
            montant: parseFloat(factMontant),
            statut: 'en_attente',
            type: typeBase,
            mois: mois,
            parent_id: familleSelectionnee.originalParentId || null
          });
        });
      } else {
        payloads.push({
          enfant_id: factEnfantId,
          titre: `${factTitreExtra} (${anneePourTitre})`,
          montant: parseFloat(factMontant),
          statut: 'en_attente',
          type: typeBase,
          mois: null,
          parent_id: familleSelectionnee.originalParentId || null
        });
      }

      const { error } = await supabase.from('paiements').insert(payloads);
      if (error) throw error;

      alert(`Facture(s) générée(s) avec succès !`);
      setModalAddFactureVisible(false); 
      setFactMontant(''); 
      setFactTitreExtra('');
      setSelectedMoisList([moisScolaires.includes(moisActuelStr) ? moisActuelStr : 'Septembre']);
      rafraichirDonnees(); 
      setModalVisible(false);
    } catch (error) { alert(error.message); } finally { setLoading(false); }
  };

  const executerSuppressionFacture = async (idFacture) => {
    const { error } = await supabase.from('paiements').delete().eq('id', idFacture);
    if (!error) { rafraichirDonnees(); setModalVisible(false); }
  };

  const supprimerFacture = (idFacture) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Voulez-vous supprimer cette facture du dossier ?")) executerSuppressionFacture(idFacture);
    } else {
      Alert.alert("Supprimer la facture ?", "Cette action retirera la facture du dossier de la famille.",
        [{ text: "Annuler", style: "cancel" }, { text: "Oui, supprimer", style: "destructive", onPress: () => executerSuppressionFacture(idFacture) }]
      );
    }
  };

  const ajouterDepense = async () => {
    if (!titreDepense || !montantDepense) return alert("Veuillez remplir le titre et le montant.");
    try {
      const { error } = await supabase.from('depenses').insert([{ titre: titreDepense, montant: parseFloat(montantDepense), categorie: categorieDepense }]);
      if (error) throw error;
      setModalDepenseVisible(false); setTitreDepense(''); setMontantDepense(''); rafraichirDonnees(); 
    } catch (error) { alert("Erreur lors de l'ajout de la dépense."); }
  };

  const executerSuppressionDepense = async (id) => { await supabase.from('depenses').delete().eq('id', id); rafraichirDonnees(); };
  
  const supprimerDepense = (id) => {
    if (Platform.OS === 'web') { if (window.confirm("Voulez-vous supprimer cette dépense ?")) executerSuppressionDepense(id); } 
    else { Alert.alert("Supprimer", "Voulez-vous supprimer cette dépense ?", [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: () => executerSuppressionDepense(id) }]); }
  };

  const genererBilanAnalytique = () => {
    const bilanMap = {};
    moisScolaires.forEach(m => { bilanMap[m] = { recettes: 0, depenses: 0 }; });

    let totalRecettesGlobal = 0;
    let totalDepensesGlobal = 0;

    paiementsFiltres.filter(p => p.statut === 'paye').forEach(p => {
      const date = new Date(p.date_paiement || p.date_creation);
      const moisAbrege = moisNomsCal[date.getMonth()];
      if (bilanMap[moisAbrege]) {
        bilanMap[moisAbrege].recettes += Number(p.montant) || 0;
        totalRecettesGlobal += Number(p.montant) || 0;
      }
    });

    depensesFiltres.forEach(d => {
      const date = new Date(d.date_creation);
      const moisAbrege = moisNomsCal[date.getMonth()];
      if (bilanMap[moisAbrege]) {
        bilanMap[moisAbrege].depenses += Number(d.montant) || 0;
        totalDepensesGlobal += Number(d.montant) || 0;
      }
    });

    const chartData = moisScolaires.map(mois => ({
      moisLabel: mois.substring(0, 3), 
      moisComplet: mois,
      recettes: bilanMap[mois].recettes,
      depenses: bilanMap[mois].depenses,
      benefice: bilanMap[mois].recettes - bilanMap[mois].depenses
    }));

    const maxMontant = Math.max(...chartData.map(d => Math.max(d.recettes, d.depenses)), 1000); 
    
    return { chartData, totalRecettesGlobal, totalDepensesGlobal, beneficeGlobal: totalRecettesGlobal - totalDepensesGlobal, maxMontant };
  };

  const statsBilan = genererBilanAnalytique();

  const preparerForcerPaiement = (facture) => {
    setFactureAForcer(facture);
    setModalForcePaymentVisible(true);
  };

  const marquerCommePaye = async (id, methode) => {
    try {
      setModalForcePaymentVisible(false);
      const dateAujourdhui = new Date().toISOString().split('T')[0]; 
      const { error } = await supabase.from('paiements').update({ 
        statut: 'paye', date_paiement: dateAujourdhui, methode_paiement: methode 
      }).eq('id', id);
      
      if (error) throw error;
      rafraichirDonnees(); 
      if (familleSelectionnee) {
        setFamilleSelectionnee(prev => ({ ...prev, factures: prev.factures.map(f => f.id === id ? { ...f, statut: 'paye', methode_paiement: methode, date_paiement: dateAujourdhui } : f) }));
      }
    } catch (error) { alert("Erreur de validation."); }
  };

  const executerRejetRecu = async (id) => {
    await supabase.from('paiements').update({ statut: 'en_attente', recu_url: null }).eq('id', id);
    rafraichirDonnees(); setModalVisible(false);
  };

  const rejeterRecu = (id) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Voulez-vous rejeter ce reçu ?")) executerRejetRecu(id);
    } else {
      Alert.alert("Rejeter le reçu", "Voulez-vous rejeter ce reçu et remettre la facture en attente ?",
        [{ text: "Annuler", style: "cancel" }, { text: "Oui, rejeter", style: "destructive", onPress: () => executerRejetRecu(id) }]
      );
    }
  };

  const toggleSelectForPrint = (id) => {
    if (selectedForPrint.includes(id)) setSelectedForPrint(selectedForPrint.filter(item => item !== id));
    else setSelectedForPrint([...selectedForPrint, id]);
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

  const genererPDFSelection = async () => {
    const facturesToPrint = familleSelectionnee.factures.filter(f => selectedForPrint.includes(f.id));
    if (facturesToPrint.length === 0) return;

    try {
      const montantTotal = facturesToPrint.reduce((sum, f) => sum + Number(f.montant), 0);
      const listeItemsHtml = facturesToPrint.map(f => `<li>${f.titre} : <b>${f.montant} Dhs</b></li>`).join('');
      const methodes = [...new Set(facturesToPrint.map(f => f.methode_paiement || 'Espèces'))].join(' / ');

      const enfant = facturesToPrint[0].enfants || {};
      const nom = enfant.nom ? enfant.nom.toUpperCase() : 'INCONNU';
      const prenom = enfant.prenom || 'Inconnu';
      const anneeScolaire = enfant.annee_scolaire || 'Non définie';
      const classe = formatClassePourImpression(enfant.classe);
      
      const dateEdition = facturesToPrint[0].date_paiement 
        ? new Date(facturesToPrint[0].date_paiement).toLocaleDateString('fr-FR') 
        : new Date().toLocaleDateString('fr-FR');
      
      let logoUri = '';
      const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
      const selectedLogo = logoAssets[crecheId] || logoAssets.jeupousse;

      try {
        const asset = Asset.fromModule(selectedLogo);
        await asset.downloadAsync();
        logoUri = asset.localUri || asset.uri;
        if (Platform.OS === 'web' && logoUri.startsWith('/')) logoUri = window.location.origin + logoUri;
      } catch (e) {}
      
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
          <head>
            <meta charset="utf-8">
            <style>
              @page { margin: 0; size: A4; }
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .page { padding: 40px; box-sizing: border-box; width: 100%; height: 100%; }
              .receipt { height: 43vh; display: flex; flex-direction: column; justify-content: center; }
              .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #4F46E5; padding-bottom: 12px; margin-bottom: 20px; }
              .logo { height: 40px; max-width: 150px; object-fit: contain; margin-bottom: 5px; }
              .creche-name { font-size: 14px; font-weight: bold; color: #334155; }
              .title { font-size: 20px; font-weight: 800; color: #4F46E5; text-transform: uppercase; letter-spacing: 1px; }
              .row { display: flex; margin-bottom: 8px; font-size: 15px; }
              .label { width: 180px; color: #64748B; font-weight: 700; text-transform: uppercase; font-size: 12px; }
              .value { font-weight: 700; color: #0F172A; flex: 1; }
              ul { margin: 0; padding-left: 20px; }
              .amount-box { margin-top: 15px; background-color: #EEF2FF !important; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #C7D2FE; }
              .amount-text { font-size: 22px; font-weight: 900; color: #4F46E5; }
              .bottom-signature { margin-top: 25px; text-align: right; font-size: 13px; font-weight: bold; color: #475569; }
              .divider { border-top: 3px dashed #94A3B8; margin: 3vh 0; position: relative; }
              .scissors { position: absolute; top: -14px; left: 20px; font-size: 20px; background: #fff; padding: 0 10px; }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="receipt">
                <div class="header">
                  <div class="logo-container">
                    ${logoUri ? `<img src="${logoUri}" class="logo" />` : ``}
                    <div class="creche-name">${nomCreche.toUpperCase()}</div>
                  </div>
                  <div class="title">Reçu de Paiement</div>
                </div>
                <div class="row"><div class="label">Date de paiement :</div><div class="value">${dateEdition}</div></div>
                <div class="row"><div class="label">Nom Enfant :</div><div class="value">${nom}</div></div>
                <div class="row"><div class="label">Prénom Enfant :</div><div class="value">${prenom}</div></div>
                <div class="row"><div class="label">Année Scolaire :</div><div class="value">${anneeScolaire}</div></div>
                <div class="row"><div class="label">Classe :</div><div class="value">${classe}</div></div>
                <div class="row"><div class="label">Mode paiement :</div><div class="value"><b>${methodes}</b></div></div>
                <div class="row"><div class="label">De :</div><div class="value"><ul>${listeItemsHtml}</ul></div></div>
                <div class="amount-box"><div class="amount-text">Total Réglé : ${montantTotal} Dhs</div></div>
                <div class="bottom-signature">Cachet & Signature Direction</div>
              </div>
              <div class="divider"><div class="scissors">✂️ Ligne de découpe</div></div>
              <div class="receipt">
                <div class="header" style="border-bottom-color: #475569;">
                  <div class="logo-container">
                    ${logoUri ? `<img src="${logoUri}" class="logo" />` : ``}
                    <div class="creche-name">${nomCreche.toUpperCase()}</div>
                  </div>
                  <div class="title" style="color: #475569;">Archive Crèche</div>
                </div>
                <div class="row"><div class="label">Date de paiement :</div><div class="value">${dateEdition}</div></div>
                <div class="row"><div class="label">Nom Enfant :</div><div class="value">${nom}</div></div>
                <div class="row"><div class="label">Prénom Enfant :</div><div class="value">${prenom}</div></div>
                <div class="row"><div class="label">Année Scolaire :</div><div class="value">${anneeScolaire}</div></div>
                <div class="row"><div class="label">Classe :</div><div class="value">${classe}</div></div>
                <div class="row"><div class="label">Mode paiement :</div><div class="value"><b>${methodes}</b></div></div>
                <div class="row"><div class="label">De :</div><div class="value"><ul>${listeItemsHtml}</ul></div></div>
                <div class="amount-box" style="background-color: #F8FAFC !important; border-color: #CBD5E1;"><div class="amount-text" style="color: #334155;">Total Réglé : ${montantTotal} Dhs</div></div>
                <div class="bottom-signature">Cachet & Signature Direction</div>
              </div>
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent); printWindow.document.close(); printWindow.focus();
          setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
        } else { alert("Veuillez autoriser les pop-ups."); }
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      }
      setSelectedForPrint([]);
    } catch (error) { alert("Erreur d'impression : " + error.message); }
  };

  const getStatutFacture = (facture) => {
    if (facture.statut === 'paye') return { label: 'Payé', color: '#10B981', code: 'paye' };
    if (facture.statut === 'en_verification') return { label: 'À vérifier 👀', color: '#8B5CF6', code: 'verification' };

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); 
    const currentDay = currentDate.getDate();

    let effectiveMonth;
    let effectiveYear;

    const isInscription = facture.type === 'inscription' || (facture.titre || '').toLowerCase().includes("inscription");
    
    if (isInscription) {
      effectiveMonth = 7; 
    } else if (facture.mois && moisNomsCal.indexOf(facture.mois) !== -1) {
      effectiveMonth = moisNomsCal.indexOf(facture.mois);
    } else {
      effectiveMonth = new Date(facture.date_creation).getMonth();
    }

    let anneeScolaire = null;
    const matchYear = facture.titre?.match(/\((\d{4}-\d{4})\)/);
    if (matchYear && matchYear[1]) anneeScolaire = matchYear[1];
    else if (facture.enfants?.annee_scolaire) anneeScolaire = facture.enfants.annee_scolaire;
    
    if (anneeScolaire && anneeScolaire.includes('-')) {
      const startYear = parseInt(anneeScolaire.split('-')[0], 10);
      
      if (isInscription) {
        effectiveYear = startYear;
      } else {
        effectiveYear = effectiveMonth >= 8 ? startYear : startYear + 1;
      }
    } else {
      effectiveYear = new Date(facture.date_creation).getFullYear();
    }

    if (effectiveYear < currentYear) {
      return { label: 'En retard', color: '#EF4444', code: 'retard' };
    } else if (effectiveYear > currentYear) {
      return { label: 'À venir', color: '#3B82F6', code: 'futur' };
    } else {
      if (effectiveMonth < currentMonth) {
        return { label: 'En retard', color: '#EF4444', code: 'retard' };
      } else if (effectiveMonth > currentMonth) {
        return { label: 'À venir', color: '#3B82F6', code: 'futur' };
      } else {
        if (currentDay >= 5) {
          return { label: 'En retard', color: '#EF4444', code: 'retard' };
        } else {
          return { label: 'À payer (Avant le 5)', color: '#F59E0B', code: 'actuel' };
        }
      }
    }
  };

  let totalCeMois = 0; let totalEnRetard = 0; let totalVerification = 0;
  const famillesMap = {};

  paiementsFiltres.forEach(p => {
    const statutInfo = getStatutFacture(p);
    if (p.statut === 'en_verification') totalVerification += 1;
    
    if (p.statut === 'en_attente') {
      if (statutInfo.code === 'retard') totalEnRetard += Number(p.montant);
      else if (statutInfo.code === 'actuel' || statutInfo.code === 'extra') totalCeMois += Number(p.montant);
    }

    const pId = p.enfants?.famille_id || p.parent_id || 'orphelins';
    const parentUser = p.enfants?.utilisateurs; 
    const currentParentId = p.enfants?.parent_id || p.parent_id;

    if (!famillesMap[pId]) {
      let parentName = 'Sans compte parent';
      let isEpingle = false; 

      if (p.enfants?.familles) {
        const f = p.enfants.familles;
        isEpingle = f.epingle === true; 
        const pere = f.pere_prenom ? `${f.pere_prenom} ${f.pere_nom || ''}`.trim() : '';
        const mere = f.mere_prenom ? `${f.mere_prenom} ${f.mere_nom || ''}`.trim() : '';
        if (pere && mere) parentName = `${pere} & ${mere}`;
        else if (pere) parentName = pere;
        else if (mere) parentName = mere;
        else parentName = `Famille ${p.enfants.code_parent || ''}`;
      } else if (parentUser) {
        parentName = `${parentUser.prenom} ${parentUser.nom}`;
      } else if (p.enfants?.code_parent) {
        parentName = `Famille ${p.enfants.code_parent}`;
      }

      famillesMap[pId] = { 
        id: pId, originalParentId: null, parent: parentName, telephone: '', expoToken: null, webPushSub: null,
        factures: [], resteAPayerRetard: 0, resteAPayerActuel: 0, aVerifier: 0, enfantsArray: [],
        epingle: isEpingle, familleId: p.enfants?.famille_id || null 
      };
    }

    if (currentParentId) famillesMap[pId].originalParentId = currentParentId;
    if (parentUser?.expo_push_token) famillesMap[pId].expoToken = parentUser.expo_push_token;
    if (parentUser?.web_push_sub) famillesMap[pId].webPushSub = parentUser.web_push_sub;
    if (parentUser?.telephone) famillesMap[pId].telephone = parentUser.telephone;

    const nomCompletEnfant = p.enfants ? `${(p.enfants.nom || '').toUpperCase()} ${p.enfants.prenom || ''}`.trim() : '';
    if (nomCompletEnfant && !famillesMap[pId].enfantsArray.includes(nomCompletEnfant)) {
      famillesMap[pId].enfantsArray.push(nomCompletEnfant);
    }

    famillesMap[pId].factures.push({ ...p, infoStatut: statutInfo });
    if (p.statut === 'en_verification') famillesMap[pId].aVerifier += 1;
    if (p.statut === 'en_attente') {
      if (statutInfo.code === 'retard') famillesMap[pId].resteAPayerRetard += Number(p.montant);
      else if (statutInfo.code === 'actuel' || statutInfo.code === 'extra') famillesMap[pId].resteAPayerActuel += Number(p.montant);
    }
  });

  const listeFamilles = Object.values(famillesMap)
    .filter(f => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      const parentMatch = f.parent.toLowerCase().includes(q);
      const codeMatch = String(f.codeFamille || f.id).toLowerCase().includes(q);
      const enfantMatch = f.enfantsArray.some(e => e.toLowerCase().includes(q));
      return parentMatch || codeMatch || enfantMatch;
    })
    .sort((a, b) => {
      if (a.epingle && !b.epingle) return -1;
      if (!a.epingle && b.epingle) return 1;
      return a.parent.localeCompare(b.parent);
    });

  listeFamilles.forEach(fam => {
    fam.factures.sort((a, b) => {
      const aIsInsc = a.type === 'inscription' || (a.titre || '').toLowerCase().includes("inscription");
      const bIsInsc = b.type === 'inscription' || (b.titre || '').toLowerCase().includes("inscription");
      if (aIsInsc && !bIsInsc) return -1;
      if (!aIsInsc && bIsInsc) return 1;

      const ordreA = ordreMoisScolaire[a.mois] || 99;
      const ordreB = ordreMoisScolaire[b.mois] || 99;
      if (ordreA !== ordreB) return ordreA - ordreB;

      return (a.titre || '').localeCompare(b.titre || '');
    });
  });

  useEffect(() => {
    if (familleSelectionnee) {
      const updated = listeFamilles.find(f => f.id === familleSelectionnee.id);
      if (updated) setFamilleSelectionnee(updated);
    }
  }, [paiements]);

  const executerRelanceGlobale = async (famillesEnRetard) => {
    setLoadingRelance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user.id;

      const messagesPush = [];
      const messagesDB = [];
      const webPushPromises = []; 

      famillesEnRetard.forEach(famille => {
        const totalRetard = famille.resteAPayerRetard;
        const texteRelance = `Bonjour, \nSauf erreur de notre part, nous vous informons que vous avez des factures en retard pour un montant total de ${totalRetard} Dhs.\n\nMerci de régulariser la situation au plus vite.\nLa Direction.`;

        if (famille.originalParentId) {
          messagesDB.push({ expediteur_id: adminId, destinataire_id: famille.originalParentId, texte: texteRelance });
          if (famille.expoToken) {
            messagesPush.push({ to: famille.expoToken, sound: 'default', priority: 'high', channelId: 'default', title: 'Rappel de Paiement ⚠️', body: `Retard de paiement de ${totalRetard} Dhs.`, data: { tab: 'factures' } });
          }
          if (famille.webPushSub) {
            try {
              const subObj = typeof famille.webPushSub === 'string' ? JSON.parse(famille.webPushSub) : famille.webPushSub;
              webPushPromises.push(supabase.functions.invoke('send-web-push', { body: { subscriptions: [subObj], payload: { title: 'Rappel ⚠️', body: `Retard de ${totalRetard} Dhs.`, data: { tab: 'factures' } } } }));
            } catch (e) {}
          }
        }
      });

      if (messagesDB.length > 0) await supabase.from('messages').insert(messagesDB);
      if (messagesPush.length > 0) {
        const apiUrli = (Platform.OS === 'web' && !__DEV__) ? '/api/expo-push' : 'https://exp.host/--/api/v2/push/send';
        await fetch(apiUrli, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(messagesPush) });
      }
      if (webPushPromises.length > 0) await Promise.all(webPushPromises);

      alert("Succès : Les relances ont bien été ajoutées !");
    } catch (error) { alert("Erreur : " + error.message); } finally { setLoadingRelance(false); }
  };

  const envoyerRelanceGlobale = () => {
    const famillesEnRetard = listeFamilles.filter(f => f.resteAPayerRetard > 0 && f.originalParentId);
    if (famillesEnRetard.length === 0) return alert("Aucun parent n'a de retard.");

    if (Platform.OS === 'web') {
      if (window.confirm(`Envoyer relance à ${famillesEnRetard.length} parent(s) ?`)) executerRelanceGlobale(famillesEnRetard);
    } else {
      Alert.alert("Envoyer ?", `Relancer ${famillesEnRetard.length} parent(s) ?`, [{ text: "Annuler", style: "cancel" }, { text: "Oui", onPress: () => executerRelanceGlobale(famillesEnRetard) }]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Gestion Financière</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity style={styles.refreshBtn} onPress={rafraichirDonnees} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#4F46E5" /> : <Text style={{ fontSize: 16 }}>🔄</Text>}
            </TouchableOpacity>
            
            <View style={styles.yearPickerWrapper}>
              <Picker selectedValue={anneeActive} onValueChange={(val) => setAnneeActive(val)} style={styles.pickerHeader}>
                <Picker.Item label="Toutes années" value="Toutes" />
                {anneesDisponibles.map(a => <Picker.Item key={a} label={a} value={a} />)}
              </Picker>
            </View>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher parent, enfant ou code..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'familles' && styles.tabActive]} onPress={() => setActiveTab('familles')}>
            <Text style={[styles.tabText, activeTab === 'familles' && styles.tabTextActive]}>Recettes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'depenses' && styles.tabActive]} onPress={() => setActiveTab('depenses')}>
            <Text style={[styles.tabText, activeTab === 'depenses' && styles.tabTextActive]}>Dépenses</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'bilan' && styles.tabActive]} onPress={() => setActiveTab('bilan')}>
            <Text style={[styles.tabText, activeTab === 'bilan' && styles.tabTextActive]}>Analyse</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'familles' && (
        <View style={{flex: 1}}>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, {borderColor: '#D8B4E2', backgroundColor: '#F9F1FA'}]}><Text style={[styles.statLabel, {color: '#8B5CF6'}]}>À Vérifier</Text><Text style={[styles.statValue, {color: '#8B5CF6'}]}>{totalVerification}</Text></View>
            <View style={[styles.statBox, {borderColor: '#FECACA', backgroundColor: '#FEF2F2'}]}><Text style={[styles.statLabel, {color: '#EF4444'}]}>Retards</Text><Text style={[styles.statValue, {color: '#EF4444'}]}>{totalEnRetard} Dhs</Text></View>
            <View style={[styles.statBox, {borderColor: '#FDE68A', backgroundColor: '#FFFBEB'}]}><Text style={[styles.statLabel, {color: '#F59E0B'}]}>Attente</Text><Text style={[styles.statValue, {color: '#F59E0B'}]}>{totalCeMois} Dhs</Text></View>
          </View>
          
          {totalEnRetard > 0 && (
            <TouchableOpacity style={styles.relanceGlobaleBtn} onPress={envoyerRelanceGlobale} disabled={loadingRelance}>
              {loadingRelance ? <ActivityIndicator color="#FFF" /> : <Text style={styles.relanceGlobaleText}>🔔 Relancer pour les retards</Text>}
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Dossiers des Familles</Text>
          {listeFamilles.length === 0 ? <Text style={styles.emptyText}>Aucune donnée.</Text> : (
            <FlatList 
              data={listeFamilles} 
              keyExtractor={item => item.id} 
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const aVerifier = item.aVerifier > 0;
                const aPayer = item.resteAPayerActuel > 0;
                return (
                  <View style={[styles.familyCard, aVerifier ? {borderLeftColor: '#8B5CF6'} : (item.resteAPayerRetard > 0) ? {borderLeftColor: '#EF4444'} : aPayer ? {borderLeftColor: '#F59E0B'} : {borderLeftColor: '#E2E8F0'}]}>
                    
                    {/* 🚀 BOUTON ÉPINGLE (PIN) EN HAUT À DROITE */}
                    <TouchableOpacity 
                      style={{ position: 'absolute', top: 12, right: 15, zIndex: 10, padding: 6 }} 
                      onPress={() => toggleEpingleFamille(item)}
                    >
                      <Text style={{ fontSize: 18 }}>{item.epingle ? '📌' : '📍'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.familyHeader} onPress={() => ouvrirModalFamille(item)}>
                      <View style={styles.avatarFamille}><Text style={{fontSize: 22}}>👨‍👩‍👧</Text></View>
                      <View style={{flex: 1, paddingRight: 25}}>
                        <Text style={styles.familyName}>👦 {item.enfantsArray.length > 0 ? item.enfantsArray.join(' / ') : 'Enfant Inconnu'}</Text>
                        <Text style={{fontSize: 13, color: '#475569', marginTop: 2, fontWeight: '600'}}>👤 Parent : {item.parent}</Text>
                        
                        {aVerifier ? <Text style={{color: '#8B5CF6', fontWeight: 'bold', fontSize: 13, marginTop: 4}}>👀 {item.aVerifier} à vérifier</Text> 
                        : item.resteAPayerRetard > 0 ? <Text style={styles.familyAlert}>⚠️ Retard: {item.resteAPayerRetard} Dhs</Text> 
                        : aPayer ? <Text style={{color: '#F59E0B', fontSize: 13, marginTop: 6, fontWeight: '700'}}>⏳ À payer: {item.resteAPayerActuel} Dhs</Text> 
                        : <Text style={styles.familySub}>À jour</Text>}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              }} 
              contentContainerStyle={styles.listContainer} 
            />
          )}
        </View>
      )}

      {activeTab === 'depenses' && (
        <View style={{flex: 1}}>
          <View style={{paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5}}>
            <TouchableOpacity style={styles.addDepenseBtn} onPress={() => setModalDepenseVisible(true)}>
              <Text style={styles.addDepenseText}>+ Ajouter un Salaire ou Dépense</Text>
            </TouchableOpacity>
          </View>
          <FlatList 
            data={depensesFiltres} 
            keyExtractor={item => item.id.toString()} 
            contentContainerStyle={styles.listContainer}
            renderItem={({item}) => (
              <View style={styles.depenseCard}>
                <View style={styles.depenseIcon}><Text style={{fontSize: 22}}>{item.categorie === 'salaire' ? '👩‍🏫' : item.categorie === 'vacances' ? '🏖️' : '🧾'}</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.depenseTitre}>{item.titre}</Text>
                  <Text style={styles.depenseDate}>{new Date(item.date_creation).toLocaleDateString()}</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={styles.depenseMontant}>- {item.montant} Dhs</Text>
                  <TouchableOpacity onPress={() => supprimerDepense(item.id)} style={{marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FEF2F2', borderRadius: 6}}>
                    <Text style={{color: '#EF4444', fontSize: 12, fontWeight: 'bold'}}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )} 
          />
        </View>
      )}

      {activeTab === 'bilan' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          
          <View style={styles.kpiContainer}>
            <View style={[styles.kpiCard, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
              <Text style={[styles.kpiTitle, { color: '#047857' }]}>Recettes</Text>
              <Text style={[styles.kpiValue, { color: '#10B981' }]}>+ {statsBilan.totalRecettesGlobal} <Text style={{fontSize:12}}>Dhs</Text></Text>
            </View>
            <View style={[styles.kpiCard, { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.kpiTitle, { color: '#B91C1C' }]}>Dépenses</Text>
              <Text style={[styles.kpiValue, { color: '#EF4444' }]}>- {statsBilan.totalDepensesGlobal} <Text style={{fontSize:12}}>Dhs</Text></Text>
            </View>
          </View>

          <View style={styles.kpiBeneficeCard}>
            <Text style={styles.kpiBeneficeTitle}>Bénéfice Net ({anneeActive})</Text>
            <Text style={[styles.kpiBeneficeValue, { color: statsBilan.beneficeGlobal >= 0 ? '#10B981' : '#EF4444' }]}>
              {statsBilan.beneficeGlobal > 0 ? '+' : ''}{statsBilan.beneficeGlobal} Dhs
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Évolution Mensuelle</Text>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor: '#10B981'}]} /><Text style={styles.legendText}>Recettes</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor: '#EF4444'}]} /><Text style={styles.legendText}>Dépenses</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScrollView}>
            <View style={styles.chartContainer}>
              {statsBilan.chartData.map((data, index) => {
                const hauteurRecette = (data.recettes / statsBilan.maxMontant) * 150;
                const hauteurDepense = (data.depenses / statsBilan.maxMontant) * 150;

                return (
                  <View key={index} style={styles.chartColumn}>
                    <View style={styles.barsWrapper}>
                      <View style={[styles.chartBar, { height: hauteurRecette, backgroundColor: '#10B981' }]} />
                      <View style={[styles.chartBar, { height: hauteurDepense, backgroundColor: '#EF4444' }]} />
                    </View>
                    <Text style={styles.chartMonthLabel}>{data.moisLabel}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <Text style={styles.sectionTitle}>Rapport par mois</Text>
          {statsBilan.chartData.map((item, index) => (
             item.recettes > 0 || item.depenses > 0 ? (
              <View key={index} style={styles.bilanCard}>
                <Text style={styles.bilanMois}>{item.moisComplet}</Text>
                <View style={styles.bilanRow}><Text style={styles.bilanLabel}>📈 Recettes :</Text><Text style={styles.bilanRecette}>+ {item.recettes} Dhs</Text></View>
                <View style={styles.bilanRow}><Text style={styles.bilanLabel}>📉 Dépenses :</Text><Text style={styles.bilanDepense}>- {item.depenses} Dhs</Text></View>
                <View style={[styles.bilanRowResult, {backgroundColor: item.benefice >= 0 ? '#ECFDF5' : '#FEF2F2'}]}>
                  <Text style={{fontWeight: '700', color: '#1E293B'}}>Bénéfice :</Text>
                  <Text style={{fontWeight: '900', fontSize: 16, color: item.benefice >= 0 ? '#10B981' : '#EF4444'}}>{item.benefice > 0 ? '+' : ''}{item.benefice} Dhs</Text>
                </View>
              </View>
             ) : null
          ))}
        </ScrollView>
      )}

      {/* MODAL AJOUT DÉPENSE */}
      <Modal visible={modalDepenseVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {paddingBottom: Platform.OS === 'ios' ? 40 : 20}]}>
              <Text style={styles.modalTitle}>Nouvelle Dépense</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Titre (Ex: Salaire Fatima...)</Text>
                <TextInput style={styles.input} value={titreDepense} onChangeText={setTitreDepense} placeholder="Titre..." />
                <Text style={styles.label}>Montant (Dhs)</Text>
                <TextInput style={styles.input} value={montantDepense} onChangeText={setMontantDepense} keyboardType="numeric" placeholder="0" />
                <Text style={styles.label}>Catégorie</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={categorieDepense} onValueChange={setCategorieDepense}>
                    <Picker.Item label="👩‍🏫 Salaire Nounou / Employé" value="salaire" />
                    <Picker.Item label="🧾 Frais Fixes (Loyer, Eau, Achat)" value="frais" />
                    <Picker.Item label="🏖️ Vacances / Événements" value="vacances" />
                  </Picker>
                </View>
              </ScrollView>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#94A3B8'}]} onPress={() => setModalDepenseVisible(false)}><Text style={styles.btnTextWhite}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity style={styles.payBtn} onPress={ajouterDepense}><Text style={styles.btnTextWhite}>Valider</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL FAMILLE FACTURES */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {height: '92%', paddingBottom: Platform.OS === 'ios' ? 40 : 20}]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitleFamille} numberOfLines={1}>{familleSelectionnee?.parent}</Text>
              <TouchableOpacity style={styles.closeBtnCircle} onPress={() => setModalVisible(false)}><Text style={{fontSize: 14}}>✖️</Text></TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.addFactureSpecialBtn} onPress={() => setModalAddFactureVisible(true)}>
              <Text style={styles.addFactureSpecialText}>+ Créer une facture exceptionnelle</Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} style={{marginTop: 5}}>
              
              {/* Factures en vérification */}
              {familleSelectionnee?.factures?.filter(f => f.statut === 'en_verification').map(item => (
                <View key={item.id} style={[styles.factureCard, {borderLeftColor: '#8B5CF6', backgroundColor: '#F9F5FF'}]}>
                  <View style={styles.factureHeader}>
                    <View style={{flex: 1, paddingRight: 10}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                        <View style={styles.badgeEnfant}><Text style={styles.badgeEnfantText}>👦 {item.enfants?.prenom || 'Inconnu'}</Text></View>
                        <Text style={{color: '#8B5CF6', fontWeight:'bold', fontSize: 11}}>À vérifier 👀</Text>
                      </View>
                      <Text style={styles.titreFacture}>{item.titre}</Text>
                    </View>
                    <Text style={[styles.montantFacture, {color: '#8B5CF6'}]}>{item.montant} Dhs</Text>
                  </View>
                  <TouchableOpacity style={styles.voirRecuBtn} onPress={() => Linking.openURL(item.recu_url)}>
                    <Text style={styles.voirRecuText}>👀 Afficher la preuve bancaire</Text>
                  </TouchableOpacity>
                  <View style={styles.actionsRowModal}>
                    <TouchableOpacity style={styles.validerRecuBtn} onPress={() => marquerCommePaye(item.id, 'Virement')}><Text style={styles.btnTextWhite}>✅ Valider (Virement)</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.rejeterRecuBtn} onPress={() => rejeterRecu(item.id)}><Text style={styles.btnTextWhite}>❌ Rejeter</Text></TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Factures en attente */}
              {familleSelectionnee?.factures?.filter(f => f.statut === 'en_attente').map(item => {
                const info = item.infoStatut;
                return (
                  <View key={item.id} style={[styles.factureCard, {borderLeftColor: info.color}]}>
                    <View style={styles.factureHeader}>
                      <View style={{flex: 1, paddingRight: 10}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                          <View style={styles.badgeEnfant}><Text style={styles.badgeEnfantText}>👦 {item.enfants?.prenom || 'Inconnu'}</Text></View>
                          <Text style={{color: info.color, fontWeight:'bold', fontSize: 11}}>{info.label}</Text>
                        </View>
                        <Text style={styles.titreFacture}>{item.titre}</Text>
                      </View>
                      <Text style={[styles.montantFacture, {color: info.color}]}>{item.montant} Dhs</Text>
                    </View>
                    <View style={styles.actionsRowModal}>
                      <TouchableOpacity style={styles.forcerPaiementBtn} onPress={() => preparerForcerPaiement(item)}>
                        <Text style={styles.btnTextWhite}>✅ Forcer paiement</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteFactureBtn} onPress={() => supprimerFacture(item.id)}>
                        <Text style={{fontSize: 16}}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Historique Payées avec Checkbox Multiple */}
              {familleSelectionnee?.factures?.filter(f => f.statut === 'paye').length > 0 && (
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10}}>
                  <Text style={[styles.sectionTitle, {marginHorizontal: 0, color: '#10B981'}]}>Historique réglé</Text>
                  <Text style={{fontSize: 12, color: '#64748B'}}>Cochez pour imprimer</Text>
                </View>
              )}

              {familleSelectionnee?.factures?.filter(f => f.statut === 'paye').map(item => {
                const isSelected = selectedForPrint.includes(item.id);
                return (
                  <View key={item.id} style={[styles.factureCard, {borderLeftColor: '#10B981', flexDirection: 'row', alignItems: 'center'}]}>
                    <TouchableOpacity style={styles.checkboxContainer} onPress={() => toggleSelectForPrint(item.id)}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <Text style={{color: 'white', fontWeight: 'bold', fontSize: 12}}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                    
                    <View style={{flex: 1}}>
                      <View style={styles.factureHeader}>
                        <View style={{flex: 1, paddingRight: 10}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                            <View style={[styles.badgeEnfant, {borderColor: '#A7F3D0', backgroundColor: '#ECFDF5'}]}>
                              <Text style={[styles.badgeEnfantText, {color: '#10B981'}]}>👦 {item.enfants?.prenom || 'Inconnu'}</Text>
                            </View>
                            <Text style={{color: '#10B981', fontWeight:'bold', fontSize: 11}}>Payé ({item.methode_paiement || 'Espèces'})</Text>
                          </View>
                          <Text style={styles.titreFacture}>{item.titre}</Text>
                        </View>
                        <Text style={[styles.montantFacture, {color: '#10B981'}]}>{item.montant} Dhs</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {selectedForPrint.length > 0 && (
              <TouchableOpacity style={styles.floatingPrintBtn} onPress={genererPDFSelection}>
                <Text style={styles.floatingPrintText}>🖨️ Imprimer Reçu Combiné ({selectedForPrint.length})</Text>
              </TouchableOpacity>
            )}

            {/* MODAL FORCE PAIEMENT METHODE */}
            {modalForcePaymentVisible && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, borderRadius: 30 }]}>
                <View style={[styles.modalContentSmall, {width: '90%'}]}>
                  <Text style={styles.modalTitleCenter}>Méthode de Paiement</Text>
                  <Text style={styles.labelDesc}>Comment ce paiement a-t-il été réglé ?</Text>
                  
                  <TouchableOpacity style={[styles.payBtnPrint, {backgroundColor: '#10B981'}]} onPress={() => marquerCommePaye(factureAForcer.id, 'Espèces')}>
                    <Text style={styles.btnTextWhite}>💵 Espèces</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={[styles.payBtnPrint, {backgroundColor: '#3B82F6', marginTop: 10}]} onPress={() => marquerCommePaye(factureAForcer.id, 'Chèque')}>
                    <Text style={styles.btnTextWhite}>✍️ Chèque</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.payBtnPrint, {backgroundColor: '#8B5CF6', marginTop: 10}]} onPress={() => marquerCommePaye(factureAForcer.id, 'Virement')}>
                    <Text style={styles.btnTextWhite}>🏦 Virement Bancaire</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={[styles.cancelBtn, {marginTop: 15}]} onPress={() => setModalForcePaymentVisible(false)}>
                    <Text style={styles.cancelBtnText}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL CRÉER FACTURE MANUELLE */}
      <Modal visible={modalAddFactureVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {height: '85%', paddingBottom: Platform.OS === 'ios' ? 40 : 20}]}>
              <Text style={styles.modalTitleCenter}>Créer une facture</Text>
              
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Pour quel enfant ?</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={factEnfantId} onValueChange={setFactEnfantId}>
                    {enfantsFamille.map(e => <Picker.Item key={e.id} label={e.prenom} value={e.id} />)}
                  </Picker>
                </View>

                <Text style={styles.label}>Type de Facturation</Text>
                <View style={{flexDirection: 'row', marginBottom: 15}}>
                  <TouchableOpacity style={[styles.typeBtn, factTypeSaisie === 'mensuel' && styles.typeBtnActive]} onPress={() => setFactTypeSaisie('mensuel')}>
                    <Text style={factTypeSaisie === 'mensuel' ? styles.typeBtnTextActive : styles.typeBtnText}>📅 Mensuelle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.typeBtn, factTypeSaisie === 'extra' && styles.typeBtnActive]} onPress={() => setFactTypeSaisie('extra')}>
                    <Text style={factTypeSaisie === 'extra' ? styles.typeBtnTextActive : styles.typeBtnText}>⭐ Extra</Text>
                  </TouchableOpacity>
                </View>

                {factTypeSaisie === 'mensuel' ? (
                  <>
                    <Text style={styles.label}>Service</Text>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={factService} onValueChange={setFactService}>
                        <Picker.Item label="Scolarité" value="Scolarité" />
                        <Picker.Item label="Cantine" value="Cantine" />
                        <Picker.Item label="Transport" value="Transport" />
                      </Picker>
                    </View>
                    <Text style={styles.label}>Mois concerné(s) - Sélectionnez un ou plusieurs</Text>
                    <View style={styles.moisGrid}>
                      {moisScolaires.map(m => {
                        const isSelected = selectedMoisList.includes(m);
                        return (
                          <TouchableOpacity 
                            key={m} 
                            style={[styles.moisChip, isSelected && styles.moisChipActive]} 
                            onPress={() => toggleMoisSelection(m)}
                          >
                            <Text style={[styles.moisChipText, isSelected && styles.moisChipTextActive]}>
                              {m.substring(0, 3)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Description (Titre)</Text>
                    <TextInput style={styles.input} placeholder="Ex: Garde spéciale..." placeholderTextColor="#94A3B8" value={factTitreExtra} onChangeText={setFactTitreExtra} />
                  </>
                )}

                <Text style={styles.label}>Montant à payer (Dhs)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#94A3B8" value={factMontant} onChangeText={setFactMontant} keyboardType="numeric" />
              </ScrollView>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#94A3B8'}]} onPress={() => setModalAddFactureVisible(false)}><Text style={styles.btnTextWhite}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#4F46E5'}]} onPress={validerAjoutFacture} disabled={loading}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Créer Facture</Text>}</TouchableOpacity>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerContainer: { backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'ios' ? 40 : 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 3, zIndex: 10, marginBottom: 10 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 15 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  refreshBtn: { backgroundColor: '#EEF2FF', width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  yearPickerWrapper: { flex: 1, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE', height: 36, justifyContent: 'center', minWidth: 140 },
  pickerHeader: { height: 36, color: '#4F46E5', fontWeight: 'bold' },
  
  searchRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 12, borderRadius: 10, height: 44, borderWidth: 1, borderColor: '#E2E8F0' },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#334155' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', marginHorizontal: 20, marginBottom: 20, borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { color: '#64748B', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#0F172A', fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  statBox: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: '900' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginHorizontal: 20, marginTop: 15, marginBottom: 10 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  emptyText: { textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', marginTop: 30 },
  familyCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderLeftWidth: 5, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2, flexDirection: 'row', alignItems: 'center' },
  familyHeader: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarFamille: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  familyName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  familySub: { fontSize: 12, color: '#10B981', marginTop: 6, fontWeight: '700' },
  familyAlert: { fontSize: 13, color: '#EF4444', marginTop: 6, fontWeight: '700' },
  addDepenseBtn: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 15, elevation: 4 },
  addDepenseText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  depenseCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  depenseIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  depenseTitre: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  depenseDate: { fontSize: 12, color: '#64748B', marginTop: 2 },
  depenseMontant: { fontSize: 16, fontWeight: '900', color: '#EF4444' },
  
  kpiContainer: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 10, justifyContent: 'space-between' },
  kpiCard: { flex: 0.48, padding: 20, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  kpiTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  kpiValue: { fontSize: 20, fontWeight: '900' },
  kpiBeneficeCard: { backgroundColor: '#F8FAFC', padding: 20, borderRadius: 16, marginHorizontal: 20, marginTop: 15, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  kpiBeneficeTitle: { fontSize: 16, color: '#475569', fontWeight: '800', marginBottom: 5 },
  kpiBeneficeValue: { fontSize: 28, fontWeight: '900' },

  chartLegend: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendText: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  
  chartScrollView: { marginHorizontal: 20, paddingBottom: 10 },
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 180, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 5 },
  chartColumn: { alignItems: 'center', width: 45, marginRight: 10 },
  barsWrapper: { flexDirection: 'row', alignItems: 'flex-end', height: 150 },
  chartBar: { width: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4, marginHorizontal: 2 },
  chartMonthLabel: { fontSize: 11, color: '#94A3B8', fontWeight: 'bold', marginTop: 8 },

  bilanCard: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginHorizontal: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 },
  bilanMois: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 15, textTransform: 'capitalize', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 10 },
  bilanRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  bilanLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  bilanRecette: { fontSize: 15, fontWeight: '700', color: '#10B981' },
  bilanDepense: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  bilanRowResult: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 16, borderRadius: 12, alignItems: 'center' },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContentSmall: { width: '100%', backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, elevation: 10 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitleFamille: { fontSize: 22, fontWeight: '800', color: '#0F172A', flex: 1 },
  closeBtnCircle: { backgroundColor: '#F1F5F9', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  modalTitleCenter: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 10, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  labelDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10, fontSize: 15, color: '#0F172A' },
  pickerContainer: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  typeBtn: { flex: 1, padding: 14, backgroundColor: '#F1F5F9', alignItems: 'center', borderRadius: 12, marginHorizontal: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  typeBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  typeBtnText: { color: '#475569', fontWeight: '600' },
  typeBtnTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  addFactureSpecialBtn: { backgroundColor: '#EEF2FF', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#C7D2FE' },
  addFactureSpecialText: { color: '#4F46E5', fontWeight: '700', fontSize: 14 },
  factureCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 6 },
  factureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  titreFacture: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  badgeEnfant: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#C7D2FE' },
  badgeEnfantText: { color: '#4F46E5', fontWeight: '800', fontSize: 11 },
  montantFacture: { fontSize: 18, fontWeight: '900' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  actionsRowModal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  payBtn: { flex: 1, backgroundColor: '#10B981', padding: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 4 },
  payBtnPrint: { backgroundColor: '#10B981', padding: 16, borderRadius: 12, alignItems: 'center' },
  forcerPaiementBtn: { flex: 2, backgroundColor: '#10B981', padding: 12, borderRadius: 12, alignItems: 'center', marginRight: 6 },
  deleteFactureBtn: { flex: 0.4, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  validerRecuBtn: { flex: 1.2, backgroundColor: '#10B981', padding: 12, borderRadius: 12, alignItems: 'center', marginRight: 5 },
  rejeterRecuBtn: { flex: 0.8, backgroundColor: '#EF4444', padding: 12, borderRadius: 12, alignItems: 'center', marginLeft: 5 },
  btnTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  voirRecuBtn: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#8B5CF6' },
  voirRecuText: { color: '#8B5CF6', fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { color: '#64748B', fontWeight: '700' },
  relanceGlobaleBtn: { backgroundColor: '#EF4444', marginHorizontal: 20, marginTop: 10, padding: 14, borderRadius: 12, alignItems: 'center', elevation: 4 },
  relanceGlobaleText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  
  checkboxContainer: { paddingRight: 15, justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
  floatingPrintBtn: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, shadowColor: '#4F46E5', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  floatingPrintText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  modalContentSmall: { width: '100%', backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, elevation: 10 },

  /* 🚀 STYLES POUR LA GRILLE DE MOIS MULTIPLES */
  moisGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  moisChip: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: '23%', alignItems: 'center', marginRight: '2%', marginBottom: 8 },
  moisChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  moisChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  moisChipTextActive: { color: '#FFFFFF', fontWeight: 'bold' }
});