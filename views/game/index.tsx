import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import { BlackoutFX, Container, Viewport } from "./core";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";

export type GameProps = {
  isSoundEnabled: boolean;
  isVibrationEnabled: boolean;
};

/**
 * Отображает трёхмерный вьюпорт игры.
 * @param {GameProps} props Свойства игры.
 * @returns {JSX.Element} Возвращает разметку компонента вьюпорта.
 */
export const Game = ({
  isSoundEnabled,
  isVibrationEnabled,
}: GameProps): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      const container = new Container({
        grid: 6,
        size: 2,
      });
      const instance = new Viewport(gl);
      viewport.current = instance;

      instance
        .init()
        .useFX(
          "blackout",
          new BlackoutFX(instance.renderer, instance.scene, instance.camera)
        )
        .add(container)
        .render();

      instance.fx.blackout.enable();
      instance.fx.blackout.play("show");
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
