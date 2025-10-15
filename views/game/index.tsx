import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import { BlackoutFX, Container, HeatHazeFX, Viewport } from "./core";
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
      const baseViewport = new Viewport(gl);
      const instance = baseViewport
        .init()
        .useFX(
          "blackout",
          new BlackoutFX(
            baseViewport.renderer,
            baseViewport.scene,
            baseViewport.camera
          )
        )
        .useFX(
          "heatHaze",
          new HeatHazeFX(
            baseViewport.renderer,
            baseViewport.scene,
            baseViewport.camera,
            {
              intensity: 0.75,
              distortion: 0.035,
              shimmer: 0.5,
            }
          )
        )
        .add(container)
        .render();

      viewport.current = instance;

      instance.fx.blackout.enable();
      instance.fx.blackout.play("show");
      instance.fx.heatHaze.enable();
      instance.fx.heatHaze.play(0.85, 1500);
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
