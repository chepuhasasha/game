import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";

 
import { Audio, AVPlaybackStatus } from "expo-av";
import {
  BoxObject,
  generateBoxes,
  createRng,
  Viewport,
  RotationRingObject,
} from "@/core";

const ROTATION_STEP_ANGLE = Math.PI / 18;
const CONTAINER_SIZE = 6;
const RING_FLOOR_OFFSET = -CONTAINER_SIZE / 2 + 0.01;
const RING_INNER_MARGIN = 0.6;
const RING_WIDTH = 0.8;

type ViewPortProps = {
  isSoundEnabled: boolean;
  isVibrationEnabled: boolean;
};

/**
 * Отображает трёхмерный вьюпорт с объектами и реагирует на пользовательские жесты.
 * @param {ViewPortProps} props Свойства компонента, управляемые состоянием звука и вибрации.
 * @returns {JSX.Element} Возвращает разметку компонента вьюпорта.
 */
export const ViewPort = ({
  isSoundEnabled,
  isVibrationEnabled,
}: ViewPortProps): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const lastDx = useRef(0);
  const lastStepTimeRef = useRef(Date.now());
  const rotationStepSoundRef = useRef<Audio.Sound | null>(null);
  const isRotationStepSoundLoadedRef = useRef(false);
  const isRotationStepSoundPlayingRef = useRef(false);
  const isRotationGestureActiveRef = useRef(false);
  const ringRadiiRef = useRef<{ inner: number; outer: number } | null>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let isMounted = true;

    /**
     * Обрабатывает обновления статуса воспроизведения звука шага вращения.
     * @param {AVPlaybackStatus} status Текущий статус воспроизведения.
     * @returns {void}
     */
    const handleRotationStepSoundStatus = (status: AVPlaybackStatus): void => {
      if (!status.isLoaded) {
        isRotationStepSoundLoadedRef.current = false;
        isRotationStepSoundPlayingRef.current = false;
        return;
      }

      isRotationStepSoundLoadedRef.current = true;
      isRotationStepSoundPlayingRef.current = status.isPlaying ?? false;
    };

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
          sound.setOnPlaybackStatusUpdate(handleRotationStepSoundStatus);
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
      const sound = rotationStepSoundRef.current;
      if (sound !== null) {
        sound.setOnPlaybackStatusUpdate(null);
        void sound.unloadAsync();
        rotationStepSoundRef.current = null;
      }
      isRotationStepSoundLoadedRef.current = false;
      isRotationStepSoundPlayingRef.current = false;
    };
  }, []);

  /**
   * Запускает звук шага вращения с начала, обеспечивая корректное воспроизведение при частых событиях.
   * @returns {void}
   */
  const playRotationStepSound = useCallback((): void => {
    if (!isSoundEnabled) {
      return;
    }

    const sound = rotationStepSoundRef.current;
    if (sound === null || !isRotationStepSoundLoadedRef.current) {
      return;
    }

    if (isRotationStepSoundPlayingRef.current) {
      void sound.setStatusAsync({
        positionMillis: 0,
        shouldPlay: true,
        volume: 0.1,
      });
      return;
    }

    void sound.playFromPositionAsync(0);
  }, [isSoundEnabled]);

  /**
   * Останавливает звук шага вращения, если он воспроизводится.
   * @returns {void}
   */
  const stopRotationStepSound = useCallback((): void => {
    const sound = rotationStepSoundRef.current;
    if (sound === null || !isRotationStepSoundLoadedRef.current) {
      return;
    }

    void sound.stopAsync();
  }, []);

  /**
   * Следит за состоянием звука и при отключении мгновенно останавливает воспроизведение шага.
   */
  useEffect(() => {
    if (!isSoundEnabled) {
      stopRotationStepSound();
    }
  }, [isSoundEnabled, stopRotationStepSound]);

  /**
   * Вызывает лёгкую вибрацию при прохождении шага вращения.
   * @param {1 | -1} _direction Направление вращения (не используется).
   * @returns {void}
   */
  const handleRotationStep = useCallback(
    (_: 1 | -1): void => {
      const time = Date.now();
      if (time - lastStepTimeRef.current >= 100) {
        lastStepTimeRef.current = time;
        if (isVibrationEnabled) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        playRotationStepSound();
      }
    },
    [isVibrationEnabled, playRotationStepSound]
  );

  /**
   * Обрабатывает изменение горизонтального свайпа и вращает сцену.
   * @param {number} deltaX Смещение пальца по горизонтали в пикселях.
   * @returns {void}
   */
  const handleHorizontalDrag = useCallback((deltaX: number): void => {
    viewport.current?.rotateHorizontally(deltaX);
  }, []);

  /**
   * Обновляет размеры контейнера и пересчитывает границы кольца вращения.
   * @param {LayoutChangeEvent} event Событие изменения раскладки контейнера.
   * @returns {void}
   */
  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }

      return { width, height };
    });
  }, []);

  /**
   * Проверяет, находится ли точка касания в пределах кольца вращения с учётом проекции.
   * @param {number} x Координата X точки касания внутри оверлея в пикселях.
   * @param {number} y Координата Y точки касания внутри оверлея в пикселях.
   * @returns {boolean} Возвращает true, если касание попадает на кольцо.
   */
  const isPointInRotationRing = useCallback(
    (x: number, y: number): boolean => {
      const instance = viewport.current;
      const ringRadii = ringRadiiRef.current;

      if (
        !instance ||
        !ringRadii ||
        layout.width === 0 ||
        layout.height === 0
      ) {
        return false;
      }

      const viewportSize = instance.getViewportSize();
      if (!viewportSize) {
        return false;
      }

      const scaleX = viewportSize.width / layout.width;
      const scaleY = viewportSize.height / layout.height;

      const worldPoint = instance.screenPointToWorldOnPlane(
        x * scaleX,
        y * scaleY,
        RING_FLOOR_OFFSET
      );

      if (!worldPoint) {
        return false;
      }

      const distance = Math.hypot(worldPoint.x, worldPoint.z);

      return (
        distance >= ringRadii.inner &&
        distance <= ringRadii.outer
      );
    },
    [layout.height, layout.width]
  );

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
      const rnd = createRng(123456);
      const boxes = generateBoxes(CONTAINER_SIZE, 6, rnd);
      boxes.forEach((b) => {
        const box = new BoxObject({
          id: 1,
          material: rnd() > 0.5 ? "standart" : "glass",
          debuffs: [],
          location: "CONTAINER",
          ...b,
        });
        viewport.current?.add(box);
      });
      const halfDiagonal = Math.sqrt(2) * (CONTAINER_SIZE / 2);
      const ringInnerRadius = halfDiagonal + RING_INNER_MARGIN;
      const ringOuterRadius = ringInnerRadius + RING_WIDTH;
      ringRadiiRef.current = {
        inner: ringInnerRadius,
        outer: ringOuterRadius,
      };
      const rotationRing = new RotationRingObject({
        innerRadius: ringInnerRadius,
        outerRadius: ringOuterRadius,
        positionY: RING_FLOOR_OFFSET,
      });
      viewport.current?.add(rotationRing, { excludeFromFit: true });
      viewport.current?.fitToContent();
    },
    [handleRotationStep]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const shouldHandle = isPointInRotationRing(locationX, locationY);
          isRotationGestureActiveRef.current = shouldHandle;

          if (shouldHandle) {
            lastDx.current = 0;
          }

          return shouldHandle;
        },
        onMoveShouldSetPanResponder: (event) => {
          if (isRotationGestureActiveRef.current) {
            return true;
          }

          const { locationX, locationY } = event.nativeEvent;
          const shouldHandle = isPointInRotationRing(locationX, locationY);
          if (shouldHandle) {
            isRotationGestureActiveRef.current = true;
            lastDx.current = 0;
          }

          return shouldHandle;
        },
        onPanResponderGrant: () => {
          lastDx.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isRotationGestureActiveRef.current) {
            return;
          }

          const deltaX = gestureState.dx - lastDx.current;
          lastDx.current = gestureState.dx;
          handleHorizontalDrag(deltaX);
        },
        onPanResponderRelease: () => {
          isRotationGestureActiveRef.current = false;
          lastDx.current = 0;
        },
        onPanResponderTerminate: () => {
          isRotationGestureActiveRef.current = false;
          lastDx.current = 0;
        },
      }),
    [handleHorizontalDrag, isPointInRotationRing]
  );

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GLView style={styles.glView} onContextCreate={handleContextCreate} />
      {layout.width > 0 && layout.height > 0 ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View
            {...panResponder.panHandlers}
            style={styles.rotationRing}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glView: {
    flex: 1,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  rotationRing: {
    ...StyleSheet.absoluteFillObject,
  },
});
