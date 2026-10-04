import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Image } from 'react-native';

const logoAsset = require('../../assets/logo.png');

/**
 * Animated circular logo component with a wavy, shady pink pulsing ring surrounding the logo.
 */
export default function CoupleLogo({ size = 130 }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(0.95)).current;
  const glowOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    // Gentle floating loop
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -5,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    // Wavy pink halo animation loop (Outer wave)
    const waveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1.15,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    // Secondary wavy wave loop (Inner pulse)
    const waveLoop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim2, {
          toValue: 1.25,
          duration: 2500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(waveAnim2, {
          toValue: 0.95,
          duration: 2500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );

    // Glow opacity pulse
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.7,
          duration: 1800,
          useNativeDriver: true
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.3,
          duration: 1800,
          useNativeDriver: true
        })
      ])
    );

    floatLoop.start();
    waveLoop.start();
    waveLoop2.start();
    opacityLoop.start();

    return () => {
      floatLoop.stop();
      waveLoop.stop();
      waveLoop2.stop();
      opacityLoop.stop();
    };
  }, []);

  const ringSize = size * 1.12;

  return (
    <View style={[styles.container, { width: size * 1.3, height: size * 1.3 }]}>
      {/* Outer Wavy Pink Ring 2 */}
      <Animated.View
        style={[
          styles.wavyRingOuter,
          {
            width: ringSize * 1.1,
            height: ringSize * 1.1,
            borderRadius: (ringSize * 1.1) / 2,
            opacity: Animated.multiply(glowOpacity, 0.5),
            transform: [{ scale: waveAnim2 }]
          }
        ]}
      />

      {/* Wavy Pink Ring 1 */}
      <Animated.View
        style={[
          styles.wavyRingInner,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            opacity: glowOpacity,
            transform: [{ scale: waveAnim }]
          }
        ]}
      />

      {/* Floating Circular Logo Image (In front of wavy ring) */}
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          borderWidth: 2.5,
          borderColor: '#f472b6',
          backgroundColor: '#0c0e17',
          shadowColor: '#ec4899',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 16,
          elevation: 10,
          transform: [{ translateY: floatAnim }]
        }}
      >
        <Image
          source={logoAsset}
          style={{
            width: '100%',
            height: '100%',
            resizeMode: 'cover'
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  wavyRingOuter: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#db2777',
    backgroundColor: 'rgba(219, 39, 119, 0.08)',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 8
  },
  wavyRingInner: {
    position: 'absolute',
    borderWidth: 2.5,
    borderColor: '#f472b6',
    backgroundColor: 'rgba(244, 114, 182, 0.12)',
    shadowColor: '#f472b6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 8
  }
});
