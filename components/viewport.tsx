import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MutableRefObject } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  StyleSheet,
  View,
} from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";

import { Audio, AVPlaybackStatus } from "expo-av";
import {
  BoxObject,
  generateBoxes,
  createRng,
  Viewport,
  RotationRingObject,
} from "@/core";

type LayoutSize = {
  width: number;
  height: number;
};

type RingRadii = {
  inner: number;
  outer: number;
};

type RotationRingPanResponderParams = {
  layout: LayoutSize;
  viewportRef: MutableRefObject<Viewport | null>;
  ringRadiiRef: MutableRefObject<RingRadii | null>;
  onHorizontalDrag: (deltaX: number) => void;
  onRotateStart?: () => void;
  onRotateEnd?: () => void;
};

const ROTATION_STEP_ANGLE = Math.PI / 18;
const CONTAINER_SIZE = 6;
const RING_FLOOR_OFFSET = -CONTAINER_SIZE / 2 + 0.01;
const RING_INNER_MARGIN = 0.6;
const RING_WIDTH = 0.8;
const DEFAULT_CAMERA_ZOOM = 0.3;
const ROTATION_ACTIVE_CAMERA_ZOOM = 0.26;

/**
 * Управляет жизненным циклом и воспроизведением звука шага вращения.
 * @param {boolean} isSoundEnabled Признак включённого звука из настроек пользователя.
 * @returns {{ play: () => void; stop: () => void }} Методы управления воспроизведением звука.
 */
const useRotationStepSound = (
  isSoundEnabled: boolean
): { play: () => void; stop: () => void } => {
  const rotationStepSoundRef = useRef<Audio.Sound | null>(null);
  const isRotationStepSoundLoadedRef = useRef(false);

  /**
   * Обрабатывает обновления статуса аудио-плеера шага вращения.
   * @param {AVPlaybackStatus} status Текущий статус воспроизведения.
   * @returns {void}
   */
  const handleRotationStepSoundStatus = useCallback(
    (status: AVPlaybackStatus): void => {
      if (!status.isLoaded) {
        isRotationStepSoundLoadedRef.current = false;
        return;
      }

      isRotationStepSoundLoadedRef.current = true;
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    /**
     * Загружает звуковой эффект шага вращения и подписывается на обновления статуса.
     * @returns {Promise<void>}
     */
    const loadRotationStepSound = async (): Promise<void> => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../assets/sounds/step.mp3")
        );

        if (!isMounted) {
          await sound.unloadAsync();
          return;
        }

        sound.setOnPlaybackStatusUpdate(handleRotationStepSoundStatus);
        rotationStepSoundRef.current = sound;
      } catch (error) {
        console.warn("Не удалось загрузить звук шага вращения.", error);
      }
    };

    void loadRotationStepSound();

    return () => {
      isMounted = false;
      const sound = rotationStepSoundRef.current;
      if (sound !== null) {
        sound.setOnPlaybackStatusUpdate(null);
        void sound.unloadAsync();
        rotationStepSoundRef.current = null;
      }
      isRotationStepSoundLoadedRef.current = false;
    };
  }, [handleRotationStepSoundStatus]);

  /**
   * Останавливает воспроизведение шага вращения, если звуковой эффект уже загружен.
   * @returns {void}
   */
  const stop = useCallback((): void => {
    const sound = rotationStepSoundRef.current;
    if (sound === null || !isRotationStepSoundLoadedRef.current) {
      return;
    }

    void sound.stopAsync();
  }, []);

  /**
   * Воспроизводит звук шага вращения с начала и выставляет громкость по умолчанию.
   * @returns {void}
   */
  const play = useCallback((): void => {
    if (!isSoundEnabled) {
      return;
    }

    const sound = rotationStepSoundRef.current;
    if (sound === null || !isRotationStepSoundLoadedRef.current) {
      return;
    }

    void sound.setStatusAsync({
      positionMillis: 0,
      shouldPlay: true,
      volume: 0.1,
    });
  }, [isSoundEnabled]);

  useEffect(() => {
    if (!isSoundEnabled) {
      stop();
    }
  }, [isSoundEnabled, stop]);

  return { play, stop };
};

