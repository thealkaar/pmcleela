import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import CoupleLogo from '../components/CoupleLogo';
import { getBaseUrl } from '../config';

const SUGGESTED_PERSONAS = [
  'Hostel 4 Senior',
  'SAC Member',
  'Library Reader',
  'PMC Regular',
  'Hostel 7 Scholar',
  'Technosearch Coder',
  'Nescafe Enthusiast'
];

export default function LoginScreen({ serverHost, onLoginSuccess }) {
  // Terms Gate State
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Auth Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Register Step: 'form' | 'otp'
  const [regStep, setRegStep] = useState('form');

  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State (all initial fields blank - NO autofills)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState(''); // 'female' | 'male'
  const [academicYear, setAcademicYear] = useState(''); // '1st Year' | '2nd Year' | '3rd Year' | '4th Year'
  const [anonymousName, setAnonymousName] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);

  // OTP State
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [otpSentVisible, setOtpSentVisible] = useState(false);

  // Timer countdown for OTP
  useEffect(() => {
    let timer = null;
    if (regStep === 'otp' && otpTimer > 0) {
      timer = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    } else if (otpTimer === 0) {
      setCanResend(true);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [regStep, otpTimer]);

  // Validate MANIT Student Email
  const isValidManitEmail = (val) => {
    if (!val) return false;
    return /^([a-zA-Z0-9._%+-]+)@stu\.manit\.ac\.in$/i.test(val.trim());
  };

  // Derive Academic Year from Scholar Number prefix in email (Reference year: 2026)
  const deriveAcademicYearFromEmail = (val) => {
    if (!val) return null;
    const match = val.trim().toLowerCase().match(/^([a-z0-9._%+-]+)@stu\.manit\.ac\.in$/i);
    if (!match) return null;
    const digits = match[1].match(/^(\d{2})/);
    if (!digits) return null;
    const prefix = parseInt(digits[1], 10);
    const diff = 26 - prefix; // Current 2026 academic year
    if (diff <= 0) return '1st';
    if (diff === 1) return '2nd';
    if (diff === 2) return '3rd';
    if (diff >= 3) return '4th';
    return '1st';
  };

  const handleEmailChange = (val) => {
    setEmail(val);
    const detectedYear = deriveAcademicYearFromEmail(val);
    if (detectedYear) {
      setAcademicYear(detectedYear);
    }
  };

  const handlePickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to upload a profile photo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        setAvatarUri(res.assets[0].uri);
      }
    } catch (e) {
      console.log('Avatar picker error:', e);
    }
  };

  const handleRandomizePersona = () => {
    const randomChoice = SUGGESTED_PERSONAS[Math.floor(Math.random() * SUGGESTED_PERSONAS.length)];
    setAnonymousName(randomChoice);
  };

  // Step 1: Send OTP to MANIT Email
  const handleSendOtp = async () => {
    if (!fullName.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }
    if (!phone.trim() || phone.trim().replace(/\D/g, '').length < 10) {
      Alert.alert('Phone Required', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your MANIT college email.');
      return;
    }
    if (!isValidManitEmail(email)) {
      Alert.alert(
        'Invalid Email Format',
        'Only official MANIT student emails are allowed (e.g. scholarNO@stu.manit.ac.in).'
      );
      return;
    }
    if (!password.trim() || password.length < 6) {
      Alert.alert('Password Required', 'Password must be at least 6 characters long.');
      return;
    }
    if (!gender) {
      Alert.alert('Gender Required', 'Please select your gender.');
      return;
    }
    if (!academicYear) {
      Alert.alert('Academic Year Required', 'Please select which year you are currently in (1st, 2nd, 3rd, or 4th Year).');
      return;
    }
    if (!anonymousName.trim()) {
      Alert.alert('Anonymous Name Required', 'Please enter your anonymous persona name.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setRegStep('otp');
        setOtpCode('');
        setOtpTimer(60);
        setCanResend(false);
        setOtpSentVisible(true);
      } else {
        Alert.alert('Notice', data.message || 'Could not send verification OTP.');
      }
    } catch (err) {
      console.log('Send OTP error:', err);
      Alert.alert('Connection Error', 'Could not reach server. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP & Create Account
  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      Alert.alert('OTP Required', 'Please enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/verify-and-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otpCode.trim(),
          fullName: fullName.trim(),
          phone: phone.trim(),
          password: password.trim(),
          gender,
          academicYear,
          anonymousName: anonymousName.trim(),
          avatarUrl: avatarUri
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        onLoginSuccess(data.user);
      } else {
        Alert.alert('Verification Failed', data.message || 'Invalid verification code.');
      }
    } catch (err) {
      console.log('Verify OTP error:', err);
      Alert.alert('Connection Error', 'Could not verify with server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Login
  const handleLoginSubmit = async () => {
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email/username and password.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${getBaseUrl(serverHost)}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword.trim()
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        onLoginSuccess(data.user);
      } else {
        Alert.alert('Login Failed', data.message || 'Invalid credentials.');
      }
    } catch (err) {
      console.log('Login error:', err);
      Alert.alert('Connection Error', 'Could not reach server. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 1. CLEAN TERMS & CONDITIONS GATE
  // ==========================================
  if (!hasAcceptedTerms) {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateCard}>
          <View style={styles.gateHeader}>
            <Ionicons name="shield-checkmark" size={36} color="#ec4899" />
            <Text style={styles.gateTitle}>Campus Code of Conduct</Text>
            <Text style={styles.gateSubtitle}>MANIT Safety & Privacy Agreement</Text>
          </View>

          <View style={styles.termsBox}>
            <View style={styles.termRow}>
              <Ionicons name="ban-outline" size={18} color="#ef4444" style={styles.termIcon} />
              <Text style={styles.termText}>
                <Text style={styles.termBold}>Zero Nudity Tolerance: </Text>
                Posting or sharing any sexually explicit, pornographic, or vulgar content is strictly prohibited. Violators face immediate permanent ban and official disciplinary action.
              </Text>
            </View>

            <View style={styles.termRow}>
              <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" style={styles.termIcon} />
              <Text style={styles.termText}>
                <Text style={styles.termBold}>No Harassment: </Text>
                Bullying, hate speech, abusive language, stalking, or harassment will lead to immediate expulsion from the platform.
              </Text>
            </View>

            <View style={styles.termRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#10b981" style={styles.termIcon} />
              <Text style={styles.termText}>
                <Text style={styles.termBold}>Privacy & Authenticity: </Text>
                Your name, email, and phone number are collected solely for student authenticity and safety. They are strictly private and never shown to others. Only your anonymous name is visible.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.checkboxContainer}
            activeOpacity={0.8}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <View style={[styles.checkboxBox, agreedToTerms && styles.checkboxBoxChecked]}>
              {agreedToTerms && <Ionicons name="checkmark" size={14} color="#ffffff" />}
            </View>
            <Text style={styles.checkboxText}>
              I accept the Campus Terms and agree to follow all safety guidelines.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, !agreedToTerms && styles.btnDisabled]}
            disabled={!agreedToTerms}
            onPress={() => setHasAcceptedTerms(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Accept & Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==========================================
  // 2. CLEAN AUTH SCREEN (LOGIN & REGISTER)
  // ==========================================
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <CoupleLogo size={80} />
          <Text style={styles.brandTitle}>पी एम सी <Text style={{ color: '#ec4899' }}>Leela</Text></Text>
          <Text style={styles.brandSub}>MANIT Campus Portal</Text>
        </View>

        {/* Auth Mode Toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, authMode === 'login' && styles.tabBtnActive]}
            onPress={() => {
              setAuthMode('login');
              setRegStep('form');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, authMode === 'login' && styles.tabBtnTextActive]}>
              Log In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, authMode === 'register' && styles.tabBtnActive]}
            onPress={() => setAuthMode('register')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, authMode === 'register' && styles.tabBtnTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* ================= LOGIN FORM ================= */}
        {authMode === 'login' && (
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email or Anonymous Name</Text>
              <TextInput
                style={styles.inputField}
                placeholder="scholarNO@stu.manit.ac.in"
                placeholderTextColor="#64748b"
                value={loginIdentifier}
                onChangeText={setLoginIdentifier}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#64748b"
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleLoginSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>Log In</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ================= REGISTER: STEP 1 (FORM) ================= */}
        {authMode === 'register' && regStep === 'form' && (
          <View style={styles.formCard}>
            {/* Avatar Picker */}
            <View style={styles.avatarCenter}>
              <TouchableOpacity style={styles.avatarCircle} onPress={handlePickAvatar} activeOpacity={0.8}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="camera-outline" size={28} color="#94a3b8" />
                )}
              </TouchableOpacity>
              <Text style={styles.avatarText}>Add Photo (Optional)</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Student Full Name</Text>
              <TextInput
                style={styles.inputField}
                placeholder="Your full name"
                placeholderTextColor="#64748b"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.inputField}
                placeholder="10-digit mobile number"
                placeholderTextColor="#64748b"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>College Email ID</Text>
              <TextInput
                style={[
                  styles.inputField,
                  email.trim().length > 0 && (
                    isValidManitEmail(email)
                      ? { borderColor: '#10b981' }
                      : { borderColor: '#ef4444' }
                  )
                ]}
                placeholder="scholarNO@stu.manit.ac.in"
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={handleEmailChange}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {email.trim().length > 0 && (
                <View style={styles.emailValidationRow}>
                  {isValidManitEmail(email) ? (
                    <>
                      <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                      <Text style={styles.emailValidText}>Valid MANIT email</Text>
                      {deriveAcademicYearFromEmail(email) && (
                        <Text style={styles.autoDetectedYearText}>
                          • Auto-detected: {deriveAcademicYearFromEmail(email)}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={14} color="#ef4444" />
                      <Text style={styles.emailInvalidText}>Must be scholarNO@stu.manit.ac.in</Text>
                    </>
                  )}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.inputField}
                placeholder="At least 6 characters"
                placeholderTextColor="#64748b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Gender Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.genderRow}>
                <TouchableOpacity
                  style={[styles.genderBtn, gender === 'female' && styles.genderBtnActiveFemale]}
                  onPress={() => setGender('female')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.genderBtnText, gender === 'female' && styles.genderBtnTextActive]}>
                    Girl 👧
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.genderBtn, gender === 'male' && styles.genderBtnActiveMale]}
                  onPress={() => setGender('male')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.genderBtnText, gender === 'male' && styles.genderBtnTextActive]}>
                    Boy 👦
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Academic Year Selection (Seniority / Respect) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Academic Year (College Seniority)</Text>
                {academicYear ? (
                  <Text style={styles.yearVerifiedHint}>
                    {academicYear === '1st' ? 'Junior 🎒' : academicYear === '4th' ? 'Senior 👑' : 'Scholar 🎓'}
                  </Text>
                ) : null}
              </View>
              <View style={styles.yearGrid}>
                {['1st', '2nd', '3rd', '4th'].map((yr) => (
                  <TouchableOpacity
                    key={yr}
                    style={[
                      styles.yearBtn,
                      academicYear === yr && styles.yearBtnActive
                    ]}
                    onPress={() => setAcademicYear(yr)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.yearBtnText, academicYear === yr && styles.yearBtnTextActive]}>
                      {yr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Anonymous Persona Name */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Anonymous Name</Text>
                <TouchableOpacity onPress={handleRandomizePersona}>
                  <Text style={styles.randomBtn}>🎲 Suggest</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="Choose your anonymous name"
                placeholderTextColor="#64748b"
                value={anonymousName}
                onChangeText={setAnonymousName}
              />
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyBox}>
              <Ionicons name="lock-closed" size={14} color="#10b981" />
              <Text style={styles.privacyText}>
                Your name, email & phone are strictly for safety. Only your anonymous name is shown to others.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSendOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Verification OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ================= REGISTER: STEP 2 (OTP) ================= */}
        {authMode === 'register' && regStep === 'otp' && (
          <View style={styles.formCard}>
            <View style={styles.otpHeader}>
              <Ionicons name="mail-open-outline" size={36} color="#ec4899" />
              <Text style={styles.otpTitle}>Verify College Email</Text>
              <Text style={styles.otpSub}>
                Enter the 6-digit OTP code sent to:
              </Text>
              <Text style={styles.otpEmail}>{email.trim()}</Text>
            </View>

            <View style={styles.inputGroup}>
              <TextInput
                style={styles.otpInputField}
                placeholder="• • • • • •"
                placeholderTextColor="#475569"
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
              />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleVerifyOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.otpFooter}>
              {canResend ? (
                <TouchableOpacity onPress={handleSendOtp}>
                  <Text style={styles.resendLink}>Resend Code</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.resendTimer}>Resend in {otpTimer}s</Text>
              )}

              <TouchableOpacity style={styles.backLink} onPress={() => setRegStep('form')}>
                <Text style={styles.backLinkText}>← Edit Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={otpSentVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpSentVisible(false)}
      >
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successModalIcon}>
              <Ionicons name="mail-open" size={30} color="#f9a8d4" />
            </View>
            <Text style={styles.successModalEyebrow}>EMAIL VERIFICATION</Text>
            <Text style={styles.successModalTitle}>Code on its way</Text>
            <Text style={styles.successModalMessage}>
              We sent a one-time code to your MANIT inbox.
            </Text>
            <View style={styles.successModalEmailRow}>
              <Ionicons name="mail-outline" size={17} color="#f9a8d4" />
              <Text style={styles.successModalEmail} numberOfLines={1}>{email.trim()}</Text>
            </View>
            <Text style={styles.successModalHint}>If it’s not there, check your spam folder.</Text>
            <TouchableOpacity
              style={styles.successModalButton}
              onPress={() => setOtpSentVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.successModalButtonText}>Enter verification code</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40
  },
  // Terms Gate Styles
  gateContainer: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  gateCard: {
    backgroundColor: '#111422',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  gateHeader: {
    alignItems: 'center',
    marginBottom: 20
  },
  gateTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10
  },
  gateSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2
  },
  termsBox: {
    backgroundColor: '#0c0e17',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)'
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  termIcon: {
    marginTop: 2,
    marginRight: 10
  },
  termText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18
  },
  termBold: {
    color: '#f8fafc',
    fontWeight: '700'
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#0c0e17'
  },
  checkboxBoxChecked: {
    backgroundColor: '#ec4899'
  },
  checkboxText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 16
  },
  btnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6
  },
  // Brand Header
  brandHeader: {
    alignItems: 'center',
    marginBottom: 24
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 4
  },
  brandSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2
  },
  // Tab Toggle
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: '#111422',
    borderRadius: 22,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 18
  },
  tabBtnActive: {
    backgroundColor: '#ec4899'
  },
  tabBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600'
  },
  tabBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  // Form Card
  formCard: {
    backgroundColor: '#111422',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  avatarCenter: {
    alignItems: 'center',
    marginBottom: 16
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#181c2d',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ec4899'
  },
  avatarImg: {
    width: 70,
    height: 70,
    borderRadius: 35
  },
  avatarText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 6
  },
  inputGroup: {
    marginBottom: 14
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6
  },
  randomBtn: {
    color: '#ec4899',
    fontSize: 11.5,
    fontWeight: '600'
  },
  inputField: {
    backgroundColor: '#0c0e17',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#ffffff',
    fontSize: 13.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  emailValidationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4
  },
  emailValidText: {
    color: '#10b981',
    fontSize: 11.5,
    fontWeight: '600'
  },
  autoDetectedYearText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600'
  },
  emailInvalidText: {
    color: '#ef4444',
    fontSize: 11.5,
    fontWeight: '500'
  },
  yearVerifiedHint: {
    color: '#34d399',
    fontSize: 11.5,
    fontWeight: '700'
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  yearBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0c0e17',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  yearBtnActive: {
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.14)'
  },
  yearBtnText: {
    color: '#94a3b8',
    fontSize: 12.5,
    fontWeight: '600'
  },
  yearBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0e17',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#ffffff',
    fontSize: 13.5
  },
  eyeButton: {
    padding: 10
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10
  },
  genderBtn: {
    flex: 1,
    backgroundColor: '#0c0e17',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  genderBtnActiveFemale: {
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.12)'
  },
  genderBtnActiveMale: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)'
  },
  genderBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600'
  },
  genderBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    gap: 8
  },
  privacyText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15
  },
  primaryBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700'
  },
  // OTP Step Styles
  otpHeader: {
    alignItems: 'center',
    marginBottom: 20
  },
  otpTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10
  },
  otpSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4
  },
  otpEmail: {
    color: '#ec4899',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  otpInputField: {
    backgroundColor: '#0c0e17',
    borderRadius: 14,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 22,
    letterSpacing: 8,
    fontWeight: '700',
    borderWidth: 1.5,
    borderColor: '#ec4899'
  },
  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 4
  },
  resendLink: {
    color: '#ec4899',
    fontSize: 12.5,
    fontWeight: '600'
  },
  resendTimer: {
    color: '#64748b',
    fontSize: 12
  },
  backLink: {
    paddingVertical: 4
  },
  backLinkText: {
    color: '#94a3b8',
    fontSize: 12
  },
  successModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(3, 7, 18, 0.78)'
  },
  successModalCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 26,
    backgroundColor: '#111422',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.28)'
  },
  successModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.24)',
    marginBottom: 18
  },
  successModalEyebrow: {
    color: '#f472b6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5
  },
  successModalTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 7
  },
  successModalMessage: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8
  },
  successModalEmailRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.2)'
  },
  successModalEmail: {
    flexShrink: 1,
    color: '#fce7f3',
    fontSize: 13,
    fontWeight: '700'
  },
  successModalHint: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12
  },
  successModalButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    marginTop: 22,
    borderRadius: 15,
    backgroundColor: '#db2777'
  },
  successModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  }
});
