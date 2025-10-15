import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import { BlackoutFX, Box, Container, HeatHazeFX, Viewport } from "./core";
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
      const box = new Box(1, 1, 1, 1, 1, 1);
      const box2 = new Box(1, 1, 1, 2, 1, 1);

      const instance = new Viewport(gl)
        .init()
        .useFX(
          "heatHaze",
          new HeatHazeFX({
            intensity: 0.75,
            distortion: 0.035,
            shimmer: 0.5,
          })
        )
        .useFX("blackout", new BlackoutFX())
        .add(box)
        .add(box2)
        .render();

      viewport.current = instance;

      // instance.fitToObject(box);

      instance.fx.blackout.enable();
      instance.fx.blackout.play("show");
      // instance.fx.heatHaze.enable();
      // instance.fx.heatHaze.play(0.85, 1500);
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
