import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import VideoSlideTrimmer from '../components/VideoSlideTrimmer';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REEL_HEIGHT = SCREEN_HEIGHT - 65;
const MAX_REEL_DURATION_SECONDS = 20;
const MAX_VIDEO_FILE_BYTES = 100 * 1024 * 1024;

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
  const [isMuted, setIsMuted] = useState(false);
  const [cropMode, setCropMode] = useState('9:16');
  const [caption, setCaption] = useState('');
  const [audioTitle, setAudioTitle] = useState('Original Audio');
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(null);
  const durationInitialized = useRef(false);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = isMuted;
  });

  useEffect(() => {
    if (!player) return;

    const initializeDuration = (duration) => {
      if (durationInitialized.current || !Number.isFinite(duration) || duration <= 0) return;
      durationInitialized.current = true;
      setTotalDuration(duration);
      setTrimEnd(Math.min(MAX_REEL_DURATION_SECONDS, duration));
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
    if (player) {
      player.muted = isMuted;
    }
  }, [isMuted, player]);

  const handleSeekPreview = (timeSec) => {
    if (player) {
      try {
        player.currentTime = Math.max(0, Math.min(timeSec, totalDuration || timeSec));
        player.play();
      } catch (e) {}
    }
  };

  const handleTrimChange = (newStart, newEnd) => {
    setTrimStart(newStart);
    setTrimEnd(newEnd);
  };

  const cycleCropMode = () => {
    if (cropMode === '9:16') setCropMode('1:1');
    else if (cropMode === '1:1') setCropMode('full');
    else setCropMode('9:16');
  };

  return (
    <View style={styles.storyEditorContainer}>
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

          <TouchableOpacity style={styles.storyIconBtn} onPress={() => setShowAudioModal(true)} activeOpacity={0.8}>
            <Ionicons name="musical-notes" size={20} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.storyIconBtn}>
            <Text style={styles.hdBadge}>HD</Text>
          </View>
        </View>
      </View>

      {/* WhatsApp-Style Slide & Trim Timeline Strip (Positioned Prominently at Top) */}
      <View style={styles.storyTrimmerPositioner}>
        {uploading ? (
          <View style={styles.storyTrimmerLoading}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.storyTrimmerLoadingText}>
              {uploadProgress >= 99 ? 'Finishing reel…' : `Uploading video… ${uploadProgress}%`}
            </Text>
          </View>
        ) : videoLoadError ? (
          <View style={styles.storyTrimmerLoading}>
            <Ionicons name="alert-circle-outline" size={18} color="#fca5a5" />
            <Text style={styles.storyTrimmerLoadingError} numberOfLines={2}>{videoLoadError}</Text>
          </View>
        ) : totalDuration > 0 ? (
          <VideoSlideTrimmer
            videoUri={videoUri}
            duration={totalDuration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={handleTrimChange}
            onSeekPreview={handleSeekPreview}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
          />
        ) : (
          <View style={styles.storyTrimmerLoading}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.storyTrimmerLoadingText}>Preparing video...</Text>
          </View>
        )}
      </View>

      {/* Bottom Floating Caption & Send Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.storyBottomKeyboard}
      >
        {/* User Persona & Audio Indicator */}
        <View style={styles.personaTagContainer}>
          <View style={styles.personaTagPill}>
            <Text style={styles.personaTagText}>
              {currentUser?.anonymousName || 'PMC Student'} (You)
            </Text>
            {currentUser?.academicYear ? (
              <Text style={styles.storyYearTagText}> • {formatYearShort(currentUser.academicYear)}</Text>
            ) : null}
          </View>
          {audioTitle !== 'Original Audio' && (
            <View style={styles.audioPillActive}>
              <Ionicons name="musical-note" size={11} color="#f472b6" />
              <Text style={styles.audioPillActiveText} numberOfLines={1}>{audioTitle}</Text>
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
            onPress={() => onPublish({ trimStart, trimEnd, caption, audioTitle, cropMode })}
            disabled={uploading || totalDuration <= 0 || trimEnd <= trimStart}
            activeOpacity={0.8}
          >
            {uploading ? (
              <View style={styles.uploadingIndicator}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.uploadingIndicatorText}>{uploadProgress}% uploaded</Text>
              </View>
            ) : (
              <Ionicons name="send" size={20} color="#ffffff" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Audio Title Modal */}
      <Modal visible={showAudioModal} transparent animationType="fade">
        <View style={styles.audioModalBackdrop}>
          <View style={styles.audioModalCard}>
            <Text style={styles.audioModalTitle}>Audio Title</Text>
            <TextInput
              style={styles.audioModalInput}
              value={audioTitle}
              onChangeText={setAudioTitle}
              placeholder="e.g. Original Audio - MANIT Vibe"
              placeholderTextColor="#64748b"
            />
            <TouchableOpacity
              style={styles.audioModalDoneBtn}
              onPress={() => setShowAudioModal(false)}
            >
              <Text style={styles.audioModalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  onShare
}) {
  const [isPaused, setIsPaused] = useState(false);

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

  const togglePlayPause = () => {
    if (!player) return;
    if (isPaused) {
      setIsPaused(false);
      player.play();
    } else {
      setIsPaused(true);
      player.pause();
    }
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
        {isPaused && (
          <View style={styles.centerPlayOverlay}>
            <View style={styles.playIconCircle}>
              <Ionicons name="play" size={38} color="#ffffff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}
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
          <Ionicons
            name={item.isLiked ? 'heart' : 'heart-outline'}
            size={32}
            color={item.isLiked ? '#ef4444' : '#ffffff'}
          />
          <Text style={styles.actionCount}>{item.likesCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onOpenComments(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={30} color="#ffffff" />
          <Text style={styles.actionCount}>{item.commentsCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => onShare(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="paper-plane-outline" size={28} color="#ffffff" />
          <Text style={styles.actionCount}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

async function uploadVideoFile(url, uri, fields, onProgress) {
  const filename = uri.split(/[?#]/)[0].split('/').pop() || `reel_${Date.now()}.mp4`;
  const match = /\.(\w+)$/.exec(filename);
  const mimeType = match ? `video/${match[1].toLowerCase()}` : 'video/mp4';
  const parameters = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
  const task = new File(uri).createUploadTask(url, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'video',
    mimeType,
    parameters,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) {
        onProgress(Math.min(99, Math.floor((bytesSent / totalBytes) * 100)));
      }
    }
  });

  try {
    const result = await task.uploadAsync();
    let response;
    try {
      response = JSON.parse(result.body);
    } catch (error) {
      throw new Error(`Server returned an invalid upload response (${result.status}).`);
    }
    if (result.status < 200 || result.status >= 300 || !response.success) {
      throw new Error(response.message || `Server error (${result.status}).`);
    }
    onProgress(100);
    return response;
  } catch (error) {
    throw new Error(error.message || 'Network error uploading video. Check server connection.');
  } finally {
    task.release();
  }
}

export default function LeelaReelsScreen({ serverHost, currentUser, isTabActive = true }) {
  const [reels, setReels] = useState([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
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
  const [commentText, setCommentText] = useState('');

  // Picker & Story Editor Modal States
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [storyEditorVisible, setStoryEditorVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedVideoUri, setSelectedVideoUri] = useState(null);

  // Fetch reels from backend
  const fetchReels = async () => {
    try {
      const res = await fetch(`${getBaseUrl(serverHost)}/api/reels`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setReels(data.data);
      }
    } catch (err) {
      console.log('Error fetching reels from server:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReels();
  }, [serverHost]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReels();
  };

  const handleLike = (reelId) => {
    setReels((prev) =>
      prev.map((r) => {
        if (r.id === reelId) {
          const isLiked = !r.isLiked;
          return {
            ...r,
            isLiked,
            likesCount: isLiked ? r.likesCount + 1 : r.likesCount - 1
          };
        }
        return r;
      })
    );
    try {
      fetch(`${getBaseUrl(serverHost)}/api/reels/${reelId}/like`, { method: 'POST' }).catch(() => {});
    } catch (e) {}
  };

  const handleOpenComments = (reel) => {
    setSelectedReel(reel);
    setCommentsModalVisible(true);
  };

  const handlePostComment = () => {
    if (!commentText.trim() || !selectedReel) return;

    const userYear = currentUser?.academicYear || 'Student';
    const newComment = {
      id: `c_${Date.now()}`,
      user: currentUser?.anonymousName || 'Student',
      userYear,
      text: commentText.trim(),
      time: 'Just now'
    };

    const updatedComments = [newComment, ...(selectedReel.comments || [])];
    setSelectedReel({ ...selectedReel, comments: updatedComments });

    setReels((prev) =>
      prev.map((r) =>
        r.id === selectedReel.id
          ? { ...r, comments: updatedComments, commentsCount: updatedComments.length }
          : r
      )
    );

    try {
      fetch(`${getBaseUrl(serverHost)}/api/reels/${selectedReel.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: currentUser?.anonymousName || 'Student',
          userYear,
          text: commentText.trim()
        })
      }).catch(() => {});
    } catch (e) {}

    setCommentText('');
  };

  const handleShare = async (reel) => {
    try {
      await Share.share({
        message: `Watch "${reel.caption}" on Leela!`
      });
    } catch (err) {
      console.log('Share error:', err);
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
        if (res.assets[0].fileSize > MAX_VIDEO_FILE_BYTES) {
          Alert.alert('Video too large', 'Choose a video file that is 100 MB or smaller.');
          return;
        }
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
        if (res.assets[0].fileSize > MAX_VIDEO_FILE_BYTES) {
          Alert.alert('Video too large', 'Choose a video file that is 100 MB or smaller.');
          return;
        }
        setSelectedVideoUri(res.assets[0].uri);
        setPickerModalVisible(false);
        setStoryEditorVisible(true);
      }
    } catch (err) {
      console.log('Gallery pick error:', err);
    }
  };

  const handlePublishReel = async ({ trimStart, trimEnd, caption, audioTitle, cropMode }) => {
    if (!selectedVideoUri) {
      Alert.alert('No Video', 'Please select a video file first.');
      return;
    }
    if (!Number.isFinite(trimStart) || !Number.isFinite(trimEnd) ||
        trimStart < 0 || trimEnd <= trimStart ||
        trimEnd - trimStart > MAX_REEL_DURATION_SECONDS) {
      Alert.alert('Invalid video length', 'Please select a video segment that is 20 seconds or shorter.');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const creatorName = currentUser?.anonymousName || 'Campus Creator';
      const creatorYear = currentUser?.academicYear || 'Student';
      const reelCaption = caption?.trim() || 'Campus vibes on Leela';
      const uploadUrl = `${getBaseUrl(serverHost)}/api/reels/upload`;

      const uploadResult = await uploadVideoFile(uploadUrl, selectedVideoUri, {
        creatorId: currentUser?.id,
        creatorName,
        creatorYear,
        caption: reelCaption,
        audioTitle: audioTitle?.trim() || 'Original Audio',
        trimStart: String(trimStart),
        trimEnd: String(trimEnd),
        cropMode: cropMode || '9:16'
      }, setUploadProgress);

      if (uploadResult && uploadResult.success) {
        // Fetch all reels from server to display permanently
        await fetchReels();
        setStoryEditorVisible(false);
        setSelectedVideoUri(null);
        Alert.alert('Reel Published!', 'Your reel has been trimmed and published to Leela.');
      } else {
        throw new Error(uploadResult?.message || 'Server rejected upload');
      }
    } catch (err) {
      console.log('Upload error:', err);
      Alert.alert('Upload Failed', `Could not upload to server: ${err.message}. Please verify the server is running.`);
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
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.uploadButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

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
          >
            <Ionicons name="add" size={20} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.postFirstBtnText}>Post First Reel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              data={selectedReel?.comments || []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingVertical: 10 }}
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
                      <Text style={styles.commentTime}>{item.time}</Text>
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

            <View style={styles.addCommentBar}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add comment..."
                placeholderTextColor="#64748b"
                value={commentText}
                onChangeText={setCommentText}
              />
              <TouchableOpacity
                style={[styles.postButton, !commentText.trim() && { opacity: 0.5 }]}
                onPress={handlePostComment}
                disabled={!commentText.trim()}
              >
                <Text style={styles.postButtonText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    top: 48,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
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
    paddingHorizontal: 16,
    paddingBottom: 24,
    width: '80%'
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  creatorAvatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e2438',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
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
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10
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
    bottom: 24,
    alignItems: 'center'
  },
  actionItem: {
    alignItems: 'center',
    marginBottom: 20
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
    padding: 16
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
  hdBadge: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
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
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  uploadingIndicatorText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  storyBottomKeyboard: {
    position: 'absolute',
    bottom: 24,
    left: 14,
    right: 14,
    zIndex: 30
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
  audioModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  audioModalCard: {
    width: '100%',
    backgroundColor: '#121524',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  audioModalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12
  },
  audioModalInput: {
    backgroundColor: '#1c2035',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  audioModalDoneBtn: {
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  audioModalDoneText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  centerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)'
  },
  playIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)'
  }
});
