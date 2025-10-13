import { JSX, useCallback, useMemo, useRef } from "react";
import { PanResponder, StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";
import { BoxObject, generateBoxes,createRng, Viewport } from "@/core";

const ROTATION_STEP_ANGLE = Math.PI / 18;

export const ViewPort = (): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const lastDx = useRef(0);

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
