import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import io from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import CoupleLogo from '../components/CoupleLogo';
import { getSocketUrl } from '../config';

const WAITING_STATUSES = [
  'Scanning Piya Milan Chauraha...',
  'Finding someone online across campus (Boy or Girl)...',
  'Checking Hostels 1-10 & SAC...',
  'Matching with a random student...',
  'Connecting your anonymous heartbeat...'
];

const formatYearShort = (val) => {
  if (!val) return '1st';
  const str = String(val).toLowerCase();
  if (str.includes('1')) return '1st';
  if (str.includes('2')) return '2nd';
  if (str.includes('3')) return '3rd';
  if (str.includes('4')) return '4th';
  return val;
};

export default function PmcChatScreen({ serverHost, currentUser, onActiveChatChange }) {
  // Session States: 'idle' | 'waiting' | 'chatting' | 'ended'
  const [chatState, setChatState] = useState('idle');
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partnerAlias, setPartnerAlias] = useState('');
  const [partnerGender, setPartnerGender] = useState('female'); // 'female' | 'male'
  const [partnerAcademicYear, setPartnerAcademicYear] = useState('');
  const [myAlias, setMyAlias] = useState('');
  const [myAcademicYear, setMyAcademicYear] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [fullImageModal, setFullImageModal] = useState(null);
  const [waitingStatusIndex, setWaitingStatusIndex] = useState(0);

  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Radar & Heart Pulse Animation for Waiting screen
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(0.8)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

  // Blinking Glow Animation for Female Pink Indicator
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const screenTransition = useRef(new Animated.Value(1)).current;

  // Floating Love Particles Animations for Ambient Background
  const floatH1 = useRef(new Animated.Value(0)).current;
  const floatH2 = useRef(new Animated.Value(0)).current;
  const floatH3 = useRef(new Animated.Value(0)).current;
  const floatH4 = useRef(new Animated.Value(0)).current;
  const floatH5 = useRef(new Animated.Value(0)).current;

  const opacityH1 = useRef(new Animated.Value(0)).current;
  const opacityH2 = useRef(new Animated.Value(0)).current;
  const opacityH3 = useRef(new Animated.Value(0)).current;
  const opacityH4 = useRef(new Animated.Value(0)).current;
  const opacityH5 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (chatState !== 'idle') return undefined;
    const travelDistance = Dimensions.get('window').height + 120;
    [floatH1, floatH2, floatH3, floatH4, floatH5].forEach(value => value.setValue(0));
    [opacityH1, opacityH2, opacityH3, opacityH4, opacityH5].forEach(value => value.setValue(0));
    const animateHeart = (animY, animOpacity, duration, delay = 0) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(animY, {
              toValue: -travelDistance,
              duration: duration,
              easing: Easing.linear,
              isInteraction: false,
              useNativeDriver: true
            }),
            Animated.sequence([
              Animated.timing(animOpacity, {
                toValue: 0.85,
                duration: 800,
                isInteraction: false,
                useNativeDriver: true
              }),
              Animated.timing(animOpacity, {
                toValue: 0.85,
                duration: duration - 1600,
                isInteraction: false,
                useNativeDriver: true
              }),
              Animated.timing(animOpacity, {
                toValue: 0,
                duration: 800,
                isInteraction: false,
                useNativeDriver: true
              })
            ])
          ]),
          Animated.parallel([
            Animated.timing(animY, { toValue: 0, duration: 16, isInteraction: false, useNativeDriver: true }),
            Animated.timing(animOpacity, { toValue: 0, duration: 16, isInteraction: false, useNativeDriver: true })
          ])
        ])
      );
    };

    const l1 = animateHeart(floatH1, opacityH1, 6000, 0);
    const l2 = animateHeart(floatH2, opacityH2, 7200, 1200);
    const l3 = animateHeart(floatH3, opacityH3, 6500, 2400);
    const l4 = animateHeart(floatH4, opacityH4, 8000, 3600);
    const l5 = animateHeart(floatH5, opacityH5, 7000, 4800);

    l1.start();
    l2.start();
    l3.start();
    l4.start();
    l5.start();

    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
      l4.stop();
      l5.stop();
    };
  }, [chatState]);

  useEffect(() => {
    screenTransition.setValue(0);
    const transition = Animated.timing(screenTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    });
    transition.start();
    return () => transition.stop();
  }, [chatState, screenTransition]);

  useEffect(() => {
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.25,
          duration: 700,
          useNativeDriver: true
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true
        })
      ])
    );
    blinkLoop.start();
    return () => blinkLoop.stop();
  }, []);

  useEffect(() => {
    if (chatState === 'waiting') {
      const pulse = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.4,
              duration: 1600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1600,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true
            })
          ]),
          Animated.sequence([
            Animated.timing(pulseAnim2, {
              toValue: 1.65,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true
            }),
            Animated.timing(pulseAnim2, {
              toValue: 0.8,
              duration: 2000,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true
            })
          ]),
          Animated.sequence([
            Animated.timing(heartBeatAnim, {
              toValue: 1.25,
              duration: 800,
              easing: Easing.out(Easing.back(1.5)),
              useNativeDriver: true
            }),
            Animated.timing(heartBeatAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true
            })
          ])
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [chatState]);

  useEffect(() => {
    if (chatState !== 'waiting') return undefined;
    const interval = setInterval(() => {
      setWaitingStatusIndex((prev) => (prev + 1) % WAITING_STATUSES.length);
    }, 900);
    return () => clearInterval(interval);
  }, [chatState]);

  // Keep parent updated on active chat status
  useEffect(() => {
    if (onActiveChatChange) {
      onActiveChatChange(chatState === 'chatting' ? partnerAlias : null);
    }
  }, [chatState, partnerAlias]);

  // Socket initialization
  useEffect(() => {
    const socketUrl = getSocketUrl(serverHost);
    const s = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      timeout: 10000,
      auth: { userId: String(currentUser?.id || currentUser?.email || '') }
    });

    s.on('online_stats', (stats) => {
      setOnlineCount(Number.isFinite(stats?.totalConnected) ? stats.totalConnected : 0);
    });

    s.on('waiting', () => {
      setChatState('waiting');
    });

    s.on('matched', (data) => {
      setMessages([]);
      setPartnerAlias(data.partnerAlias);
      setPartnerGender(data.partnerGender || 'female');
      setPartnerAcademicYear(data.partnerAcademicYear || 'Student');
      setMyAlias(data.yourAlias);
      setMyAcademicYear(data.yourAcademicYear || currentUser?.academicYear || 'Student');
      setChatState('chatting');
      setIsPartnerTyping(false);
    });

    s.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setIsPartnerTyping(false);
    });

    s.on('partner_typing', ({ isTyping }) => {
      setIsPartnerTyping(isTyping);
    });

    s.on('error_message', ({ message }) => {
      Alert.alert('Chat unavailable', message || 'Please try again.');
    });

    s.on('partner_disconnected', (data) => {
      wipeAndEndChat(data.reason || 'Stranger left the chauraha.');
    });

    setSocket(s);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      s.removeAllListeners();
      s.disconnect();
    };
  }, [serverHost, currentUser?.id]);

  const wipeAndEndChat = (notice) => {
    setMessages([]);
    setPartnerAlias('');
    setPartnerAcademicYear('');
    setMyAlias('');
    setMyAcademicYear('');
    setIsPartnerTyping(false);
    setChatState('idle');
    if (notice) {
      Alert.alert('Session Ended', notice);
    }
  };

  const startSearch = () => {
    if (!socket?.connected) {
      Alert.alert('Connection unavailable', 'Could not connect to the chat server. Please try again.');
      return;
    }
    setMessages([]);
    socket.emit('search_partner', {
      gender: currentUser?.gender || 'male',
      preferredAlias: currentUser?.anonymousName,
      academicYear: currentUser?.academicYear || 'Student'
    });
    setChatState('waiting');
  };

  const handleNext = () => {
    if (!socket?.connected) {
      Alert.alert('Connection unavailable', 'Could not connect to the chat server. Please try again.');
      return;
    }
    setMessages([]);
    setPartnerAlias('');
    setPartnerAcademicYear('');
    setMyAlias('');
    setMyAcademicYear('');
    setIsPartnerTyping(false);
    socket.emit('next_partner', {
      gender: currentUser?.gender || 'male',
      preferredAlias: currentUser?.anonymousName,
      academicYear: currentUser?.academicYear || 'Student'
    });
    setChatState('waiting');
  };

  const handleEndChat = () => {
    Alert.alert(
      'Leave Piya Milan Chauraha?',
      'This will permanently burn this chat and wipe all messages & photos for both of you.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Burn & End',
          style: 'destructive',
          onPress: () => {
            if (socket) {
              socket.emit('leave_chat');
            }
            wipeAndEndChat();
          }
        }
      ]
    );
  };

  const handleSendText = () => {
    const trimmed = inputText.trim();
    if (!trimmed || !socket) return;

    const myMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      type: 'text',
      text: trimmed,
      senderAlias: myAlias,
      isMe: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, myMessage]);
    socket.emit('send_message', { text: trimmed });
    setInputText('');
    socket.emit('typing_status', { isTyping: false });
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Permission to access gallery is required to send photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.6,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;

        const myMessage = {
          id: `img_${Date.now()}_${Math.random()}`,
          type: 'image',
          image: base64Image,
          senderAlias: myAlias,
          isMe: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages((prev) => [...prev, myMessage]);
        if (socket) {
          socket.emit('send_image', { image: base64Image });
        }
      }
    } catch (err) {
      console.error('Image pick error:', err);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);
    if (!socket) return;

    socket.emit('typing_status', { isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_status', { isTyping: false });
    }, 1500);
  };

  // ---------------- RENDER LOBBY (ROMANTIC ATMOSPHERE & COUPLE LOGO) ----------------
  if (chatState === 'idle') {
    return (
      <Animated.View style={[styles.darkCanvas, { opacity: screenTransition }]}>
        {/* Ambient Floating Love Particles Generating from Connect with Piya Section */}
        <Animated.View style={[styles.floatingHeartItem, { left: '12%', bottom: 120, opacity: opacityH1, transform: [{ translateY: floatH1 }] }]}>
          <Ionicons name="heart" size={18} color="#ec4899" />
        </Animated.View>
        <Animated.View style={[styles.floatingHeartItem, { left: '30%', bottom: 110, opacity: opacityH2, transform: [{ translateY: floatH2 }] }]}>
          <Ionicons name="heart" size={14} color="#f472b6" />
        </Animated.View>
        <Animated.View style={[styles.floatingHeartItem, { left: '50%', bottom: 125, opacity: opacityH3, transform: [{ translateY: floatH3 }] }]}>
          <Ionicons name="heart" size={22} color="#db2777" />
        </Animated.View>
        <Animated.View style={[styles.floatingHeartItem, { left: '68%', bottom: 115, opacity: opacityH4, transform: [{ translateY: floatH4 }] }]}>
          <Ionicons name="heart" size={16} color="#fda4af" />
        </Animated.View>
        <Animated.View style={[styles.floatingHeartItem, { left: '84%', bottom: 120, opacity: opacityH5, transform: [{ translateY: floatH5 }] }]}>
          <Ionicons name="heart" size={20} color="#f472b6" />
        </Animated.View>

        <View style={styles.lobbyContent}>
          {/* Header Presence Dot */}
          <View style={styles.liveBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.liveBadgeText}>
              {onlineCount} {onlineCount === 1 ? 'Piya Online' : 'Piyas Online'}
            </Text>
          </View>

          {/* Animated Couple Emblem */}
          <View style={styles.logoContainer}>
            <CoupleLogo size={145} />
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.titleHindi}></Text>
          <Text style={[styles.titleHindi, { fontSize: 80 }]}>P M C</Text>

          <Text style={styles.titleHindi}></Text>
          <Text style={styles.luxurySubtitle}>Piya Milan Chauraha </Text>
          {/* <Text style={styles.luxurySubtitle}>•</Text> */}
          <Text style={styles.luxurySubtitle}>Anonymous Campus Chit Chat </Text>


          {/* Current Persona Badge */}
          <View style={styles.personaBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.personaLabel}>Your Persona: </Text>
              <Text style={styles.personaValue}>{currentUser?.anonymousName || 'Hostel Senior'}</Text>
            </View>
            <View style={styles.personaYearTag}>
              <Text style={styles.personaYearTagText}>{formatYearShort(currentUser?.academicYear)}</Text>
            </View>
          </View>

          {/* Action Button: Connect with Piya */}
          <TouchableOpacity
            style={styles.luxuryButton}
            onPress={startSearch}
            activeOpacity={0.85}
          >
            <Ionicons name="heart" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.luxuryButtonText}>Connect with Piya</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  // ---------------- RENDER WAITING STATE (CONNECTING TO PIYA + PULSING PINK HEART) ----------------
  if (chatState === 'waiting') {
    return (
      <Animated.View style={[styles.darkCanvas, { opacity: screenTransition }]}>
        <View style={styles.waitingContent}>
          {/* Pulsing Concentric Radar Rings with Pulsating Pink Heart */}
          <View style={styles.radarBox}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim2 }] }]} />
            <Animated.View style={[styles.pulseRingInner, { transform: [{ scale: pulseAnim }] }]} />
            <Animated.View style={[styles.radarCore, { transform: [{ scale: heartBeatAnim }] }]}>
              <Ionicons name="heart" size={42} color="#ec4899" />
            </Animated.View>
          </View>

          <Text style={styles.waitingTitle}>Connecting to Piya</Text>
          <Text style={styles.waitingTagline}>
            {WAITING_STATUSES[waitingStatusIndex]}
          </Text>

          <View style={styles.randomIndicatorRow}>
            <View style={styles.randomMiniDotGreen} />
            <Text style={styles.randomHintText}>Random Match: Boy or Girl</Text>
            <View style={styles.randomMiniDotRed} />
          </View>

          <TouchableOpacity
            style={styles.cancelPill}
            onPress={() => {
              if (socket) socket.emit('leave_chat');
              setChatState('idle');
            }}
          >
            <Text style={styles.cancelPillText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  // ---------------- RENDER ACTIVE CHAT (WITH GENDER INDICATORS: GIRL=GREEN, BOY=RED) ----------------
  return (
    <KeyboardAvoidingView
      style={[styles.chatCanvas, { opacity: screenTransition }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      {/* Sleek Top Navigation Bar */}
      <View style={styles.chatNav}>
        <View style={styles.navUser}>
          {/* Avatar with Gender Indicator Dot */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarOrb}>
              <Ionicons name="person" size={20} color="#cbd5e1" />
            </View>

            {/* GENDER DOT INDICATOR:
                - Female (Girl): Green glowing blinking dot
                - Male (Boy): Red glowing blinking dot
            */}
            {partnerGender === 'female' ? (
              <Animated.View style={[styles.greenBlinkingDot, { opacity: blinkAnim }]} />
            ) : (
              <Animated.View style={[styles.redBlinkingDot, { opacity: blinkAnim }]} />
            )}
          </View>

          <View style={{ marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.partnerAliasText} numberOfLines={1}>
                {partnerAlias || 'Stranger'}
              </Text>
              <Text style={styles.genderLabelMini}>
                {partnerGender === 'female' ? ' (Girl)' : ' (Boy)'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
              <View style={styles.partnerYearPill}>
                <Text style={styles.partnerYearPillText}>
                  {formatYearShort(partnerAcademicYear)}
                </Text>
              </View>
              <Text style={styles.statusDotLine}>
                • {isPartnerTyping ? 'typing...' : 'Online'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.navControls}>
          <TouchableOpacity style={styles.aglaPill} onPress={handleNext} activeOpacity={0.8}>
            <Ionicons name="refresh" size={14} color="#f472b6" />
            <Text style={styles.aglaText}>Next</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endChatButton}
            onPress={handleEndChat}
            accessibilityRole="button"
            accessibilityLabel="End chat"
          >
            <Ionicons name="stop-circle-outline" size={16} color="#fda4af" />
            <Text style={styles.endChatText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Burn Guarantee Ribbon (No emojis) */}
      <View style={styles.burnRibbon}>
        <Text style={styles.burnRibbonText}>
          One-time chat: All messages and photos are permanently wiped on exit
        </Text>
      </View>

      {/* Message Stream */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageStream}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMe = item.isMe;
          return (
            <View style={[styles.msgRow, isMe ? styles.rowMe : styles.rowThem]}>
              <View style={[styles.chatBubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {item.type === 'text' && (
                  <Text style={isMe ? styles.textMe : styles.textThem}>{item.text}</Text>
                )}

                {item.type === 'image' && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setFullImageModal(item.image)}
                  >
                    <Image
                      source={{ uri: item.image }}
                      style={styles.chatPhoto}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}

                <View style={styles.metaLine}>
                  <Text style={styles.msgTime}>{item.timestamp}</Text>
                  {isMe && (
                    <Ionicons
                      name="checkmark-done"
                      size={13}
                      color="#f472b6"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Typing Toast */}
      {isPartnerTyping && (
        <View style={styles.typingIndicatorBar}>
          <Text style={styles.typingIndicatorText}>{partnerAlias} is typing...</Text>
        </View>
      )}

      {/* Modern Floating Input Bar */}
      <View style={styles.floatingInputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage}>
          <Ionicons name="camera-outline" size={22} color="#e2e8f0" />
        </TouchableOpacity>

        <TextInput
          style={styles.modernInput}
          placeholder="Type message..."
          placeholderTextColor="#64748b"
          value={inputText}
          onChangeText={handleTextChange}
          returnKeyType="send"
          onSubmitEditing={handleSendText}
        />

        <TouchableOpacity
          style={[styles.sendOrb, !inputText.trim() && styles.sendOrbDisabled]}
          onPress={handleSendText}
          disabled={!inputText.trim()}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Full Image Preview Modal */}
      <Modal visible={!!fullImageModal} transparent={true} animationType="fade">
        <View style={styles.fullImageBackdrop}>
          <TouchableOpacity
            style={styles.closeFullImage}
            onPress={() => setFullImageModal(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {fullImageModal && (
            <Image
              source={{ uri: fullImageModal }}
              style={styles.expandedImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  darkCanvas: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'center',
    alignItems: 'center'
  },
  ambientGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#831843',
    opacity: 0.12,
    top: '25%'
  },
  lobbyContent: {
    alignItems: 'center',
    width: '88%',
    maxWidth: 380
  },
  floatingHeartItem: {
    position: 'absolute',
    zIndex: 1
  },
  logoContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8
  },
  liveBadgeText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '500'
  },
  radarCenterGraphic: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28
  },
  ring3: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.12)'
  },
  ring2: {
    position: 'absolute',
    width: 105,
    height: 105,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.22)'
  },
  ring1: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#151322',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.35)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  titleHindi: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 4
  },
  mainTitleEnglish: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f472b6',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 6
  },
  luxurySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20
  },
  perksRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20
  },
  perkPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  perkText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600'
  },
  personaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#121420',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 28,
    gap: 8
  },
  personaLabel: {
    color: '#64748b',
    fontSize: 12
  },
  personaValue: {
    color: '#f472b6',
    fontSize: 12,
    fontWeight: '700'
  },
  personaYearTag: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.3)'
  },
  personaYearTagText: {
    color: '#f472b6',
    fontSize: 10.5,
    fontWeight: '700'
  },
  partnerYearPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginRight: 6
  },
  partnerYearPillText: {
    color: '#38bdf8',
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  luxuryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#db2777',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 28,
    shadowColor: '#db2777',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  },
  luxuryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  waitingContent: {
    alignItems: 'center',
    width: '80%'
  },
  radarBox: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.25)',
    backgroundColor: 'rgba(236, 72, 153, 0.05)'
  },
  pulseRingInner: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.45)',
    backgroundColor: 'rgba(236, 72, 153, 0.1)'
  },
  radarCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#201026',
    borderWidth: 1.5,
    borderColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center'
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8
  },
  waitingTagline: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32
  },
  cancelPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20
  },
  cancelPillText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600'
  },
  chatCanvas: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  chatNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0c0e17',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  navUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  avatarContainer: {
    position: 'relative'
  },
  avatarOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1b1e2e',
    justifyContent: 'center',
    alignItems: 'center'
  },
  // Girl Gender Indicator: Green Glowing Blinking Dot
  greenBlinkingDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#0c0e17',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8
  },
  // Boy Gender Indicator: Red Glowing Blinking Dot
  redBlinkingDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#0c0e17',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8
  },
  partnerAliasText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15
  },
  genderLabelMini: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 4
  },
  statusDotLine: {
    color: '#10b981',
    fontSize: 11,
    marginTop: 2
  },
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  aglaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 114, 182, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  aglaText: {
    color: '#f472b6',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 4
  },
  endChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16
  },
  endChatText: {
    color: '#fda4af',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 4
  },
  burnRibbon: {
    backgroundColor: '#130c14',
    paddingVertical: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.15)'
  },
  burnRibbonText: {
    color: '#fda4af',
    fontSize: 11,
    fontWeight: '500'
  },
  messageStream: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  msgRow: {
    marginVertical: 4,
    flexDirection: 'row'
  },
  rowMe: {
    justifyContent: 'flex-end'
  },
  rowThem: {
    justifyContent: 'flex-start'
  },
  chatBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  bubbleMe: {
    backgroundColor: '#be185d',
    borderBottomRightRadius: 4
  },
  bubbleThem: {
    backgroundColor: '#161926',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  textMe: {
    color: '#ffffff',
    fontSize: 14.5,
    lineHeight: 20
  },
  textThem: {
    color: '#f1f5f9',
    fontSize: 14.5,
    lineHeight: 20
  },
  chatPhoto: {
    width: 220,
    height: 180,
    borderRadius: 14,
    marginBottom: 4
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 3
  },
  msgTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)'
  },
  typingIndicatorBar: {
    paddingHorizontal: 20,
    paddingBottom: 6
  },
  typingIndicatorText: {
    color: '#f472b6',
    fontSize: 12,
    fontStyle: 'italic'
  },
  floatingInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0c0e17',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  attachBtn: {
    padding: 8
  },
  modernInput: {
    flex: 1,
    backgroundColor: '#141724',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 14.5,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  sendOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#db2777',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendOrbDisabled: {
    backgroundColor: '#272a3a',
    opacity: 0.5
  },
  fullImageBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  closeFullImage: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 8,
    zIndex: 10
  },
  expandedImage: {
    width: '92%',
    height: '80%'
  },
  randomIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 20,
    gap: 8
  },
  randomMiniDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981'
  },
  randomMiniDotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444'
  },
  randomHintText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  }
});
