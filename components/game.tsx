import { useCallback, useRef, type JSX } from "react";
import { StyleSheet, type GestureResponderEvent } from "react-native";
import { BlackoutFX, Controls, generateBoxes, HeatHazeFX, Viewport } from "@/core";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { Group, Object3D } from "three";

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
  const controls = useRef<Controls | null>(null);
  const pointerPosition = useRef<{ x: number; y: number } | null>(null);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      const boxes = generateBoxes({
        seed: 123,
        container: {
          width: 1,
          height: 1,
          depth: 1,
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

      const root = new Group();
      boxes.forEach((box) => {
        root.add(box);
      });

      instance.add(root);

      const controller = new Controls(instance);
      controller.setTargetObject(root);
      controls.current = controller;
      // instance.fitToObject(root);

      instance.fx.blackout.enable();
      instance.fx.blackout.play("show");
      // instance.fx.heatHaze.enable();
      // instance.fx.heatHaze.play(0.85, 1500);
    },
    []
  );

  /**
   * Фиксирует начальную позицию указателя для последующих вычислений смещения.
   * @param {GestureResponderEvent} event Событие начала взаимодействия.
   */
  const handlePointerStart = useCallback((event: GestureResponderEvent): void => {
    const { pageX, pageY } = event.nativeEvent;
    pointerPosition.current = { x: pageX, y: pageY };
  }, []);

  /**
   * Обновляет вращение камеры при перемещении указателя.
   * @param {GestureResponderEvent} event Событие перемещения во время жеста.
   */
  const handlePointerMove = useCallback((event: GestureResponderEvent): void => {
    if (!controls.current || !pointerPosition.current) {
      return;
    }

    const { pageX, pageY } = event.nativeEvent;
    const deltaX = pageX - pointerPosition.current.x;
    const deltaY = pageY - pointerPosition.current.y;

    controls.current.rotate({ x: deltaX, y: deltaY });

    pointerPosition.current = { x: pageX, y: pageY };
  }, []);

  /**
   * Сбрасывает сохранённое положение указателя после завершения взаимодействия.
   */
  const handlePointerEnd = useCallback((): void => {
    pointerPosition.current = null;
  }, []);

  return (
    <GLView
      style={styles.glView}
      onContextCreate={handleContextCreate}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handlePointerStart}
      onResponderMove={handlePointerMove}
      onResponderRelease={handlePointerEnd}
      onResponderTerminate={handlePointerEnd}
    />
  );
};

const styles = StyleSheet.create({
  glView: {
    flex: 1,
    overflow: "hidden",
  },
});
