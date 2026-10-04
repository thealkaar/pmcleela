import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Platform, ActivityIndicator, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from './src/screens/LoginScreen';
import PmcChatScreen from './src/screens/PmcChatScreen';
import LeelaReelsScreen from './src/screens/LeelaReelsScreen';
import MeProfileScreen from './src/screens/MeProfileScreen';
import { DEFAULT_HOST } from './src/config';

const USER_STORAGE_KEY = '@pmc_leela_current_user';

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
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentTab, setCurrentTab] = useState('pmc'); // 'pmc' | 'leela' | 'me'
  const [serverHost, setServerHost] = useState(DEFAULT_HOST);
  const [activeChatPartner, setActiveChatPartner] = useState(null);
  const tabTransitionOpacity = React.useRef(new Animated.Value(1)).current;
  const tabTransitionId = React.useRef(0);
  const interfaceTransitionOpacity = React.useRef(new Animated.Value(0)).current;

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
          const parsed = deriveYear(JSON.parse(stored));
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

  const handleLoginSuccess = async (user) => {
    const fixedUser = deriveYear(user);
    setCurrentUser(fixedUser);
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fixedUser));
    } catch (err) {
      console.log('Error saving user session:', err);
    }
  };

  const handleLogout = async () => {
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
      <SafeAreaView style={styles.safeArea}>
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
    <SafeAreaView style={styles.safeArea}>
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
    backgroundColor: '#07080c',
    paddingTop: Platform.OS === 'android' ? 30 : 0
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