/**
 * Комбинирует звуковую и тактильную обратную связь при прохождении шага вращения.
 * @param {{ isSoundEnabled: boolean; isVibrationEnabled: boolean }} options Настройки обратной связи.
 * @returns {{ handleRotationStep: (direction: 1 | -1) => void }} Обработчик шага вращения.
 */
const useRotationFeedback = ({
  isSoundEnabled,
  isVibrationEnabled,
}: {
  isSoundEnabled: boolean;
  isVibrationEnabled: boolean;
}): { handleRotationStep: (direction: 1 | -1) => void } => {
  const lastStepTimeRef = useRef(Date.now());
  const { play } = useRotationStepSound(isSoundEnabled);

  /**
   * Запускает звуковую и тактильную обратную связь, ограничивая частоту срабатываний.
   * @param {1 | -1} _direction Направление вращения, не влияющее на поведение обратной связи.
   * @returns {void}
   */
  const handleRotationStep = useCallback(
    (_direction: 1 | -1): void => {
      const time = Date.now();
      if (time - lastStepTimeRef.current >= 100) {
        lastStepTimeRef.current = time;
        if (isVibrationEnabled) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        play();
      }
    },
    [isVibrationEnabled, play]
  );

  return { handleRotationStep };
};

/**
 * Проверяет, находится ли экранная точка в проекции кольца вращения.
 * @param {number} x Горизонтальная координата точки внутри оверлея в пикселях.
 * @param {number} y Вертикальная координата точки внутри оверлея в пикселях.
 * @param {LayoutSize} layout Текущий размер оверлея вьюпорта.
 * @param {Viewport | null} viewportInstance Экземпляр вьюпорта, предоставляющий проекции.
 * @param {RingRadii | null} ringRadii Предварительно вычисленные радиусы кольца.
 * @returns {boolean} Возвращает true, если точка попадает внутрь кольца.
 */
const isPointInRotationRing = (
  x: number,
  y: number,
  layout: LayoutSize,
  viewportInstance: Viewport | null,
  ringRadii: RingRadii | null
): boolean => {
  if (
    !viewportInstance ||
    !ringRadii ||
    layout.width === 0 ||
    layout.height === 0
  ) {
    return false;
  }

  const viewportSize = viewportInstance.getViewportSize();
  if (!viewportSize) {
    return false;
  }

  const scaleX = viewportSize.width / layout.width;
  const scaleY = viewportSize.height / layout.height;

  const worldPoint = viewportInstance.screenPointToWorldOnPlane(
    x * scaleX,
    y * scaleY,
    RING_FLOOR_OFFSET
  );

  if (!worldPoint) {
    return false;
  }

  const distance = Math.hypot(worldPoint.x, worldPoint.z);

  return distance >= ringRadii.inner && distance <= ringRadii.outer;
};

/**
 * Создаёт жестовое управление для кольца вращения, объединяя обработчики начала и движения.
 * @param {RotationRingPanResponderParams} params Параметры, необходимые для инициализации.
 * @returns {PanResponderInstance} Экземпляр PanResponder для передачи в компонент.
 */
