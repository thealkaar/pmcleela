import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, ActivityIndicator, Animated, Easing, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from './src/screens/LoginScreen';
import PmcChatScreen from './src/screens/PmcChatScreen';
import LeelaReelsScreen from './src/screens/LeelaReelsScreen';
import MeProfileScreen from './src/screens/MeProfileScreen';
import { DEFAULT_HOST, getBaseUrl } from './src/config';

const USER_STORAGE_KEY = '@pmc_leela_current_user';
const PUSH_TOKEN_STORAGE_KEY = '@pmc_leela_push_token';

function withoutRealName(user) {
  if (!user) return user;
  const sanitizedUser = { ...user };
  delete sanitizedUser.fullName;
  return sanitizedUser;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const deriveYear = (user) => {
  if (!user) return user;
  if (user.academicYear && ['1st', '2nd', '3rd', '4th'].includes(user.academicYear)) {
    return user;
  }
  const refStr = user.scholarNo || user.email || '';
  const match = refStr.match(/^(\d{2})/);
  if (match) {
    const prefix = parseInt(match[1], 10);
    const diff = 26 - prefix; // Current 2026 academic year
    if (diff <= 0) user.academicYear = '1st';
    else if (diff === 1) user.academicYear = '2nd';
    else if (diff === 2) user.academicYear = '3rd';
    else if (diff >= 3) user.academicYear = '4th';
  } else {
    user.academicYear = user.academicYear || '1st';
  }
  return user;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentTab, setCurrentTab] = useState('pmc'); // 'pmc' | 'leela' | 'me'
  const [pendingReelId, setPendingReelId] = useState(null);
  const [serverHost, setServerHost] = useState(DEFAULT_HOST);
  const [activeChatPartner, setActiveChatPartner] = useState(null);
  const tabTransitionOpacity = React.useRef(new Animated.Value(1)).current;
  const tabTransitionId = React.useRef(0);
  const interfaceTransitionOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener(() => {
      setCurrentTab('me');
    });
    return () => responseListener.remove();
  }, []);

  const handleIncomingUrl = React.useCallback((url) => {
    const match = url.match(/^pmcleela:\/\/reel\/([^/?#]+)\/?$/i);
    if (!match) return;

    let reelId;
    try {
      reelId = decodeURIComponent(match[1]);
    } catch (error) {
      console.warn('[Deep link] Invalid reel ID in shared URL:', error.message);
      return;
    }
    if (!reelId) return;

    setPendingReelId(reelId);
    setCurrentTab('leela');
  }, []);

  useEffect(() => {
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        if (active && url) handleIncomingUrl(url);
      })
      .catch((error) => console.warn('[Deep link] Could not read launch URL:', error.message));

    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  const handleReelOpened = React.useCallback((reelId) => {
    setPendingReelId((currentReelId) => currentReelId === reelId ? null : currentReelId);
  }, []);

  const switchTab = (tab) => {
    if (tab === currentTab) return;
    const transitionId = ++tabTransitionId.current;
    tabTransitionOpacity.stopAnimation();
    Animated.timing(tabTransitionOpacity, {
      toValue: 0,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished || transitionId !== tabTransitionId.current) return;
      setCurrentTab(tab);
      Animated.timing(tabTransitionOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      }).start();
    });
  };

  React.useEffect(() => {
    interfaceTransitionOpacity.setValue(0);
    const transition = Animated.timing(interfaceTransitionOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    });
    transition.start();
    return () => transition.stop();
  }, [Boolean(currentUser), isInitializing, interfaceTransitionOpacity]);

  // Load saved session on app launch
  useEffect(() => {
    async function loadSession() {
      try {
        const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (stored) {
          const parsed = deriveYear(withoutRealName(JSON.parse(stored)));
          setCurrentUser(parsed);
          await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (err) {
        console.log('Error loading saved user session:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    loadSession();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function registerForPushNotifications() {
      if (!currentUser?.id || Platform.OS === 'web' || !Device.isDevice) return;
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('announcements', {
            name: 'PMC announcements',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250]
          });
        }

        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') {
          permission = await Notifications.requestPermissionsAsync();
        }
        if (permission.status !== 'granted') return;

        const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) throw new Error('Expo project ID is missing from the app configuration.');
        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) return;

        await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenResult.data);
        const response = await fetch(`${getBaseUrl(serverHost)}/api/push/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            token: tokenResult.data,
            platform: Platform.OS
          })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || `Push registration failed (${response.status}).`);
        }
      } catch (error) {
        console.warn('[Push] Could not register this device:', error.message);
      }
    }
    registerForPushNotifications();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, serverHost]);

  const handleLoginSuccess = async (user) => {
    const fixedUser = deriveYear(withoutRealName(user));
    setCurrentUser(fixedUser);
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fixedUser));
    } catch (err) {
      console.log('Error saving user session:', err);
    }
  };

  const handleLogout = async () => {
    AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY).then(async (pushToken) => {
      if (!pushToken) return;
      try {
        await fetch(`${getBaseUrl(serverHost)}/api/push/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pushToken })
        });
      } catch (error) {
        console.warn('[Push] Could not unregister this device:', error.message);
      } finally {
        await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      }
    }).catch(error => console.warn('[Push] Could not read the saved device token:', error.message));
    setActiveChatPartner(null);
    setCurrentUser(null);
    setCurrentTab('pmc');
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    } catch (err) {
      console.log('Error removing user session:', err);
    }
  };

  const handleUpdateCurrentUser = async (updated) => {
    setCurrentUser(updated);
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.log('Error updating user session:', err);
    }
  };

  const handleDeleteAccount = async () => {
    setActiveChatPartner(null);
    setCurrentUser(null);
    setCurrentTab('pmc');
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    } catch (err) {
      console.log('Error clearing session after account deletion:', err);
    }
  };

  if (isInitializing) {
    return (
      <Animated.View style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center', opacity: interfaceTransitionOpacity }]}>
        <ActivityIndicator size="large" color="#ec4899" />
      </Animated.View>
    );
  }

  // If not logged in, render dual-mode Login / Register screen
  if (!currentUser) {
    return (
      <Animated.View style={{ flex: 1, opacity: interfaceTransitionOpacity }}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <LoginScreen
          serverHost={serverHost}
          onLoginSuccess={handleLoginSuccess}
        />
      </SafeAreaView>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: interfaceTransitionOpacity }}>
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Floating Active Chat Banner if user is browsing Reels or Me while chatting */}
      {activeChatPartner && currentTab !== 'pmc' && (
        <TouchableOpacity
          style={styles.floatingActiveBanner}
          activeOpacity={0.9}
          onPress={() => switchTab('pmc')}
        >
          <View style={styles.activeDot} />
          <Text style={styles.floatingBannerText} numberOfLines={1}>
            Chatting with <Text style={{ fontWeight: '700', color: '#fff' }}>{activeChatPartner}</Text>
          </Text>
          <Text style={styles.floatingReturnHint}>Return →</Text>
        </TouchableOpacity>
      )}

      {/* Keep screens mounted so chat never disconnects when switching tabs */}
      <Animated.View style={[styles.screensContainer, { opacity: tabTransitionOpacity }]}>
        {/* Tab 1: पी एम सी (Piya Milan Chauraha) */}
        <View
          style={[
            styles.screenWrapper,
            { display: currentTab === 'pmc' ? 'flex' : 'none' }
          ]}
        >
          <PmcChatScreen
            serverHost={serverHost}
            currentUser={currentUser}
            onActiveChatChange={(partner) => setActiveChatPartner(partner)}
          />
        </View>

        {/* Tab 2: Leela (Campus Reels) */}
        <View
          style={[
            styles.screenWrapper,
            { display: currentTab === 'leela' ? 'flex' : 'none' }
          ]}
        >
          <LeelaReelsScreen
            serverHost={serverHost}
            currentUser={currentUser}
            isTabActive={currentTab === 'leela'}
            reelIdToOpen={pendingReelId}
            onReelOpened={handleReelOpened}
          />
        </View>

        {/* Tab 3: Me (Profile) */}
        <View
          style={[
            styles.screenWrapper,
            { display: currentTab === 'me' ? 'flex' : 'none' }
          ]}
        >
          <MeProfileScreen
            currentUser={currentUser}
            onUpdateCurrentUser={handleUpdateCurrentUser}
            onLogout={handleLogout}
            serverHost={serverHost}
            isTabActive={currentTab === 'me'}
            onDeleteAccount={handleDeleteAccount}
          />
        </View>
      </Animated.View>

      {/* Luxury Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        {/* Tab 1: पी एम सी */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => switchTab('pmc')}
          activeOpacity={0.75}
        >
          <View style={styles.tabIconContainer}>
            <Ionicons
              name={currentTab === 'pmc' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={22}
              color={currentTab === 'pmc' ? '#ec4899' : '#64748b'}
            />
            {activeChatPartner && currentTab !== 'pmc' && <View style={styles.tabBadgeDot} />}
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'pmc' && styles.activeTabLabel
            ]}
          >
            पी एम सी
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Leela */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => switchTab('leela')}
          activeOpacity={0.75}
        >
          <View style={styles.tabIconContainer}>
            <Ionicons
              name={currentTab === 'leela' ? 'play-circle' : 'play-circle-outline'}
              size={23}
              color={currentTab === 'leela' ? '#ec4899' : '#64748b'}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'leela' && styles.activeTabLabel
            ]}
          >
            Leela
          </Text>
        </TouchableOpacity>

        {/* Tab 3: Me */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => switchTab('me')}
          activeOpacity={0.75}
        >
          <View style={styles.tabIconContainer}>
            <Ionicons
              name={currentTab === 'me' ? 'person' : 'person-outline'}
              size={21}
              color={currentTab === 'me' ? '#ec4899' : '#64748b'}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'me' && styles.activeTabLabel
            ]}
          >
            Me
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  floatingActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#831843',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 100
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
    marginRight: 8
  },
  floatingBannerText: {
    color: '#fce7f3',
    fontSize: 13,
    flex: 1
  },
  floatingReturnHint: {
    color: '#fbcfe8',
    fontSize: 12,
    fontWeight: '700'
  },
  screensContainer: {
    flex: 1
  },
  screenWrapper: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: '#0c0e17',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 4
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  tabIconContainer: {
    position: 'relative'
  },
  tabBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ec4899'
  },
  tabLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2
  },
  activeTabLabel: {
    color: '#ec4899',
    fontWeight: '700'
  }
});
