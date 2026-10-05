import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl } from '../config';

export default function CampusAuthScreen({ serverHost, onUpdateServerHost }) {
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('student@manit.ac.in');
  const [isVerified, setIsVerified] = useState(true);
  const [ipInput, setIpInput] = useState(serverHost);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your MANIT college email address.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/verify-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setIsVerified(true);
        setVerifiedEmail(email.trim());
        Alert.alert('Campus Identity Verified! 🎓', data.message);
      } else {
        Alert.alert('Verification Failed', data.message);
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to reach backend server. Check server IP below.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIp = () => {
    onUpdateServerHost(ipInput.trim());
    Alert.alert('Updated', `Backend server connected to: ${ipInput.trim()}:5000`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* MANIT Crest / Emblem Badge */}
      <View style={styles.badgeContainer}>
        <View style={styles.avatarCircle}>
          <Text style={{ fontSize: 36 }}>🏛️</Text>
        </View>
        <Text style={styles.title}>PMC लीला</Text>
        <Text style={styles.subtitle}>MANIT Bhopal Campus Pass</Text>
      </View>

      {/* Verified Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons
            name={isVerified ? 'shield-checkmark' : 'alert-circle'}
            size={22}
            color={isVerified ? '#10b981' : '#f59e0b'}
          />
          <Text style={styles.cardTitle}>Student Gatekeeper</Text>
        </View>

        {isVerified ? (
          <View style={styles.verifiedBox}>
            <Text style={styles.verifiedBadge}>VERIFIED MANITIAN</Text>
            <Text style={styles.verifiedEmail}>{verifiedEmail}</Text>
            <Text style={styles.verifiedNotice}>
              ✅ You have full access to Piya Milan Chauraha anonymous chat & Leela campus reels.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.inputLabel}>Official Student Email</Text>
            <TextInput
              style={styles.input}
              placeholder="scholar@manit.ac.in"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={loading}>
              <Text style={styles.verifyBtnText}>
                {loading ? 'Verifying...' : 'Verify @manit.ac.in'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Ephemeral Privacy Guidelines */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flame-outline" size={22} color="#f87171" />
          <Text style={styles.cardTitle}>Piya Milan Chauraha Rules</Text>
        </View>
        <Text style={styles.ruleItem}>🔥 <Text style={styles.ruleBold}>1-Time Session:</Text> Exiting wipes everything permanently. Neither you nor the stranger can view history.</Text>
        <Text style={styles.ruleItem}>🎭 <Text style={styles.ruleBold}>Random Pseudonyms:</Text> Both users are given fun campus aliases (e.g. Hostel 4 Maggi Chef, PMC Chai Lover).</Text>
        <Text style={styles.ruleItem}>🛡️ <Text style={styles.ruleBold}>Safe Campus:</Text> Abuse or harassment will result in a ban of your verified scholar email.</Text>
      </View>

      {/* Network & Server Connection Settings */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="wifi-outline" size={22} color="#38bdf8" />
          <Text style={styles.cardTitle}>Backend Server IP</Text>
        </View>
        <Text style={styles.hint}>
          Connect mobile Expo app to your laptop's Wi-Fi IP:
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={ipInput}
            onChangeText={setIpInput}
            placeholder="e.g. 10.68.7.167 or localhost"
            placeholderTextColor="#64748b"
          />
          <TouchableOpacity style={styles.saveIpBtn} onPress={handleSaveIp}>
            <Text style={styles.saveIpText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090a0f'
  },
  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40
  },
  badgeContainer: {
    alignItems: 'center',
    marginBottom: 24
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#23153d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff'
  },
  subtitle: {
    fontSize: 13,
    color: '#c084fc',
    marginTop: 2
  },
  card: {
    backgroundColor: '#121524',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e2438'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  cardTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8
  },
  verifiedBox: {
    backgroundColor: '#064e3b',
    padding: 14,
    borderRadius: 12
  },
  verifiedBadge: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1
  },
  verifiedEmail: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4
  },
  verifiedNotice: {
    color: '#a7f3d0',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6
  },
  input: {
    backgroundColor: '#1a1f33',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 12
  },
  verifyBtn: {
    backgroundColor: '#9333ea',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  verifyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  ruleItem: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 4
  },
  ruleBold: {
    color: '#f1f5f9',
    fontWeight: '700'
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18
  },
  saveIpBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginLeft: 8
  },
  saveIpText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  }
});
