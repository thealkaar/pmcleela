import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  Dimensions,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackgroundReelUpload from '../../modules/background-reel-upload/src';
import VideoSlideTrimmer from '../components/VideoSlideTrimmer';
import { getBaseUrl, REEL_SHARE_BASE_URL } from '../config';

const formatYearShort = (val) => {
  if (!val) return '1st';
  const str = String(val).toLowerCase();
  if (str.includes('1')) return '1st';
  if (str.includes('2')) return '2nd';
  if (str.includes('3')) return '3rd';
  if (str.includes('4')) return '4th';
  return val;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REEL_HEIGHT = SCREEN_HEIGHT - 65;
const MAX_REEL_DURATION_SECONDS = 40;
const MAX_REEL_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

function shuffleReelsByDay(reels) {
  const seenIds = new Set();
  const reelsByDay = new Map();

  for (const reel of reels) {
    if (reel?.id == null || seenIds.has(String(reel.id))) continue;
    seenIds.add(String(reel.id));

    const createdAt = new Date(reel.createdAt);
    const dayStart = Number.isNaN(createdAt.getTime())
      ? 0
      : new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()).getTime();
    const dayReels = reelsByDay.get(dayStart) || [];
    dayReels.push(reel);
    reelsByDay.set(dayStart, dayReels);
  }

  return Array.from(reelsByDay.entries())
    .sort(([dayA], [dayB]) => dayB - dayA)
    .flatMap(([, dayReels]) => {
      for (let index = dayReels.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [dayReels[index], dayReels[swapIndex]] = [dayReels[swapIndex], dayReels[index]];
      }
      return dayReels;
    });
}

function formatCommentAge(createdAt, now = Date.now()) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const elapsedMs = Math.max(0, now - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return `${elapsedMonths} mo ago`;

  const elapsedYears = Math.floor(elapsedDays / 365);
  return `${elapsedYears} yr ago`;
}

