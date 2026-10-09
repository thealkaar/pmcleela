import React, { useRef, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';

const TRACK_WIDTH = Dimensions.get('window').width - 72;

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function AudioTrackSelector({
  duration,
  selectionDuration,
  start,
  onStartChange
}) {
  const [trackWidth, setTrackWidth] = useState(TRACK_WIDTH);
  const gesture = useRef({ start, duration, selectionDuration, trackWidth });
  const dragOrigin = useRef({ start, duration, selectionDuration, trackWidth });
  gesture.current = { start, duration, selectionDuration, trackWidth };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragOrigin.current = gesture.current;
    },
    onPanResponderMove: (_event, state) => {
      const {
        start: initialStart,
        duration: trackDuration,
        selectionDuration: clipDuration,
        trackWidth: width
      } = dragOrigin.current;
      const maxStart = Math.max(0, trackDuration - clipDuration);
      const nextStart = Math.max(0, Math.min(
        initialStart + (state.dx / Math.max(1, width)) * trackDuration,
        maxStart
      ));
      onStartChange(Math.round(nextStart * 10) / 10);
    }
  })).current;

  const selectedWidth = duration > 0
    ? Math.min(100, (selectionDuration / duration) * 100)
    : 100;
  const selectedLeft = duration > selectionDuration
    ? (start / duration) * 100
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={styles.title}>Choose music section</Text>
        <Text style={styles.duration}>
          {formatTime(start)} – {formatTime(start + selectionDuration)}
        </Text>
      </View>
      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View style={styles.waveform}>
          {Array.from({ length: 32 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.waveBar,
                { height: 7 + ((index * 13 + 7) % 20) },
                index / 32 >= selectedLeft / 100 &&
                  index / 32 <= (selectedLeft + selectedWidth) / 100 &&
                  styles.selectedWaveBar
              ]}
            />
          ))}
        </View>
        <View
          style={[
            styles.selection,
            { left: `${selectedLeft}%`, width: `${selectedWidth}%` }
          ]}
          {...panResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Selected music section"
          accessibilityValue={{
            min: 0,
            max: Math.max(0, duration - selectionDuration),
            now: start
          }}
        >
          <View style={styles.grip} />
          <View style={styles.grip} />
        </View>
      </View>
      <Text style={styles.hint}>Drag the highlighted section to choose which part plays.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 18,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 12, 20, 0.88)'
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  title: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700'
  },
  duration: {
    color: '#f9a8d4',
    fontSize: 11,
    fontWeight: '700'
  },
  track: {
    height: 42,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#242838',
    justifyContent: 'center'
  },
  waveform: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4
  },
  waveBar: {
    width: 2,
    borderRadius: 2,
    backgroundColor: '#64748b'
  },
  selectedWaveBar: {
    backgroundColor: '#f9a8d4'
  },
  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    minWidth: 18,
    borderColor: '#f472b6',
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(236, 72, 153, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3
  },
  grip: {
    width: 3,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#fff'
  },
  hint: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 7
  }
});
