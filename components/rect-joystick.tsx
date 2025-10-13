import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  StyleSheet,
  View,
  Easing,
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
  const [isPressed, setIsPressed] = useState(false);
  const lastDxRef = useRef(0);
  const handlePosition = useRef(
    new Animated.ValueXY(INITIAL_HANDLE_OFFSET)
  ).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  /**
   * Останавливает текущую пульсацию бегунка.
   * @returns {void}
   */
  const stopPulseAnimation = useCallback((): void => {
    if (pulseAnimationRef.current) {
      pulseAnimationRef.current.stop();
      pulseAnimationRef.current = null;
    }
  }, []);

  /**
   * Сбрасывает позицию бегунка в центр и обнуляет накопленное смещение.
   * @returns {void}
   */
  const resetHandlePosition = useCallback((): void => {
    handlePosition.stopAnimation();
    handlePosition.setValue(INITIAL_HANDLE_OFFSET);
    lastDxRef.current = 0;
  }, [handlePosition]);

  /**
   * Запускает анимацию плавного возврата бегунка в центр.
   * @returns {void}
   */
  const animateHandleToCenter = useCallback((): void => {
    handlePosition.stopAnimation();
    Animated.spring(handlePosition, {
      toValue: INITIAL_HANDLE_OFFSET,
      damping: 12,
      stiffness: 180,
      mass: 0.5,
      useNativeDriver: true,
    }).start();
    lastDxRef.current = 0;
  }, [handlePosition]);

  /**
   * Запускает пульсацию бегунка в режиме покоя.
   * @returns {void}
   */
  const startPulseAnimation = useCallback((): void => {
    stopPulseAnimation();
    scaleValue.setValue(1);
    pulseAnimationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 1.08,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimationRef.current.start();
  }, [scaleValue, stopPulseAnimation]);

  useEffect(() => {
    startPulseAnimation();

    return () => {
      stopPulseAnimation();
    };
  }, [startPulseAnimation, stopPulseAnimation]);

  /**
   * Сохраняет размеры контейнера джойстика при изменении раскладки.
   * @param {LayoutChangeEvent} event Событие изменения раскладки контейнера.
   * @returns {void}
   */
  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      const { width, height } = event.nativeEvent.layout;
      setLayout((previous) => {
        if (previous.width === width && previous.height === height) {
          return previous;
        }

        return { width, height };
      });
    },
    []
  );

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

      handlePosition.stopAnimation();
      handlePosition.setValue({
        x: clampedDx,
        y: clampedDy,
      });

      const deltaX = gestureState.dx - lastDxRef.current;
      lastDxRef.current = gestureState.dx;
      onHorizontalDrag(deltaX);
    },
    [handlePosition, layout.height, layout.width, onHorizontalDrag]
  );

  /**
   * Сбрасывает позицию бегунка и возвращает визуальное состояние по умолчанию при завершении жеста.
   * @returns {void}
   */
  const handlePanEnd = useCallback((): void => {
    setIsPressed(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      damping: 12,
      stiffness: 180,
      mass: 0.6,
      useNativeDriver: true,
    }).start(() => {
      startPulseAnimation();
    });
    animateHandleToCenter();
  }, [animateHandleToCenter, scaleValue, startPulseAnimation]);

  /**
   * Подготавливает состояние к началу обработки свайпа и включает визуальный эффект нажатия.
   * @returns {void}
   */
  const handlePanStart = useCallback((): void => {
    setIsPressed(true);
    stopPulseAnimation();
    scaleValue.stopAnimation();
    Animated.spring(scaleValue, {
      toValue: 1.2,
      damping: 12,
      stiffness: 220,
      mass: 0.4,
      useNativeDriver: true,
    }).start();
    resetHandlePosition();
  }, [resetHandlePosition, scaleValue, stopPulseAnimation]);

  /**
   * Формирует визуальный стиль бегунка с учётом нажатия и текущего смещения.
   * @returns {Array<object>} Массив стилевых объектов для отображения бегунка.
   */
  const handleStyle = useMemo(() => {
    return [
      styles.handle,
      {
        backgroundColor: isPressed
          ? "rgba(255,255,255, 1)"
          : "rgba(255,255,255, 0.4)",
        transform: [
          ...handlePosition.getTranslateTransform(),
          { scale: scaleValue },
        ],
      },
    ];
  }, [handlePosition, isPressed, scaleValue]);

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
      <Animated.View
        pointerEvents="none"
        style={handleStyle}
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
    borderRadius: "50%",
  },
});