// Fullscreen WhatsApp-Style Slide & Trim Story Editor Component
function VideoStoryEditor({
  videoUri,
  currentUser,
  uploading,
  uploadProgress,
  onClose,
  onPublish
}) {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isOriginalAudioMuted, setIsOriginalAudioMuted] = useState(false);
  const [cropMode, setCropMode] = useState('9:16');
  const [caption, setCaption] = useState('');
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [videoLoadError, setVideoLoadError] = useState(null);
  const [isCaptionKeyboardVisible, setIsCaptionKeyboardVisible] = useState(false);
  const durationInitialized = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setIsCaptionKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsCaptionKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = isOriginalAudioMuted;
  });

  useEffect(() => {
    if (!player) return;

    const initializeDuration = (duration) => {
      if (durationInitialized.current || !Number.isFinite(duration) || duration <= 0) return;
      durationInitialized.current = true;
      setTotalDuration(duration);
      setTrimEnd(Math.min(15, duration));
      setVideoLoadError(null);
      if (!uploading) player.play();
    };

    const sourceSubscription = player.addListener('sourceLoad', ({ duration }) => {
      initializeDuration(duration);
    });
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') {
        setVideoLoadError(error?.message || 'This video could not be opened. Please select another video.');
      } else if (status === 'readyToPlay') {
        initializeDuration(Number(player.duration));
      }
    });

    if (player.status === 'readyToPlay') {
      initializeDuration(Number(player.duration));
    } else if (player.status === 'error') {
      setVideoLoadError('This video could not be opened. Please select another video.');
    }

    const loadTimeout = setTimeout(() => {
      if (!durationInitialized.current) {
        setVideoLoadError('The video is taking too long to load. Please select another video or try a smaller clip.');
      }
    }, 30000);

    return () => {
      clearTimeout(loadTimeout);
      sourceSubscription.remove();
      statusSubscription.remove();
    };
  }, [player, videoUri, uploading]);

  useEffect(() => {
    if (!player || !durationInitialized.current) return;
    if (uploading) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, uploading]);

  // Keep preview playback within the selected trim range.
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      if (uploading) return;
      try {
        if (trimEnd > trimStart && player.currentTime >= trimEnd) {
          player.currentTime = trimStart;
          player.play();
        } else if (player.currentTime < trimStart) {
          player.currentTime = trimStart;
        }
      } catch (e) {}
    }, 200);
    return () => clearInterval(interval);
  }, [player, trimStart, trimEnd, uploading]);

  useEffect(() => {
    if (!player || uploading) return undefined;
    const interval = setInterval(() => {
      const currentTime = Number(player.currentTime);
      if (Number.isFinite(currentTime)) setPlaybackTime(currentTime);
    }, 50);
    return () => clearInterval(interval);
  }, [player, uploading]);

  useEffect(() => {
    if (player) {
      player.muted = isOriginalAudioMuted;
    }
  }, [isOriginalAudioMuted, player]);

  const handleSeekPreview = (timeSec) => {
    if (player) {
      try {
        player.currentTime = Math.max(0, Math.min(timeSec, totalDuration || timeSec));
        player.play();
      } catch (e) {}
    }
  };

  const handleTrimChange = (newStart, newEnd) => {
    const boundedStart = Math.max(0, Math.min(newStart, totalDuration));
    const boundedEnd = Math.max(
      boundedStart,
      Math.min(newEnd, totalDuration, boundedStart + MAX_REEL_DURATION_SECONDS)
    );
    setTrimStart(boundedStart);
    setTrimEnd(boundedEnd);
  };

  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false
      });
      if (result.canceled) return;

      const audio = result.assets?.[0];
      if (!audio) {
        Alert.alert('Could Not Select Music', 'Choose an audio file stored on your device.');
        return;
      }
      if (audio.size && audio.size > MAX_REEL_AUDIO_SIZE_BYTES) {
        Alert.alert('Music File Too Large', 'Choose an audio file smaller than 25 MB.');
        return;
      }
      if (audio.mimeType && !audio.mimeType.startsWith('audio/')) {
        Alert.alert('Unsupported File', 'Choose an audio file such as MP3, M4A, AAC, WAV, OGG, or FLAC.');
        return;
      }
      setSelectedAudio(audio);
    } catch (error) {
      console.error('[Reels] Could not open the device music picker:', error);
      Alert.alert('Music Picker Error', 'Could not open music files. Please try again.');
    }
  };

  const cycleCropMode = () => {
    if (cropMode === '9:16') setCropMode('1:1');
    else if (cropMode === '1:1') setCropMode('full');
    else setCropMode('9:16');
  };

  return (
    <KeyboardAvoidingView
      style={styles.storyEditorContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Background Video Preview */}
      {!uploading && (
        <View style={styles.storyVideoStage} pointerEvents="none">
          <VideoView
            style={[
              styles.storyVideoPreview,
              cropMode === '9:16' && styles.storyVideoPreviewPortrait,
              cropMode === '1:1' && styles.storyVideoPreviewSquare
            ]}
            player={player}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            contentFit={cropMode === 'full' ? 'contain' : 'cover'}
            nativeControls={false}
          />
        </View>
      )}

      {/* Top Navigation & Tools Bar */}
      <View style={styles.storyTopBar}>
        <TouchableOpacity style={styles.storyIconBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={26} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.storyTopActions}>
          <TouchableOpacity style={styles.storyPillBtn} onPress={cycleCropMode} activeOpacity={0.8}>
            <Ionicons name="crop" size={15} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.cropModeBadge}>
              {cropMode === '9:16' ? '9:16' : cropMode === '1:1' ? '1:1' : 'Full'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.storyIconBtn}
            onPress={handlePickAudio}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={selectedAudio ? 'Change reel music' : 'Add music to reel'}
          >
            <Ionicons name="musical-notes" size={20} color={selectedAudio ? '#f472b6' : '#ffffff'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* WhatsApp-Style Slide & Trim Timeline Strip (Positioned Prominently at Top) */}
      <View style={styles.storyTrimmerPositioner}>
        {videoLoadError ? (
          <View style={styles.storyTrimmerLoading}>
            <Ionicons name="alert-circle-outline" size={18} color="#fca5a5" />
            <Text style={styles.storyTrimmerLoadingError} numberOfLines={2}>{videoLoadError}</Text>
          </View>
        ) : totalDuration > 0 ? (
          <VideoSlideTrimmer
            videoUri={videoUri}
            duration={totalDuration}
            maxDuration={MAX_REEL_DURATION_SECONDS}
            playbackTime={playbackTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={handleTrimChange}
            onSeekPreview={handleSeekPreview}
            isMuted={isOriginalAudioMuted}
            onToggleMute={() => setIsOriginalAudioMuted((muted) => !muted)}
          />
        ) : (
          <View style={styles.storyTrimmerLoading}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.storyTrimmerLoadingText}>Preparing video...</Text>
          </View>
        )}
      </View>

      {/* Bottom Floating Caption & Send Bar */}
      <View
        style={[
          styles.storyBottomKeyboard,
          isCaptionKeyboardVisible && styles.storyCaptionKeyboardLift
        ]}
      >
        {/* User Persona & Audio Indicator */}
        <View style={styles.personaTagContainer}>
          <View style={styles.personaTagPill}>
            <Text style={styles.personaTagText}>
              {currentUser?.leelaUsername || 'Leela Student'} (You)
            </Text>
            {currentUser?.academicYear ? (
              <Text style={styles.storyYearTagText}> • {formatYearShort(currentUser.academicYear)}</Text>
            ) : null}
          </View>
          {selectedAudio && (
            <View style={styles.audioPillActive}>
              <Ionicons name="musical-note" size={11} color="#f472b6" />
              <Text style={styles.audioPillActiveText} numberOfLines={1}>{selectedAudio.name}</Text>
              <TouchableOpacity
                onPress={() => setSelectedAudio(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove selected music"
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color="#f472b6" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* WhatsApp-Style Rounded Dark Input Bar + Green Circular Send Button */}
        <View style={styles.storyBottomBar}>
          <View style={styles.captionInputPill}>
            <Ionicons name="image-outline" size={20} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.storyTextInput}
              placeholder="Add a caption..."
              placeholderTextColor="#94a3b8"
              value={caption}
              onChangeText={setCaption}
            />
          </View>

          <TouchableOpacity
            style={styles.whatsappSendBtn}
            onPress={() => onPublish({
              trimStart,
              trimEnd,
              caption,
              selectedAudio,
              cropMode,
              muteOriginalAudio: isOriginalAudioMuted
            })}
            disabled={uploading || totalDuration <= 0 || trimEnd <= trimStart}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={20} color="#ffffff" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </View>
      {uploading && (
        <View style={styles.storyUploadOverlay}>
          <ActivityIndicator size="large" color="#f472b6" />
          <Text style={styles.storyUploadText}>
            {selectedAudio ? 'Preparing music and publishing reel…' : 'Publishing reel…'} {uploadProgress}%
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// Individual Reel Component
function ReelItem({
  item,
  isActive,
  isTabActive,
  isMuted,
  height = REEL_HEIGHT,
  onLike,
  onOpenComments,
  onShare,
  onReport
}) {
  const [isPaused, setIsPaused] = useState(false);
  const playbackFeedback = useRef(new Animated.Value(0));

  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.muted = isMuted;
    if (isActive && isTabActive && !isPaused) {
      p.play();
    } else {
      p.pause();
    }
  });

  useEffect(() => {
    if (!player) return;
    if (isActive && isTabActive && !isPaused) {
      try {
        player.currentTime = 0;
      } catch (e) {}
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, isTabActive, isPaused, player]);

  useEffect(() => {
    if (!player) return;
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => () => playbackFeedback.current.stopAnimation(), []);

  const togglePlayPause = () => {
    if (!player) return;
    if (isPaused) {
      setIsPaused(false);
      player.play();
    } else {
      setIsPaused(true);
      player.pause();
    }
    playbackFeedback.current.stopAnimation();
    playbackFeedback.current.setValue(0);
    Animated.sequence([
      Animated.timing(playbackFeedback.current, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true
      }),
      Animated.delay(750),
      Animated.timing(playbackFeedback.current, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      })
    ]).start();
  };

  return (
    <View style={[styles.reelContainer, { height: height }]}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Tap anywhere on video to Play / Pause */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={togglePlayPause}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.centerPlayOverlay,
            {
              top: Math.max(0, height / 2 - 41),
              opacity: playbackFeedback.current,
              transform: [{
                scale: playbackFeedback.current.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1]
                })
              }]
            }
          ]}
        >
            <View style={styles.playIconCircle}>
              <Ionicons
                name={isPaused ? 'play' : 'pause'}
                size={38}
                color="#ffffff"
                style={isPaused ? { marginLeft: 4 } : undefined}
              />
            </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Bottom Creator Info & Caption */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.creatorInfo}>
          <View style={styles.creatorAvatarBox}>
            <Ionicons name="person" size={16} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.creatorName}>{item.creatorName}</Text>
            <Text style={styles.creatorYearText}>
              {formatYearShort(item.creatorYear || item.academicYear)}
            </Text>
          </View>
        </View>

        <Text style={styles.caption} numberOfLines={3}>
          {item.caption}
        </Text>

        <View style={styles.soundPill}>
          <Ionicons name="musical-notes" size={13} color="#e9d5ff" />
          <Text style={styles.soundText} numberOfLines={1}>
            {item.audioTitle || 'Original Audio'}
          </Text>
        </View>
      </View>

      {/* Right Actions */}
      <View style={styles.sideActions} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onLike(item.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, item.isLiked && styles.likedActionCircle]}>
            <Ionicons
              name={item.isLiked ? 'heart' : 'heart-outline'}
              size={24}
              color={item.isLiked ? '#ef4444' : '#ffffff'}
            />
          </View>
          <Text style={styles.actionCount}>{item.likesCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onOpenComments(item)}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#ffffff" />
          </View>
          <Text style={styles.actionCount}>{item.commentsCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onShare(item)}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="paper-plane-outline" size={21} color="#ffffff" />
          </View>
          <Text style={styles.actionCount}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onReport(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Report reel"
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="flag-outline" size={20} color="#ffffff" />
          </View>
          <Text style={styles.actionCount}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

async function uploadMediaFile(
  url,
  uri,
  { fields, authToken, onProgress, fieldName, mimeType }
) {
  const parameters = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
  const headers = { Authorization: `Bearer ${authToken}` };

  if (Platform.OS === 'android' && fieldName === 'video' && BackgroundReelUpload) {
    let uploadId;
    try {
      uploadId = await BackgroundReelUpload.startUpload(url, uri, parameters, headers);
    } catch (error) {
      console.error('[Reels] Could not start the Android upload service:', error);
      const uploadError = new Error('The upload could not be started.');
      uploadError.code = 'UPLOAD_START_FAILED';
      throw uploadError;
    }

    return new Promise((resolve, reject) => {
      let polling = false;
      const poll = async () => {
        if (polling) return;
        polling = true;
        try {
          const state = await BackgroundReelUpload.getUploadState();
          if (state.uploadId !== uploadId) return;
          onProgress(Math.max(0, Math.min(99, Number(state.progress) || 0)));
          if (state.status !== 'completed' && state.status !== 'failed') return;

          clearInterval(pollTimer);
          await BackgroundReelUpload.clearUploadState();
          if (state.status === 'failed') {
            const responseCode = Number(state.responseCode) || 0;
            let failureMessage = 'The upload could not be completed.';
            if (responseCode === 400 || responseCode === 413) {
              try {
                failureMessage = JSON.parse(state.responseBody).message || failureMessage;
              } catch (parseError) {
                console.warn('[Reels] The upload error response was not valid JSON:', parseError);
              }
            }
            const uploadError = new Error(failureMessage);
            uploadError.statusCode = responseCode;
            uploadError.code = uploadError.statusCode === 404 ? 'UPLOAD_ROUTE_NOT_FOUND' : 'UPLOAD_FAILED';
            throw uploadError;
          }

          let response;
          try {
            response = JSON.parse(state.responseBody);
          } catch {
            throw new Error('The server response could not be read.');
          }
          if (!response.success) {
            throw new Error('The server could not publish this reel.');
          }
          onProgress(100);
          resolve(response);
        } catch (error) {
          clearInterval(pollTimer);
          reject(error);
        } finally {
          polling = false;
        }
      };

      const pollTimer = setInterval(poll, 500);
      poll();
    });
  }

  const filename = uri.split(/[?#]/)[0].split('/').pop() || `reel_${Date.now()}.mp4`;
  const match = /\.(\w+)$/.exec(filename);
  const fileMimeType = mimeType || (
    fieldName === 'audio'
      ? 'audio/mpeg'
      : match
        ? `video/${match[1].toLowerCase()}`
        : 'video/mp4'
  );
  const task = new File(uri).createUploadTask(url, {
    httpMethod: 'POST',
    headers,
    uploadType: UploadType.MULTIPART,
    fieldName,
    mimeType: fileMimeType,
    parameters,
    sessionType: Platform.OS === 'android' ? 'foreground' : 'background',
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) {
        onProgress(Math.min(99, Math.floor((bytesSent / totalBytes) * 100)));
      }
    }
  });

  try {
    const uploadPromise = task.uploadAsync();
    const result = await uploadPromise;
    let response;
    try {
      response = JSON.parse(result.body);
    } catch (error) {
      const uploadError = new Error('The server response could not be read.');
      uploadError.statusCode = result.status;
      uploadError.code = result.status === 404 && url.includes('/api/reels/audio-upload')
        ? 'MUSIC_UPLOAD_ENDPOINT_NOT_FOUND'
        : result.status === 404
          ? 'UPLOAD_ROUTE_NOT_FOUND'
          : 'UPLOAD_FAILED';
      throw uploadError;
    }
    if (result.status < 200 || result.status >= 300 || !response.success) {
      const uploadError = new Error(
        result.status === 400 || result.status === 413
          ? response.message || 'The selected file could not be uploaded.'
          : 'The upload could not be completed.'
      );
      uploadError.statusCode = result.status;
      uploadError.code = result.status === 404 && url.includes('/api/reels/audio-upload')
        ? 'MUSIC_UPLOAD_ENDPOINT_NOT_FOUND'
        : result.status === 404
          ? 'UPLOAD_ROUTE_NOT_FOUND'
          : 'UPLOAD_FAILED';
      throw uploadError;
    }
    onProgress(100);
    return response;
  } catch (error) {
    if (error.code) throw error;
    console.error('[Reels] File upload failed:', error);
    const uploadError = new Error('The upload was interrupted by a connection problem.');
    uploadError.code = 'UPLOAD_NETWORK_ERROR';
    throw uploadError;
  } finally {
    task.release();
  }
}

function getPublishErrorMessage(error) {
  if (error?.code === 'MUSIC_UPLOAD_ENDPOINT_NOT_FOUND') {
    return 'Music uploads are not enabled on the server yet. Ask the administrator to update the server, then try again.';
  }
  if (error?.code === 'UPLOAD_ROUTE_NOT_FOUND') {
    return 'The reel upload service is not available on the server. Please contact the administrator.';
  }
  if (error?.statusCode === 400 || error?.statusCode === 413) {
    return error.message;
  }
  return 'The upload could not finish. Check your connection and try again; your reel edits are still here.';
}

export default function LeelaReelsScreen({
  serverHost,
  currentUser,
  authToken,
  isTabActive = true,
  reelIdToOpen = null,
  onReelOpened
}) {
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reelsFetchFailed, setReelsFetchFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reelHeight, setReelHeight] = useState(REEL_HEIGHT);

  const handleContainerLayout = (e) => {
    const { height } = e.nativeEvent.layout;
    if (height && Math.abs(height - reelHeight) > 1) {
      setReelHeight(height);
    }
  };

  // Comments modal state
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedReel, setSelectedReel] = useState(null);
  const [reelToReport, setReelToReport] = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentAgeNow, setCommentAgeNow] = useState(Date.now());
  const [isCommentKeyboardVisible, setIsCommentKeyboardVisible] = useState(false);
  const likeQueuesRef = useRef(new Map());

  // Picker & Story Editor Modal States
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [storyEditorVisible, setStoryEditorVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedVideoUri, setSelectedVideoUri] = useState(null);
  const [publishSuccessVisible, setPublishSuccessVisible] = useState(false);
  const isTabActiveRef = useRef(isTabActive);
  const reelsListRef = useRef(null);

  useEffect(() => {
    isTabActiveRef.current = isTabActive;
  }, [isTabActive]);

  // Fetch reels from backend
  const fetchReels = async () => {
    try {
      const res = await fetch(`${getBaseUrl(serverHost)}/api/reels`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Could not load reels.');
      }
      if (!Array.isArray(data.data)) throw new Error('Could not load reels.');
      setReels(shuffleReelsByDay(data.data));
      setReelsFetchFailed(false);
    } catch (err) {
      setReelsFetchFailed(true);
      console.log('Error fetching reels from server:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReels();
  }, [serverHost, authToken, isTabActive]);

  useEffect(() => {
    if (!authToken) return undefined;

    const socket = io(getBaseUrl(serverHost), {
      transports: ['websocket', 'polling'],
      auth: { token: authToken }
    });
    let hasConnected = false;

    socket.on('connect', () => {
      if (hasConnected) fetchReels();
      hasConnected = true;
    });
    socket.on('connect_error', (error) => {
      console.error('[Leela] Realtime connection failed:', error.message);
    });
    socket.on('reel_like_updated', (event) => {
      if (typeof event?.reelId !== 'string' || !Number.isFinite(event.likesCount)) return;
      setReels((prev) => prev.map((reel) => (
        reel.id === event.reelId ? { ...reel, likesCount: event.likesCount } : reel
      )));
    });
    socket.on('reel_comment_added', (event) => {
      if (
        typeof event?.reelId !== 'string' ||
        !event.comment?.id ||
        !Number.isFinite(event.commentsCount)
      ) return;

      const confirmedComment = { ...event.comment, pending: false };
      const updateReelComments = (reel) => {
        if (reel.id !== event.reelId) return reel;
        const comments = Array.isArray(reel.comments) ? reel.comments : [];
        const pendingIndex = event.clientMutationId
          ? comments.findIndex((comment) => comment.id === event.clientMutationId)
          : -1;
        const alreadyPresent = comments.some((comment) => comment.id === confirmedComment.id);
        let updatedComments = comments;
        if (pendingIndex >= 0) {
          updatedComments = comments.map((comment, index) => (
            index === pendingIndex ? confirmedComment : comment
          ));
        } else if (!alreadyPresent) {
          updatedComments = [confirmedComment, ...comments];
        }
        return {
          ...reel,
          comments: updatedComments,
          commentsCount: event.commentsCount
        };
      };

      setReels((prev) => prev.map(updateReelComments));
      setSelectedReel((prev) => prev ? updateReelComments(prev) : prev);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [serverHost, authToken]);

  useEffect(() => {
    if (!reelIdToOpen || !isTabActive || loading || refreshing) return;

    const reelIndex = reels.findIndex((reel) => String(reel.id) === String(reelIdToOpen));
    if (reelsFetchFailed) {
      Alert.alert('Could not open reel', 'Could not load reels. Check your connection and try again.');
    } else if (reelIndex === -1) {
      Alert.alert('Reel unavailable', 'This reel is no longer available.');
    } else {
      setActiveReelIndex(reelIndex);
      reelsListRef.current?.scrollToIndex({ index: reelIndex, animated: false });
    }
    onReelOpened?.(reelIdToOpen);
  }, [isTabActive, loading, onReelOpened, reelIdToOpen, reels, reelsFetchFailed, refreshing]);

  const handleRefresh = () => {
    setRefreshing(true);
    setActiveReelIndex(0);
    reelsListRef.current?.scrollToOffset({ offset: 0, animated: false });
    fetchReels();
  };

  const handleLike = (reelId) => {
    const userId = currentUser?.id;
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again to like reels.');
      return;
    }
    setReels((prev) => prev.map((reel) => {
      if (reel.id !== reelId) return reel;
      const isLiked = !reel.isLiked;
      return {
        ...reel,
        isLiked,
        likesCount: Math.max(0, (Number(reel.likesCount) || 0) + (isLiked ? 1 : -1))
      };
    }));

    const queue = likeQueuesRef.current.get(reelId) || { promise: Promise.resolve(), pending: 0 };
    queue.pending += 1;
    queue.promise = queue.promise.catch(() => {}).then(async () => {
      const response = await fetch(`${getBaseUrl(serverHost)}/api/reels/${reelId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({})
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update your like.');
      }
      queue.pending -= 1;
      if (queue.pending === 0) {
        setReels((prev) => prev.map((reel) => (
          reel.id === reelId
            ? { ...reel, isLiked: result.data.isLiked, likesCount: result.data.likesCount }
            : reel
        )));
        likeQueuesRef.current.delete(reelId);
      }
    }).catch(async (error) => {
      queue.pending -= 1;
      if (queue.pending === 0) {
        likeQueuesRef.current.delete(reelId);
        try {
          const response = await fetch(`${getBaseUrl(serverHost)}/api/reels`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          const result = await response.json();
          if (!response.ok || !result.success || !Array.isArray(result.data)) {
            throw new Error(result.message || 'Could not refresh the reel.');
          }
          const updatedReel = result.data.find((reel) => reel.id === reelId);
          if (updatedReel) {
            setReels((prev) => prev.map((reel) => reel.id === reelId ? updatedReel : reel));
          }
        } catch (refreshError) {
          console.log('Could not reconcile failed reel like:', refreshError.message);
        }
        Alert.alert('Like not saved', error.message || 'Please try again.');
      }
    });
    likeQueuesRef.current.set(reelId, queue);
  };

  const handleOpenComments = (reel) => {
    setCommentAgeNow(Date.now());
    setSelectedReel(reel);
    setCommentsModalVisible(true);
  };

  useEffect(() => {
    if (!commentsModalVisible) return undefined;
    const interval = setInterval(() => setCommentAgeNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, [commentsModalVisible]);

  useEffect(() => {
    if (!commentsModalVisible) {
      setIsCommentKeyboardVisible(false);
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setIsCommentKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsCommentKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [commentsModalVisible]);

  const handlePostComment = () => {
    const text = commentText.trim();
    if (!text || !selectedReel || commentPosting) return;
    const reelId = selectedReel.id;
    const userYear = currentUser?.academicYear || 'Student';
    const optimisticComment = {
      id: `pending_${Date.now()}`,
      user: currentUser?.leelaUsername || 'Student',
      userYear,
      text,
      createdAt: new Date().toISOString(),
      pending: true
    };
    const updatedComments = [optimisticComment, ...(selectedReel.comments || [])];
    setSelectedReel((prev) => prev?.id === reelId
      ? { ...prev, comments: updatedComments, commentsCount: (Number(prev.commentsCount) || 0) + 1 }
      : prev);
    setReels((prev) => prev.map((reel) => (
      reel.id === reelId
        ? { ...reel, comments: updatedComments, commentsCount: (Number(reel.commentsCount) || 0) + 1 }
        : reel
    )));
    setCommentText('');
    setCommentPosting(true);
    void (async () => {
      try {
        const response = await fetch(`${getBaseUrl(serverHost)}/api/reels/${reelId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({
            text,
            clientMutationId: optimisticComment.id
          })
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.message || 'Could not save your comment.');
        }
        const confirmedComment = { ...result.data, pending: false };
        setSelectedReel((prev) => prev?.id === reelId ? {
          ...prev,
          comments: (prev.comments || []).map((comment) => (
            comment.id === optimisticComment.id ? confirmedComment : comment
          )),
          commentsCount: result.commentsCount
        } : prev);
        setReels((prev) => prev.map((reel) => (
          reel.id === reelId
            ? {
              ...reel,
              comments: (reel.comments || []).map((comment) => (
                comment.id === optimisticComment.id ? confirmedComment : comment
              )),
              commentsCount: result.commentsCount
            }
            : reel
        )));
      } catch (error) {
        setSelectedReel((prev) => prev?.id === reelId ? {
          ...prev,
          comments: (prev.comments || []).filter((comment) => comment.id !== optimisticComment.id),
          commentsCount: Math.max(0, (Number(prev.commentsCount) || 1) - 1)
        } : prev);
        setReels((prev) => prev.map((reel) => (
          reel.id === reelId
            ? {
              ...reel,
              comments: (reel.comments || []).filter((comment) => comment.id !== optimisticComment.id),
              commentsCount: Math.max(0, (Number(reel.commentsCount) || 1) - 1)
            }
            : reel
        )));
        setCommentText((currentText) => currentText || text);
        Alert.alert('Comment not saved', error.message || 'Please try again.');
      } finally {
        setCommentPosting(false);
      }
    })();
  };

  const handleShare = async (reel) => {
    try {
      const reelUrl = `${REEL_SHARE_BASE_URL}/reel/${encodeURIComponent(reel.id)}`;
      await Share.share({
        message: `Watch "${reel.caption || 'this reel'}" on Leela!\n${reelUrl}`,
        url: reelUrl
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const handleReportReel = (reel) => {
    if (!currentUser?.id) {
      Alert.alert('Sign in required', 'Please sign in again to report a reel.');
      return;
    }
    if (reel.creatorId === currentUser.id) {
      Alert.alert('Cannot report your reel', 'You cannot report a reel posted by your account.');
      return;
    }
    setReelToReport(reel);
  };

  const submitReelReport = async (reason) => {
    if (!reelToReport || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const response = await fetch(
        `${getBaseUrl(serverHost)}/api/reels/${reelToReport.id}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ reason })
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not submit this report.');
      }
      setReelToReport(null);
      Alert.alert('Report submitted', 'Thank you. The PMC moderation team will review this reel.');
    } catch (error) {
      Alert.alert('Report not sent', error.message || 'Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleRecordVideoWithCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to record reels.');
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8,
        videoMaxDuration: MAX_REEL_DURATION_SECONDS
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        setSelectedVideoUri(res.assets[0].uri);
        setPickerModalVisible(false);
        setStoryEditorVisible(true);
      }
    } catch (err) {
      console.log('Camera recording error:', err);
      Alert.alert('Camera Error', 'Could not open camera to record video.');
    }
  };

  const handlePickVideoFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to select videos.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        setSelectedVideoUri(res.assets[0].uri);
        setPickerModalVisible(false);
        setStoryEditorVisible(true);
      }
    } catch (err) {
      console.log('Gallery pick error:', err);
    }
  };

  const handlePublishReel = async ({
    trimStart,
    trimEnd,
    caption,
    selectedAudio,
    cropMode,
    muteOriginalAudio
  }) => {
    if (!selectedVideoUri) {
      Alert.alert('No Video', 'Please select a video file first.');
      return;
    }

    let stagedAudioId = null;
    try {
      setUploading(true);
      setUploadProgress(0);

      const reelCaption = caption?.trim() || 'Campus vibes on Leela';
      const uploadUrl = `${getBaseUrl(serverHost)}/api/reels/upload`;
      let audioFields = {};

      if (selectedAudio) {
        const audioUrl = `${getBaseUrl(serverHost)}/api/reels/audio-upload`;
        const audioResult = await uploadMediaFile(audioUrl, selectedAudio.uri, {
          fields: {},
          authToken,
          fieldName: 'audio',
          mimeType: selectedAudio.mimeType || 'audio/mpeg',
          onProgress: (progress) => setUploadProgress(Math.floor(progress * 0.15))
        });
        stagedAudioId = audioResult.audioUploadId;
        if (!stagedAudioId) {
          throw new Error('The server did not confirm the music upload. Please try again.');
        }
        setUploadProgress(15);
        audioFields = {
          audioUploadId: stagedAudioId,
          audioTitle: selectedAudio.name?.trim().slice(0, 120) || 'Selected music'
        };
      }

      const uploadResult = await uploadMediaFile(uploadUrl, selectedVideoUri, {
        fieldName: 'video',
        fields: {
          caption: reelCaption,
          audioTitle: audioFields.audioTitle || 'Original Audio',
          audioUploadId: audioFields.audioUploadId,
          trimStart: String(trimStart),
          trimEnd: String(trimEnd),
          cropMode: cropMode || '9:16',
          muteOriginalAudio: String(Boolean(muteOriginalAudio))
        },
        authToken,
        onProgress: (progress) => setUploadProgress(15 + Math.floor(progress * 0.84))
      });
      stagedAudioId = null;

      if (uploadResult && uploadResult.success) {
        // Fetch all reels from server to display permanently
        await fetchReels();
        setStoryEditorVisible(false);
        setSelectedVideoUri(null);
        if (isTabActiveRef.current) setPublishSuccessVisible(true);
      } else {
        throw new Error(uploadResult?.message || 'Server rejected upload');
      }
    } catch (err) {
      console.log('Upload error:', err);
      if (stagedAudioId) {
        try {
          const cleanupResponse = await fetch(
            `${getBaseUrl(serverHost)}/api/reels/audio-upload/${encodeURIComponent(stagedAudioId)}`,
            {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + authToken }
            }
          );
          if (!cleanupResponse.ok) {
            console.warn('[Reels] Staged music cleanup was not confirmed by the server.');
          }
        } catch (cleanupError) {
          console.warn('[Reels] Could not clean up staged music:', cleanupError);
        }
      }
      if (isTabActiveRef.current) {
        Alert.alert('Could Not Publish Reel', getPublishErrorMessage(err));
      }
    } finally {
      setUploading(false);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      setActiveReelIndex(viewableItems[0].index || 0);
    }
  }).current;

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* Top Header Floating Overlay */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.appTitle}>Leela</Text>
          <View style={styles.campusBadge}>
            <Text style={styles.campusBadgeText}>MANIT</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setIsMuted(!isMuted)}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => setPickerModalVisible(true)}
            disabled={uploading}
            activeOpacity={uploading ? 1 : 0.85}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.uploadButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      {uploading && (
        <View style={styles.uploadStatusBanner} pointerEvents="none">
          <Ionicons name="cloud-upload-outline" size={18} color="#a5f3fc" />
          <View style={styles.uploadStatusTextGroup}>
            <Text style={styles.uploadStatusTitle}>
              {uploadProgress >= 99 ? 'Finishing your reel' : 'Publishing your reel'}
            </Text>
            <View style={styles.uploadStatusTrack}>
              <View style={[styles.uploadStatusFill, { width: `${uploadProgress}%` }]} />
            </View>
          </View>
          <Text style={styles.uploadStatusPercent}>{uploadProgress}%</Text>
        </View>
      )}

      {/* If No Reels, Show Clean Empty State */}
      {reels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="videocam-outline" size={48} color="#ec4899" />
          </View>
          <Text style={styles.emptyTitle}>No Reels on Leela Yet</Text>
          <Text style={styles.emptySubtitle}>
            Be the first MANIT student to post a campus reel!
          </Text>
          <TouchableOpacity
            style={styles.postFirstBtn}
            onPress={() => setPickerModalVisible(true)}
            disabled={uploading}
          >
            <Ionicons name="add" size={20} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.postFirstBtnText}>Post First Reel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={reelsListRef}
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={reelHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={(data, index) => ({
            length: reelHeight,
            offset: reelHeight * index,
            index
          })}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 75 }}
          renderItem={({ item, index }) => (
            <ReelItem
              item={item}
              isActive={index === activeReelIndex}
              isTabActive={isTabActive && !storyEditorVisible}
              isMuted={isMuted}
              height={reelHeight}
              onLike={handleLike}
              onOpenComments={handleOpenComments}
              onShare={handleShare}
              onReport={handleReportReel}
            />
          )}
        />
      )}

      {/* Slide-Up Comments Modal */}
      <Modal
        visible={commentsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.commentsBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.commentsSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <FlatList
              style={styles.commentsList}
              data={selectedReel?.comments || []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingVertical: 10 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Ionicons name="person" size={14} color="#cbd5e1" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.commentUser}>{item.user}</Text>
                      {item.userYear ? (
                        <View style={styles.commentYearPill}>
                          <Text style={styles.commentYearText}>{formatYearShort(item.userYear)}</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.commentTime, item.pending && styles.pendingCommentTime]}>
                        {item.pending
                          ? 'Sending…'
                          : item.createdAt
                            ? formatCommentAge(item.createdAt, commentAgeNow)
                            : item.time || 'Time unavailable'}
                      </Text>
                    </View>
                    <Text style={styles.commentContent}>{item.text}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.noCommentsText}>
                  No comments yet. Be the first to drop a comment!
                </Text>
              }
            />

            <View
              style={[
                styles.commentComposerAvoider,
                { paddingBottom: insets.bottom },
                isCommentKeyboardVisible && styles.commentKeyboardLift
              ]}
            >
              <View style={styles.addCommentBar}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add comment..."
                  placeholderTextColor="#64748b"
                  value={commentText}
                  onChangeText={setCommentText}
                />
                <TouchableOpacity
                  style={[styles.postButton, (!commentText.trim() || commentPosting) && { opacity: 0.5 }]}
                  onPress={handlePostComment}
                  disabled={!commentText.trim() || commentPosting}
                >
                  <Text style={styles.postButtonText}>{commentPosting ? 'Posting...' : 'Post'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(reelToReport)}
        transparent
        animationType="slide"
        onRequestClose={() => !reportSubmitting && setReelToReport(null)}
      >
        <View style={styles.commentsBackdrop}>
          <View style={styles.reportSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.commentsTitle}>Report this reel</Text>
            <Text style={styles.reportDescription}>Choose a reason to send it to PMC moderation.</Text>
            {[
              'Harassment or bullying',
              'Explicit content',
              'Hate or discrimination',
              'Spam or misleading',
              'Other'
            ].map(reason => (
              <TouchableOpacity
                key={reason}
                style={styles.reportReasonButton}
                onPress={() => submitReelReport(reason)}
                disabled={reportSubmitting}
              >
                <Text style={styles.reportReasonText}>{reason}</Text>
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.reportCancelButton}
              onPress={() => setReelToReport(null)}
              disabled={reportSubmitting}
            >
              <Text style={styles.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Video Source Selection Sheet (Camera vs Gallery) */}
      <Modal
        visible={pickerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerModalBackdrop}
          activeOpacity={1}
          onPress={() => setPickerModalVisible(false)}
        >
          <View style={styles.pickerModalCard}>
            <View style={styles.uploadCardHeader}>
              <Text style={styles.uploadCardTitle}>Create Campus Reel</Text>
              <TouchableOpacity onPress={() => setPickerModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerOptionsRow}>
              <TouchableOpacity
                style={styles.pickerOptionBtn}
                onPress={handleRecordVideoWithCamera}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={26} color="#ec4899" />
                <Text style={styles.pickerOptionText}>Shoot Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pickerOptionBtn}
                onPress={handlePickVideoFromGallery}
                activeOpacity={0.85}
              >
                <Ionicons name="images" size={26} color="#38bdf8" />
                <Text style={styles.pickerOptionText}>Gallery Pick</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* FULLSCREEN WHATSAPP-STYLE SLIDE AND TRIM STORY EDITOR */}
      <Modal
        visible={storyEditorVisible && !!selectedVideoUri}
        animationType="slide"
        onRequestClose={() => setStoryEditorVisible(false)}
      >
        {selectedVideoUri && (
          <VideoStoryEditor
            videoUri={selectedVideoUri}
            currentUser={currentUser}
            uploading={uploading}
            uploadProgress={uploadProgress}
            onClose={() => {
              setStoryEditorVisible(false);
              setSelectedVideoUri(null);
            }}
            onPublish={handlePublishReel}
          />
        )}
      </Modal>

      <Modal
        visible={publishSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPublishSuccessVisible(false)}
      >
        <View style={styles.publishSuccessBackdrop}>
          <View style={styles.publishSuccessCard}>
            <View style={styles.publishSuccessIcon}>
              <Ionicons name="checkmark" size={34} color="#a7f3d0" />
            </View>
            <Text style={styles.publishSuccessEyebrow}>LEELA • CAMPUS MOMENTS</Text>
            <Text style={styles.publishSuccessTitle}>Your reel is live!</Text>
            <Text style={styles.publishSuccessMessage}>
              Your trimmed video has been published. It’s ready for the campus to see.
            </Text>
            <TouchableOpacity
              style={styles.publishSuccessButton}
              onPress={() => setPublishSuccessVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.publishSuccessButtonText}>Back to reels</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  topBar: {
    position: 'absolute',
    top: 46,
    left: 14,
    right: 14,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(7, 8, 12, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  uploadStatusBanner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    zIndex: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.25)'
  },
  uploadStatusTextGroup: {
    flex: 1,
    gap: 6
  },
  uploadStatusTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700'
  },
  uploadStatusTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(148, 163, 184, 0.25)'
  },
  uploadStatusFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#22d3ee'
  },
  uploadStatusPercent: {
    minWidth: 38,
    color: '#cffafe',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums']
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  campusBadge: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8
  },
  campusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800'
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 13
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 2
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32
  },
  emptyIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#191122',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.3)'
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  postFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22
  },
  postFirstBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  reelContainer: {
    width: SCREEN_WIDTH,
    backgroundColor: '#07080c',
    justifyContent: 'flex-end'
  },
  bottomOverlay: {
    marginLeft: 14,
    marginBottom: 22,
    paddingHorizontal: 14,
    paddingVertical: 13,
    width: '77%',
    borderRadius: 18,
    backgroundColor: 'rgba(7, 8, 12, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  creatorAvatarBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#1e2438',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.36)'
  },
  creatorName: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  creatorYearText: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1
  },
  storyYearTagText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  caption: {
    color: '#f1f5f9',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 11
  },
  soundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  soundText: {
    color: '#e2e8f0',
    fontSize: 12,
    marginLeft: 6
  },
  sideActions: {
    position: 'absolute',
    right: 12,
    bottom: 25,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderRadius: 24,
    backgroundColor: 'rgba(7, 8, 12, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  actionItem: {
    alignItems: 'center',
    marginBottom: 13
  },
  actionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  likedActionCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: 'rgba(239, 68, 68, 0.28)'
  },
  actionCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  commentsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end'
  },
  commentsSheet: {
    backgroundColor: '#111420',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '60%',
    maxHeight: '85%',
    padding: 16
  },
  commentsList: {
    flex: 1,
    minHeight: 0
  },
  commentComposerAvoider: {
    zIndex: 1,
    elevation: 1
  },
  commentKeyboardLift: {
    marginBottom: 46
  },
  reportSheet: {
    backgroundColor: '#111420',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28
  },
  reportDescription: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 14
  },
  reportReasonButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2438'
  },
  reportReasonText: {
    color: '#e2e8f0',
    fontSize: 14
  },
  reportCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6
  },
  reportCancelText: {
    color: '#f472b6',
    fontSize: 14,
    fontWeight: '700'
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2438'
  },
  commentsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  commentRow: {
    flexDirection: 'row',
    marginVertical: 8
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  commentUser: {
    color: '#ec4899',
    fontWeight: '700',
    fontSize: 13,
    marginRight: 6
  },
  commentYearPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginRight: 6
  },
  commentYearText: {
    color: '#38bdf8',
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  commentTime: {
    color: '#64748b',
    fontSize: 11
  },
  pendingCommentTime: {
    color: '#a78bfa'
  },
  commentContent: {
    color: '#e2e8f0',
    fontSize: 13,
    marginTop: 2
  },
  noCommentsText: {
    color: '#64748b',
    textAlign: 'center',
    marginVertical: 24
  },
  addCommentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e2438'
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1e2438',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14
  },
  postButton: {
    marginLeft: 10,
    backgroundColor: '#ec4899',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  postButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  pickerModalCard: {
    backgroundColor: '#121524',
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  uploadCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18
  },
  uploadCardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800'
  },
  pickerOptionsRow: {
    flexDirection: 'row',
    gap: 12
  },
  pickerOptionBtn: {
    flex: 1,
    backgroundColor: '#181b2c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pickerOptionText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8
  },

  // WhatsApp-Style Fullscreen Story Editor Styles
  storyEditorContainer: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative'
  },
  storyUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.82)'
  },
  storyUploadText: {
    marginTop: 14,
    paddingHorizontal: 24,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center'
  },
  storyVideoStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  storyVideoPreview: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000'
  },
  storyVideoPreviewPortrait: {
    height: SCREEN_WIDTH * (16 / 9)
  },
  storyVideoPreviewSquare: {
    width: Math.min(SCREEN_WIDTH, SCREEN_HEIGHT),
    height: Math.min(SCREEN_WIDTH, SCREEN_HEIGHT)
  },
  storyTopBar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  storyTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  storyIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  storyPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  cropModeBadge: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  storyTrimmerPositioner: {
    position: 'absolute',
    top: 96,
    left: 0,
    right: 0,
    zIndex: 25
  },
  storyTrimmerLoading: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(18, 21, 36, 0.82)'
  },
  storyTrimmerLoadingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  storyTrimmerLoadingError: {
    flex: 1,
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '600'
  },
  publishSuccessBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(3, 7, 18, 0.78)'
  },
  publishSuccessCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
    borderRadius: 26,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.26)'
  },
  publishSuccessIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.28)',
    marginBottom: 18
  },
  publishSuccessEyebrow: {
    color: '#6ee7b7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4
  },
  publishSuccessTitle: {
    color: '#f8fafc',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 8
  },
  publishSuccessMessage: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 9
  },
  publishSuccessButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    marginTop: 24,
    borderRadius: 15,
    backgroundColor: '#059669'
  },
  publishSuccessButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  storyBottomKeyboard: {
    position: 'absolute',
    bottom: 24,
    left: 14,
    right: 14,
    zIndex: 30
  },
  storyCaptionKeyboardLift: {
    marginBottom: 46
  },
  personaTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8
  },
  personaTagPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  personaTagText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  audioPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.3)',
    maxWidth: 160
  },
  audioPillActiveText: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
  storyBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  captionInputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 21, 36, 0.92)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  storyTextInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    maxHeight: 80
  },
  whatsappSendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6
  },
  centerPlayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center'
  },
  playIconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(15,23,42,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)'
  }
});