const useRotationRingPanResponder = ({
  layout,
  viewportRef,
  ringRadiiRef,
  onHorizontalDrag,
  onRotateStart,
  onRotateEnd,
}: RotationRingPanResponderParams): PanResponderInstance => {
  const lastDxRef = useRef(0);
  const isRotationGestureActiveRef = useRef(false);

  /**
   * Обнуляет накопленное смещение жеста, сохраняя текущий статус активности.
   * @returns {void}
   */
  const resetGestureDelta = useCallback((): void => {
    lastDxRef.current = 0;
  }, []);

  /**
   * Сбрасывает жест и завершает обработку вращения кольца.
   * @returns {void}
   */
  const deactivateGesture = useCallback((): void => {
    lastDxRef.current = 0;
    if (isRotationGestureActiveRef.current) {
      isRotationGestureActiveRef.current = false;
      onRotateEnd?.();
    }
  }, [onRotateEnd]);

  /**
   * Проверяет, следует ли начинать обработку жеста на основании координат касания.
   * @param {number} locationX Координата X вьюпорта.
   * @param {number} locationY Координата Y вьюпорта.
   * @returns {boolean} Флаг продолжения обработки жеста.
   */
  const shouldHandleGestureAtPoint = useCallback(
    (locationX: number, locationY: number): boolean => {
      const shouldHandle = isPointInRotationRing(
        locationX,
        locationY,
        layout,
        viewportRef.current,
        ringRadiiRef.current
      );

      if (shouldHandle && !isRotationGestureActiveRef.current) {
        isRotationGestureActiveRef.current = true;
        resetGestureDelta();
        onRotateStart?.();
      }

      return shouldHandle;
    },
    [layout, onRotateStart, resetGestureDelta, viewportRef, ringRadiiRef]
  );

  /**
   * Обрабатывает начало жеста и решает, стоит ли назначать обработчик.
   * @param {GestureResponderEvent} event Событие касания от React Native.
   * @returns {boolean} Признак необходимости обработки жеста.
   */
  const handlePanStart = useCallback(
    (event: GestureResponderEvent): boolean => {
      const { locationX, locationY } = event.nativeEvent;
      return shouldHandleGestureAtPoint(locationX, locationY);
    },
    [shouldHandleGestureAtPoint]
  );

  /**
   * Обрабатывает перемещение пальца и переводит дельту в горизонтальное вращение сцены.
   * @param {PanResponderGestureState} gestureState Состояние жеста с накопленным смещением.
   * @returns {void}
   */
  const handlePanMove = useCallback(
    (gestureState: PanResponderGestureState): void => {
      if (!isRotationGestureActiveRef.current) {
        return;
      }

      const deltaX = gestureState.dx - lastDxRef.current;
      lastDxRef.current = gestureState.dx;
      onHorizontalDrag(deltaX);
    },
    [onHorizontalDrag]
  );

  /**
   * Решает, нужно ли подключать обработчик к перемещению, если жест уже активен.
   * @param {GestureResponderEvent} event Событие перемещения касания.
   * @returns {boolean} Признак необходимости обрабатывать перемещение.
   */
  const handleMoveShouldSetPanResponder = useCallback(
    (event: GestureResponderEvent): boolean => {
      if (isRotationGestureActiveRef.current) {
        return true;
      }

      const { locationX, locationY } = event.nativeEvent;
      return shouldHandleGestureAtPoint(locationX, locationY);
    },
    [shouldHandleGestureAtPoint]
  );

  /**
   * Проксирует событие перемещения в общий обработчик движения.
   * @param {GestureResponderEvent} _event Первичное событие, не используемое в логике.
   * @param {PanResponderGestureState} gestureState Состояние текущего жеста.
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
   * Создаёт экземпляр PanResponder со всеми обработчиками жестов вращения.
   * @returns {PanResponderInstance}
   */
  const panResponder = useMemo((): PanResponderInstance => {
    return PanResponder.create({
      onStartShouldSetPanResponder: handlePanStart,
      onMoveShouldSetPanResponder: handleMoveShouldSetPanResponder,
      onPanResponderGrant: resetGestureDelta,
      onPanResponderMove: handlePanResponderMove,
      onPanResponderRelease: deactivateGesture,
      onPanResponderTerminate: deactivateGesture,
    });
  }, [
    deactivateGesture,
    handleMoveShouldSetPanResponder,
    handlePanResponderMove,
    handlePanStart,
    resetGestureDelta,
  ]);

  return panResponder;
};

/**
 * Заполняет сцену начальными объектами и рассчитывает радиусы кольца вращения.
 * @param {Viewport} viewportInstance Экземпляр вьюпорта Three.js.
 * @returns {RingRadii} Внутренний и внешний радиусы кольца вращения.
 */
const populateViewportContent = (viewportInstance: Viewport): RingRadii => {
  const rnd = createRng(123456);
  const boxes = generateBoxes(CONTAINER_SIZE, 6, rnd);

  boxes.forEach((boxParameters) => {
    const box = new BoxObject({
      id: 1,
      material: rnd() > 0.5 ? "standart" : "glass",
      debuffs: [],
      location: "CONTAINER",
      ...boxParameters,
    });
    viewportInstance.add(box);
  });

  const halfDiagonal = Math.sqrt(2) * (CONTAINER_SIZE / 2);
  const ringInnerRadius = halfDiagonal + RING_INNER_MARGIN;
  const ringOuterRadius = ringInnerRadius + RING_WIDTH;

  const rotationRing = new RotationRingObject({
    innerRadius: ringInnerRadius,
    outerRadius: ringOuterRadius,
    positionY: RING_FLOOR_OFFSET,
  });
  viewportInstance.add(rotationRing, { excludeFromFit: true });
  viewportInstance.fitToContent();

  return { inner: ringInnerRadius, outer: ringOuterRadius };
};

