import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  Image,
  PanResponder,
  TouchableOpacity,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

let VideoThumbnails = null;
try {
  VideoThumbnails = require('expo-video-thumbnails');
} catch (e) {
  // Graceful fallback
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIMELINE_PADDING = 16;
const TIMELINE_WIDTH = SCREEN_WIDTH - (TIMELINE_PADDING * 2);
const HANDLE_WIDTH = 18;
const TIMELINE_HEIGHT = 50;

export default function VideoSlideTrimmer({
  videoUri,
  duration = 30, // in seconds
  trimStart,
  trimEnd,
  onTrimChange,
  onSeekPreview,
  isMuted,
  onToggleMute,
  fileSizeMB
}) {
  const [thumbnails, setThumbnails] = useState([]);
  const [totalDuration, setTotalDuration] = useState(duration > 0 ? duration : 30);
  
  // Track layout width dynamically
  const [containerWidth, setContainerWidth] = useState(TIMELINE_WIDTH);

  useEffect(() => {
    if (duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  // Extract frames for horizontal filmstrip
  useEffect(() => {
    let isMounted = true;
    const extractFrames = async () => {
      if (!videoUri || !VideoThumbnails) return;
      try {
        const frameCount = 4;
        const dur = totalDuration > 0 ? totalDuration : 30;
        const interval = dur / frameCount;
        const frames = [];

        for (let i = 0; i < frameCount; i++) {
          const timeMs = Math.floor(i * interval * 1000);
          try {
            const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
              time: Math.max(100, timeMs),
              quality: 0.2
            });
            if (uri) frames.push(uri);
          } catch (err) {
            // Frame extract fallback
          }
        }

        if (isMounted && frames.length > 0) {
          setThumbnails(frames);
        }
      } catch (e) {
        console.log('Error generating thumbnails:', e);
      }
    };

    extractFrames();
    return () => {
      isMounted = false;
    };
  }, [videoUri, totalDuration]);

  // Calculate pixel positions from trimStart and trimEnd
  const durSafe = totalDuration > 0 ? totalDuration : 30;
  const usableWidth = Math.max(1, containerWidth - (HANDLE_WIDTH * 2));
  const leftX = (Math.max(0, Math.min(trimStart, durSafe)) / durSafe) * usableWidth;
  const rightX = (Math.max(0, Math.min(trimEnd, durSafe)) / durSafe) * usableWidth + HANDLE_WIDTH;

  // Refs to hold current values for pan responder gestures
  const trimRef = useRef({ trimStart, trimEnd, totalDuration: durSafe, containerWidth });
  trimRef.current = { trimStart, trimEnd, totalDuration: durSafe, containerWidth };

  // Left Handle Pan Responder
  const leftPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        leftPanResponder.startX = trimRef.current.trimStart;
      },
      onPanResponderMove: (evt, gestureState) => {
        const { totalDuration: dur, containerWidth: w, trimEnd: endVal } = trimRef.current;
        const gestureWidth = Math.max(1, w - (HANDLE_WIDTH * 2));
        const deltaSec = (gestureState.dx / gestureWidth) * dur;
        let newStart = leftPanResponder.startX + deltaSec;
        const minClipDuration = Math.min(1.5, dur);
        
        newStart = Math.max(0, Math.min(newStart, endVal - minClipDuration));
        newStart = Math.round(newStart * 10) / 10;

        if (onTrimChange) {
          onTrimChange(newStart, endVal);
        }
        if (onSeekPreview) {
          onSeekPreview(newStart);
        }
      },
      onPanResponderRelease: () => {
        if (onSeekPreview) {
          onSeekPreview(trimRef.current.trimStart);
        }
      }
    })
  ).current;

  // Right Handle Pan Responder
  const rightPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rightPanResponder.startEnd = trimRef.current.trimEnd;
      },
      onPanResponderMove: (evt, gestureState) => {
        const { totalDuration: dur, containerWidth: w, trimStart: startVal } = trimRef.current;
        const gestureWidth = Math.max(1, w - (HANDLE_WIDTH * 2));
        const deltaSec = (gestureState.dx / gestureWidth) * dur;
        let newEnd = rightPanResponder.startEnd + deltaSec;
        const minClipDuration = Math.min(1.5, dur);

        newEnd = Math.max(startVal + minClipDuration, Math.min(newEnd, dur));
        newEnd = Math.round(newEnd * 10) / 10;

        if (onTrimChange) {
          onTrimChange(startVal, newEnd);
        }
        if (onSeekPreview) {
          onSeekPreview(newEnd);
        }
      },
      onPanResponderRelease: () => {
        if (onSeekPreview) {
          onSeekPreview(trimRef.current.trimStart);
        }
      }
    })
  ).current;

  const currentDurationSec = Math.max(1, Math.round((trimEnd - trimStart) * 10) / 10);
  const formatTime = (secs) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const remainS = s % 60;
    return `${m}:${remainS < 10 ? '0' : ''}${remainS}`;
  };

  return (
    <View style={styles.trimmerRoot}>
      {/* 1. WhatsApp-Style Slide and Trim Filmstrip Container */}
      <View
        style={styles.timelineWrapper}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w && Math.abs(w - containerWidth) > 2) {
            setContainerWidth(w);
          }
        }}
      >
        {/* Filmstrip Background Frames */}
        <View style={styles.filmstripTrack}>
          {thumbnails.length > 0 ? (
            thumbnails.map((uri, index) => (
              <Image
                key={`thumb_${index}`}
                source={{ uri }}
                style={[styles.thumbnailImage, { width: `${100 / thumbnails.length}%` }]}
                resizeMode="cover"
              />
            ))
          ) : (
            // Aesthetic gradient placeholders while extracting
            Array.from({ length: 8 }).map((_, idx) => (
              <View key={`ph_${idx}`} style={styles.thumbnailPlaceholder}>
                <View style={styles.filmHole} />
              </View>
            ))
          )}
        </View>

        {/* Dark Dimmed Excluded Overlay (Left) */}
        <View
          style={[
            styles.dimmedOverlay,
            { left: 0, width: Math.max(0, leftX) }
          ]}
          pointerEvents="none"
        />

        {/* Dark Dimmed Excluded Overlay (Right) */}
        <View
          style={[
            styles.dimmedOverlay,
            {
              left: Math.min(containerWidth, rightX + HANDLE_WIDTH),
              right: 0
            }
          ]}
          pointerEvents="none"
        />

        {/* Selected Trim Box (White border top & bottom) */}
        <View
          style={[
            styles.trimSelectionBox,
            {
              left: leftX,
              width: Math.max(HANDLE_WIDTH * 2, rightX - leftX + HANDLE_WIDTH)
            }
          ]}
          pointerEvents="none"
        />

        {/* LEFT TRIM HANDLE (WhatsApp Style with Grip Notch) */}
        <View
          style={[styles.handleTouchable, { left: leftX }]}
          {...leftPanResponder.panHandlers}
        >
          <View style={styles.handleBarLeft}>
            <View style={styles.handleGripDot} />
            <View style={styles.handleGripDot} />
          </View>
        </View>

        {/* RIGHT TRIM HANDLE (WhatsApp Style with Grip Notch) */}
        <View
          style={[styles.handleTouchable, { left: rightX }]}
          {...rightPanResponder.panHandlers}
        >
          <View style={styles.handleBarRight}>
            <View style={styles.handleGripDot} />
            <View style={styles.handleGripDot} />
          </View>
        </View>
      </View>

      {/* 2. Info Row (Mute toggle + WhatsApp Duration Badge 0:39 • 7.7 MB) */}
      <View style={styles.metaRow}>
        <TouchableOpacity
          style={styles.muteButtonPill}
          onPress={onToggleMute}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={18}
            color="#ffffff"
          />
        </TouchableOpacity>

        <View style={styles.durationBadgePill}>
          <Text style={styles.durationText}>
            {formatTime(currentDurationSec)}
            {fileSizeMB ? ` • ${fileSizeMB} MB` : ` • ${formatTime(totalDuration)} total`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trimmerRoot: {
    width: '100%',
    paddingHorizontal: TIMELINE_PADDING,
    marginVertical: 10
  },
  timelineWrapper: {
    width: '100%',
    height: TIMELINE_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#11131f'
  },
  filmstripTrack: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center'
  },
  thumbnailImage: {
    height: '100%',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.1)'
  },
  thumbnailPlaceholder: {
    flex: 1,
    height: '100%',
    backgroundColor: '#1e2438',
    borderRightWidth: 1,
    borderRightColor: '#0a0d18',
    justifyContent: 'center',
    alignItems: 'center'
  },
  filmHole: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)'
  },
  dimmedOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)'
  },
  trimSelectionBox: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#ffffff'
  },
  handleTouchable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH + 14,
    marginLeft: -7,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  handleBarLeft: {
    width: HANDLE_WIDTH,
    height: '100%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4
  },
  handleBarRight: {
    width: HANDLE_WIDTH,
    height: '100%',
    backgroundColor: '#ffffff',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4
  },
  handleGripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#334155',
    marginVertical: 2
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 8
  },
  muteButtonPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  durationBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  durationText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3
  }
});
