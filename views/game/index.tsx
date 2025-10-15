import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import {
  BlackoutFX,
  Container,
  HeatHazeFX,
  createGameViewport,
  type ViewportWithFX,
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
  const viewport = useRef<ViewportWithFX | null>(null);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      const container = new Container({
        grid: 6,
        size: 2,
      });

      const baseViewport = createGameViewport(gl);
      baseViewport.init();
      const viewportWithHeatHaze = baseViewport.useFX(
        "heatHaze",
        new HeatHazeFX({
          intensity: 0.75,
          distortion: 0.035,
          shimmer: 0.5,
        })
      );
      const viewportWithFX = viewportWithHeatHaze.useFX(
        "blackout",
        new BlackoutFX()
      );
      viewportWithFX.add(container);
      viewportWithFX.render();

      viewport.current = viewportWithFX;

      viewportWithFX.fx.blackout.enable();
      viewportWithFX.fx.blackout.play("show");
      // viewportWithFX.fx.heatHaze.enable();
      // viewportWithFX.fx.heatHaze.play(0.85, 1500);
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
