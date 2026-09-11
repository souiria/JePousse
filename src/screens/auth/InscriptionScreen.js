import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabaseClient';

export default function InscriptionScreen({ navigation }) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeSuffix, setCodeSuffix] = useState('');
  const [remarquesMedicales, setRemarquesMedicales] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const handleInscription = async () => {
    if (!prenom || !nom || !email || !password || !codeSuffix) {
      alert("Veuillez remplir tous les champs obligatoires (*).");
      return;
    }
    if (password.length < 6) {
      alert("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!acceptTerms) {
      alert("Vous devez accepter le contrat et règlement pour continuer.");
      return;
    }
    
    setLoading(true);
    try {
      // 1. FORMATER LE CODE
      const codeNettoye = `FAM-${codeSuffix.trim().toUpperCase()}`;

      // 🚀 2. NOUVEAU : VÉRIFIER L'EXISTENCE DU CODE AVANT LA CRÉATION
      const { data: enfantsExistants, error: verifError } = await supabase
        .from('enfants')
        .select('id')
        .eq('code_parent', codeNettoye);

      if (verifError) throw new Error(verifError.message);

      // Si le code n'existe pas dans la base de données, on bloque l'inscription
      if (!enfantsExistants || enfantsExistants.length === 0) {
        alert(`Le code famille ${codeNettoye} est introuvable. Veuillez demander le bon code à la direction.`);
        setLoading(false);
        return; 
      }

      // 3. LE CODE EST VALIDE, ON CRÉE LE COMPTE
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: email.trim(), password: password });
      if (authError) throw new Error(authError.message);
      
      if (authData.user) {
        const userId = authData.user.id;
        
        // 4. INSERTION DE L'UTILISATEUR
        const { error: dbError } = await supabase.from('utilisateurs').insert([{ 
          id: userId, 
          email: email.trim(), 
          prenom: prenom.trim(), 
          nom: nom.trim(), 
          telephone: telephone.trim(), 
          role: 'parent' 
        }]);
        if (dbError) throw new Error(dbError.message);
        
        // 5. LIAISON AVEC LES ENFANTS
        const enfantsUpdateData = { parent_id: userId };
        if (remarquesMedicales.trim() !== '') enfantsUpdateData.remarques_medicales = remarquesMedicales;
        
        await supabase.from('enfants').update(enfantsUpdateData).eq('code_parent', codeNettoye);
        
        // 6. LIAISON AVEC LES PAIEMENTS
        const enfantIds = enfantsExistants.map(e => e.id); // On réutilise les IDs trouvés à l'étape 2
        await supabase.from('paiements').update({ parent_id: userId }).in('enfant_id', enfantIds);
        
        await supabase.auth.signOut();
        setIsSuccess(true);
      }
    } catch (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        alert("Un compte existe déjà avec cette adresse email. Veuillez vous connecter.");
      } else { 
        alert("Erreur : " + error.message); 
      }
    } finally { 
      setLoading(false); 
    }
  };

  // --- ÉCRAN DE SUCCÈS MODERNE ---
  if (isSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.containerSuccess}>
          <View style={styles.successIconCircle}>
            <Text style={styles.iconSuccess}>✅</Text>
          </View>
          <Text style={styles.titleSuccess}>Inscription réussie !</Text>
          <Text style={styles.textSuccess}>Votre compte a été créé avec succès.</Text>
          <Text style={styles.textSuccess}>Vos enfants et vos factures sont déjà liés à votre espace.</Text>
          <TouchableOpacity style={styles.buttonSuccess} onPress={() => navigation.replace('Login')}>
            <Text style={styles.buttonText}>Aller à la connexion</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Developped by A S © 2026</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- ÉCRAN D'INSCRIPTION ---
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer} 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            
            {/* EN-TÊTE */}
            <View style={styles.headerContainer}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoIcon}>🧸</Text>
              </View>
              <Text style={styles.title}>Rejoindre la crèche</Text>
              <Text style={styles.subtitle}>Créez votre Espace Famille</Text>
            </View>
            
            {/* FORMULAIRE */}
            <View style={styles.formContainer}>
              
              <View style={styles.codeContainer}>
                <Text style={styles.labelCode}>Code Famille *</Text>
                <Text style={styles.codeDesc}>Le code fourni par la direction</Text>
                <View style={styles.fixedPrefixContainer}>
                  <Text style={styles.fixedPrefixText}>FAM-</Text>
                  <TextInput 
                    style={styles.codeInput} 
                    placeholder="XXXX" 
                    placeholderTextColor="#94A3B8"
                    value={codeSuffix} 
                    onChangeText={setCodeSuffix} 
                    autoCapitalize="characters" 
                  />
                </View>
              </View>

              <Text style={styles.label}>Prénom du parent *</Text>
              <TextInput style={styles.input} placeholder="" placeholderTextColor="#94A3B8" value={prenom} onChangeText={setPrenom} />
              
              <Text style={styles.label}>Nom du parent *</Text>
              <TextInput style={styles.input} placeholder="" placeholderTextColor="#94A3B8" value={nom} onChangeText={setNom} />
              
              <Text style={styles.label}>Téléphone</Text>
              <TextInput style={styles.input} placeholder="" placeholderTextColor="#94A3B8" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
              
              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} placeholder="" placeholderTextColor="#94A3B8" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              
              <Text style={styles.label}>Mot de passe (6 caractères min.) *</Text>
              <TextInput style={styles.input} placeholder="Votre mot de passe" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} secureTextEntry />
              
              <Text style={styles.label}>Remarques médicales sur l'enfant</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                placeholder="Allergies, maladies, notes importantes... (Optionnel)" 
                placeholderTextColor="#94A3B8"
                value={remarquesMedicales} 
                onChangeText={setRemarquesMedicales} 
                multiline={true} 
                numberOfLines={3} 
              />
              
              <View style={styles.checkboxWrapper}>
                <TouchableOpacity 
                  style={[styles.checkbox, acceptTerms && styles.checkboxChecked]} 
                  onPress={() => setAcceptTerms(!acceptTerms)}
                >
                  {acceptTerms && <Text style={styles.checkboxIcon}>✓</Text>}
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>
                  J'accepte le{' '}
                  <Text style={styles.linkTextInline} onPress={() => setShowTermsModal(true)}>
                    contrat et règlement
                  </Text> *
                </Text>
              </View>

              <TouchableOpacity style={styles.button} onPress={handleInscription} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Créer mon compte</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
                <Text style={styles.linkText}>Déjà inscrit ? Se connecter</Text>
              </TouchableOpacity>

            </View>
          </View>

          {/* FOOTER SIGNATURE */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Developped by A S © 2026</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL CONTRAT ET REGLEMENT */}
      <Modal visible={showTermsModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Contrat et Règlement</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSectionTitle}>L'Application Mobile</Text>
              <Text style={styles.modalText}>
                L'Application mobile permet de vous communiquer toute l'information scolaire de votre enfant pour rester informé et vous aider à bien accompagner votre enfant.
              </Text>

              <Text style={styles.modalSectionTitle}>COLLECTE DES DONNÉES PERSONNELLES</Text>
              <Text style={styles.modalText}>Nous collectons les renseignements suivants :</Text>
              <Text style={styles.modalListItem}>• Nom / Prénom</Text>
              <Text style={styles.modalListItem}>• Adresse électronique</Text>
              <Text style={styles.modalListItem}>• Sexe</Text>
              <Text style={styles.modalListItem}>• Age / Date de naissance</Text>
              <Text style={styles.modalListItem}>• Photo</Text>
              <Text style={styles.modalListItem}>• Phone Number</Text>
              <Text style={styles.modalText}>
                Ces données personnelles sont recueillies suite à l'inscription de votre enfant et au remplissage de la fiche d'inscription par vos soins ou l'aide de l'agent d'inscription à l'école.
                Vos données ne sont en aucun cas transmises à d'autres parties tierces, nous n’utilisons pas de cookies pour réunir des informations vous concernant.
              </Text>

              <Text style={styles.modalSectionTitle}>FICHIERS JOURNAUX</Text>
              <Text style={styles.modalText}>
                Lorsque vous utilisez notre Application mobile, nous collectons et stockons des informations dans les fichiers journaux de nos serveurs. Cela comprend :
                Date de votre connexion, votre adresse IP. Des données relatives aux événements liés à l’appareil que vous utilisez, tels que plantages, activité du système, paramètres du matériel, type et langue de votre navigateur, date et heure de la requête et URL de provenance.
              </Text>

              <Text style={styles.modalSectionTitle}>DROIT D’OPPOSITION ET DE RETRAIT</Text>
              <Text style={styles.modalText}>
                Nous nous engageons à vous offrir un droit d’opposition et de retrait quant à vos renseignements personnels. Le droit d’opposition s’entend comme étant la possibilité offerte aux internautes de refuser que leurs renseignements personnels soient utilisés à certaines fins mentionnées lors de la collecte. Le droit de retrait s’entend comme étant la possibilité offerte aux internautes de demander à ce que leurs renseignements personnels ne figurent plus, par exemple, dans une liste de diffusion. Pour pouvoir exercer ces droits, vous pouvez nous contacter directement l'administration.
              </Text>

              <Text style={styles.modalSectionTitle}>DROIT D’ACCÈS</Text>
              <Text style={styles.modalText}>
                Nous nous engageons à reconnaître un droit d’accès et de rectification aux personnes concernées désireuses de consulter, modifier, voire radier les informations les concernant. Vous pouvez mettre à jour vos informations personnelles via votre application mobile comme vous pouvez le demander à votre conseiller/agent à l'administration de l'école.
              </Text>

              <Text style={styles.modalSectionTitle}>SÉCURITÉ</Text>
              <Text style={styles.modalText}>
                Les renseignements personnels que nous collectons sont conservés dans un environnement sécurisé. Les personnes travaillant pour nous sont tenues de respecter la confidentialité de vos informations. Pour assurer la sécurité de vos renseignements personnels, nous avons recours aux mesures suivantes :
              </Text>
              <Text style={styles.modalListItem}>• Protocole SSL (Secure Sockets Layer)</Text>
              <Text style={styles.modalListItem}>• Gestion des accès – personne autorisée</Text>
              <Text style={styles.modalListItem}>• Gestion des accès – personne concernée</Text>
              <Text style={styles.modalListItem}>• Logiciel de surveillance du réseau</Text>
              <Text style={styles.modalListItem}>• Sauvegarde informatique</Text>
              <Text style={styles.modalListItem}>• Développement de certificat numérique</Text>
              <Text style={styles.modalListItem}>• Identifiant / mot de passe</Text>
              <Text style={styles.modalListItem}>• Pare-feu (Firewalls)</Text>
              <Text style={styles.modalListItem}>• Hébergeur de données de santé agréé HDS ASIP santé</Text>
              <Text style={styles.modalText}>
                Nous nous engageons à maintenir un haut degré de confidentialité en intégrant les dernières innovations technologiques permettant d’assurer la confidentialité de vos données. Toutefois, comme aucun mécanisme n’offre une sécurité maximale, une part de risque est toujours présente lorsque l’on utilise Internet pour transmettre des renseignements personnels.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowTermsModal(false)}>
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoCircle: {
    width: 70,
    height: 70,
    backgroundColor: '#EEF2FF',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  logoIcon: {
    fontSize: 35,
  },
  title: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#0F172A', 
    textAlign: 'center', 
    marginBottom: 5,
    letterSpacing: -0.5,
  },
  subtitle: { 
    fontSize: 15, 
    color: '#64748B', 
    textAlign: 'center', 
  },
  formContainer: {
    width: '100%',
    paddingBottom: 20,
  },
  codeContainer: { 
    backgroundColor: '#EEF2FF', 
    padding: 20, 
    borderRadius: 16, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#C7D2FE',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  labelCode: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#4F46E5', 
    marginBottom: 4 
  },
  codeDesc: { 
    fontSize: 12, 
    color: '#6366F1', 
    marginBottom: 12, 
    fontStyle: 'italic' 
  },
  fixedPrefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A5B4FC',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  fixedPrefixText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4F46E5',
    letterSpacing: 2,
  },
  codeInput: { 
    flex: 1,
    backgroundColor: 'transparent', 
    fontWeight: 'bold', 
    fontSize: 18, 
    letterSpacing: 2, 
    paddingVertical: 16,
    color: '#334155',
  },
  label: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#334155', 
    marginBottom: 8, 
    marginTop: 10,
    marginLeft: 4,
  },
  input: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  textArea: { 
    minHeight: 100, 
    textAlignVertical: 'top',
    paddingTop: 16,
  }, 
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
  },
  checkboxIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
  },
  linkTextInline: {
    color: '#4F46E5',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  button: { 
    backgroundColor: '#4F46E5', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginTop: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: 16,
    letterSpacing: 0.5,
  },
  linkButton: { 
    marginTop: 25, 
    alignItems: 'center',
    paddingBottom: 20,
  },
  linkText: { 
    color: '#4F46E5', 
    fontWeight: '600', 
    fontSize: 15 
  },
  
  // -- STYLES SUCCÈS --
  containerSuccess: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
  },
  successIconCircle: {
    width: 100,
    height: 100,
    backgroundColor: '#D1FAE5',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
  },
  iconSuccess: { 
    fontSize: 50 
  },
  titleSuccess: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#059669',
    marginBottom: 15, 
    textAlign: 'center' 
  },
  textSuccess: { 
    fontSize: 16, 
    color: '#475569', 
    textAlign: 'center', 
    marginBottom: 8,
    lineHeight: 24,
  },
  buttonSuccess: { 
    backgroundColor: '#10B981', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginTop: 35, 
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  // -- MODAL --
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '85%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalScroll: {
    flex: 1,
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginTop: 15,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 10,
  },
  modalListItem: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 10,
    marginBottom: 4,
  },
  modalCloseButton: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#334155',
    fontWeight: 'bold',
    fontSize: 16,
  },

  // -- FOOTER --
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingTop: 10,
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  }
});