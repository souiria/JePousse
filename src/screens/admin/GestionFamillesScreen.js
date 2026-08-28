import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabaseClient';

const logoAssets = {
  jeupousse: require('../../../assets/images/jeupousse/icon.png'),
  demo: require('../../../assets/images/demo/icon.png'),
};

const themes = {
  jeupousse: { primary: '#E91E63', background: '#F8FAFC' },
  demo: { primary: '#2196F3', background: '#E3F2FD' }
};

export default function GestionFamillesScreen() {
  const [enfants, setEnfants] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingEnfantId, setEditingEnfantId] = useState(null);

  const [anneeActive, setAnneeActive] = useState('');
  const [anneeFiltre, setAnneeFiltre] = useState('');
  const [anneeInscription, setAnneeInscription] = useState('');
  const [anneesDisponibles, setAnneesDisponibles] = useState([]);

  const [showFilters, setShowFilters] = useState(false);
  const [filterSexe, setFilterSexe] = useState('Tous'); 
  const [filterAllergie, setFilterAllergie] = useState('Tous'); 
  const [filterClasse, setFilterClasse] = useState('Toutes'); 

  const [codeParent, setCodeParent] = useState(''); 
  const [familleTrouvee, setFamilleTrouvee] = useState(false); 
  const [nomsParentsExistant, setNomsParentsExistant] = useState(''); 
  
  const [situationMatrimoniale, setSituationMatrimoniale] = useState('Marie');
  const [mereNom, setMereNom] = useState(''); const [merePrenom, setMerePrenom] = useState('');
  const [mereProf, setMereProf] = useState(''); const [mereTel1, setMereTel1] = useState(''); const [mereTel2, setMereTel2] = useState('');
  const [pereNom, setPereNom] = useState(''); const [perePrenom, setPerePrenom] = useState('');
  const [pereProf, setPereProf] = useState(''); const [pereTel1, setPereTel1] = useState(''); const [pereTel2, setPereTel2] = useState('');
  const [auth1, setAuth1] = useState(''); const [auth2, setAuth2] = useState(''); const [auth3, setAuth3] = useState('');

  const [prenomEnfant, setPrenomEnfant] = useState('');
  const [nomEnfant, setNomEnfant] = useState('');
  const [dateNaissance, setDateNaissance] = useState(''); 
  const [showDatePicker, setShowDatePicker] = useState(false); 
  const [dateObj, setDateObj] = useState(new Date()); 
  const [lieuNaissance, setLieuNaissance] = useState(''); 
  const [adresse, setAdresse] = useState(''); 
  const [sexe, setSexe] = useState('Masculin');
  const [classeEnfant, setClasseEnfant] = useState('Crèche'); 
  const [photoUri, setPhotoUri] = useState(null);
  
  const [aAllergie, setAAllergie] = useState(false);
  const [detailsAllergie, setDetailsAllergie] = useState('');
  const [signesAgressivite, setSignesAgressivite] = useState([]);
  const [faitSieste, setFaitSieste] = useState(true);

  const [tarifInscription, setTarifInscription] = useState('');
  const [tarifMensuel, setTarifMensuel] = useState('');
  const [tarifGarde, setTarifGarde] = useState(''); 
  const [tarifCantine, setTarifCantine] = useState('');
  const [tarifTransport, setTarifTransport] = useState('');

  const listeSignes = ["Tape", "Mord", "Griffe", "Pousse", "Crache", "Autre"];

  const crecheId = Constants.expoConfig?.extra?.crecheId || 'jeupousse';
  const currentTheme = themes[crecheId] || themes.jeupousse;

  useEffect(() => { 
    initialiser(); 
  }, []);

  useEffect(() => {
    if (dateNaissance.length === 10 && anneeInscription) {
      const autoClasse = calculerClasse(dateNaissance, anneeInscription);
      if (autoClasse) setClasseEnfant(autoClasse);
    }
  }, [dateNaissance, anneeInscription]);

  const calculerClasse = (dateString, anneeSco) => {
    if (!dateString || dateString.length !== 10 || !anneeSco || !anneeSco.includes('-')) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const year = parseInt(parts[2], 10);

    const birthDate = new Date(year, month, day);
    if (isNaN(birthDate.getTime())) return null;

    const endYear = parseInt(anneeSco.split('-')[1], 10);
    const refDate = new Date(endYear, 2, 31);

    let ageInMonths = (refDate.getFullYear() - birthDate.getFullYear()) * 12;
    ageInMonths -= birthDate.getMonth();
    ageInMonths += refDate.getMonth();
    
    if (refDate.getDate() < birthDate.getDate()) {
      ageInMonths--;
    }

    if (ageInMonths < 24) return 'Crèche'; 
    if (ageInMonths >= 24 && ageInMonths < 36) return 'TPS'; 
    if (ageInMonths >= 36 && ageInMonths < 48) return 'PS'; 
    if (ageInMonths >= 48 && ageInMonths < 60) return 'MS'; 
    if (ageInMonths >= 60) return 'GS'; 
    
    return 'Crèche';
  };

  const initialiser = async () => {
    const anneesList = Array.from(new Array(6), (val, index) => {
      const year = new Date().getFullYear() - 2 + index;
      return `${year}-${year + 1}`;
    });
    setAnneesDisponibles(anneesList);

    const { data: paramData } = await supabase.from('parametres').select('valeur').eq('cle', 'annee_active').maybeSingle();
    const currentYear = paramData?.valeur || anneesList[2];
    
    setAnneeActive(currentYear);
    setAnneeFiltre(currentYear); 
    setAnneeInscription(currentYear); 

    chargerDonnees();
  };

  const chargerDonnees = async () => {
    try {
      const { data } = await supabase.from('enfants').select('*, familles(*)');
      if (data) setEnfants(data);
    } catch (error) {
      console.error("Erreur chargement:", error);
    }
  };

  const genererNouveauCode = () => 'FAM-' + Math.floor(1000 + Math.random() * 9000); 

  const rechercherFamille = async (code, skipPreFill = false) => {
    if (!code || code.length < 4) {
      setFamilleTrouvee(false);
      return;
    }
    const { data } = await supabase.from('familles').select('*').eq('code_parent', code.trim().toUpperCase()).maybeSingle();
    
    if (data) {
      setFamilleTrouvee(true);
      setNomsParentsExistant(`Parents : ${data.pere_prenom || ''} ${data.pere_nom || ''} & ${data.mere_prenom || ''} ${data.mere_nom || ''}`);
      
      if (!skipPreFill) {
        setMereNom(data.mere_nom || ''); setMerePrenom(data.mere_prenom || '');
        setMereProf(data.mere_profession || ''); setMereTel1(data.mere_tel1 || ''); setMereTel2(data.mere_tel2 || '');
        setPereNom(data.pere_nom || ''); setPerePrenom(data.pere_prenom || '');
        setPereProf(data.pere_profession || ''); setPereTel1(data.pere_tel1 || ''); setPereTel2(data.pere_tel2 || '');
        setSituationMatrimoniale(data.situation_matrimoniale || 'Marie');
        
        let authObj = {};
        try { authObj = JSON.parse(data.personnes_autorisees || '{}'); } catch(e){}
        setAuth1(authObj.auth1 || ''); setAuth2(authObj.auth2 || ''); setAuth3(authObj.auth3 || '');
      }
    } else {
      setFamilleTrouvee(false);
      setNomsParentsExistant('');
    }
  };

  const executerAnalyseGlobale = async () => {
    setLoading(true);
    try {
      const { data: allKids, error: kidsErr } = await supabase.from('enfants').select('*');
      if (kidsErr) throw kidsErr;

      const { data: allPayments, error: payErr } = await supabase.from('paiements').select('enfant_id');
      if (payErr) throw payErr;

      const kidsWithPayments = new Set(allPayments.map(p => p.enfant_id));
      const kidsMissingPayments = allKids.filter(k => 
        !kidsWithPayments.has(k.id) && 
        (k.tarif_inscription > 0 || k.tarif_mensuel > 0 || k.tarif_garde > 0 || k.tarif_cantine > 0 || k.tarif_transport > 0)
      );

      if (kidsMissingPayments.length === 0) {
        if (Platform.OS === 'web') window.alert("Tout est en ordre ! Aucun enfant n'a de facture manquante.");
        else Alert.alert("Tout est en ordre ✅", "Aucun enfant n'a de facture manquante dans la base.");
        setLoading(false);
        return;
      }

      const paiementsAGenerer = [];
      const moisScolaires = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];

      kidsMissingPayments.forEach(kid => {
        const annee = kid.annee_scolaire || anneeActive;
        const idDuParent = kid.parent_id;

        const addPaymentRow = (titre, montant, type, mois = null) => {
          if (montant > 0) {
            const row = { enfant_id: kid.id, titre, montant, type, statut: "en_attente" };
            if (idDuParent) row.parent_id = idDuParent;
            if (mois) row.mois = mois;
            paiementsAGenerer.push(row);
          }
        };

        addPaymentRow(`Frais d'inscription (${annee})`, kid.tarif_inscription, "inscription");
        
        moisScolaires.forEach(mois => {
          addPaymentRow(`Scolarité - ${mois} (${annee})`, kid.tarif_mensuel, 'scolarite', mois);
          addPaymentRow(`Garde - ${mois} (${annee})`, kid.tarif_garde, 'garde', mois);
          addPaymentRow(`Cantine - ${mois} (${annee})`, kid.tarif_cantine, 'cantine', mois);
          addPaymentRow(`Transport - ${mois} (${annee})`, kid.tarif_transport, 'transport', mois);
        });
      });

      if (paiementsAGenerer.length > 0) {
        const { error: insertErr } = await supabase.from('paiements').insert(paiementsAGenerer);
        if (insertErr) throw insertErr;
        
        const successMsg = `Réparation réussie ! 🎉\n\n${paiementsAGenerer.length} factures ont été générées pour ${kidsMissingPayments.length} enfant(s). Vous pouvez aller vérifier dans l'onglet Finance.`;
        if (Platform.OS === 'web') window.alert(successMsg);
        else Alert.alert("Réparation réussie", successMsg);
      }

    } catch (error) {
      if (Platform.OS === 'web') window.alert("Erreur: " + error.message);
      else Alert.alert("Erreur", error.message);
    } finally {
      setLoading(false);
    }
  };

  const synchroniserToutesLesFactures = () => {
    const message = "Cette fonction va scanner tous les enfants inscrits. Si l'application trouve un enfant avec des tarifs (Scolarité, Inscription...) mais AUCUNE facture, elle générera automatiquement toute l'année manquante.\n\nVoulez-vous lancer l'analyse ?";
    if (Platform.OS === 'web') {
      if (window.confirm(message)) executerAnalyseGlobale();
    } else {
      Alert.alert("Scanner les factures manquantes 🔍", message, [
        { text: "Annuler", style: "cancel" },
        { text: "Lancer l'analyse", onPress: executerAnalyseGlobale }
      ]);
    }
  };

  const genererFacturesManuellementEnfant = async () => {
    if (!editingEnfantId) return;

    const executer = async () => {
      setLoading(true);
      try {
        const { data: currentKid } = await supabase.from('enfants').select('parent_id').eq('id', editingEnfantId).single();
        const idDuParent = currentKid?.parent_id;

        const paiementsAGenerer = [];
        const addPaymentRow = (titre, montant, type, mois = null) => {
          if (montant > 0) {
            const row = { enfant_id: editingEnfantId, titre, montant, type, statut: "en_attente" };
            if (idDuParent) row.parent_id = idDuParent;
            if (mois) row.mois = mois;
            paiementsAGenerer.push(row);
          }
        };

        addPaymentRow(`Frais d'inscription (${anneeInscription})`, parseTarif(tarifInscription), "inscription");

        const moisScolaires = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];
        moisScolaires.forEach(mois => {
          addPaymentRow(`Scolarité - ${mois} (${anneeInscription})`, parseTarif(tarifMensuel), 'scolarite', mois);
          addPaymentRow(`Garde - ${mois} (${anneeInscription})`, parseTarif(tarifGarde), 'garde', mois);
          addPaymentRow(`Cantine - ${mois} (${anneeInscription})`, parseTarif(tarifCantine), 'cantine', mois);
          addPaymentRow(`Transport - ${mois} (${anneeInscription})`, parseTarif(tarifTransport), 'transport', mois);
        });

        if (paiementsAGenerer.length > 0) {
          const { error } = await supabase.from('paiements').insert(paiementsAGenerer);
          if (error) throw error;
          
          if (Platform.OS === 'web') window.alert("Les factures ont été générées !");
          else Alert.alert("Succès", "Les factures ont été générées !");
          
          setModalVisible(false);
        } else {
          if (Platform.OS === 'web') window.alert("Aucun tarif supérieur à 0 n'a été saisi.");
          else Alert.alert("Info", "Aucun tarif supérieur à 0 n'a été saisi.");
        }
      } catch (error) {
        if (Platform.OS === 'web') window.alert("Erreur: " + error.message);
        else Alert.alert("Erreur", error.message);
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Générer la facture d'inscription et les 11 mensualités pour cet enfant en fonction des tarifs saisis ?")) executer();
    } else {
      Alert.alert(
        "Générer les factures ?",
        "Cela va créer la facture d'inscription et les 11 mensualités.\n⚠️ Ne cliquez pas si elles ont déjà été générées pour éviter les doublons.",
        [ { text: "Annuler", style: "cancel" }, { text: "Générer", onPress: executer } ]
      );
    }
  };

  const choisirPhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsEditing: true, 
      aspect: [1, 1],
      quality: 0.6,
      base64: true
    });
    
    if (!result.canceled) {
      const fileSize = result.assets[0].base64?.length * (3/4) / 1024 / 1024;
      if (fileSize > 2) {
        Alert.alert("Image trop grande", "Veuillez choisir une image plus petite.");
        return;
      }
      setPhotoUri(result.assets[0].uri);
    }
  };

  const toggleSigne = (signe) => {
    setSignesAgressivite(prev => prev.includes(signe) ? prev.filter(s => s !== signe) : [...prev, signe]);
  };

  const onChangeDate = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDateObj(selectedDate);
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      setDateNaissance(`${day}/${month}/${year}`);
    }
  };

  const ouvrirModalAjoutGlobal = () => {
    setIsEditing(false); setEditingEnfantId(null);
    const newCode = genererNouveauCode();
    setCodeParent(newCode); 
    setFamilleTrouvee(false);
    setAnneeInscription(anneeActive); 
    
    setPrenomEnfant(''); setNomEnfant(''); setDateNaissance(''); setDateObj(new Date()); setLieuNaissance(''); setAdresse(''); setSexe('Masculin'); setClasseEnfant('Crèche'); setPhotoUri(null);
    setMereNom(''); setMerePrenom(''); setMereProf(''); setMereTel1(''); setMereTel2('');
    setPereNom(''); setPerePrenom(''); setPereProf(''); setPereTel1(''); setPereTel2(''); setSituationMatrimoniale('Marie');
    setAuth1(''); setAuth2(''); setAuth3('');
    setAAllergie(false); setDetailsAllergie(''); setSignesAgressivite([]); setFaitSieste(true);
    setTarifInscription(''); setTarifMensuel(''); setTarifGarde(''); setTarifCantine(''); setTarifTransport('');
    setModalVisible(true);
  };

  const abrirModalAjoutPourFamilleExistant = (codeExistant) => {
    setIsEditing(false); setEditingEnfantId(null);
    const codeFormat = codeExistant.trim().toUpperCase();
    setCodeParent(codeFormat);
    rechercherFamille(codeFormat); 
    setAnneeInscription(anneeActive); 
    
    setPrenomEnfant(''); setNomEnfant(''); setDateNaissance(''); setDateObj(new Date()); setLieuNaissance(''); setAdresse(''); setSexe('Masculin'); setClasseEnfant('Crèche'); setPhotoUri(null);
    setAAllergie(false); setDetailsAllergie(''); setSignesAgressivite([]); setFaitSieste(true);
    setTarifInscription(''); setTarifMensuel(''); setTarifGarde(''); setTarifCantine(''); setTarifTransport('');
    setModalVisible(true);
  };

  const editerEnfant = (enfant) => {
    setIsEditing(true); setEditingEnfantId(enfant.id);
    const code = enfant.code_parent || enfant.familles?.code_parent || genererNouveauCode();
    setCodeParent(code);
    rechercherFamille(code, true); 
    
    setAnneeInscription(enfant.annee_scolaire || anneeActive);
    setPrenomEnfant(enfant.prenom); setNomEnfant(enfant.nom); 
    
    if (enfant.date_naissance) {
      if (enfant.date_naissance.includes('-')) {
        const [y, m, d] = enfant.date_naissance.split('-');
        setDateNaissance(`${d}/${m}/${y}`);
        setDateObj(new Date(y, m - 1, d));
      } else if (enfant.date_naissance.includes('/')) {
        setDateNaissance(enfant.date_naissance);
        const parts = enfant.date_naissance.split('/');
        setDateObj(new Date(parts[2], parts[1] - 1, parts[0]));
      }
    } else {
      setDateNaissance('');
      setDateObj(new Date());
    }

    setLieuNaissance(enfant.lieu_naissance || ''); setAdresse(enfant.adresse || ''); 
    setSexe(enfant.sexe || 'Masculin'); setClasseEnfant(enfant.classe || 'Crèche');
    setPhotoUri(enfant.photo_url || null);
    setAAllergie(enfant.a_allergie || false); setDetailsAllergie(enfant.details_allergie || '');
    setSignesAgressivite(enfant.signes_agressivite ? enfant.signes_agressivite.split(', ') : []);
    setFaitSieste(enfant.fait_sieste !== false);
    setTarifInscription(enfant.tarif_inscription?.toString() || '0'); 
    setTarifMensuel(enfant.tarif_mensuel?.toString() || '0');
    setTarifGarde(enfant.tarif_garde?.toString() || '0'); 
    setTarifCantine(enfant.tarif_cantine?.toString() || '0'); 
    setTarifTransport(enfant.tarif_transport?.toString() || '0');

    if (enfant.familles) {
      setMereNom(enfant.familles.mere_nom || ''); setMerePrenom(enfant.familles.mere_prenom || '');
      setMereProf(enfant.familles.mere_profession || ''); setMereTel1(enfant.familles.mere_tel1 || ''); setMereTel2(enfant.familles.mere_tel2 || '');
      setPereNom(enfant.familles.pere_nom || ''); setPerePrenom(enfant.familles.pere_prenom || '');
      setPereProf(enfant.familles.pere_profession || ''); setPereTel1(enfant.familles.pere_tel1 || ''); setPereTel2(enfant.familles.pere_tel2 || '');
      setSituationMatrimoniale(enfant.familles.situation_matrimoniale || 'Marie');
      
      let authObj = {};
      try { authObj = JSON.parse(enfant.familles.personnes_autorisees || '{}'); } catch(e){}
      setAuth1(authObj.auth1 || ''); setAuth2(authObj.auth2 || ''); setAuth3(authObj.auth3 || '');
    }
    
    setModalVisible(true);
  };

  const parseTarif = (val) => {
    if (!val) return 0;
    const cleaned = val.toString().replace(/\s/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  const sauvegarderEnfant = async () => {
    if (!prenomEnfant || !nomEnfant || !codeParent || !anneeInscription) {
      if (Platform.OS === 'web') window.alert("Veuillez remplir le prénom, le nom, l'année et le Code Famille.");
      else Alert.alert("Erreur", "Veuillez remplir le prénom, le nom, l'année et le Code Famille.");
      return;
    }
    setLoading(true);

    try {
      const codeFormat = codeParent.trim().toUpperCase();
      let familleId;

      const { data: existingFam } = await supabase.from('familles').select('id').eq('code_parent', codeFormat).maybeSingle();

      const familleData = {
        code_parent: codeFormat, situation_matrimoniale: situationMatrimoniale,
        mere_nom: mereNom, mere_prenom: merePrenom, mere_profession: mereProf, mere_tel1: mereTel1, mere_tel2: mereTel2,
        pere_nom: pereNom, pere_prenom: perePrenom, pere_profession: pereProf, pere_tel1: pereTel1, pere_tel2: pereTel2,
        personnes_autorisees: JSON.stringify({auth1, auth2, auth3})
      };

      if (existingFam) {
        familleId = existingFam.id;
        await supabase.from('familles').update(familleData).eq('id', familleId);
      } else {
        const { data: newFam, error: famErr } = await supabase.from('familles').insert([familleData]).select().single();
        if (famErr) throw famErr;
        familleId = newFam.id;
      }

      let idDuParent = null;

      if (isEditing) {
        const { data: currentKid } = await supabase.from('enfants').select('parent_id').eq('id', editingEnfantId).single();
        if (currentKid?.parent_id) idDuParent = currentKid.parent_id;
      }

      if (!idDuParent) {
        const { data: sibling } = await supabase
          .from('enfants')
          .select('parent_id')
          .eq('code_parent', codeFormat)
          .not('parent_id', 'is', null)
          .limit(1)
          .maybeSingle();
        
        if (sibling?.parent_id) idDuParent = sibling.parent_id;
      }

      if (!idDuParent) {
        const { data: compteParent } = await supabase
          .from('utilisateurs')
          .select('id')
          .eq('code_parent', codeFormat)
          .maybeSingle();
          
        if (compteParent?.id) idDuParent = compteParent.id;
      }

      let photoUrlFinale = photoUri;
      if (photoUri && !photoUri.startsWith('http')) {
        const response = await fetch(photoUri);
        const blob = await response.blob();
        const fileName = `${Date.now()}_${prenomEnfant}.jpg`;
        await supabase.storage.from('photos_enfants').upload(fileName, blob);
        const { data: urlData } = supabase.storage.from('photos_enfants').getPublicUrl(fileName);
        photoUrlFinale = urlData.publicUrl;
      }

      let dateNaissanceDB = null;
      if (dateNaissance && dateNaissance.includes('/')) {
        const [d, m, y] = dateNaissance.split('/');
        dateNaissanceDB = `${y}-${m}-${d}`;
      }

      const enfantData = {
        famille_id: familleId, 
        code_parent: codeFormat,
        parent_id: idDuParent,
        annee_scolaire: anneeInscription, 
        prenom: prenomEnfant, 
        nom: nomEnfant, 
        date_naissance: dateNaissanceDB,
        lieu_naissance: lieuNaissance || null, 
        adresse: adresse || null, 
        sexe: sexe,
        classe: classeEnfant,
        photo_url: photoUrlFinale || null,
        a_allergie: aAllergie, 
        details_allergie: aAllergie ? detailsAllergie : null,
        signes_agressivite: signesAgressivite.length > 0 ? signesAgressivite.join(', ') : null,
        fait_sieste: faitSieste,
        tarif_inscription: parseTarif(tarifInscription),
        tarif_mensuel: parseTarif(tarifMensuel),
        tarif_garde: parseTarif(tarifGarde), 
        tarif_cantine: parseTarif(tarifCantine),
        tarif_transport: parseTarif(tarifTransport)
      };

      if (isEditing) {
        await supabase.from('enfants').update(enfantData).eq('id', editingEnfantId);
        if (Platform.OS === 'web') window.alert("Profil et famille mis à jour !");
        else Alert.alert("Succès", "Profil et famille mis à jour !");
      } else {
        const { data: newKid, error: kidErr } = await supabase.from('enfants').insert([enfantData]).select();
        if (kidErr) throw kidErr;
        
        const newKidId = newKid[0].id;
        const paiementsAGenerer = [];

        const addPaymentRow = (titre, montant, type, mois = null) => {
          if (montant > 0) {
            const row = { enfant_id: newKidId, titre, montant, type, statut: "en_attente" };
            if (idDuParent) row.parent_id = idDuParent;
            if (mois) row.mois = mois;
            paiementsAGenerer.push(row);
          }
        };

        addPaymentRow(`Frais d'inscription (${anneeInscription})`, enfantData.tarif_inscription, "inscription");

        const moisScolaires = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet'];
        moisScolaires.forEach(mois => {
          addPaymentRow(`Scolarité - ${mois} (${anneeInscription})`, enfantData.tarif_mensuel, 'scolarite', mois);
          addPaymentRow(`Garde - ${mois} (${anneeInscription})`, enfantData.tarif_garde, 'garde', mois);
          addPaymentRow(`Cantine - ${mois} (${anneeInscription})`, enfantData.tarif_cantine, 'cantine', mois);
          addPaymentRow(`Transport - ${mois} (${anneeInscription})`, enfantData.tarif_transport, 'transport', mois);
        });

        if (paiementsAGenerer.length > 0) {
          const { error: payErr } = await supabase.from('paiements').insert(paiementsAGenerer);
          if (payErr) {
            console.error("Erreur génération paiements:", payErr);
            throw new Error("L'enfant a été créé mais la génération des factures a échoué : " + payErr.message);
          }
        }
        
        let msgSucces = `Enfant inscrit pour l'année ${anneeInscription} avec succès !\nCode : ${codeFormat}`;
        if (idDuParent) {
          msgSucces += `\n\n✅ Le profil a hérité du compte parent existant et sera visible immédiatement sur son application.`;
        } else {
          msgSucces += `\n\n⏳ Attente Parent : L'enfant sera lié au téléphone du parent lorsque ce dernier créera son compte avec ce code.`;
        }

        if (Platform.OS === 'web') window.alert(msgSucces);
        else Alert.alert("Succès", msgSucces);
      }

      setModalVisible(false);
      chargerDonnees();
    } catch (error) { 
      if (Platform.OS === 'web') window.alert("Erreur: " + error.message);
      else Alert.alert("Erreur", error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  const demanderSuppressionFamille = (codeParent) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Voulez-vous vraiment supprimer la famille ${codeParent} et tous ses enfants ? Cette action est irréversible.`)) {
        executerSuppressionFamille(codeParent);
      }
    } else {
      Alert.alert(
        "Supprimer la famille",
        `Voulez-vous vraiment supprimer la famille ${codeParent} et tous ses enfants ? Cette action est irréversible.`,
        [
          { text: "Annuler", style: "cancel" },
          { text: "Supprimer", style: "destructive", onPress: () => executerSuppressionFamille(codeParent) }
        ]
      );
    }
  };

  const executerSuppressionFamille = async (codeParent) => {
    setLoading(true);
    try {
      const { data: kids } = await supabase.from('enfants').select('id').eq('code_parent', codeParent);
      if (kids && kids.length > 0) {
        const kidIds = kids.map(k => k.id);
        await supabase.from('paiements').delete().in('enfant_id', kidIds);
      }

      await supabase.from('enfants').delete().eq('code_parent', codeParent);

      const { error: errFamille } = await supabase.from('familles').delete().eq('code_parent', codeParent);
      if (errFamille) throw errFamille;

      if (Platform.OS === 'web') window.alert("Famille supprimée avec succès.");
      else Alert.alert("Succès", "Famille supprimée avec succès.");
      
      chargerDonnees();
    } catch (error) {
      console.error("Erreur suppression:", error);
      if (Platform.OS === 'web') window.alert("Erreur lors de la suppression : " + error.message);
      else Alert.alert("Erreur", "Erreur lors de la suppression : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exporterVersExcel = async () => {
    try {
      const donneesExport = [];
      
      listeFamilles.forEach(famille => {
        famille.enfants_a_afficher?.forEach(enfant => {
          let dateExcel = enfant.date_naissance || '';
          if (dateExcel.includes('-')) {
            dateExcel = dateExcel.split('-').reverse().join('/');
          }

          donneesExport.push({
            "Code Famille": famille.code_parent,
            "Nom Maman": famille.mere_nom || '',
            "Prénom Maman": famille.mere_prenom || '',
            "Téléphone Maman": famille.mere_tel1 || '',
            "Nom Papa": famille.pere_nom || '',
            "Prénom Papa": famille.pere_prenom || '',
            "Téléphone Papa": famille.pere_tel1 || '',
            "Situation": famille.situation_matrimoniale || '',
            "Prénom Enfant": enfant.prenom || '',
            "Nom Enfant": enfant.nom || '',
            "Année Scolaire": enfant.annee_scolaire || '',
            "Date de Naissance": dateExcel,
            "Sexe": enfant.sexe || '',
            "Classe": enfant.classe || 'Non classé',
            "Allergie": enfant.a_allergie ? `Oui (${enfant.details_allergie})` : 'Non',
            "Tarif Mensuel": enfant.tarif_mensuel || 0
          });
        });
      });

      if (donneesExport.length === 0) {
        if (Platform.OS === 'web') return window.alert("Aucune donnée à exporter pour cette sélection.");
        else return Alert.alert("Vide", "Aucune donnée à exporter pour cette sélection.");
      }

      const ws = XLSX.utils.json_to_sheet(donneesExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Familles & Enfants");

      if (Platform.OS === 'web') {
        XLSX.writeFile(wb, `Liste_Familles_${anneeFiltre !== 'Toutes' ? anneeFiltre : 'Global'}.xlsx`);
      } else {
        const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const fileUri = FileSystem.documentDirectory + `Liste_Familles_${anneeFiltre !== 'Toutes' ? anneeFiltre : 'Global'}.xlsx`;
        
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Exporter la liste des familles'
          });
        } else {
          Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
        }
      }
    } catch (error) {
      console.error(error);
      if (Platform.OS === 'web') window.alert("Erreur lors de l'exportation : " + error.message);
      else Alert.alert("Erreur", "Erreur lors de l'exportation : " + error.message);
    }
  };

  const famillesGroupees = {};
  enfants.forEach(enfant => {
    const code = enfant.code_parent || 'SANS-CODE';
    if (!famillesGroupees[code]) {
      famillesGroupees[code] = { 
        code_parent: code, 
        enfants: [],
        pere_nom: '', pere_prenom: '', mere_nom: '', mere_prenom: '',
        mere_tel1: '', pere_tel1: '', situation_matrimoniale: '', personnes_autorisees: '{}'
      };
    }

    const fam = enfant.familles;
    if (fam) {
      if (fam.pere_nom) famillesGroupees[code].pere_nom = fam.pere_nom;
      if (fam.pere_prenom) famillesGroupees[code].pere_prenom = fam.pere_prenom;
      if (fam.mere_nom) famillesGroupees[code].mere_nom = fam.mere_nom;
      if (fam.mere_prenom) famillesGroupees[code].mere_prenom = fam.mere_prenom;
      if (fam.mere_tel1) famillesGroupees[code].mere_tel1 = fam.mere_tel1;
      if (fam.pere_tel1) famillesGroupees[code].pere_tel1 = fam.pere_tel1;
      if (fam.situation_matrimoniale) famillesGroupees[code].situation_matrimoniale = fam.situation_matrimoniale;
      if (fam.personnes_autorisees) famillesGroupees[code].personnes_autorisees = fam.personnes_autorisees;
    }

    famillesGroupees[code].enfants.push(enfant);
  });
  
  const classCounts = { Toutes: 0, Crèche: 0, TPS: 0, PS: 0, MS: 0, GS: 0 };
  
  enfants.forEach(e => {
    let matchAnnee = (anneeFiltre === 'Toutes' || !anneeFiltre) ? true : e.annee_scolaire === anneeFiltre;
    let matchAllergie = filterAllergie === 'Tous' ? true : (filterAllergie === 'Oui' ? e.a_allergie : !e.a_allergie);
    let matchSexe = filterSexe === 'Tous' ? true : e.sexe === filterSexe;
    
    if (matchAnnee && matchAllergie && matchSexe) {
      classCounts.Toutes++;
      const c = e.classe || 'Crèche';
      if (classCounts[c] !== undefined) {
        classCounts[c]++;
      }
    }
  });

  const listeFamilles = Object.values(famillesGroupees).map(famille => {
    const enfantsFiltres = famille.enfants.filter(e => {
      let matchAnnee = (anneeFiltre === 'Toutes' || !anneeFiltre) ? true : e.annee_scolaire === anneeFiltre;
      let matchAllergie = filterAllergie === 'Tous' ? true : (filterAllergie === 'Oui' ? e.a_allergie : !e.a_allergie);
      let matchSexe = filterSexe === 'Tous' ? true : e.sexe === filterSexe;
      let matchClasse = filterClasse === 'Toutes' ? true : e.classe === filterClasse;
      
      return matchAnnee && matchAllergie && matchSexe && matchClasse;
    });
    return { ...famille, enfants_a_afficher: enfantsFiltres };
  }).filter(f => {
    if (f.enfants_a_afficher.length === 0) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const pereFull = `${f.pere_prenom || ''} ${f.pere_nom || ''}`.toLowerCase();
    const mereFull = `${f.mere_prenom || ''} ${f.mere_nom || ''}`.toLowerCase();
    const codeStr = (f.code_parent || '').toLowerCase();

    const matchParent = codeStr.includes(query) || pereFull.includes(query) || mereFull.includes(query);

    const matchEnfant = f.enfants_a_afficher.some(e => {
      const enfantFull = `${e.prenom || ''} ${e.nom || ''}`.toLowerCase();
      return enfantFull.includes(query);
    });

    return matchParent || matchEnfant;
  });

  const getAnneeSuivante = (anneeStr) => {
    if (!anneeStr) return '';
    const parts = anneeStr.split('-');
    if (parts.length === 2) {
      return `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
    }
    return '';
  };
  const anneeSuivantePossible = getAnneeSuivante(anneeActive);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      
      <View style={styles.topSection}>
        {/* 🚀 BARRE DE RECHERCHE DÉPLACÉE TOUT EN HAUT */}
        <View style={[styles.searchRow, { marginBottom: 12 }]}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput 
              style={styles.searchInput} 
              placeholder="Rechercher un parent ou un enfant..." 
              placeholderTextColor="#94A3B8" 
              value={searchQuery} 
              onChangeText={setSearchQuery} 
            />
          </View>
          <TouchableOpacity 
            style={[styles.actionBtn, showFilters && styles.actionBtnActive]} 
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={styles.actionBtnIcon}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.excelBtn} onPress={exporterVersExcel}>
            <Text style={styles.actionBtnIcon}>📥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.magicBtn} onPress={synchroniserToutesLesFactures} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#F59E0B" /> : <Text style={styles.actionBtnIcon}>🛠️</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.topRow, { marginBottom: 0 }]}>
          <Text style={styles.mainTitle}>Familles</Text>
          <View style={styles.yearPickerContainerInline}>
            <Picker
              selectedValue={anneeFiltre}
              onValueChange={(val) => setAnneeFiltre(val)}
              style={[styles.pickerCompactInline, { color: currentTheme.primary }]}
            >
              {anneesDisponibles.map(a => <Picker.Item key={a} label={a} value={a} />)}
              <Picker.Item label="Toutes" value="Toutes" />
            </Picker>
          </View>
          <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: currentTheme.primary }]} onPress={ouvrirModalAjoutGlobal}>
            <Text style={styles.addBtnIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterTitle}>Paramètres supplémentaires</Text>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Sexe :</Text>
            <View style={styles.pillsRow}>
              {['Tous', 'Masculin', 'Féminin'].map(opt => (
                <TouchableOpacity key={opt} style={[styles.filterPill, filterSexe === opt && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFilterSexe(opt)}>
                  <Text style={[styles.filterPillText, filterSexe === opt && styles.filterPillTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Classe :</Text>
            <View style={[styles.pillsRow, { flexWrap: 'wrap' }]}>
              {['Toutes', 'Crèche', 'TPS', 'PS', 'MS', 'GS'].map(opt => (
                <TouchableOpacity key={opt} style={[styles.filterPill, filterClasse === opt && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }], {marginBottom: 5}]} onPress={() => setFilterClasse(opt)}>
                  <Text style={[styles.filterPillText, filterClasse === opt && styles.filterPillTextActive]}>
                    {opt} ({classCounts[opt] || 0})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Allergie :</Text>
            <View style={styles.pillsRow}>
              {['Tous', 'Oui', 'Non'].map(opt => (
                <TouchableOpacity key={opt} style={[styles.filterPill, filterAllergie === opt && [styles.filterPillActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFilterAllergie(opt)}>
                  <Text style={[styles.filterPillText, filterAllergie === opt && styles.filterPillTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {listeFamilles.map((famille, index) => {
          const hasParentsInfo = famille.pere_nom || famille.mere_nom;
          
          let auth1List = '', auth2List = '', auth3List = '';
          try {
            const authObj = JSON.parse(famille.personnes_autorisees);
            auth1List = authObj.auth1 || '';
            auth2List = authObj.auth2 || '';
            auth3List = authObj.auth3 || '';
          } catch(e){}
          const aDesAutorises = auth1List || auth2List || auth3List;

          return (
            <View key={index} style={[styles.card, { borderLeftColor: currentTheme.primary }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.familleTitle}>Famille : <Text style={[styles.codeText, { color: currentTheme.primary }]}>{famille.code_parent}</Text></Text>
                    {hasParentsInfo ? (
                      <Text style={styles.parentsNamesText}>
                        {famille.pere_prenom} {famille.pere_nom} & {famille.mere_prenom} {famille.mere_nom}
                      </Text>
                    ) : null}
                    <Text style={styles.parentLinkedText}>👨‍👩‍👧‍👦 {famille.enfants_a_afficher?.length || 0} enfant(s) dans cette sélection</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={styles.addKidSmallBtn} onPress={() => abrirModalAjoutPourFamilleExistant(famille.code_parent)}>
                      <Text style={[styles.addKidSmallBtnText, { color: currentTheme.primary }]}>+ Enfant</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteFamilyBtn} onPress={() => demanderSuppressionFamille(famille.code_parent)}>
                      <Text style={styles.deleteFamilyBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.enfantsGrid}>
                {famille.enfants_a_afficher?.map(enfant => {
                  let dateAffichage = enfant.date_naissance || 'Non renseigné';
                  if (dateAffichage.includes('-')) {
                    dateAffichage = dateAffichage.split('-').reverse().join('/');
                  }

                  return (
                    <View key={enfant.id} style={[styles.enfantChip, enfant.a_allergie && styles.enfantChipAllergie]}>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        {enfant.photo_url ? <Image source={{ uri: enfant.photo_url }} style={styles.enfantPhoto} /> : <View style={styles.enfantPhotoPlaceholder}><Text style={{fontSize: 20}}>👦</Text></View>}
                        <View style={styles.enfantInfo}>
                          <Text style={styles.enfantText}>{enfant.prenom} {enfant.nom}</Text>
                          <Text style={styles.enfantYearText}>🎓 {enfant.annee_scolaire || 'Non définie'} • 🏫 {enfant.classe || 'Non classé'}</Text>
                          <Text style={{fontSize: 12, color: '#64748B', marginTop: 2}}>🎂 Né(e) le : {dateAffichage}</Text>
                          {enfant.a_allergie && <Text style={styles.alerteTextList}>⚠️ Allergie : {enfant.details_allergie}</Text>}
                        </View>
                        <TouchableOpacity style={styles.editIconBtn} onPress={() => editerEnfant(enfant)}><Text>✏️</Text></TouchableOpacity>
                      </View>
                      
                      <View style={styles.authBox}>
                        <Text style={styles.authBoxTitle}>🚗 Autorisés à récupérer l'enfant :</Text>
                        {aDesAutorises ? (
                          <>
                            {auth1List ? <Text style={styles.authItem}>• {auth1List}</Text> : null}
                            {auth2List ? <Text style={styles.authItem}>• {auth2List}</Text> : null}
                            {auth3List ? <Text style={styles.authItem}>• {auth3List}</Text> : null}
                          </>
                        ) : (
                          <Text style={styles.authEmpty}>Aucune autre personne renseignée.</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
        <View style={styles.footer}><Text style={styles.footerText}>Developped by Abderrahim S © 2026</Text></View>
      </ScrollView>

      {/* MODAL INSCRIPTION/ÉDITION */}
      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
            <Text style={styles.formHeader}>{isEditing ? "Modifier le dossier" : "Nouvelle Inscription"}</Text>

            <Text style={[styles.sectionHeader, { color: currentTheme.primary }]}>1. Code de Liaison Famille</Text>
            <Text style={styles.labelDesc}>Tapez un code existant pour lier un frère/sœur.</Text>
            <TextInput style={[styles.minimalInput, styles.codeInput, { color: currentTheme.primary }]} value={codeParent} onChangeText={(t) => {setCodeParent(t); rechercherFamille(t);}} autoCapitalize="characters" placeholder="FAM-XXXX" />
            
            {familleTrouvee && (
              <View style={styles.successBox}>
                <Text style={styles.successText}>✅ Famille reconnue {isEditing ? "(Dossier existant)" : "- Liaison automatique"}.</Text>
                <Text style={styles.successSubText}>{nomsParentsExistant}</Text>
              </View>
            )}

            <Text style={[styles.sectionHeader, { color: currentTheme.primary }]}>2. Informations Enfant</Text>
            <TouchableOpacity style={styles.photoButton} onPress={choisirPhoto}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : <Text style={styles.photoButtonText}>📸 Photo</Text>}
            </TouchableOpacity>

            <Text style={styles.label}>Année d'inscription</Text>
            <View style={styles.minimalPicker}>
              <Picker selectedValue={anneeInscription} onValueChange={setAnneeInscription}>
                <Picker.Item label={anneeActive ? `Année en cours (${anneeActive})` : "Année en cours"} value={anneeActive} />
                {anneeSuivantePossible ? (
                  <Picker.Item label={`Année prochaine (${anneeSuivantePossible})`} value={anneeSuivantePossible} />
                ) : null}
              </Picker>
            </View>

            <View style={styles.row}>
              <View style={styles.halfInput}><Text style={styles.label}>Prénom</Text><TextInput style={styles.minimalInput} value={prenomEnfant} onChangeText={setPrenomEnfant} /></View>
              <View style={styles.halfInput}><Text style={styles.label}>Nom</Text><TextInput style={styles.minimalInput} value={nomEnfant} onChangeText={setNomEnfant} /></View>
            </View>
            
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Né(e) le</Text>
                {Platform.OS === 'web' ? (
                  <input 
                    type="date"
                    value={dateNaissance ? dateNaissance.split('/').reverse().join('-') : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if(val) {
                        const [y, m, d] = val.split('-');
                        setDateNaissance(`${d}/${m}/${y}`);
                        setDateObj(new Date(y, m - 1, d));
                      } else {
                        setDateNaissance('');
                      }
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '13px', 
                      borderRadius: '10px', 
                      border: '1px solid #E5E7EB', 
                      backgroundColor: '#F9FAFB', 
                      fontSize: '15px', 
                      color: '#111827',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                ) : (
                  <TouchableOpacity 
                    style={[styles.minimalInput, { height: 48, justifyContent: 'center' }]} 
                    onPress={() => setShowDatePicker(!showDatePicker)}
                  >
                    <Text style={{ color: dateNaissance ? '#111827' : '#94A3B8', fontSize: 15 }}>
                      {dateNaissance || "JJ/MM/AAAA"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Lieu</Text>
                <TextInput style={styles.minimalInput} value={lieuNaissance} onChangeText={setLieuNaissance} />
              </View>
            </View>

            {showDatePicker && Platform.OS === 'ios' && (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 10, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: currentTheme.primary, fontWeight: 'bold', fontSize: 16, padding: 12 }}>OK</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={dateObj}
                  mode="date"
                  display="spinner"
                  onChange={onChangeDate}
                  maximumDate={new Date()}
                />
              </View>
            )}

            <Text style={styles.label}>Adresse</Text>
            <TextInput style={styles.minimalInput} value={adresse} onChangeText={setAdresse} />
            
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Sexe</Text>
                <View style={styles.minimalPicker}>
                  <Picker selectedValue={sexe} onValueChange={setSexe}>
                    <Picker.Item label="👦 Masculin" value="Masculin" />
                    <Picker.Item label="👧 Féminin" value="Féminin" />
                  </Picker>
                </View>
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Classe</Text>
                <View style={styles.minimalPicker}>
                  <Picker selectedValue={classeEnfant} onValueChange={setClasseEnfant}>
                    <Picker.Item label="Crèche (< 2 ans)" value="Crèche" />
                    <Picker.Item label="TPS (2 - 3 ans)" value="TPS" />
                    <Picker.Item label="PS (3 - 4 ans)" value="PS" />
                    <Picker.Item label="MS (4 - 5 ans)" value="MS" />
                    <Picker.Item label="GS (5 - 6 ans)" value="GS" />
                  </Picker>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionHeader, { color: currentTheme.primary }]}>3. Santé & Habitudes</Text>
            <Text style={styles.label}>L'enfant a-t-il une allergie ?</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggleBtn, aAllergie === true && styles.toggleBtnDanger]} onPress={() => setAAllergie(true)}><Text style={[styles.toggleBtnText, aAllergie === true && styles.toggleBtnTextActive]}>Oui</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, aAllergie === false && [styles.toggleBtnActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => {setAAllergie(false); setDetailsAllergie('');}}><Text style={[styles.toggleBtnText, aAllergie === false && styles.toggleBtnTextActive]}>Non</Text></TouchableOpacity>
            </View>
            {aAllergie && <TextInput style={[styles.minimalInput, {borderColor: '#EF4444'}]} value={detailsAllergie} onChangeText={setDetailsAllergie} placeholder="Précisez l'allergie..." />}
            
            <Text style={styles.label}>L'enfant fait-il la sieste ?</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggleBtn, faitSieste === true && [styles.toggleBtnActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFaitSieste(true)}><Text style={[styles.toggleBtnText, faitSieste === true && styles.toggleBtnTextActive]}>Oui</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, faitSieste === false && [styles.toggleBtnActive, { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary }]]} onPress={() => setFaitSieste(false)}><Text style={[styles.toggleBtnText, faitSieste === false && styles.toggleBtnTextActive]}>Non</Text></TouchableOpacity>
            </View>

            <Text style={styles.label}>Signes d'agressivité (Cochez si applicable) :</Text>
            <View style={styles.checklistContainer}>
              {listeSignes.map(signe => (
                <TouchableOpacity key={signe} style={[styles.checkItem, signesAgressivite.includes(signe) && [styles.checkItemActive, { borderColor: currentTheme.primary }]]} onPress={() => toggleSigne(signe)}>
                  <Text style={signesAgressivite.includes(signe) ? [styles.checkItemTextActive, { color: currentTheme.primary }] : styles.checkItemText}>{signesAgressivite.includes(signe) ? "✅ " : "⬜ "}{signe}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View>
              <Text style={[styles.sectionHeader, { color: currentTheme.primary }]}>4. Parents & Contacts</Text>
              <Text style={styles.label}>Situation Matrimoniale</Text>
              <View style={styles.minimalPicker}>
                <Picker selectedValue={situationMatrimoniale} onValueChange={setSituationMatrimoniale}>
                  <Picker.Item label="Mariés" value="Marie" />
                  <Picker.Item label="Divorcés" value="Divorce" />
                  <Picker.Item label="Célibataire" value="Celibataire" />
                </Picker>
              </View>

              <Text style={styles.labelSub}>👤 MAMAN</Text>
              <View style={styles.row}>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Nom" value={mereNom} onChangeText={setMereNom} /></View>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Prénom" value={merePrenom} onChangeText={setMerePrenom} /></View>
              </View>
              <TextInput style={styles.minimalInput} placeholder="Profession" value={mereProf} onChangeText={setMereProf} />
              <View style={styles.row}>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Téléphone 1" value={mereTel1} onChangeText={setMereTel1} keyboardType="phone-pad" /></View>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Téléphone 2" value={mereTel2} onChangeText={setMereTel2} keyboardType="phone-pad" /></View>
              </View>

              <Text style={styles.labelSub}>👤 PAPA</Text>
              <View style={styles.row}>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Nom" value={pereNom} onChangeText={setPereNom} /></View>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Prénom" value={perePrenom} onChangeText={setPerePrenom} /></View>
              </View>
              <TextInput style={styles.minimalInput} placeholder="Profession" value={pereProf} onChangeText={setPereProf} />
              <View style={styles.row}>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Téléphone 1" value={pereTel1} onChangeText={setPereTel1} keyboardType="phone-pad" /></View>
                <View style={styles.halfInput}><TextInput style={styles.minimalInput} placeholder="Téléphone 2" value={pereTel2} onChangeText={setPereTel2} keyboardType="phone-pad" /></View>
              </View>

              <Text style={styles.labelSub}>🚗 AUTRES PERSONNES AUTORISÉES</Text>
              <TextInput style={styles.minimalInput} placeholder="1er : Nom complet - CIN" value={auth1} onChangeText={setAuth1} />
              <TextInput style={styles.minimalInput} placeholder="2ème : Nom complet - CIN" value={auth2} onChangeText={setAuth2} />
              <TextInput style={styles.minimalInput} placeholder="3ème : Nom complet - CIN" value={auth3} onChangeText={setAuth3} />
            </View>

            <Text style={[styles.sectionHeader, { color: currentTheme.primary }]}>5. Tarification Mensuelle</Text>
            <View style={styles.priceRow}><Text style={styles.labelPrice}>Inscription (1x)</Text><TextInput style={styles.priceInput} value={tarifInscription} onChangeText={setTarifInscription} keyboardType="numeric" placeholder="0" /></View>
            <View style={styles.priceRow}><Text style={styles.labelPrice}>Scolarité</Text><TextInput style={styles.priceInput} value={tarifMensuel} onChangeText={setTarifMensuel} keyboardType="numeric" placeholder="0" /></View>
            <View style={styles.priceRow}><Text style={styles.labelPrice}>Garde</Text><TextInput style={styles.priceInput} value={tarifGarde} onChangeText={setTarifGarde} keyboardType="numeric" placeholder="0" /></View>
            <View style={styles.priceRow}><Text style={styles.labelPrice}>Cantine</Text><TextInput style={styles.priceInput} value={tarifCantine} onChangeText={setTarifCantine} keyboardType="numeric" placeholder="0" /></View>
            <View style={styles.priceRow}><Text style={styles.labelPrice}>Transport</Text><TextInput style={styles.priceInput} value={tarifTransport} onChangeText={setTarifTransport} keyboardType="numeric" placeholder="0" /></View>

            {isEditing && (
              <TouchableOpacity 
                style={{ backgroundColor: '#EEF2FF', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE', marginTop: 15, alignItems: 'center' }} 
                onPress={genererFacturesManuellementEnfant}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#4F46E5" /> : <Text style={{ color: '#4F46E5', fontWeight: 'bold', fontSize: 15 }}>⚙️ Générer les factures de l'année</Text>}
              </TouchableOpacity>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: currentTheme.primary }]} onPress={sauvegarderEnfant} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>

      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display="default"
          onChange={onChangeDate}
          maximumDate={new Date()}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  topSection: { backgroundColor: '#FFFFFF', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  mainTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginRight: 10 },
  yearPickerContainerInline: { flex: 1, backgroundColor: '#EEF2FF', borderRadius: 8, height: 38, justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  pickerCompactInline: { height: 38, fontWeight: 'bold' },
  addBtnSmall: { width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  addBtnIcon: { fontSize: 22, color: '#FFFFFF', fontWeight: 'bold', lineHeight: 24 },

  searchRow: { flexDirection: 'row', gap: 8 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 12, borderRadius: 8, height: 40, borderWidth: 1, borderColor: '#E2E8F0' },
  searchIcon: { fontSize: 14, marginRight: 6 }, 
  searchInput: { flex: 1, fontSize: 13, color: '#334155' },
  
  actionBtn: { width: 40, height: 40, backgroundColor: '#F8FAFC', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  actionBtnIcon: { fontSize: 16 },
  excelBtn: { width: 40, height: 40, backgroundColor: '#F0FDF4', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#86EFAC' },
  magicBtn: { width: 40, height: 40, backgroundColor: '#FFFBEB', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A' },

  filtersPanel: { backgroundColor: '#FFFFFF', marginHorizontal: 15, marginBottom: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 },
  filterTitle: { fontSize: 13, fontWeight: 'bold', color: '#0F172A', marginBottom: 8 },
  filterGroup: { marginBottom: 10 },
  filterLabel: { fontSize: 12, color: '#64748B', marginBottom: 6, fontStyle: 'italic', fontWeight: '600' },
  pillsRow: { flexDirection: 'row', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterPillActive: { },
  filterPillText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterPillTextActive: { color: '#FFFFFF' },

  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 6, elevation: 2 },
  
  cardHeader: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 12, marginBottom: 15 },
  cardHeaderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  familleTitle: { fontSize: 15, fontWeight: '700', color: '#475569' },
  codeText: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  parentsNamesText: { fontSize: 13, color: '#475569', fontWeight: '600', marginTop: 3 },
  parentLinkedText: { fontSize: 13, color: '#64748B', marginTop: 6, fontWeight: '700' },
  
  addKidSmallBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  addKidSmallBtnText: { fontSize: 13, fontWeight: '800' },

  deleteFamilyBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  deleteFamilyBtnText: { fontSize: 13 },

  enfantsGrid: { flexDirection: 'column' },
  enfantChip: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, flexDirection: 'column', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  enfantChipAllergie: { borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  enfantPhoto: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  enfantPhotoPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  enfantInfo: { flex: 1 }, 
  enfantText: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  enfantYearText: { fontSize: 13, color: '#8B5CF6', fontWeight: '700', marginTop: 2 },
  alerteTextList: { fontSize: 12, color: '#EF4444', fontWeight: 'bold', marginTop: 2 },
  editIconBtn: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },

  authBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  authBoxTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  authItem: { fontSize: 13, color: '#334155', fontWeight: '600', marginBottom: 2, paddingLeft: 5 },
  authEmpty: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', paddingLeft: 5 },

  formContainer: { padding: 24, paddingBottom: 50 },
  formHeader: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 10, textAlign: 'center' },
  sectionHeader: { fontSize: 16, fontWeight: '800', marginTop: 30, marginBottom: 15, borderBottomWidth: 2, borderBottomColor: '#EEF2FF', paddingBottom: 5 },
  labelSub: { fontSize: 13, fontWeight: '800', color: '#64748B', marginTop: 15, marginBottom: 8, letterSpacing: 1 },
  labelDesc: { fontSize: 12, color: '#64748B', marginBottom: 12, fontStyle: 'italic' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 8 },
  
  successBox: { backgroundColor: '#ECFDF5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#10B981', marginBottom: 15 },
  successText: { color: '#059669', fontWeight: 'bold', fontSize: 14 },
  successSubText: { color: '#047857', fontSize: 12, marginTop: 4 },

  minimalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  codeInput: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC', fontWeight: '900', fontSize: 20, textAlign: 'center', letterSpacing: 2 },
  minimalPicker: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, marginBottom: 12 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  
  photoButton: { alignSelf: 'center', marginBottom: 10, marginTop: 10, backgroundColor: '#F1F5F9', borderRadius: 50, width: 100, height: 100, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  photoButtonText: { textAlign: 'center', color: '#6B7280', fontSize: 13, fontWeight: '600' }, 
  photoPreview: { width: '100%', height: '100%' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  toggleBtn: { flex: 1, backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  toggleBtnActive: { },
  toggleBtnDanger: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  toggleBtnText: { color: '#6B7280', fontWeight: 'bold' },
  toggleBtnTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  
  checklistContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5, marginBottom: 15 },
  checkItem: { backgroundColor: '#F3F4F6', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, margin: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  checkItemActive: { backgroundColor: '#EEF2FF' },
  checkItemText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  checkItemTextActive: { fontSize: 13, fontWeight: '800' },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 10, marginTop: 8 },
  labelPrice: { fontSize: 14, fontWeight: '700', color: '#374151', flex: 1 },
  priceInput: { backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8, width: 90, textAlign: 'center', fontWeight: '800', color: '#111827' },

  buttonRow: { flexDirection: 'row', marginTop: 35, gap: 12 },
  saveBtn: { flex: 1.5, padding: 16, borderRadius: 12, alignItems: 'center', elevation: 2 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  cancelBtnText: { color: '#4B5563', fontWeight: '700', fontSize: 16 },

  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' }
});