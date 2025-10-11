import { JSX, useCallback, useMemo, useRef } from "react";
import { PanResponder, StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { BoxObject, Viewport } from "@/core";

export const ViewPort = (): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const lastDx = useRef(0);

  /**
   * Обрабатывает изменение горизонтального свайпа и вращает сцену.
   * @param {number} deltaX Смещение пальца по горизонтали в пикселях.
   * @returns {void}
   */
  const handleHorizontalDrag = useCallback(
    (deltaX: number): void => {
      viewport.current?.rotateHorizontally(deltaX);
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
      viewport.current.setZoom(0.5)

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
        material: 'glass',
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
        material: 'standart',
        debuffs: [],
        location: "CONTAINER",
      });
      viewport.current.add(box)
      viewport.current.add(box2)
    },
    []
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
