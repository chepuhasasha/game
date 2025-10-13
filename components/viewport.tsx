import { JSX, useCallback, useEffect, useMemo, useRef } from "react";
import { PanResponder, StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { BoxObject, generateBoxes, createRng, Viewport } from "@/core";

const ROTATION_STEP_ANGLE = Math.PI / 18;

export const ViewPort = (): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const lastDx = useRef(0);
  const lastStepTimeRef = useRef(Date.now());
  const rotationStepSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let isMounted = true;

    /**
     * Загружает звуковой эффект шага вращения.
     * @returns {Promise<void>}
     */
    const loadRotationStepSound = async (): Promise<void> => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../assets/sounds/step.mp3")
        );

        if (isMounted) {
          rotationStepSoundRef.current = sound;
        } else {
          void sound.unloadAsync();
        }
      } catch (error) {
        console.warn("Не удалось загрузить звук шага вращения.", error);
      }
    };

    void loadRotationStepSound();

    return () => {
      isMounted = false;
      if (rotationStepSoundRef.current !== null) {
        void rotationStepSoundRef.current.unloadAsync();
        rotationStepSoundRef.current = null;
      }
    };
  }, []);

  /**
   * Вызывает лёгкую вибрацию при прохождении шага вращения.
   * @param {1 | -1} _direction Направление вращения (не используется).
   * @returns {void}
   */
  const handleRotationStep = useCallback((_: 1 | -1): void => {
    const time = Date.now();
    if (time - lastStepTimeRef.current >= 100) {
      lastStepTimeRef.current = time;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sound = rotationStepSoundRef.current;
      if (sound !== null) {
        void sound.replayAsync();
      }
    }
  }, []);

  /**
   * Обрабатывает изменение горизонтального свайпа и вращает сцену.
   * @param {number} deltaX Смещение пальца по горизонтали в пикселях.
   * @returns {void}
   */
  const handleHorizontalDrag = useCallback((deltaX: number): void => {
    viewport.current?.rotateHorizontally(deltaX);
  }, []);

  /**
   * Обработчик создания контекста OpenGL, инициализирующий сцену Three.js.
   * @param {ExpoWebGLRenderingContext} gl Контекст OpenGL, предоставленный Expo.
   * @returns {void}
   */
  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      viewport.current = new Viewport(gl);
      viewport.current.init();
      viewport.current.setZoom(0.3);
      viewport.current.setRotationStepFeedback(
        ROTATION_STEP_ANGLE,
        handleRotationStep
      );
      const rnd = createRng(123456)
      const boxes = generateBoxes(
        6,
        6,
        rnd
      );
      boxes.forEach((b) => {
        const box = new BoxObject({
          id: 1,
          material: rnd() > 0.5 ? "standart" : "glass",
          debuffs: [],
          location: "CONTAINER",
          ...b
        });
        viewport.current?.add(box);
      });
      viewport.current?.fitToContent();
    },
    [handleRotationStep]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          lastDx.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          const deltaX = gestureState.dx - lastDx.current;
          lastDx.current = gestureState.dx;
          handleHorizontalDrag(deltaX);
        },
        onPanResponderRelease: () => {
          lastDx.current = 0;
        },
        onPanResponderTerminate: () => {
          lastDx.current = 0;
        },
      }),
    [handleHorizontalDrag]
  );

  return (
    <GLView
      style={styles.glView}
      onContextCreate={handleContextCreate}
      {...panResponder.panHandlers}
    />
  );
};

const styles = StyleSheet.create({
  glView: {
    flex: 1,
    overflow: "hidden",
  },
});
