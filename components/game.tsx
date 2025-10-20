import { useCallback, useRef, type JSX } from "react";
import { StyleSheet } from "react-native";
import { BlackoutFX, generateBoxes, HeatHazeFX, Viewport } from "@/core";
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
      const boxes = generateBoxes({
        seed: 123,
        container: {
          width: 1.5,
          height: 1.5,
          depth: 1.5,
        },
        cuts: 2,
        debuffDistribution: {
          FRAGILE: 1,
          HEAVY: 2,
          NON_TILTABLE: 1,
        },
      });

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
        .render();

      viewport.current = instance;

      instance.add(boxes);

      // instance.fitToObject(box).then(async () => {
      //   await box.animateTransform(
      //     {
      //       rotation: {
      //         rx: true,
      //         ry: false,
      //         rz: true,
      //       },
      //     },
      //     300
      //   );

      //   await instance.fitToObject(box);
      // });

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
