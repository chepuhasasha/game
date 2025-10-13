import { useCallback, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  StyleSheet,
  View,
} from "react-native";

const HANDLE_SIZE = 48;

const INITIAL_LAYOUT = {
  width: 0,
  height: 0,
};

const INITIAL_HANDLE_OFFSET = {
  x: 0,
  y: 0,
};

type LayoutSize = {
  width: number;
  height: number;
};

type HandleOffset = {
  x: number;
  y: number;
};

type RectJoystickProps = {
  onHorizontalDrag: (deltaX: number) => void;
};

/**
 * Ограничивает значение указанным диапазоном.
 * @param {number} value Исходное значение для ограничения.
 * @param {number} min Нижняя граница допустимого диапазона.
 * @param {number} max Верхняя граница допустимого диапазона.
 * @returns {number} Ограниченное значение.
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Отображает прямоугольный джойстик для управления игрой с помощью свайпов.
 * @param {RectJoystickProps} props Свойства компонента с обработчиком горизонтального движения.
 * @returns {JSX.Element} Возвращает разметку прямоугольного джойстика.
 */
export const RectJoystick = ({
  onHorizontalDrag,
}: RectJoystickProps): JSX.Element => {
  const [layout, setLayout] = useState<LayoutSize>(INITIAL_LAYOUT);
  const [handleOffset, setHandleOffset] = useState<HandleOffset>(
    INITIAL_HANDLE_OFFSET
  );
  const lastDxRef = useRef(0);

  /**
   * Сбрасывает позицию бегунка в центр и обнуляет накопленное смещение.
   * @returns {void}
   */
  const resetHandlePosition = useCallback((): void => {
    setHandleOffset(INITIAL_HANDLE_OFFSET);
    lastDxRef.current = 0;
  }, []);

  /**
   * Сохраняет размеры контейнера джойстика при изменении раскладки.
   * @param {LayoutChangeEvent} event Событие изменения раскладки контейнера.
   * @returns {void}
   */
  const handleContainerLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }

      return { width, height };
    });
  }, []);

  /**
   * Обновляет позицию бегунка и сообщает об изменении горизонтального смещения.
   * @param {PanResponderGestureState} gestureState Состояние жеста с накопленным смещением.
   * @returns {void}
   */
  const handlePanMove = useCallback(
    (gestureState: PanResponderGestureState): void => {
      if (layout.width === 0 || layout.height === 0) {
        return;
      }

      const halfWidth = (layout.width - HANDLE_SIZE) / 2;
      const halfHeight = (layout.height - HANDLE_SIZE) / 2;
      const clampedDx = clamp(gestureState.dx, -halfWidth, halfWidth);
      const clampedDy = clamp(gestureState.dy, -halfHeight, halfHeight);

      setHandleOffset({
        x: clampedDx,
        y: clampedDy,
      });

      const deltaX = gestureState.dx - lastDxRef.current;
      lastDxRef.current = gestureState.dx;
      onHorizontalDrag(deltaX);
    },
    [layout.height, layout.width, onHorizontalDrag]
  );

  /**
   * Сбрасывает позицию бегунка при завершении жеста.
   * @returns {void}
   */
  const handlePanEnd = useCallback((): void => {
    resetHandlePosition();
  }, [resetHandlePosition]);

  /**
   * Подготавливает состояние к началу обработки свайпа.
   * @returns {void}
   */
  const handlePanStart = useCallback((): void => {
    resetHandlePosition();
  }, [resetHandlePosition]);

  /**
   * Определяет, следует ли назначать обработчик жестов на событие начала касания.
   * @returns {boolean} Признак необходимости обработки жеста.
   */
  const handleShouldSetPanResponder = useCallback((): boolean => {
    return true;
  }, []);

  /**
   * Оборачивает обработку перемещения для совместимости с интерфейсом PanResponder.
   * @param {GestureResponderEvent} _event Событие касания, не используемое в логике.
   * @param {PanResponderGestureState} gestureState Текущее состояние жеста.
   * @returns {void}
   */
  const handlePanResponderMove = useCallback(
    (
      _event: GestureResponderEvent,
      gestureState: PanResponderGestureState
    ): void => {
      handlePanMove(gestureState);
    },
    [handlePanMove]
  );

  /**
   * Создаёт обработчики жестов для прямоугольного джойстика.
   * @returns {PanResponderInstance} Экземпляр PanResponder для обработки свайпов.
   */
  const panResponder = useMemo((): PanResponderInstance => {
    return PanResponder.create({
      onStartShouldSetPanResponder: handleShouldSetPanResponder,
      onMoveShouldSetPanResponder: handleShouldSetPanResponder,
      onPanResponderGrant: handlePanStart,
      onPanResponderMove: handlePanResponderMove,
      onPanResponderRelease: handlePanEnd,
      onPanResponderTerminate: handlePanEnd,
    });
  }, [
    handlePanEnd,
    handlePanResponderMove,
    handlePanStart,
    handleShouldSetPanResponder,
  ]);

  return (
    <View
      onLayout={handleContainerLayout}
      style={styles.container}
      {...panResponder.panHandlers}
    >
      <View
        pointerEvents="none"
        style={[
          styles.handle,
          {
            transform: [
              { translateX: handleOffset.x },
              { translateY: handleOffset.y },
            ],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255, 0.1)",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  handle: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: '50%',
    backgroundColor: "rgba(255,255,255, 1)",
  },
});
