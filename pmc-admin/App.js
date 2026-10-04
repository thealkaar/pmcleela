import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { VideoView, useVideoPlayer } from 'expo-video';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://pmcleela.onrender.com').replace(/\/+$/, '');
const REPORT_FILTERS = ['pending', 'resolved', 'dismissed'];

async function request(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || `Request failed (${response.status}).`);
  }
  return result;
}

async function uploadRequest(path, token, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || `Upload failed (${response.status}).`);
  }
  return result;
}

function VideoCard({ reel }) {
  if (!reel.videoUrl) {
    return (
      <View style={styles.videoUnavailable}>
        <Ionicons name="videocam-off-outline" size={26} color="#94a3b8" />
        <Text style={styles.mutedText}>Video unavailable</Text>
      </View>
    );
  }
  return <PlayableVideo reel={reel} />;
}

function PlayableVideo({ reel }) {
  const player = useVideoPlayer(reel.videoUrl, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
  });
  return (
    <VideoView
      style={styles.video}
      player={player}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture={false}
    />
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#6c7487"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [tab, setTab] = useState('reports');
  const [users, setUsers] = useState([]);
  const [reels, setReels] = useState([]);
  const [reports, setReports] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [appReleases, setAppReleases] = useState([]);
  const [reportFilter, setReportFilter] = useState('pending');
  const [reelOwnerFilter, setReelOwnerFilter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [addUserBusy, setAddUserBusy] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [releaseVersionName, setReleaseVersionName] = useState('');
  const [releaseVersionCode, setReleaseVersionCode] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [apkAsset, setApkAsset] = useState(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    anonymousName: '',
    phone: '',
    gender: 'female',
    academicYear: '1st Year',
    hostel: ''
  });

  const loadTab = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      if (tab === 'users') {
        const result = await request('/api/admin/users', token);
        setUsers(result.data);
      } else if (tab === 'reels') {
        const result = await request('/api/admin/reels', token);
        setReels(result.data);
      } else if (tab === 'broadcast') {
        const result = await request('/api/admin/announcements', token);
        setBroadcasts(result.data);
      } else if (tab === 'update') {
        const result = await request('/api/admin/app-releases', token);
        setAppReleases(result.data);
      } else {
        const result = await request(`/api/admin/reports?status=${reportFilter}`, token);
        setReports(result.data);
      }
    } catch (error) {
      setLoadError(error.message);
      if (error.message.toLowerCase().includes('sign-in has expired')) setToken('');
    } finally {
      setLoading(false);
    }
  }, [reportFilter, tab, token]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const signIn = async () => {
    if (!email.trim() || !password) {
      setLoadError('Enter the admin email and password.');
      return;
    }
    setLoginBusy(true);
    setLoadError('');
    try {
      const result = await request('/api/admin/login', '', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(result.token);
      setPassword('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const updateNewUser = (key, value) => {
    setNewUser(previous => ({ ...previous, [key]: value }));
  };

  const createUser = async () => {
    setAddUserBusy(true);
    try {
      const result = await request('/api/admin/users', token, {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      setUsers(previous => [{ ...result.data, reelsCount: 0 }, ...previous]);
      setAddUserVisible(false);
      setNewUser({
        fullName: '', email: '', password: '', anonymousName: '', phone: '',
        gender: 'female', academicYear: '1st Year', hostel: ''
      });
      Alert.alert('Account created', 'The student account is verified and ready to sign in.');
    } catch (error) {
      Alert.alert('Could not add user', error.message);
    } finally {
      setAddUserBusy(false);
    }
  };

  const sendBroadcast = async () => {
    setBroadcastBusy(true);
    try {
      const result = await request('/api/admin/announcements', token, {
        method: 'POST',
        body: JSON.stringify({ title: broadcastTitle, message: broadcastMessage })
      });
      setBroadcasts(previous => [result.data, ...previous]);
      setBroadcastTitle('');
      setBroadcastMessage('');
      const delivery = result.delivery;
      Alert.alert(
        'Broadcast published',
        `Expo accepted ${delivery.sent} of ${delivery.registeredDevices} registered-device notifications. Device delivery depends on Android permissions and connectivity.${delivery.failed ? ` ${delivery.failed} failed; users can still see the message in Me.` : ''}${delivery.errors?.[0] ? `\n${delivery.errors[0]}` : ''}`
      );
    } catch (error) {
      Alert.alert('Could not send broadcast', error.message);
    } finally {
      setBroadcastBusy(false);
    }
  };

  const chooseApk = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected || !selected.name.toLowerCase().endsWith('.apk')) {
        Alert.alert('Choose an APK', 'Select the signed PMC Leela Android .apk file.');
        return;
      }
      if (selected.size && selected.size > 250 * 1024 * 1024) {
        Alert.alert('APK is too large', 'The maximum APK upload size is 250 MB.');
        return;
      }
      setApkAsset(selected);
    } catch (error) {
      Alert.alert('Could not select APK', error.message);
    }
  };

  const publishRelease = async () => {
    if (!apkAsset) {
      Alert.alert('APK required', 'Choose the signed Android APK before publishing this update.');
      return;
    }
    setReleaseBusy(true);
    try {
      const body = new FormData();
      body.append('versionName', releaseVersionName.trim());
      body.append('versionCode', releaseVersionCode.trim());
      body.append('notes', releaseNotes.trim());
      body.append('apk', {
        uri: apkAsset.uri,
        name: apkAsset.name,
        type: apkAsset.mimeType || 'application/vnd.android.package-archive'
      });
      const result = await uploadRequest('/api/admin/app-releases', token, body);
      setAppReleases(previous => [result.data, ...previous]);
      setApkAsset(null);
      setReleaseVersionName('');
      setReleaseVersionCode('');
      setReleaseNotes('');
      Alert.alert(
        'Update published',
        `Version ${result.data.versionName} is available in the student app. Expo accepted ${result.delivery.sent} of ${result.delivery.registeredDevices} registered-device notifications. Students can also find the update in Me.${result.delivery.errors?.[0] ? `\n${result.delivery.errors[0]}` : ''}`
      );
    } catch (error) {
      Alert.alert('Could not publish update', error.message);
    } finally {
      setReleaseBusy(false);
    }
  };

  const deleteUser = (user) => {
    Alert.alert(
      'Remove student account?',
      `This permanently removes ${user.fullName || user.anonymousName}, their reels and associated data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(`/api/admin/users/${encodeURIComponent(user.id)}`, token, { method: 'DELETE' });
              setUsers(previous => previous.filter(item => item.id !== user.id));
              setReels(previous => previous.filter(item => item.creatorId !== user.id));
              Alert.alert('Account removed', 'The account and its stored reels have been deleted.');
            } catch (error) {
              Alert.alert('Could not remove account', error.message);
            }
          }
        }
      ]
    );
  };

  const deleteReel = (reel) => {
    Alert.alert(
      'Delete this reel?',
      'This removes the reel and its video from Cloudflare R2.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete reel',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(`/api/admin/reels/${encodeURIComponent(reel.id)}`, token, { method: 'DELETE' });
              setReels(previous => previous.filter(item => item.id !== reel.id));
              setReports(previous => previous.filter(item => item.reelId !== reel.id));
              setUsers(previous => previous.map(user => (
                user.id === reel.creatorId
                  ? { ...user, reelsCount: Math.max(0, (user.reelsCount || 0) - 1) }
                  : user
              )));
              Alert.alert('Reel deleted', 'The video object was removed from storage.');
            } catch (error) {
              Alert.alert('Could not delete reel', error.message);
            }
          }
        }
      ]
    );
  };

  const updateReport = async (report, status) => {
    try {
      await request(`/api/admin/reports/${encodeURIComponent(report.id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setReports(previous => previous.filter(item => item.id !== report.id));
    } catch (error) {
      Alert.alert('Could not update report', error.message);
    }
  };

  const data = useMemo(() => {
    if (tab === 'users') return users;
    if (tab === 'reels') {
      return reelOwnerFilter
        ? reels.filter(reel => reel.creatorId === reelOwnerFilter.id)
        : reels;
    }
    if (tab === 'broadcast') return broadcasts;
    if (tab === 'update') return appReleases;
    return reports;
  }, [appReleases, broadcasts, reelOwnerFilter, reports, reels, tab, users]);

  const renderUser = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, styles.userAvatar]}>
          <Ionicons name="person-outline" size={20} color="#f9a8d4" />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{item.fullName || item.anonymousName || 'Student'}</Text>
          <Text style={styles.cardSubtitle}>{item.anonymousName} · {item.email}</Text>
        </View>
        <TouchableOpacity style={styles.dangerIconButton} onPress={() => deleteUser(item)}>
          <Ionicons name="trash-outline" size={18} color="#fda4af" />
        </TouchableOpacity>
      </View>
      <View style={styles.detailGrid}>
        <Detail label="Scholar number" value={item.scholarNo} />
        <Detail label="Phone" value={item.phone} />
        <Detail label="Gender" value={item.gender} />
        <Detail label="Academic year" value={item.academicYear} />
        <Detail label="Hostel" value={item.hostel} />
        <Detail label="Reels" value={String(item.reelsCount || 0)} />
        <Detail label="Registered" value={formatDate(item.createdAt)} />
        <Detail label="Email verified" value={item.isEmailVerified ? 'Yes' : 'No'} />
        <Detail label="Avatar URL" value={item.avatarUrl} />
      </View>
      <TouchableOpacity
        style={styles.viewContentButton}
        onPress={() => {
          setReelOwnerFilter({ id: item.id, name: item.anonymousName || item.fullName });
          setTab('reels');
        }}
      >
        <Ionicons name="play-circle-outline" size={16} color="#f9a8d4" />
        <Text style={styles.viewContentText}>View this student’s reels ({item.reelsCount || 0})</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReel = ({ item }) => (
    <View style={styles.card}>
      <VideoCard reel={item} />
      <View style={styles.reelDetails}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, styles.reelAvatar]}>
            <Ionicons name="videocam-outline" size={19} color="#f9a8d4" />
          </View>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>{item.creatorName || 'Campus Creator'}</Text>
            <Text style={styles.cardSubtitle}>{item.creatorYear || 'Student'} · {formatDate(item.createdAt)}</Text>
          </View>
          <TouchableOpacity style={styles.dangerIconButton} onPress={() => deleteReel(item)}>
            <Ionicons name="trash-outline" size={18} color="#fda4af" />
          </TouchableOpacity>
        </View>
        <Text style={styles.reelCaption}>{item.caption || 'No caption'}</Text>
        <Text style={styles.reelStats}>{item.likesCount || 0} likes  ·  {item.commentsCount || 0} comments  ·  ID {item.id}</Text>
        {Array.isArray(item.comments) && item.comments.length > 0 && (
          <View style={styles.commentList}>
            <Text style={styles.subheading}>Comments ({item.comments.length})</Text>
            {item.comments.slice(0, 8).map(comment => (
              <Text key={comment.id} style={styles.commentText}>
                <Text style={styles.commentName}>{comment.user}: </Text>{comment.text}
              </Text>
            ))}
            {item.comments.length > 8 && <Text style={styles.mutedText}>More comments are available in the student app.</Text>}
          </View>
        )}
      </View>
    </View>
  );

  const renderReport = ({ item }) => (
    <View style={styles.card}>
      {item.reel ? <VideoCard reel={item.reel} /> : (
        <View style={styles.deletedVideo}><Text style={styles.mutedText}>Reported reel is no longer available</Text></View>
      )}
      <View style={styles.reelDetails}>
        <View style={styles.reportReason}>
          <Ionicons name="flag" size={15} color="#fda4af" />
          <Text style={styles.reportReasonText}>{item.reason}</Text>
        </View>
        {item.reel ? (
          <>
            <Text style={styles.cardTitle}>{item.reel.creatorName || 'Campus Creator'}</Text>
            <Text style={styles.reelCaption}>{item.reel.caption || 'No caption'}</Text>
            <Text style={styles.reelStats}>Reel {item.reelId} · {formatDate(item.createdAt)}</Text>
          </>
        ) : <Text style={styles.reelStats}>Reel {item.reelId}</Text>}
        <Text style={styles.reporterText}>
          Reported by {item.reporter?.anonymousName || 'Student'} ({item.reporter?.email || 'account unavailable'})
        </Text>
        <View style={styles.reportActions}>
          {item.reel && (
            <TouchableOpacity style={styles.deleteReelButton} onPress={() => deleteReel(item.reel)}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>Delete reel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondaryButton} onPress={() => updateReport(item, 'dismissed')}>
            <Text style={styles.secondaryButtonText}>Dismiss</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => updateReport(item, 'resolved')}>
            <Text style={styles.secondaryButtonText}>Resolve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderBroadcast = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.broadcastHistoryCard}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.announcementMessage}>{item.message}</Text>
        <Text style={styles.mutedText}>{formatDate(item.createdAt)}</Text>
      </View>
    </View>
  );

  const renderRelease = ({ item, index }) => (
    <View style={styles.card}>
      <View style={styles.releaseHistoryCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, styles.releaseAvatar]}>
            <Ionicons name="arrow-up-circle-outline" size={20} color="#f9a8d4" />
          </View>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>Version {item.versionName}</Text>
            <Text style={styles.cardSubtitle}>Android version code {item.versionCode} · {formatDate(item.createdAt)}</Text>
          </View>
          {index === 0 && <Text style={styles.currentReleaseBadge}>LATEST</Text>}
        </View>
        {item.notes ? <Text style={styles.announcementMessage}>{item.notes}</Text> : null}
      </View>
    </View>
  );

  const renderBroadcastComposer = () => (
    <View style={styles.composerCard}>
      <Text style={styles.composerTitle}>Send a message to every student</Text>
      <Text style={styles.composerHint}>
        A push notification goes to devices that allowed notifications. Everyone can also see the latest messages in Me.
      </Text>
      <Text style={styles.fieldLabel}>Notification title</Text>
      <TextInput
        style={styles.input}
        value={broadcastTitle}
        onChangeText={setBroadcastTitle}
        placeholder="For example: Campus update"
        placeholderTextColor="#6c7487"
        maxLength={80}
      />
      <Text style={styles.fieldLabel}>Message</Text>
      <TextInput
        style={[styles.input, styles.messageInput]}
        value={broadcastMessage}
        onChangeText={setBroadcastMessage}
        placeholder="Write the message for students"
        placeholderTextColor="#6c7487"
        multiline
        maxLength={500}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={sendBroadcast} disabled={broadcastBusy}>
        {broadcastBusy
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryButtonText}>Send broadcast</Text>}
      </TouchableOpacity>
    </View>
  );

  const renderReleaseComposer = () => (
    <View style={styles.composerCard}>
      <Text style={styles.composerTitle}>Publish a student-app update</Text>
      <Text style={styles.composerHint}>
        Upload the signed APK made for PMC Leela. Keep the same Android package name and signing key as the installed app, and increase its version code.
      </Text>
      <Field label="Version name (for example 1.2.0)" value={releaseVersionName} onChangeText={setReleaseVersionName} />
      <Field label="Android version code (must increase)" value={releaseVersionCode} onChangeText={setReleaseVersionCode} keyboardType="number-pad" />
      <Text style={styles.fieldLabel}>Release notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.messageInput]}
        value={releaseNotes}
        onChangeText={setReleaseNotes}
        placeholder="What changed in this release?"
        placeholderTextColor="#6c7487"
        multiline
        maxLength={1000}
      />
      <TouchableOpacity style={styles.secondaryButton} onPress={chooseApk}>
        <Ionicons name="document-attach-outline" size={17} color="#f9a8d4" />
        <Text style={styles.secondaryButtonText}>{apkAsset?.name || 'Choose signed APK'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryButton} onPress={publishRelease} disabled={releaseBusy}>
        {releaseBusy
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryButtonText}>Publish update and notify students</Text>}
      </TouchableOpacity>
    </View>
  );

  if (!token) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled">
          <View style={styles.loginMark}>
            <Ionicons name="shield-checkmark" size={35} color="#f9a8d4" />
          </View>
          <Text style={styles.brandEyebrow}>PMC LEELA</Text>
          <Text style={styles.loginTitle}>Admin console</Text>
          <Text style={styles.loginCopy}>Private moderation and account management</Text>
          <Field label="Admin email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Admin password" value={password} onChangeText={setPassword} secureTextEntry />
          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={signIn} disabled={loginBusy}>
            {loginBusy
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryButtonText}>Sign in securely</Text>}
          </TouchableOpacity>
          <Text style={styles.loginFootnote}>Admin access is configured by the PMC server administrator.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brandEyebrow}>PMC LEELA</Text>
          <Text style={styles.screenTitle}>Admin console</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={() => setToken('')}>
          <Ionicons name="log-out-outline" size={19} color="#d8dbea" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        showsHorizontalScrollIndicator={false}
      >
        {[
          { id: 'reports', title: 'Reports', icon: 'flag-outline', count: reports.length },
          { id: 'users', title: 'Users', icon: 'people-outline', count: users.length },
          { id: 'reels', title: 'Reels', icon: 'play-circle-outline', count: reels.length },
          { id: 'broadcast', title: 'Broadcast', icon: 'megaphone-outline', count: broadcasts.length },
          { id: 'update', title: 'App update', icon: 'cloud-upload-outline', count: appReleases.length }
        ].map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.tabButton, tab === item.id && styles.tabButtonActive]}
            onPress={() => setTab(item.id)}
          >
            <Ionicons name={item.icon} size={17} color={tab === item.id ? '#f9a8d4' : '#8992a7'} />
            <Text style={[styles.tabButtonText, tab === item.id && styles.tabButtonTextActive]}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.contentHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            {tab === 'users'
              ? 'Student accounts'
              : tab === 'reels'
                ? reelOwnerFilter ? `Reels · ${reelOwnerFilter.name}` : 'All reels'
                : tab === 'broadcast'
                  ? 'Broadcast messages'
                  : tab === 'update'
                    ? 'Student app releases'
                    : 'Reel reports'}
          </Text>
          <Text style={styles.mutedText}>
            {tab === 'reports'
              ? 'Review reports and moderate campus content.'
              : tab === 'broadcast'
                ? 'Send a push notification to registered devices.'
                : tab === 'update'
                  ? 'Upload and announce a signed Android APK.'
                  : 'Private administrator view'}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={loadTab}>
          <Ionicons name="refresh" size={18} color="#e2e8f0" />
        </TouchableOpacity>
      </View>

      {tab === 'reels' && reelOwnerFilter && (
        <TouchableOpacity style={styles.clearFilterButton} onPress={() => setReelOwnerFilter(null)}>
          <Ionicons name="close-circle-outline" size={15} color="#f9a8d4" />
          <Text style={styles.clearFilterText}>Show all reels</Text>
        </TouchableOpacity>
      )}

      {tab === 'reports' && (
        <View style={styles.filterRow}>
          {REPORT_FILTERS.map(filter => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, reportFilter === filter && styles.filterChipActive]}
              onPress={() => setReportFilter(filter)}
            >
              <Text style={[styles.filterText, reportFilter === filter && styles.filterTextActive]}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {tab === 'users' && (
        <TouchableOpacity style={styles.addUserButton} onPress={() => setAddUserVisible(true)}>
          <Ionicons name="person-add-outline" size={17} color="#fff" />
          <Text style={styles.primaryButtonText}>Add student account</Text>
        </TouchableOpacity>
      )}

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loader} size="large" color="#ec4899" /> : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          renderItem={
            tab === 'users' ? renderUser
              : tab === 'reels' ? renderReel
                : tab === 'reports' ? renderReport
                  : tab === 'broadcast' ? renderBroadcast
                    : renderRelease
          }
          ListHeaderComponent={
            tab === 'broadcast' ? renderBroadcastComposer()
              : tab === 'update' ? renderReleaseComposer()
                : null
          }
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadTab}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name={
                  tab === 'reports' ? 'checkmark-done-outline'
                    : tab === 'users' ? 'people-outline'
                      : tab === 'reels' ? 'videocam-outline'
                        : tab === 'broadcast' ? 'megaphone-outline'
                          : 'cloud-upload-outline'
                }
                size={36}
                color="#717b90"
              />
              <Text style={styles.emptyText}>
                {tab === 'reports' ? `No ${reportFilter} reports`
                  : tab === 'users' ? 'No student accounts'
                    : tab === 'reels' ? 'No reels'
                      : tab === 'broadcast' ? 'No broadcasts yet'
                        : 'No app releases published'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={addUserVisible} transparent animationType="slide" onRequestClose={() => setAddUserVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.formSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.sectionTitle}>Add a student</Text>
                <Text style={styles.mutedText}>This account will be marked email-verified.</Text>
              </View>
              <TouchableOpacity onPress={() => setAddUserVisible(false)}>
                <Ionicons name="close" size={24} color="#aab2c2" />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Full name" value={newUser.fullName} onChangeText={value => updateNewUser('fullName', value)} autoCapitalize="words" />
              <Field label="MANIT student email" value={newUser.email} onChangeText={value => updateNewUser('email', value)} keyboardType="email-address" />
              <Field label="Campus name" value={newUser.anonymousName} onChangeText={value => updateNewUser('anonymousName', value)} autoCapitalize="words" />
              <Field label="Initial password (12+ characters)" value={newUser.password} onChangeText={value => updateNewUser('password', value)} secureTextEntry />
              <Field label="Phone" value={newUser.phone} onChangeText={value => updateNewUser('phone', value)} keyboardType="phone-pad" />
              <Field label="Academic year" value={newUser.academicYear} onChangeText={value => updateNewUser('academicYear', value)} />
              <Field label="Hostel" value={newUser.hostel} onChangeText={value => updateNewUser('hostel', value)} autoCapitalize="words" />
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.genderChoices}>
                {['female', 'male'].map(gender => (
                  <TouchableOpacity
                    key={gender}
                    style={[styles.genderChoice, newUser.gender === gender && styles.genderChoiceActive]}
                    onPress={() => updateNewUser('gender', gender)}
                  >
                    <Text style={[styles.genderChoiceText, newUser.gender === gender && styles.genderChoiceTextActive]}>
                      {gender === 'female' ? 'Girl' : 'Boy'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={createUser} disabled={addUserBusy}>
                {addUserBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create account</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080a10' },
  loginScreen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 38 },
  loginMark: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(236,72,153,0.12)',
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.25)', alignItems: 'center',
    justifyContent: 'center', marginBottom: 22
  },
  brandEyebrow: { color: '#f472b6', fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  loginTitle: { color: '#f8fafc', fontSize: 29, fontWeight: '800', marginTop: 6 },
  loginCopy: { color: '#929bad', fontSize: 13, marginTop: 8, marginBottom: 32 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: '#bac2d1', fontSize: 12, fontWeight: '600', marginBottom: 7 },
  input: {
    minHeight: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#121622',
    borderWidth: 1, borderColor: '#252b39', color: '#f8fafc', fontSize: 14
  },
  primaryButton: {
    minHeight: 48, borderRadius: 13, backgroundColor: '#db2777', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 16, marginTop: 8
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  loginFootnote: { color: '#747e92', fontSize: 11, lineHeight: 16, marginTop: 22 },
  errorText: { color: '#fda4af', fontSize: 12, lineHeight: 17, marginTop: 12 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 18 : 52, paddingBottom: 16
  },
  screenTitle: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginTop: 4 },
  logoutButton: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: '#151925',
    borderWidth: 1, borderColor: '#252b39', alignItems: 'center', justifyContent: 'center'
  },
  tabBar: {
    flexGrow: 0, marginHorizontal: 16, borderRadius: 14,
    backgroundColor: '#121622', borderWidth: 1, borderColor: '#252b39'
  },
  tabBarContent: {
    flexDirection: 'row',
    padding: 5
  },
  tabButton: {
    width: 104, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10
  },
  tabButtonActive: { backgroundColor: 'rgba(236,72,153,0.12)' },
  tabButtonText: { color: '#8992a7', fontSize: 12, fontWeight: '600' },
  tabButtonTextActive: { color: '#f9a8d4' },
  contentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10
  },
  sectionTitle: { color: '#edf0f7', fontSize: 17, fontWeight: '700' },
  mutedText: { color: '#8992a7', fontSize: 11, marginTop: 4 },
  refreshButton: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#151925',
    alignItems: 'center', justifyContent: 'center'
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  filterChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#141824', borderWidth: 1, borderColor: '#252b39'
  },
  filterChipActive: { backgroundColor: 'rgba(236,72,153,0.13)', borderColor: 'rgba(236,72,153,0.35)' },
  filterText: { color: '#9aa3b6', fontSize: 11, fontWeight: '600' },
  filterTextActive: { color: '#f9a8d4' },
  addUserButton: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#db2777', borderRadius: 12, paddingVertical: 12, marginHorizontal: 20, marginTop: 6
  },
  loader: { marginTop: 50 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, flexGrow: 1 },
  card: {
    backgroundColor: '#11151f', borderRadius: 17, borderWidth: 1, borderColor: '#252b39',
    overflow: 'hidden', marginBottom: 13
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { backgroundColor: 'rgba(236,72,153,0.12)' },
  reelAvatar: { backgroundColor: 'rgba(236,72,153,0.12)' },
  cardHeading: { flex: 1, minWidth: 0, marginLeft: 10 },
  cardTitle: { color: '#f1f4fa', fontSize: 13, fontWeight: '700' },
  cardSubtitle: { color: '#929bad', fontSize: 10.5, marginTop: 4 },
  dangerIconButton: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center'
  },
  detailGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingBottom: 13,
    borderTopWidth: 1, borderTopColor: '#202531'
  },
  detailItem: { width: '50%', paddingTop: 11, paddingRight: 8 },
  detailLabel: { color: '#788196', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  detailValue: { color: '#dce1eb', fontSize: 11.5, marginTop: 4 },
  composerCard: {
    backgroundColor: '#11151f', borderRadius: 17, borderWidth: 1, borderColor: '#303447',
    padding: 16, marginBottom: 14
  },
  composerTitle: { color: '#f1f4fa', fontSize: 15, fontWeight: '700' },
  composerHint: { color: '#929bad', fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 14 },
  messageInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
  announcementMessage: { color: '#c1c5d0', fontSize: 12, lineHeight: 18, marginTop: 8 },
  broadcastHistoryCard: { padding: 15 },
  releaseHistoryCard: { paddingBottom: 14 },
  releaseAvatar: { backgroundColor: 'rgba(236,72,153,0.12)' },
  currentReleaseBadge: {
    color: '#9fe5c8', fontSize: 9, fontWeight: '800', letterSpacing: 0.6,
    backgroundColor: 'rgba(16,185,129,0.09)', paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, overflow: 'hidden'
  },
  viewContentButton: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#202531'
  },
  viewContentText: { color: '#f9a8d4', fontSize: 11.5, fontWeight: '700' },
  clearFilterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  clearFilterText: { color: '#f9a8d4', fontSize: 11, fontWeight: '600' },
  video: { width: '100%', height: 360, backgroundColor: '#05060a' },
  videoUnavailable: {
    height: 170, backgroundColor: '#090c13', alignItems: 'center', justifyContent: 'center', gap: 8
  },
  reelDetails: { padding: 14 },
  reelCaption: { color: '#e1e5ee', fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  reelStats: { color: '#8992a7', fontSize: 10, marginTop: 8 },
  commentList: { borderTopWidth: 1, borderTopColor: '#252b39', marginTop: 12, paddingTop: 10 },
  subheading: { color: '#bfc7d5', fontSize: 11, fontWeight: '700', marginBottom: 7 },
  commentText: { color: '#aeb6c6', fontSize: 11, lineHeight: 16, marginBottom: 5 },
  commentName: { color: '#f9a8d4', fontWeight: '700' },
  deletedVideo: { height: 90, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090c13' },
  reportReason: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 9, paddingVertical: 6,
    borderRadius: 9, marginBottom: 11
  },
  reportReasonText: { color: '#fda4af', fontSize: 11, fontWeight: '700' },
  reporterText: { color: '#b8c0cf', fontSize: 10.5, marginTop: 9 },
  reportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  deleteReelButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#be123c',
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10
  },
  secondaryButton: {
    minWidth: 62, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1b2030', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9
  },
  secondaryButtonText: { color: '#c4cbda', fontSize: 10.5, fontWeight: '700' },
  emptyState: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#8992a7', fontSize: 12, marginTop: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  formSheet: {
    maxHeight: '92%', backgroundColor: '#10141e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#3b4354', alignSelf: 'center', marginBottom: 17 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  genderChoices: { flexDirection: 'row', gap: 9, marginTop: 9, marginBottom: 15 },
  genderChoice: {
    flex: 1, alignItems: 'center', paddingVertical: 11, backgroundColor: '#171c28',
    borderWidth: 1, borderColor: '#2a3040', borderRadius: 11
  },
  genderChoiceActive: { backgroundColor: 'rgba(236,72,153,0.12)', borderColor: '#ec4899' },
  genderChoiceText: { color: '#9aa3b6', fontSize: 12, fontWeight: '600' },
  genderChoiceTextActive: { color: '#f9a8d4' }
});
