import { JSX, useCallback, useMemo, useRef } from "react";
import { PanResponder, StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";
import { BoxObject, Viewport } from "@/core";

const ROTATION_STEP_ANGLE = Math.PI / 18;

export const ViewPort = (): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const lastDx = useRef(0);
  const lastTimestamp = useRef<number | null>(null);

  /**
   * Вызывает лёгкую вибрацию при прохождении шага вращения.
   * @param {1 | -1} _direction Направление вращения (не используется).
   * @returns {void}
   */
  const handleRotationStep = useCallback((_: 1 | -1): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /**
   * Обрабатывает изменение горизонтального свайпа и вращает сцену.
   * @param {number} deltaX Смещение пальца по горизонтали в пикселях.
   * @param {number} velocityX Горизонтальная скорость жеста в пикселях в секунду.
   * @param {number} [deltaTime] Интервал времени между событиями жеста в секундах.
   * @param {boolean} [isFinal] Признак завершающего события жеста.
   * @returns {void}
   */
  const handleHorizontalDrag = useCallback(
    (
      deltaX: number,
      velocityX: number,
      deltaTime?: number,
      isFinal = false
    ): void => {
      viewport.current?.rotateHorizontally(deltaX, velocityX, deltaTime, isFinal);
    },
    []
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
      viewport.current.setZoom(0.5);
      viewport.current.setRotationStepFeedback(
        ROTATION_STEP_ANGLE,
        handleRotationStep
      );

      const box = new BoxObject({
        id: 1,
        position: {
          x: 1,
          y: 1,
          z: 1,
        },
        width: 1,
        height: 1,
        depth: 1,
        material: "glass",
        debuffs: [],
        location: "CONTAINER",
      });
      const box2 = new BoxObject({
        id: 1,
        position: {
          x: -0.5,
          y: 1,
          z: -0.5,
        },
        width: 1,
        height: 1,
        depth: 1,
        material: "standart",
        debuffs: [],
        location: "CONTAINER",
      });
      viewport.current.add(box);
      viewport.current.add(box2);
    },
    [handleRotationStep]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          lastDx.current = 0;
          lastTimestamp.current =
            typeof evt.nativeEvent.timestamp === "number"
              ? evt.nativeEvent.timestamp
              : Date.now();
        },
        onPanResponderMove: (evt, gestureState) => {
          const timestamp =
            typeof evt.nativeEvent.timestamp === "number"
              ? evt.nativeEvent.timestamp
              : Date.now();
          const deltaTime =
            lastTimestamp.current !== null
              ? (timestamp - lastTimestamp.current) / 1000
              : undefined;
          lastTimestamp.current = timestamp;
          const deltaX = gestureState.dx - lastDx.current;
          lastDx.current = gestureState.dx;
          handleHorizontalDrag(deltaX, gestureState.vx, deltaTime, false);
        },
        onPanResponderRelease: (_, gestureState) => {
          handleHorizontalDrag(0, gestureState.vx, undefined, true);
          lastDx.current = 0;
          lastTimestamp.current = null;
        },
        onPanResponderTerminate: (_, gestureState) => {
          handleHorizontalDrag(0, gestureState.vx, undefined, true);
          lastDx.current = 0;
          lastTimestamp.current = null;
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
