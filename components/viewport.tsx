import { JSX, useCallback, useRef } from "react";
import { StyleSheet } from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { BoxObject, Viewport } from "@/core";

export const ViewPort = (): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);

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
        width: 2,
        height: 2,
        depth: 2,
        material: 'standart',
        debuffs: [],
        location: "CONTAINER",
      });
      viewport.current.add(box)
    },
    []
  );

  return <GLView style={styles.glView} onContextCreate={handleContextCreate} />;
};

const styles = StyleSheet.create({
  glView: {
    flex: 1,
    overflow: "hidden",
  },
});
