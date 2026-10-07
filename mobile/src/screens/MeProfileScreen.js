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
  Platform,
  Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl } from '../config';
import { uploadAvatar } from '../utils/uploadAvatar';

const DISMISSED_NOTIFICATIONS_KEY = '@pmc_leela_dismissed_notifications';
const FEEDBACK_URL = 'https://forms.gle/CtC8UzXwHrUkZZgw6';

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
  authToken,
  pushRegistrationStatus = 'idle',
  pushRegistrationError = '',
  onEnablePushNotifications,
  onUpdateCurrentUser,
  onLogout,
  serverHost,
  isTabActive,
  notificationOpenRequest = 0,
  onOpenReel
}) {
  const [showEditPersonaModal, setShowEditPersonaModal] = useState(false);
  const [newPersona, setNewPersona] = useState(currentUser?.anonymousName || 'Hostel Senior');
  const [newLeelaUsername, setNewLeelaUsername] = useState(currentUser?.leelaUsername || 'Leela_Student');
  const [isSavingUsernames, setIsSavingUsernames] = useState(false);
  const [showMyReelsModal, setShowMyReelsModal] = useState(false);
  const [myReels, setMyReels] = useState([]);
  const [isLoadingMyReels, setIsLoadingMyReels] = useState(false);
  const [myReelsLoadError, setMyReelsLoadError] = useState('');
  const [deletingReelId, setDeletingReelId] = useState(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [isLoadingDeletionRequest, setIsLoadingDeletionRequest] = useState(false);
  const [deletionRequestError, setDeletionRequestError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [appRelease, setAppRelease] = useState(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState({
    userId: null,
    announcementIds: [],
    releaseCodes: []
  });
  const [isLoadingDismissedNotifications, setIsLoadingDismissedNotifications] = useState(true);

  const notificationUserId = currentUser?.id ? String(currentUser.id) : null;
  const notificationStorageKey = notificationUserId
    ? `${DISMISSED_NOTIFICATIONS_KEY}:${encodeURIComponent(notificationUserId)}`
    : null;

  useEffect(() => {
    let active = true;
    const loadDismissedNotifications = async () => {
      setIsLoadingDismissedNotifications(true);
      if (!notificationStorageKey || !notificationUserId) {
        setDismissedNotifications({ userId: null, announcementIds: [], releaseCodes: [] });
        setIsLoadingDismissedNotifications(false);
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(notificationStorageKey);
        const parsed = stored ? JSON.parse(stored) : {};
        const saved = parsed && typeof parsed === 'object' ? parsed : {};
        if (!active) return;
        setDismissedNotifications({
          userId: notificationUserId,
          announcementIds: Array.isArray(saved.announcementIds) ? saved.announcementIds.map(String) : [],
          releaseCodes: Array.isArray(saved.releaseCodes) ? saved.releaseCodes.map(String) : []
        });
      } catch (error) {
        console.warn('[Notifications] Could not load dismissed items:', error.message);
        if (active) {
          setDismissedNotifications({ userId: notificationUserId, announcementIds: [], releaseCodes: [] });
          Alert.alert('Could not load notification settings', 'Dismissed notifications could not be loaded from this device.');
        }
      } finally {
        if (active) setIsLoadingDismissedNotifications(false);
      }
    };

    loadDismissedNotifications();
    return () => {
      active = false;
    };
  }, [notificationStorageKey, notificationUserId]);

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
    let notificationSubscription;
    if (!(Platform.OS === 'android' && isRunningInExpoGo())) {
      import('expo-notifications')
        .then((Notifications) => {
          if (active) {
            notificationSubscription = Notifications.addNotificationReceivedListener(loadUpdates);
          }
        })
        .catch((error) => console.warn('[Notifications] Could not listen for incoming notifications:', error.message));
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadUpdates();
    });
    return () => {
      active = false;
      clearInterval(interval);
      notificationSubscription?.remove();
      subscription.remove();
    };
  }, [isTabActive, serverHost]);

  useEffect(() => {
    if (isTabActive && notificationOpenRequest > 0) {
      setShowNotifications(true);
    }
  }, [isTabActive, notificationOpenRequest]);

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

  const openFeedbackForm = async () => {
    try {
      await Linking.openURL(FEEDBACK_URL);
    } catch (error) {
      console.error('[Feedback] Could not open feedback form:', error);
      Alert.alert('Could not open feedback form', 'Please try again later.');
    }
  };

  const installedVersionCode = Number(Constants.expoConfig?.android?.versionCode || 1);
  const hasAppUpdateAvailable = Platform.OS === 'android' &&
    appRelease && Number(appRelease.versionCode) > installedVersionCode;
  const dismissedForCurrentUser = dismissedNotifications.userId === notificationUserId
    ? dismissedNotifications
    : { announcementIds: [], releaseCodes: [] };
  const visibleAnnouncements = announcements.filter(
    item => !dismissedForCurrentUser.announcementIds.includes(String(item.id))
  );
  const releaseCode = appRelease ? String(appRelease.versionCode) : null;
  const hasAppUpdate = Boolean(
    hasAppUpdateAvailable &&
    releaseCode &&
    !dismissedForCurrentUser.releaseCodes.includes(releaseCode)
  );
  const notificationCount = visibleAnnouncements.length + Number(hasAppUpdate);

  const clearNotifications = async () => {
    if (!notificationStorageKey || !notificationUserId || isLoadingDismissedNotifications) {
      Alert.alert('Could not clear notifications', 'Notification settings are not ready. Please try again.');
      return;
    }

    const nextDismissed = {
      userId: notificationUserId,
      announcementIds: Array.from(new Set([
        ...dismissedForCurrentUser.announcementIds,
        ...announcements.map(item => String(item.id))
      ])),
      releaseCodes: Array.from(new Set([
        ...dismissedForCurrentUser.releaseCodes,
        ...(hasAppUpdateAvailable && releaseCode ? [releaseCode] : [])
      ]))
    };
    try {
      await AsyncStorage.setItem(notificationStorageKey, JSON.stringify({
        announcementIds: nextDismissed.announcementIds,
        releaseCodes: nextDismissed.releaseCodes
      }));
      setDismissedNotifications(nextDismissed);
    } catch (error) {
      console.error('[Notifications] Could not clear dismissed items:', error);
      Alert.alert('Could not clear notifications', 'Your notifications could not be cleared on this device. Please try again.');
    }
  };

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

      if (!res.canceled && res.assets?.[0]) {
        setIsUploadingAvatar(true);
        try {
          const updatedUser = await uploadAvatar(serverHost, authToken, res.assets[0]);
          await onUpdateCurrentUser({ ...currentUser, ...updatedUser });
          Alert.alert('Profile image updated', 'Your profile image has been saved to your account.');
        } catch (error) {
          console.error('[Profile] Could not upload profile image:', error);
          Alert.alert('Could not save profile image', error.message);
        } finally {
          setIsUploadingAvatar(false);
        }
      }
    } catch (error) {
      console.error('[Profile] Could not select profile image:', error);
      Alert.alert('Could not select profile image', error.message);
    }
  };

  const handleSaveUsernames = async () => {
    const chatUsername = newPersona.trim();
    const leelaUsername = newLeelaUsername.trim();
    if (!chatUsername || !leelaUsername) {
      Alert.alert('Usernames required', 'Enter a username for both PMC chat and Leela.');
      return;
    }
    if (chatUsername.length > 30 || leelaUsername.length > 30) {
      Alert.alert('Username too long', 'Usernames cannot exceed 30 characters.');
      return;
    }
    if (chatUsername.toLowerCase() === leelaUsername.toLowerCase()) {
      Alert.alert('Choose different usernames', 'Your Leela username must be different from your PMC chat username.');
      return;
    }

    setIsSavingUsernames(true);
    try {
      const response = await fetch(`${getBaseUrl(serverHost)}/api/auth/update-persona`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          anonymousName: chatUsername,
          leelaUsername
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.user) {
        throw new Error(result.message || 'Could not update your usernames. Please try again.');
      }
      await onUpdateCurrentUser({ ...currentUser, ...result.user });
      setShowEditPersonaModal(false);
      Alert.alert('Updated', 'Your PMC chat and Leela usernames have been updated.');
    } catch (error) {
      console.error('[Profile] Could not update usernames:', error);
      Alert.alert('Usernames not updated', error.message || 'Could not update your usernames. Please try again.');
    } finally {
      setIsSavingUsernames(false);
    }
  };

  const loadMyReels = async () => {
    setIsLoadingMyReels(true);
    setMyReelsLoadError('');
    try {
      const response = await fetch(`${getBaseUrl(serverHost)}/api/reels/mine`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || 'Could not load your reels.');
      }
      setMyReels(result.data);
    } catch (error) {
      console.error('[Profile] Could not load uploaded reels:', error);
      setMyReelsLoadError(error.message || 'Could not load your reels. Please try again.');
    } finally {
      setIsLoadingMyReels(false);
    }
  };

  const openMyReels = () => {
    setShowMyReelsModal(true);
    loadMyReels();
  };

  const deleteMyReel = (reel) => {
    Alert.alert(
      'Delete this reel?',
      'This permanently removes your reel from Leela. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete reel',
          style: 'destructive',
          onPress: async () => {
            setDeletingReelId(reel.id);
            try {
              const response = await fetch(`${getBaseUrl(serverHost)}/api/reels/${encodeURIComponent(reel.id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${authToken}` }
              });
              const result = await response.json();
              if (!response.ok || !result.success) {
                throw new Error(result.message || 'Could not delete this reel.');
              }
              setMyReels(previous => previous.filter(item => item.id !== reel.id));
            } catch (error) {
              console.error(`[Profile] Could not delete reel ${reel.id}:`, error);
              Alert.alert('Reel not deleted', error.message || 'Please try again.');
            } finally {
              setDeletingReelId(null);
            }
          }
        }
      ]
    );
  };

  const loadDeletionRequest = async () => {
    setIsLoadingDeletionRequest(true);
    setDeletionRequestError('');
    try {
      const response = await fetch(`${getBaseUrl(serverHost)}/api/auth/deletion-request`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not check the account deletion status.');
      }
      setDeletionRequest(result.data || null);
    } catch (error) {
      console.error('[Profile] Could not load deletion request status:', error);
      setDeletionRequestError(error.message || 'Could not check the account deletion status.');
    } finally {
      setIsLoadingDeletionRequest(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deletionRequest) return;
    Alert.alert(
      'Request account deletion?',
      'Your account will stay active while your request is pending. An admin can approve or reject it; if nobody acts, the account will be deleted automatically after 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Submit deletion request?',
              'The request will appear in the PMC Admin portal. If it is approved, your account will be deleted immediately. If rejected, your account remains active.',
              [
                { text: 'Go back', style: 'cancel' },
                {
                  text: 'Submit request',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setIsRequestingDeletion(true);
                      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/delete-account`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${authToken}`
                        }
                      });
                      const data = await res.json();
                      if (!res.ok || !data.success || !data.data) {
                        throw new Error(data.message || 'Could not submit the account deletion request.');
                      }
                      setDeletionRequest(data.data);
                      Alert.alert('Request submitted', 'Your account remains active for now. It will be deleted after 24 hours unless an admin approves or rejects the request sooner.');
                    } catch (error) {
                      console.error('[Profile] Could not submit account deletion request:', error);
                      Alert.alert('Request not submitted', error.message || 'Please check your connection and try again.');
                    } finally {
                      setIsRequestingDeletion(false);
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
          <Text style={styles.headerTitle}>Your profile</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setShowNotifications(true)}
            accessibilityRole="button"
            accessibilityLabel={`Notifications${notificationCount ? `, ${notificationCount} available` : ''}`}
          >
            <Ionicons name="notifications-outline" size={21} color="#f472b6" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              setShowSettingsModal(true);
              loadDeletionRequest();
            }}
            accessibilityRole="button"
            accessibilityLabel="Account settings"
          >
            <Ionicons name="settings-outline" size={21} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={openFeedbackForm}
            accessibilityRole="button"
            accessibilityLabel="Feedback"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={21} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.profileHero}>
        <View style={styles.profileHeroTop}>
          <TouchableOpacity
            activeOpacity={isUploadingAvatar ? 1 : 0.85}
            onPress={handlePickAvatar}
            disabled={isUploadingAvatar}
            style={styles.avatarWrapper}
          >
            {currentUser?.avatarUrl ? (
              <Image source={{ uri: currentUser.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person-outline" size={34} color="#94a3b8" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              {isUploadingAvatar
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Ionicons name="camera-outline" size={13} color="#ffffff" />}
            </View>
          </TouchableOpacity>

          <View style={styles.profileIdentity}>
            <View style={styles.memberBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#f472b6" />
              <Text style={styles.memberBadgeText}>MANIT STUDENT</Text>
            </View>
            <Text style={styles.displayName} numberOfLines={2}>
              {currentUser?.anonymousName || 'Campus Scholar'}
            </Text>
            <Text style={styles.anonymousTag}>Your PMC chat username</Text>
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
          <Ionicons name="lock-closed" size={12} color="#f472b6" />
          <Text style={styles.privateStatusText}>PRIVATE</Text>
        </View>
      </View>

      <View style={styles.privateCard}>
        {currentUser?.scholarNo ? (
          <View style={styles.privateDetailRow}>
            <Text style={styles.privateLabel}>Scholar number</Text>
            <Text style={styles.privateValue}>{currentUser.scholarNo}</Text>
          </View>
        ) : null}
        <View style={styles.privateNotice}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#f472b6" />
          <Text style={styles.privateFooterNote}>
            Your personal details are not shown to other students.
          </Text>
        </View>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Preferences & safety</Text>

        {/* Change PMC and Leela usernames */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            setNewPersona(currentUser?.anonymousName || 'Hostel Senior');
            setNewLeelaUsername(currentUser?.leelaUsername || 'Leela_Student');
            setShowEditPersonaModal(true);
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.menuIconBox, styles.personaIconBox]}>
            <Ionicons name="person-outline" size={18} color="#f9a8d4" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>Chat & Leela usernames</Text>
            <Text style={styles.menuSubtitle}>
              PMC: {currentUser?.anonymousName || 'Hostel Senior'} · Leela: {currentUser?.leelaUsername || 'Leela_Student'}
            </Text>
          </View>
          <View style={styles.changeAction}>
            <Text style={styles.editActionText}>Edit</Text>
            <Ionicons name="chevron-forward" size={15} color="#f472b6" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={openMyReels}
          activeOpacity={0.8}
        >
          <View style={[styles.menuIconBox, styles.reelsIconBox]}>
            <Ionicons name="videocam-outline" size={18} color="#c4b5fd" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.menuTitle}>My uploaded reels</Text>
            <Text style={styles.menuSubtitle}>View or delete reels you posted</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748b" />
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

      <View style={styles.creatorSignature}>
        <View style={styles.signatureRule} />
        <Text style={styles.signatureText}>
          MADE BY <Text style={styles.signatureName}>_alkaar_</Text>
        </Text>
      </View>

      <Modal
        visible={showNotifications}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationCard}>
            <View style={styles.modalHeader}>
              <View style={styles.notificationHeaderText}>
                <Text style={styles.modalTitle}>Notifications</Text>
                <Text style={styles.notificationSubtitle}>Updates and messages from PMC</Text>
                <View style={styles.pushStatusRow}>
                  <Ionicons
                    name={pushRegistrationStatus === 'registered' ? 'checkmark-circle' : 'notifications-outline'}
                    size={15}
                    color={pushRegistrationStatus === 'registered' ? '#4ade80' : '#f9a8d4'}
                  />
                  <Text style={styles.pushStatusText}>
                    {pushRegistrationStatus === 'registered'
                      ? 'You will receive all notifications.'
                      : pushRegistrationStatus === 'registering'
                        ? 'Registering this device for all notifications...'
                        : pushRegistrationError || 'Notificaion status is not available.'}
                  </Text>
                  {['permission-denied', 'error'].includes(pushRegistrationStatus) && (
                    <TouchableOpacity
                      onPress={() => {
                        if (pushRegistrationStatus === 'permission-denied') {
                          Linking.openSettings().catch((error) => {
                            Alert.alert('Could not open settings', error.message);
                          });
                        } else {
                          onEnablePushNotifications?.();
                        }
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.pushSettingsAction}>
                        {pushRegistrationStatus === 'permission-denied' ? 'Settings' : 'Retry'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.notificationHeaderActions}>
                {notificationCount > 0 && (
                  <TouchableOpacity
                    onPress={clearNotifications}
                    disabled={isLoadingDismissedNotifications}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all notifications for this account on this device"
                    style={[
                      styles.clearNotificationsButton,
                      isLoadingDismissedNotifications && styles.disabledButton
                    ]}
                  >
                    <Ionicons name="trash-outline" size={14} color="#f472b6" />
                    <Text style={styles.clearNotificationsText}>Clear all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowNotifications(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications"
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={21} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.notificationList}
              contentContainerStyle={styles.notificationListContent}
              showsVerticalScrollIndicator={false}
            >
              {hasAppUpdate && (
                <View style={styles.updateCard}>
                  <View style={styles.updateHeading}>
                    <View style={styles.updateIcon}>
                      <Ionicons name="arrow-up-circle-outline" size={21} color="#f472b6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.updateTitle}>Version {appRelease.versionName} is available</Text>
                      <Text style={styles.announcementDate}>
                        Current version {Constants.expoConfig?.version || 'installed'}
                      </Text>
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

              {visibleAnnouncements.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.announcementCard}
                  activeOpacity={String(item.id).startsWith('reel_') ? 0.75 : 1}
                  disabled={!String(item.id).startsWith('reel_')}
                  onPress={() => {
                    setShowNotifications(false);
                    onOpenReel?.(String(item.id).slice('reel_'.length));
                  }}
                >
                  <View style={styles.notificationItemHeading}>
                    <View style={styles.notificationItemIcon}>
                      <Ionicons
                        name={String(item.id).startsWith('reel_') ? 'videocam-outline' : 'megaphone-outline'}
                        size={16}
                        color="#f472b6"
                      />
                    </View>
                    <Text style={styles.updateTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.announcementMessage}>{item.message}</Text>
                  <Text style={styles.announcementDate}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'PMC announcement'}
                  </Text>
                </TouchableOpacity>
              ))}

              {!hasAppUpdate && visibleAnnouncements.length === 0 && (
                <View style={styles.emptyNotifications}>
                  <View style={styles.emptyNotificationIcon}>
                    <Ionicons name="notifications-off-outline" size={25} color="#f472b6" />
                  </View>
                  <Text style={styles.emptyNotificationsTitle}>You're all caught up</Text>
                  <Text style={styles.emptyNotificationsText}>
                    New announcements and app updates will appear here.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit PMC and Leela usernames */}
      <Modal visible={showEditPersonaModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update usernames</Text>
              <TouchableOpacity onPress={() => setShowEditPersonaModal(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputDescription}>
              Keep your identities separate: other students see your PMC name in chats and your Leela name on reels and comments.
            </Text>

            <Text style={styles.usernameFieldLabel}>PMC chat username</Text>
            <TextInput
              style={styles.ipTextInput}
              value={newPersona}
              onChangeText={setNewPersona}
              maxLength={30}
              placeholder="e.g. Hostel 4 Senior"
              autoCapitalize="words"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.usernameFieldLabel}>Leela username</Text>
            <TextInput
              style={styles.ipTextInput}
              value={newLeelaUsername}
              onChangeText={setNewLeelaUsername}
              maxLength={30}
              placeholder="e.g. campus_creator"
              autoCapitalize="none"
              placeholderTextColor="#64748b"
            />

            <TouchableOpacity
              style={[styles.saveIpButton, isSavingUsernames && styles.disabledButton]}
              onPress={handleSaveUsernames}
              disabled={isSavingUsernames}
            >
              {isSavingUsernames
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveIpText}>Save usernames</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMyReelsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMyReelsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>My uploaded reels</Text>
                <Text style={styles.reelsModalSubtitle}>Only you can delete your reels.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowMyReelsModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close uploaded reels"
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {isLoadingMyReels ? (
              <ActivityIndicator color="#f472b6" style={styles.reelsLoading} />
            ) : myReelsLoadError ? (
              <View style={styles.reelsLoadError}>
                <Text style={styles.emptyReelsText}>{myReelsLoadError}</Text>
                <TouchableOpacity style={styles.reelsRetryButton} onPress={loadMyReels}>
                  <Text style={styles.reelsRetryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : myReels.length === 0 ? (
              <Text style={styles.emptyReelsText}>You haven't uploaded any reels yet.</Text>
            ) : (
              <ScrollView style={styles.myReelsList} showsVerticalScrollIndicator={false}>
                {myReels.map(reel => (
                  <View key={reel.id} style={styles.myReelItem}>
                    <View style={styles.myReelDetails}>
                      <Text style={styles.myReelCaption} numberOfLines={2}>
                        {reel.caption || 'Campus reel'}
                      </Text>
                      <Text style={styles.myReelDate}>
                        {reel.createdAt ? new Date(reel.createdAt).toLocaleDateString() : 'Uploaded reel'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.myReelDeleteButton, deletingReelId === reel.id && styles.disabledButton]}
                      onPress={() => deleteMyReel(reel)}
                      disabled={!!deletingReelId}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete reel ${reel.caption || ''}`}
                    >
                      {deletingReelId === reel.id
                        ? <ActivityIndicator size="small" color="#fca5a5" />
                        : <Ionicons name="trash-outline" size={18} color="#fca5a5" />}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
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

            {isLoadingDeletionRequest ? (
              <ActivityIndicator color="#f472b6" style={styles.deletionStatusLoading} />
            ) : deletionRequest ? (
              <View style={styles.deletePendingBox}>
                <Ionicons name="time-outline" size={28} color="#fbbf24" />
                <Text style={styles.deletePendingTitle}>Deletion request pending</Text>
                <Text style={styles.deleteWarningText}>
                  Your account remains active while an admin reviews the request. It will be deleted automatically after 24 hours if no decision is made.
                </Text>
                <Text style={styles.deletePendingDate}>
                  Automatic deletion: {new Date(deletionRequest.deleteAfter).toLocaleString()}
                </Text>
              </View>
            ) : (
              <View style={styles.deleteWarningBox}>
              <Ionicons name="warning-outline" size={28} color="#ef4444" />
              <Text style={styles.deleteWarningTitle}>Delete My Account</Text>
              <Text style={styles.deleteWarningText}>
                Submit a deletion request for admin review. If it is not approved or rejected within 24 hours, your account and its uploaded reels will be deleted automatically.
              </Text>
              </View>
            )}
            {deletionRequestError ? (
              <View>
                <Text style={styles.deletionRequestError}>{deletionRequestError}</Text>
                <TouchableOpacity onPress={loadDeletionRequest} style={styles.deletionRetryButton}>
                  <Text style={styles.deletionRetryText}>Check again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={handleDeleteAccount}
              disabled={isRequestingDeletion || isLoadingDeletionRequest || !!deletionRequest || !!deletionRequestError}
              activeOpacity={0.85}
            >
              {isRequestingDeletion ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name={deletionRequest ? 'time-outline' : 'trash-outline'} size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.deleteAccountText}>
                    {deletionRequest ? 'Request pending' : 'Request account deletion'}
                  </Text>
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
                Harassment, bullying, doxxing, or threats will be directly escalated to MANIT Proctorial Board.
              </Text>

              <View style={styles.ruleHeading}>
                <Ionicons name="lock-closed-outline" size={16} color="#f472b6" />
                <Text style={styles.modalRuleTitle}>Protect personal information</Text>
              </View>
              <Text style={styles.modalRuleText}>
                Your scholar email is kept private and is never revealed to other students.
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
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 36
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  headerEyebrow: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 5
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.7
  },
  headerIconButton: {
    position: 'relative',
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#0c0e17',
    borderWidth: 1,
    borderColor: '#252a36',
    justifyContent: 'center',
    alignItems: 'center'
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ec4899',
    borderWidth: 1.5,
    borderColor: '#07080c',
    justifyContent: 'center',
    alignItems: 'center'
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  },
  profileHero: {
    backgroundColor: '#0c0e17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#252a36',
    padding: 18,
    marginBottom: 24
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
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#ec4899'
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: '#161926',
    borderWidth: 1.5,
    borderColor: '#38303d',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#be185d',
    width: 25,
    height: 25,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0c0e17'
  },
  memberBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(236, 72, 153, 0.10)',
    borderColor: 'rgba(236, 72, 153, 0.24)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 7
  },
  memberBadgeText: {
    color: '#f9a8d4',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  displayName: {
    color: '#f8fafc',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.35
  },
  anonymousTag: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3
  },
  profileDivider: {
    height: 1,
    backgroundColor: '#252a36',
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
    backgroundColor: '#303442',
    marginHorizontal: 14
  },
  profileMetaLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 5
  },
  profileMetaValue: {
    color: '#e2e8f0',
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
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.15
  },
  sectionDescription: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginTop: 4
  },
  privateStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  privateStatusText: {
    color: '#f9a8d4',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6
  },
  privateCard: {
    backgroundColor: '#0c0e17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252a36',
    padding: 16,
    marginBottom: 27
  },
  announcementCard: {
    backgroundColor: '#11131d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252a36',
    padding: 15,
    marginBottom: 10
  },
  updateCard: {
    backgroundColor: '#17101a',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.30)',
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
    backgroundColor: 'rgba(236, 72, 153, 0.13)'
  },
  updateTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  announcementMessage: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8
  },
  announcementDate: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 7
  },
  updateButton: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#be185d',
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
    borderBottomColor: '#252a36'
  },
  privateLabel: {
    color: '#94a3b8',
    fontSize: 12
  },
  privateValue: {
    color: '#e2e8f0',
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
    color: '#94a3b8',
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
    backgroundColor: '#0c0e17',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#252a36'
  },
  menuIconBox: {
    width: 39,
    height: 39,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  personaIconBox: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)'
  },
  reelsIconBox: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)'
  },
  safetyIconBox: {
    backgroundColor: 'rgba(96, 165, 250, 0.11)'
  },
  menuTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600'
  },
  menuSubtitle: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginTop: 4
  },
  changeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  editActionText: {
    color: '#f472b6',
    fontSize: 12,
    fontWeight: '700'
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0c0e17',
    borderWidth: 1,
    borderColor: '#33232f',
    paddingVertical: 15,
    borderRadius: 14
  },
  logoutButtonText: {
    color: '#fda4af',
    fontWeight: '700',
    fontSize: 13
  },
  creatorSignature: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 6
  },
  signatureRule: {
    width: 34,
    height: 1,
    backgroundColor: 'rgba(244, 114, 182, 0.38)',
    marginBottom: 12
  },
  signatureText: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.1
  },
  signatureName: {
    color: '#f9a8d4',
    fontFamily: 'Georgia',
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '600',
    letterSpacing: 1.2
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  notificationCard: {
    backgroundColor: '#0c0e17',
    width: '100%',
    height: '82%',
    maxHeight: '88%',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#292532'
  },
  notificationHeaderText: {
    flex: 1,
    marginRight: 10
  },
  notificationHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  notificationSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4
  },
  pushStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    paddingRight: 4
  },
  pushStatusText: {
    flex: 1,
    color: '#aeb7c8',
    fontSize: 10,
    lineHeight: 14
  },
  pushSettingsAction: {
    color: '#f9a8d4',
    fontSize: 10,
    fontWeight: '700',
    padding: 4
  },
  clearNotificationsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: 'rgba(236, 72, 153, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.20)'
  },
  clearNotificationsText: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '700'
  },
  disabledButton: {
    opacity: 0.5
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#161926',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notificationList: {
    flex: 1
  },
  notificationListContent: {
    paddingBottom: 2
  },
  notificationItemHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  notificationItemIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyNotifications: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 34
  },
  emptyNotificationIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  emptyNotificationsTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700'
  },
  emptyNotificationsText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6
  },
  settingsCard: {
    backgroundColor: '#0c0e17',
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
  usernameFieldLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5
  },
  reelsModalSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4
  },
  reelsLoading: {
    paddingVertical: 28
  },
  emptyReelsText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 24,
    textAlign: 'center'
  },
  reelsLoadError: {
    alignItems: 'center'
  },
  reelsRetryButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.22)'
  },
  reelsRetryText: {
    color: '#f9a8d4',
    fontSize: 11,
    fontWeight: '700'
  },
  myReelsList: {
    maxHeight: 420
  },
  myReelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11131d',
    borderWidth: 1,
    borderColor: '#252a36',
    borderRadius: 12,
    padding: 12,
    marginBottom: 9
  },
  myReelDetails: {
    flex: 1,
    marginRight: 10
  },
  myReelCaption: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600'
  },
  myReelDate: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 5
  },
  myReelDeleteButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(248, 113, 113, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.22)',
    alignItems: 'center',
    justifyContent: 'center'
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
  deletePendingBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)'
  },
  deletePendingTitle: {
    color: '#fbbf24',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6
  },
  deletePendingDate: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center'
  },
  deletionStatusLoading: {
    paddingVertical: 24
  },
  deletionRequestError: {
    color: '#fda4af',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 8
  },
  deletionRetryButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12
  },
  deletionRetryText: {
    color: '#f9a8d4',
    fontSize: 12,
    fontWeight: '700'
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
