import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Modal,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
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
  isTabActive,
  onDeleteAccount
}) {
  const [showEditPersonaModal, setShowEditPersonaModal] = useState(false);
  const [newPersona, setNewPersona] = useState(currentUser?.anonymousName || 'Hostel Senior');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [appRelease, setAppRelease] = useState(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);

  useEffect(() => {
    if (!isTabActive) return undefined;
    let active = true;
    const loadUpdates = async () => {
      const baseUrl = getBaseUrl(serverHost);
      const [announcementResult, releaseResult] = await Promise.allSettled([
        fetch(`${baseUrl}/api/announcements`).then(async response => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Could not load announcements.');
          return result.data;
        }),
        fetch(`${baseUrl}/api/app-release`).then(async response => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Could not check for app updates.');
          return result.data;
        })
      ]);
      if (!active) return;
      if (announcementResult.status === 'fulfilled') {
        setAnnouncements(announcementResult.value);
      } else {
        console.warn('[Announcements] Could not refresh messages:', announcementResult.reason?.message);
      }
      if (releaseResult.status === 'fulfilled') {
        setAppRelease(releaseResult.value);
      } else {
        console.warn('[Updates] Could not check for app updates:', releaseResult.reason?.message);
      }
    };

    loadUpdates();
    const interval = setInterval(loadUpdates, 15 * 60 * 1000);
    const notificationSubscription = Notifications.addNotificationReceivedListener(loadUpdates);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadUpdates();
    });
    return () => {
      active = false;
      clearInterval(interval);
      notificationSubscription.remove();
      subscription.remove();
    };
  }, [isTabActive, serverHost]);

  const installUpdate = async () => {
    if (Platform.OS !== 'android' || !appRelease?.downloadUrl) {
      Alert.alert('Update unavailable', 'App updates can be installed from this screen on Android.');
      return;
    }
    setIsDownloadingUpdate(true);
    let downloadedApkUri = null;
    try {
      const updateStorage = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!updateStorage) throw new Error('App storage is unavailable.');
      const directory = `${updateStorage}app-updates/`;
      const directoryInfo = await FileSystem.getInfoAsync(directory);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      }
      const apkUri = `${directory}pmc-leela-${appRelease.versionCode}.apk`;
      const existingFile = await FileSystem.getInfoAsync(apkUri);
      if (existingFile.exists) await FileSystem.deleteAsync(apkUri);

      const download = await FileSystem.downloadAsync(appRelease.downloadUrl, apkUri);
      if (download.status < 200 || download.status >= 300) {
        throw new Error(`APK download failed (${download.status}).`);
      }
      downloadedApkUri = download.uri;
      const contentUri = await FileSystem.getContentUriAsync(download.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1
      });
    } catch (error) {
      console.error('[Updates] APK download or installer launch failed:', error);
      const message = `${error.message}\n\nAndroid may require you to allow installs from PMC Leela. The system installer will ask you to confirm the update.`;
      if (downloadedApkUri) {
        Alert.alert('Could not start installation', message, [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open install settings',
            onPress: () => {
              IntentLauncher.startActivityAsync(
                'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
                { data: 'package:com.pmcleela.app' }
              ).catch(settingsError => {
                console.error('[Updates] Could not open Android install settings:', settingsError);
                Alert.alert('Settings unavailable', settingsError.message);
              });
            }
          }
        ]);
      } else {
        Alert.alert('Could not download update', message);
      }
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  const installedVersionCode = Number(Constants.expoConfig?.android?.versionCode || 1);
  const hasAppUpdate = Platform.OS === 'android' &&
    appRelease && Number(appRelease.versionCode) > installedVersionCode;

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
      'Delete account',
      'Are you sure you want to permanently delete your account? This will remove ALL your data including reels, chats, and profile. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Final confirmation',
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>PMC LEELA</Text>
          <Text style={styles.headerTitle}>Your account</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsIcon}
          onPress={() => setShowSettingsModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Account settings"
        >
          <Ionicons name="settings-outline" size={21} color="#dbe4f0" />
        </TouchableOpacity>
      </View>

      <View style={styles.profileHero}>
        <View style={styles.profileHeroTop}>
          <TouchableOpacity activeOpacity={0.85} onPress={handlePickAvatar} style={styles.avatarWrapper}>
            {currentUser?.avatarUri || currentUser?.avatarUrl ? (
              <Image source={{ uri: currentUser.avatarUri || currentUser.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person-outline" size={34} color="#94a3b8" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera-outline" size={13} color="#ffffff" />
            </View>
          </TouchableOpacity>

          <View style={styles.profileIdentity}>
            <View style={styles.memberBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#6ee7b7" />
              <Text style={styles.memberBadgeText}>MANIT STUDENT</Text>
            </View>
            <Text style={styles.displayName} numberOfLines={2}>
              {currentUser?.anonymousName || 'Campus Scholar'}
            </Text>
            <Text style={styles.anonymousTag}>Your campus name</Text>
          </View>
        </View>

        <View style={styles.profileDivider} />

        <View style={styles.profileMetaRow}>
          <View style={styles.profileMetaItem}>
            <Text style={styles.profileMetaLabel}>ACADEMIC YEAR</Text>
            <Text style={styles.profileMetaValue}>{formatYearShort(currentUser?.academicYear)} year</Text>
          </View>
          <View style={styles.profileMetaDivider} />
          <View style={styles.profileMetaItem}>
            <Text style={styles.profileMetaLabel}>COLLEGE EMAIL</Text>
            <Text style={styles.profileMetaValue} numberOfLines={1}>
              {currentUser?.email || 'Not available'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionTitle}>Private details</Text>
          <Text style={styles.sectionDescription}>Only used for account verification</Text>
        </View>
        <View style={styles.privateStatus}>
          <Ionicons name="lock-closed" size={12} color="#6ee7b7" />
          <Text style={styles.privateStatusText}>PRIVATE</Text>
        </View>
      </View>

      <View style={styles.privateCard}>
        <View style={styles.privateDetailRow}>
          <Text style={styles.privateLabel}>Legal name</Text>
          <Text style={styles.privateValue} numberOfLines={1}>{currentUser?.fullName || 'MANIT Student'}</Text>
        </View>
        {currentUser?.scholarNo ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>Scholar number</Text>
            <Text style={styles.privateValue}>{currentUser.scholarNo}</Text>
          </View>
        ) : null}
        {currentUser?.phone ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>Phone number</Text>
            <Text style={styles.privateValue}>{currentUser.phone}</Text>
          </View>
        ) : null}
        <View style={styles.privateNotice}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#6ee7b7" />
          <Text style={styles.privateFooterNote}>
            Your personal details are not shown to other students.
          </Text>
        </View>
      </View>

      {(hasAppUpdate || announcements.length > 0) && (
        <View style={styles.announcementSection}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Updates & announcements</Text>
              <Text style={styles.sectionDescription}>Messages from the PMC team</Text>
            </View>
            <Ionicons name="notifications-outline" size={19} color="#f0a2cc" />
          </View>

          {hasAppUpdate && (
            <View style={styles.updateCard}>
              <View style={styles.updateHeading}>
                <View style={styles.updateIcon}>
                  <Ionicons name="arrow-up-circle-outline" size={21} color="#f9a8d4" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.updateTitle}>Version {appRelease.versionName} is available</Text>
                  <Text style={styles.announcementDate}>Current version {Constants.expoConfig?.version || 'installed'}</Text>
                </View>
              </View>
              {appRelease.notes ? <Text style={styles.announcementMessage}>{appRelease.notes}</Text> : null}
              <TouchableOpacity
                style={styles.updateButton}
                onPress={installUpdate}
                disabled={isDownloadingUpdate}
                activeOpacity={0.85}
              >
                {isDownloadingUpdate
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="download-outline" size={17} color="#fff" />
                      <Text style={styles.updateButtonText}>Download update</Text>
                    </>}
              </TouchableOpacity>
              <Text style={styles.installNote}>Android will ask you to confirm installation.</Text>
            </View>
          )}

          {announcements.slice(0, 5).map(item => (
            <View key={item.id} style={styles.announcementCard}>
              <Text style={styles.updateTitle}>{item.title}</Text>
              <Text style={styles.announcementMessage}>{item.message}</Text>
              <Text style={styles.announcementDate}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'PMC announcement'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Preferences & safety</Text>

        {/* Change Anonymous Persona */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            setNewPersona(currentUser?.anonymousName || 'Hostel Senior');
            setShowEditPersonaModal(true);
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.menuIconBox, styles.personaIconBox]}>
            <Ionicons name="person-outline" size={18} color="#f9a8d4" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>Campus name</Text>
            <Text style={styles.menuSubtitle}>{currentUser?.anonymousName || 'Hostel Senior'}</Text>
          </View>
          <View style={styles.changeAction}>
            <Text style={styles.editActionText}>Edit</Text>
            <Ionicons name="chevron-forward" size={15} color="#f472b6" />
          </View>
        </TouchableOpacity>

        {/* View Community Terms & Rules */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setShowTermsModal(true)}
          activeOpacity={0.8}
        >
          <View style={[styles.menuIconBox, styles.safetyIconBox]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#93c5fd" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>Community guidelines</Text>
            <Text style={styles.menuSubtitle}>Safety, privacy and conduct</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={18} color="#fda4af" style={{ marginRight: 9 }} />
        <Text style={styles.logoutButtonText}>Sign out</Text>
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
              <View style={styles.ruleHeading}>
                <Ionicons name="ban-outline" size={16} color="#fda4af" />
                <Text style={styles.modalRuleTitle}>No explicit content</Text>
              </View>
              <Text style={styles.modalRuleText}>
                No explicit sexual content, nudity, or pornography is permitted. Violators face permanent bans and college disciplinary action.
              </Text>

              <View style={styles.ruleHeading}>
                <Ionicons name="hand-left-outline" size={16} color="#fda4af" />
                <Text style={styles.modalRuleTitle}>Respect every student</Text>
              </View>
              <Text style={styles.modalRuleText}>
                Harassment, abusive language, bullying, doxxing, or threats will be directly escalated to MANIT Proctorial Board.
              </Text>

              <View style={styles.ruleHeading}>
                <Ionicons name="lock-closed-outline" size={16} color="#6ee7b7" />
                <Text style={styles.modalRuleTitle}>Protect personal information</Text>
              </View>
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
    backgroundColor: '#090b12'
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 52,
    paddingBottom: 44
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
  },
  headerEyebrow: {
    color: '#8993a8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 5
  },
  headerTitle: {
    color: '#f4f6fb',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7
  },
  settingsIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#151925',
    borderWidth: 1,
    borderColor: '#252b3a',
    justifyContent: 'center',
    alignItems: 'center'
  },
  profileHero: {
    backgroundColor: '#121622',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#252b3a',
    padding: 18,
    marginBottom: 26
  },
  profileHeroTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  profileIdentity: {
    flex: 1,
    marginLeft: 16
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 0
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#52506d'
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#1b2030',
    borderWidth: 1.5,
    borderColor: '#383c50',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#8b78e6',
    width: 25,
    height: 25,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121622'
  },
  memberBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.09)',
    borderColor: 'rgba(110, 231, 183, 0.18)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 7
  },
  memberBadgeText: {
    color: '#9fe5c8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  displayName: {
    color: '#f4f6fb',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.35
  },
  anonymousTag: {
    color: '#929bad',
    fontSize: 12,
    marginTop: 3
  },
  profileDivider: {
    height: 1,
    backgroundColor: '#272c3a',
    marginTop: 19,
    marginBottom: 15
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  profileMetaItem: {
    flex: 1,
    minWidth: 0
  },
  profileMetaDivider: {
    width: 1,
    height: 29,
    backgroundColor: '#303545',
    marginHorizontal: 14
  },
  profileMetaLabel: {
    color: '#818a9e',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 5
  },
  profileMetaValue: {
    color: '#e3e7f0',
    fontSize: 12,
    fontWeight: '600'
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: {
    color: '#e9ecf4',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.15
  },
  sectionDescription: {
    color: '#858ea2',
    fontSize: 11.5,
    marginTop: 4
  },
  privateStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  privateStatusText: {
    color: '#9fe5c8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6
  },
  privateCard: {
    backgroundColor: '#11151f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252c38',
    padding: 16,
    marginBottom: 27
  },
  announcementSection: {
    marginBottom: 25
  },
  announcementCard: {
    backgroundColor: '#11151f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252c38',
    padding: 15,
    marginBottom: 10
  },
  updateCard: {
    backgroundColor: '#171423',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.28)',
    padding: 16,
    marginBottom: 10
  },
  updateHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 8
  },
  updateIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 114, 182, 0.11)'
  },
  updateTitle: {
    color: '#f1eaf2',
    fontSize: 13,
    fontWeight: '700'
  },
  announcementMessage: {
    color: '#c1c5d0',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8
  },
  announcementDate: {
    color: '#818a9e',
    fontSize: 10,
    marginTop: 7
  },
  updateButton: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#db2777',
    borderRadius: 12,
    marginTop: 14
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  installNote: {
    color: '#929bad',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 9
  },
  privateDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#202531'
  },
  privateLabel: {
    color: '#929bad',
    fontSize: 12
  },
  privateValue: {
    color: '#e4e8f0',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '58%',
    textAlign: 'right'
  },
  privateNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13
  },
  privateFooterNote: {
    color: '#9ba5b7',
    fontSize: 11,
    lineHeight: 16,
    flex: 1
  },
  menuSection: {
    marginBottom: 22
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121622',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#252b39'
  },
  menuIconBox: {
    width: 39,
    height: 39,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  personaIconBox: {
    backgroundColor: 'rgba(244, 114, 182, 0.11)'
  },
  safetyIconBox: {
    backgroundColor: 'rgba(96, 165, 250, 0.11)'
  },
  menuTitle: {
    color: '#e7eaf2',
    fontSize: 13,
    fontWeight: '600'
  },
  menuSubtitle: {
    color: '#8f98aa',
    fontSize: 11.5,
    marginTop: 4
  },
  changeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  editActionText: {
    color: '#f0a2cc',
    fontSize: 12,
    fontWeight: '700'
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11141c',
    borderWidth: 1,
    borderColor: '#2c2932',
    paddingVertical: 15,
    borderRadius: 14
  },
  logoutButtonText: {
    color: '#fda4af',
    fontWeight: '700',
    fontSize: 13
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
    color: '#e4e8f1',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8
  },
  ruleHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 5
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
