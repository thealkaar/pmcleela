import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl } from '../config';

const formatYearShort = (val) => {
  if (!val) return '1st';
  const str = String(val).toLowerCase();
  if (str.includes('1')) return '1st';
  if (str.includes('2')) return '2nd';
  if (str.includes('3')) return '3rd';
  if (str.includes('4')) return '4th';
  return val;
};

export default function MeProfileScreen({
  currentUser,
  onUpdateCurrentUser,
  onLogout,
  serverHost,
  onDeleteAccount
}) {
  const [showEditPersonaModal, setShowEditPersonaModal] = useState(false);
  const [newPersona, setNewPersona] = useState(currentUser?.anonymousName || 'Hostel Senior');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pick Custom Avatar Photo
  const handlePickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Gallery access is needed to select an avatar.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        onUpdateCurrentUser({
          ...currentUser,
          avatarUri: res.assets[0].uri
        });
      }
    } catch (err) {
      console.log('Avatar pick error:', err);
    }
  };

  const handleSavePersona = async () => {
    if (!newPersona.trim()) return;
    const trimmed = newPersona.trim();
    const updated = {
      ...currentUser,
      anonymousName: trimmed
    };
    onUpdateCurrentUser(updated);
    setShowEditPersonaModal(false);

    try {
      await fetch(`${getBaseUrl(serverHost)}/api/auth/update-persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.id,
          newAnonymousName: trimmed
        })
      });
    } catch (err) {
      console.log('Update persona sync error:', err.message);
    }

    Alert.alert('Updated', 'Your anonymous persona name has been updated.');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'Are you sure you want to permanently delete your account? This will remove ALL your data including reels, chats, and profile. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              '🚨 Final Confirmation',
              `This will permanently delete the account "${currentUser?.anonymousName || 'your account'}" and all associated reels & data from the server. Are you absolutely sure?`,
              [
                { text: 'No, Keep My Account', style: 'cancel' },
                {
                  text: 'Delete Permanently',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setIsDeleting(true);
                      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/delete-account`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser?.id })
                      });
                      const data = await res.json();
                      if (data.success) {
                        setShowSettingsModal(false);
                        setIsDeleting(false);
                        // Immediately reset user session so app returns to Login screen
                        onDeleteAccount();
                        Alert.alert(
                          'Account Deleted',
                          'Your account and all associated data have been permanently removed.'
                        );
                        return;
                      } else {
                        Alert.alert('Error', data.message || 'Could not delete account. Please try again.');
                      }
                    } catch (err) {
                      console.log('Delete account error:', err);
                      Alert.alert('Connection Error', 'Could not reach the server. Please check your connection and try again.');
                    } finally {
                      setIsDeleting(false);
                      setShowSettingsModal(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Profile Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Student Profile</Text>
        <TouchableOpacity style={styles.settingsIcon} onPress={() => setShowSettingsModal(true)}>
          <Ionicons name="settings-outline" size={22} color="#cbd5e1" />
        </TouchableOpacity>
      </View>

      {/* Avatar with Glow & Edit Badge */}
      <View style={styles.avatarSection}>
        <TouchableOpacity activeOpacity={0.85} onPress={handlePickAvatar} style={styles.avatarWrapper}>
          {currentUser?.avatarUri || currentUser?.avatarUrl ? (
            <Image source={{ uri: currentUser.avatarUri || currentUser.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={44} color="#94a3b8" />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.displayName}>{currentUser?.anonymousName || 'Campus Scholar'}</Text>
        
        {/* Academic Year Seniority Badge */}
        <View style={styles.seniorityRow}>
          <Ionicons name="school" size={13} color="#f472b6" />
          <Text style={styles.seniorityText}>
            {formatYearShort(currentUser?.academicYear)} • {currentUser?.gender === 'female' ? 'Girl' : 'Boy'}
          </Text>
        </View>

        <Text style={styles.anonymousTag}>Visible Persona in PMC & Leela</Text>
        
        {/* Verified Badge & Gender Tag */}
        <View style={styles.badgeRow}>
          <View style={styles.verifiedPill}>
            <Ionicons name="checkmark-circle" size={14} color="#10b981" />
            <Text style={styles.verifiedText}>{currentUser?.email || 'scholar@stu.manit.ac.in'}</Text>
          </View>

          <View style={styles.genderPill}>
            {currentUser?.gender === 'female' ? (
              <View style={styles.greenDot} />
            ) : (
              <View style={styles.redDot} />
            )}
            <Text style={styles.genderPillText}>
              {currentUser?.gender === 'female' ? 'Girl' : 'Boy'}
            </Text>
          </View>
        </View>
      </View>

      {/* Real Student Identity (Private Shield) */}
      <View style={styles.privateCard}>
        <View style={styles.privateHeaderRow}>
          <Ionicons name="shield-checkmark" size={18} color="#10b981" />
          <Text style={styles.privateHeaderTitle}> MANIT Identity (Confidential)</Text>
        </View>
        
        <View style={styles.privateDetailRow}>
          <Text style={styles.privateLabel}>Student Name:</Text>
          <Text style={styles.privateValue}>{currentUser?.fullName || 'MANIT Student'}</Text>
        </View>
        
        {currentUser?.scholarNo ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>Scholar Number:</Text>
            <Text style={styles.privateValue}>{currentUser.scholarNo}</Text>
          </View>
        ) : null}

        {currentUser?.academicYear ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>College Year:</Text>
            <Text style={[styles.privateValue, { color: '#38bdf8' }]}>
              {formatYearShort(currentUser.academicYear)}
            </Text>
          </View>
        ) : null}

        {currentUser?.phone ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>Phone Number:</Text>
            <Text style={styles.privateValue}>{currentUser.phone}</Text>
          </View>
        ) : null}

        <View style={styles.privateDivider} />
        <Text style={styles.privateFooterNote}>
          🔒 <Text style={{ fontWeight: '700', color: '#34d399' }}>Privacy Guarantee:</Text> Your real name, phone, and scholar number are strictly stored for campus authenticity & safety. They are never revealed to other students.
        </Text>
      </View>

      {/* Campus Identity Details */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionHeader}>Campus Persona Settings</Text>

        {/* Change Anonymous Persona */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            setNewPersona(currentUser?.anonymousName || 'Hostel Senior');
            setShowEditPersonaModal(true);
          }}
          activeOpacity={0.8}
        >
          <View style={styles.menuIconBox}>
            <Ionicons name="pencil" size={16} color="#ec4899" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>Anonymous Name </Text>
            <Text style={styles.menuSubtitle}>{currentUser?.anonymousName || 'Hostel Senior'}</Text>
          </View>
          <Text style={styles.editActionText}>Change</Text>
        </TouchableOpacity>

        {/* View Community Terms & Rules */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setShowTermsModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.menuIconBox}>
            <Ionicons name="document-text-outline" size={16} color="#f59e0b" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>Campus Safety & Conduct Policy</Text>
            <Text style={styles.menuSubtitle}>Anti-harassment, anti-nudity terms</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Logout Action */}
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={18} color="#f87171" style={{ marginRight: 8 }} />
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>

      {/* Edit Anonymous Persona Modal */}
      <Modal visible={showEditPersonaModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Anonymous Persona</Text>
              <TouchableOpacity onPress={() => setShowEditPersonaModal(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputDescription}>
              This is the name other students see when chatting with you at पी एम सी and browsing Leela:
            </Text>

            <TextInput
              style={styles.ipTextInput}
              value={newPersona}
              onChangeText={setNewPersona}
              placeholder="e.g. Hostel 4 Senior"
              placeholderTextColor="#64748b"
            />

            <TouchableOpacity style={styles.saveIpButton} onPress={handleSavePersona}>
              <Text style={styles.saveIpText}>Update Persona</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Account Settings Modal */}
      <Modal visible={showSettingsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={styles.deleteWarningBox}>
              <Ionicons name="warning-outline" size={28} color="#ef4444" />
              <Text style={styles.deleteWarningTitle}>Delete My Account</Text>
              <Text style={styles.deleteWarningText}>
                This will permanently remove your profile, all your uploaded reels, comments, and every piece of data associated with your account from our servers. This action cannot be reversed.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={handleDeleteAccount}
              disabled={isDeleting}
              activeOpacity={0.85}
            >
              {isDeleting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.deleteAccountText}>Delete My Account</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelDeleteButton}
              onPress={() => setShowSettingsModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelDeleteText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms & Conduct Modal */}
      <Modal visible={showTermsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Campus Safety & Conduct</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalRuleTitle}>🚫 Zero Tolerance for Nudity</Text>
              <Text style={styles.modalRuleText}>
                No explicit sexual content, nudity, or pornography is permitted. Violators face permanent bans and college disciplinary action.
              </Text>

              <Text style={styles.modalRuleTitle}>🛑 Strict Anti-Harassment Policy</Text>
              <Text style={styles.modalRuleText}>
                Harassment, abusive language, bullying, doxxing, or threats will be directly escalated to MANIT Proctorial Board.
              </Text>

              <Text style={styles.modalRuleTitle}>🔒 Complete Privacy & Safety</Text>
              <Text style={styles.modalRuleText}>
                Your real name, phone number, and scholar email are kept 100% confidential and are never revealed to other students.
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.saveIpButton} onPress={() => setShowTermsModal(false)}>
              <Text style={styles.saveIpText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 40
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800'
  },
  settingsIcon: {
    padding: 6
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#ec4899'
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#161926',
    borderWidth: 2,
    borderColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#ec4899',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#07080c'
  },
  displayName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700'
  },
  anonymousTag: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginTop: 2
  },
  seniorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 114, 182, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.25)',
    marginTop: 6,
    gap: 5
  },
  seniorityText: {
    color: '#f472b6',
    fontSize: 11.5,
    fontWeight: '700'
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14
  },
  verifiedText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
  genderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  genderPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981'
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444'
  },
  privateCard: {
    backgroundColor: '#111422',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    padding: 16,
    marginBottom: 20
  },
  privateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  privateHeaderTitle: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8
  },
  privateDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  privateLabel: {
    color: '#94a3b8',
    fontSize: 12.5
  },
  privateValue: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '600'
  },
  privateDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 10
  },
  privateFooterNote: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16
  },
  menuSection: {
    marginBottom: 24
  },
  sectionHeader: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111420',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)'
  },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  menuTitle: {
    color: '#cbd5e1',
    fontSize: 13.5,
    fontWeight: '600'
  },
  menuSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2
  },
  editActionText: {
    color: '#ec4899',
    fontSize: 12,
    fontWeight: '700'
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 14,
    borderRadius: 14
  },
  logoutButtonText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 14
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  settingsCard: {
    backgroundColor: '#121524',
    width: '100%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  modalRuleTitle: {
    color: '#f472b6',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2
  },
  modalRuleText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6
  },
  inputDescription: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12
  },
  ipTextInput: {
    backgroundColor: '#191e32',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 16
  },
  saveIpButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  saveIpText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  deleteWarningBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)'
  },
  deleteWarningTitle: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6
  },
  deleteWarningText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 4
  },
  deleteAccountText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  cancelDeleteButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8
  },
  cancelDeleteText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 13
  }
});
