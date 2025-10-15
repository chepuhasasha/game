import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import {
  BlackoutFX,
  Container,
  HeatHazeFX,
  OutlineFX,
  Viewport,
} from "./core";
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
      const container = new Container(6, 1);

      const instance = new Viewport(gl)
        .init()
        .useFX(
          "outline",
          new OutlineFX({
            color: 0xf6f6f6,
            thickness: 1.35,
            intensity: 1.0,
            threshold: 0.2,
          })
        )
        .useFX(
          "heatHaze",
          new HeatHazeFX({
            intensity: 0.75,
            distortion: 0.035,
            shimmer: 0.5,
          })
        )
        .useFX("blackout", new BlackoutFX())
        .add(container)
        .render();

      viewport.current = instance;

      instance.fitToObject(container);

      instance.fx.outline.enable();
      instance.fx.outline.play(1);
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