type ViewPortProps = {
  isSoundEnabled: boolean;
  isVibrationEnabled: boolean;
};

/**
 * Отображает трёхмерный вьюпорт с объектами и реагирует на пользовательские жесты.
 * @param {ViewPortProps} props Свойства компонента, управляемые состоянием звука и вибрации.
 * @returns {JSX.Element} Возвращает разметку компонента вьюпорта.
 */
export const ViewPort = ({
  isSoundEnabled,
  isVibrationEnabled,
}: ViewPortProps): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const ringRadiiRef = useRef<RingRadii | null>(null);
  const restZoomRef = useRef<number>(DEFAULT_CAMERA_ZOOM);
  const [layout, setLayout] = useState<LayoutSize>({ width: 0, height: 0 });
  const { handleRotationStep } = useRotationFeedback({
    isSoundEnabled,
    isVibrationEnabled,
  });

  /**
   * Обрабатывает изменение горизонтального свайпа и вращает сцену.
   * @param {number} deltaX Смещение пальца по горизонтали в пикселях.
   * @returns {void}
   */
  const handleHorizontalDrag = useCallback((deltaX: number): void => {
    viewport.current?.rotateHorizontally(deltaX);
  }, []);

  /**
   * Сохраняет исходный zoom камеры и плавно отдаляет её при начале вращения.
   * @returns {void}
   */
  const handleRotationGestureStart = useCallback((): void => {
    const instance = viewport.current;
    if (!instance) {
      return;
    }

    restZoomRef.current = instance.getZoom();
    instance.smoothZoomTo(ROTATION_ACTIVE_CAMERA_ZOOM);
  }, [restZoomRef, viewport]);

  /**
   * Возвращает камеру к исходному zoom после завершения жеста вращения.
   * @returns {void}
   */
  const handleRotationGestureEnd = useCallback((): void => {
    const instance = viewport.current;
    if (!instance) {
      return;
    }

    instance.smoothZoomTo(restZoomRef.current);
  }, [restZoomRef, viewport]);

  /**
   * Обновляет размеры контейнера и пересчитывает границы кольца вращения.
   * @param {LayoutChangeEvent} event Событие изменения раскладки контейнера.
   * @returns {void}
   */
  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }

      return { width, height };
    });
  }, []);

  const panResponder = useRotationRingPanResponder({
    layout,
    viewportRef: viewport,
    ringRadiiRef,
    onHorizontalDrag: handleHorizontalDrag,
    onRotateStart: handleRotationGestureStart,
    onRotateEnd: handleRotationGestureEnd,
  });

  /**
   * Обработчик создания контекста OpenGL, инициализирующий сцену Three.js.
   * @param {ExpoWebGLRenderingContext} gl Контекст OpenGL, предоставленный Expo.
   * @returns {void}
   */
  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      const instance = new Viewport(gl);
      viewport.current = instance;
      instance.init();
      instance.setZoom(DEFAULT_CAMERA_ZOOM);
      instance.setRotationStepFeedback(ROTATION_STEP_ANGLE, handleRotationStep);
      ringRadiiRef.current = populateViewportContent(instance);
      restZoomRef.current = instance.getZoom();
    },
    [handleRotationStep, restZoomRef]
  );

  /**
   * Очищает ресурсы вьюпорта при размонтировании компонента.
   */
  useEffect(() => {
    return () => {
      viewport.current?.dispose();
      viewport.current = null;
    };
  }, []);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GLView style={styles.glView} onContextCreate={handleContextCreate} />
      {layout.width > 0 && layout.height > 0 ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View {...panResponder.panHandlers} style={styles.rotationRing} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glView: {
    flex: 1,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  rotationRing: {
    ...StyleSheet.absoluteFillObject,
  },
});
