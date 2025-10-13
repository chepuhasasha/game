import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MutableRefObject } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import UPNG from "upng-js";

import { Audio, AVPlaybackStatus } from "expo-av";
import {
  BoxObject,
  GameBox,
  RotationRingObject,
  Viewport,
  createRng,
  generateFigure,
} from "@/core";

const ROTATION_STEP_ANGLE = Math.PI / 18;
const DEFAULT_CAMERA_ZOOM = 0.3;
const ROTATION_ACTIVE_CAMERA_ZOOM = 0.26;
const RING_INNER_MARGIN = 0.6;
const RING_WIDTH = 0.8;
const RING_VERTICAL_MARGIN = 0.2;
const MIN_RING_RADIUS = 1.2;
const SILHOUETTE_RESOLUTION = 256;
const MATCH_HOLD_DURATION_MS = 600;
const HINT_PENALTY_SECONDS = 5;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

type LayoutSize = {
  width: number;
  height: number;
};

type RingRadii = {
  inner: number;
  outer: number;
  floorY: number;
};

type RotationRingPanResponderParams = {
  layout: LayoutSize;
  viewportRef: MutableRefObject<Viewport | null>;
  ringRadiiRef: MutableRefObject<RingRadii | null>;
  onHorizontalDrag: (deltaX: number) => void;
  onRotateStart?: () => void;
  onRotateEnd?: () => void;
};

type BoxBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type LevelInfo = {
  seed: number;
  boxCount: number;
  silhouetteUri: string | null;
};

export type DifficultyOption = {
  id: string;
  title: string;
  boxCountRange: [number, number];
  matchThreshold: number;
};

/**
 * Преобразует ArrayBuffer в base64-строку без использования браузерных API.
 * @param {ArrayBuffer} buffer Входной бинарный буфер.
 * @returns {string} Строка в формате base64.
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let base64 = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const hasSecond = i + 1 < bytes.length;
    const hasThird = i + 2 < bytes.length;
    const b2 = hasSecond ? bytes[i + 1] : 0;
    const b3 = hasThird ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 0x03) << 4) | (b2 >> 4);
    const enc3 = ((b2 & 0x0f) << 2) | (b3 >> 6);
    const enc4 = b3 & 0x3f;

    base64 +=
      BASE64_ALPHABET.charAt(enc1) +
      BASE64_ALPHABET.charAt(enc2) +
      (hasSecond ? BASE64_ALPHABET.charAt(enc3) : "=") +
      (hasThird ? BASE64_ALPHABET.charAt(enc4) : "=");
  }

  return base64;
};

/**
 * Кодирует RGBA-маску силуэта в PNG и возвращает data URI.
 * @param {Uint8Array} rgba Пиксели силуэта в формате RGBA.
 * @param {number} width Ширина изображения.
 * @param {number} height Высота изображения.
 * @returns {string} Строка data URI в формате PNG.
 */
const encodeMaskToPngUri = (
  rgba: Uint8Array,
  width: number,
  height: number
): string => {
  const frame =
    rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength
      ? rgba.buffer
      : rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength);
  const pngBuffer = UPNG.encode([frame], width, height, 0);
  return `data:image/png;base64,${arrayBufferToBase64(pngBuffer)}`;
};

/**
 * Отражает маску по вертикали, преобразуя координаты в систему UI.
 * @param {number} width Ширина маски.
 * @param {number} height Высота маски.
 * @param {Uint8Array} source Исходные пиксели RGBA.
 * @param {Uint8Array} [target] Буфер для переиспользования.
 * @returns {Uint8Array} Перевёрнутые пиксели.
 */
const flipMaskVertically = (
  width: number,
  height: number,
  source: Uint8Array,
  target?: Uint8Array
): Uint8Array => {
  const stride = width * 4;
  const output =
    target && target.length === source.length
      ? target
      : new Uint8Array(source.length);
  for (let row = 0; row < height; row += 1) {
    const srcOffset = row * stride;
    const dstOffset = (height - 1 - row) * stride;
    output.set(source.subarray(srcOffset, srcOffset + stride), dstOffset);
  }
  return output;
};

/**
 * Преобразует RGBA-представление маски в бинарный массив пикселей.
 * @param {Uint8Array} rgba Пиксели RGBA.
 * @param {number} width Ширина изображения.
 * @param {number} height Высота изображения.
 * @param {Uint8Array} [target] Буфер для переиспользования.
 * @returns {Uint8Array} Бинарный массив, где 1 означает заполненный пиксель.
 */
const rgbaToMask = (
  rgba: Uint8Array,
  width: number,
  height: number,
  target?: Uint8Array
): Uint8Array => {
  const total = width * height;
  const output =
    target && target.length === total ? target : new Uint8Array(total);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    output[j] = rgba[i] > 0 ? 1 : 0;
  }
  return output;
};

/**
 * Вычисляет Intersection over Union для двух бинарных масок.
 * @param {Uint8Array} maskA Первая маска.
 * @param {Uint8Array} maskB Вторая маска.
 * @returns {number} Значение IoU в диапазоне [0,1].
 */
const computeIoU = (maskA: Uint8Array, maskB: Uint8Array): number => {
  const total = Math.min(maskA.length, maskB.length);
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < total; i += 1) {
    const a = maskA[i] > 0;
    const b = maskB[i] > 0;
    if (a && b) {
      intersection += 1;
    }
    if (a || b) {
      union += 1;
    }
  }
  if (union === 0) {
    return 0;
  }
  return intersection / union;
};

/**
 * Форматирует время в миллисекундах в строку MM:SS.
 * @param {number} ms Количество миллисекунд.
 * @returns {string} Строка времени.
 */
const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

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
        play();
        lastStepTimeRef.current = time;
        if (isVibrationEnabled) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
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
    ringRadii.floorY
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
 * Вычисляет границы набора коробок.
 * @param {GameBox[]} boxes Коллекция коробок.
 * @returns {BoxBounds | null} Пределы вдоль всех осей либо null, если коллекция пуста.
 */
const computeBoxBounds = (boxes: GameBox[]): BoxBounds | null => {
  if (boxes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  boxes.forEach((box) => {
    const halfX = box.width / 2;
    const halfY = box.height / 2;
    const halfZ = box.depth / 2;

    minX = Math.min(minX, box.x - halfX);
    maxX = Math.max(maxX, box.x + halfX);
    minY = Math.min(minY, box.y - halfY);
    maxY = Math.max(maxY, box.y + halfY);
    minZ = Math.min(minZ, box.z - halfZ);
    maxZ = Math.max(maxZ, box.z + halfZ);
  });

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

/**
 * Создаёт и добавляет кольцо вращения на сцену на основе размеров набора коробок.
 * @param {GameBox[]} boxes Коллекция коробок уровня.
 * @param {Viewport} viewportInstance Экземпляр вьюпорта Three.js.
 * @returns {RingRadii | null} Параметры кольца или null, если создать кольцо невозможно.
 */
const createRotationRingForBoxes = (
  boxes: GameBox[],
  viewportInstance: Viewport
): RingRadii | null => {
  const bounds = computeBoxBounds(boxes);
  if (!bounds) {
    return null;
  }

  const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const depth = Math.max(bounds.maxZ - bounds.minZ, Number.EPSILON);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const halfDiagonal = Math.sqrt(halfWidth ** 2 + halfDepth ** 2);
  const innerRadius = Math.max(
    halfDiagonal + RING_INNER_MARGIN,
    MIN_RING_RADIUS
  );
  const outerRadius = innerRadius + RING_WIDTH;
  const floorY = bounds.minY - RING_VERTICAL_MARGIN;

  const rotationRing = new RotationRingObject({
    innerRadius,
    outerRadius,
    positionY: floorY,
  });
  viewportInstance.add(rotationRing, { excludeFromFit: true });

  return { inner: innerRadius, outer: outerRadius, floorY };
};

type ViewPortProps = {
  isSoundEnabled: boolean;
  isVibrationEnabled: boolean;
  difficulty: DifficultyOption;
};

/**
 * Отображает трёхмерный вьюпорт с объектами и реагирует на пользовательские жесты.
 * @param {ViewPortProps} props Свойства компонента, управляемые состоянием звука, вибрации и сложностью.
 * @returns {JSX.Element} Возвращает разметку компонента вьюпорта.
 */
export const ViewPort = ({
  isSoundEnabled,
  isVibrationEnabled,
  difficulty,
}: ViewPortProps): JSX.Element => {
  const viewport = useRef<Viewport | null>(null);
  const ringRadiiRef = useRef<RingRadii | null>(null);
  const restZoomRef = useRef<number>(DEFAULT_CAMERA_ZOOM);
  const targetMaskRef = useRef<Uint8Array | null>(null);
  const maskBufferRef = useRef<Uint8Array | null>(null);
  const flippedBufferRef = useRef<Uint8Array | null>(null);
  const currentMaskBufferRef = useRef<Uint8Array | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const lastIoUUpdateRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const targetAngleRef = useRef(0);
  const [layout, setLayout] = useState<LayoutSize>({ width: 0, height: 0 });
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [matchIoU, setMatchIoU] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLevelReady, setIsLevelReady] = useState(false);
  const [isGhostVisible, setIsGhostVisible] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const isVerticalLayout = windowWidth < 900;
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
    const targetZoom = Math.min(
      restZoomRef.current - 0.001,
      ROTATION_ACTIVE_CAMERA_ZOOM
    );
    instance.smoothZoomTo(targetZoom);
  }, []);

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
  }, []);

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
   * Генерирует новую фигуру и подготавливает все данные уровня.
   * @returns {void}
   */
  const regenerateLevel = useCallback((): void => {
    const instance = viewport.current;
    if (!instance) {
      return;
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const rng = createRng(seed);
    const [minBoxes, maxBoxes] = difficulty.boxCountRange;
    const boxCountRange = Math.max(0, Math.floor(maxBoxes - minBoxes));
    const desiredCount =
      minBoxes + Math.floor(rng() * (boxCountRange + 1));
    const figure = generateFigure({ seed, boxCount: desiredCount });
    const boxes = figure.boxes;

    instance.clear();
    ringRadiiRef.current = null;
    targetMaskRef.current = null;
    maskBufferRef.current = null;
    flippedBufferRef.current = null;
    currentMaskBufferRef.current = null;
    holdStartRef.current = null;
    lastIoUUpdateRef.current = 0;

    boxes.forEach((box) => {
      const boxObject = new BoxObject(box);
      instance.add(boxObject);
    });

    const ringInfo = createRotationRingForBoxes(boxes, instance);
    ringRadiiRef.current = ringInfo;

    instance.fitToContent();
    restZoomRef.current = instance.getZoom();

    const targetAngle = rng() * Math.PI * 2;
    targetAngleRef.current = targetAngle;
    instance.setHorizontalAngle(targetAngle);

    const rawMask = instance.captureSilhouetteMask(
      SILHOUETTE_RESOLUTION,
      SILHOUETTE_RESOLUTION,
      maskBufferRef.current ?? undefined
    );

    let silhouetteUri: string | null = null;

    if (rawMask) {
      maskBufferRef.current = rawMask;
      const flipped = flipMaskVertically(
        SILHOUETTE_RESOLUTION,
        SILHOUETTE_RESOLUTION,
        rawMask,
        flippedBufferRef.current ?? undefined
      );
      flippedBufferRef.current = flipped;
      const binaryMask = rgbaToMask(
        flipped,
        SILHOUETTE_RESOLUTION,
        SILHOUETTE_RESOLUTION
      );
      targetMaskRef.current = new Uint8Array(binaryMask);
      silhouetteUri = encodeMaskToPngUri(
        flipped,
        SILHOUETTE_RESOLUTION,
        SILHOUETTE_RESOLUTION
      );
    } else {
      targetMaskRef.current = null;
    }

    const angleOffset =
      (rng() * 0.7 + 0.3) * Math.PI * (rng() < 0.5 ? -1 : 1);
    instance.setHorizontalAngle(targetAngle + angleOffset);

    setIsGhostVisible(false);
    setHintsUsed(0);
    setMatchIoU(0);
    setHoldProgress(0);
    setElapsedMs(0);
    setIsCompleted(false);
    setLevelInfo({
      seed,
      boxCount: boxes.length,
      silhouetteUri,
    });
    setIsLevelReady(Boolean(targetMaskRef.current));
  }, [difficulty.boxCountRange]);

  /**
   * Инициализирует сцену при создании контекста OpenGL и запускает генерацию уровня.
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
      restZoomRef.current = instance.getZoom();
      regenerateLevel();
    },
    [handleRotationStep, regenerateLevel]
  );

  /**
   * Обновляет расчёт IoU между текущей проекцией и целевым силуэтом.
   * @returns {void}
   */
  const updateMatch = useCallback((): void => {
    const instance = viewport.current;
    const targetMask = targetMaskRef.current;
    if (!instance || !targetMask || !isLevelReady || isCompleted) {
      return;
    }

    const rawMask = instance.captureSilhouetteMask(
      SILHOUETTE_RESOLUTION,
      SILHOUETTE_RESOLUTION,
      maskBufferRef.current ?? undefined
    );

    if (!rawMask) {
      return;
    }

    maskBufferRef.current = rawMask;

    const flipped = flipMaskVertically(
      SILHOUETTE_RESOLUTION,
      SILHOUETTE_RESOLUTION,
      rawMask,
      flippedBufferRef.current ?? undefined
    );
    flippedBufferRef.current = flipped;

    const binaryMask = rgbaToMask(
      flipped,
      SILHOUETTE_RESOLUTION,
      SILHOUETTE_RESOLUTION,
      currentMaskBufferRef.current ?? undefined
    );
    currentMaskBufferRef.current = binaryMask;

    const iou = computeIoU(binaryMask, targetMask);
    const now = Date.now();
    if (
      now - lastIoUUpdateRef.current >= 50 ||
      Math.abs(iou - matchIoU) > 0.02
    ) {
      setMatchIoU(iou);
      lastIoUUpdateRef.current = now;
    }

    if (iou >= difficulty.matchThreshold) {
      if (holdStartRef.current === null) {
        holdStartRef.current = now;
      }
      const progress = Math.min(
        1,
        (now - holdStartRef.current) / MATCH_HOLD_DURATION_MS
      );
      setHoldProgress((prev) => (Math.abs(prev - progress) > 1e-3 ? progress : prev));
      if (progress >= 1 && !isCompleted) {
        setIsCompleted(true);
        setHoldProgress(1);
      }
    } else {
      holdStartRef.current = null;
      setHoldProgress((prev) => (prev === 0 ? prev : 0));
    }
  }, [
    difficulty.matchThreshold,
    isCompleted,
    isLevelReady,
    matchIoU,
  ]);

  /**
   * Перезапускает таймер и анимацию при изменении уровня.
   */
  useEffect(() => {
    if (!viewport.current) {
      return;
    }

    regenerateLevel();
  }, [regenerateLevel]);

  useEffect(() => {
    const instance = viewport.current;
    if (!instance) {
      return;
    }

    instance.setRotationStepFeedback(ROTATION_STEP_ANGLE, handleRotationStep);
  }, [handleRotationStep]);

  useEffect(() => {
    if (!isLevelReady || isCompleted) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let isMounted = true;
    const loop = (): void => {
      updateMatch();
      if (!isMounted) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isLevelReady, isCompleted, updateMatch]);

  useEffect(() => {
    if (!isLevelReady || isCompleted) {
      return;
    }

    const startTime = Date.now();
    setElapsedMs(0);
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [isLevelReady, isCompleted, levelInfo?.seed]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      viewport.current?.dispose();
      viewport.current = null;
    };
  }, []);

  /**
   * Переключает отображение призрачного силуэта и учитывает штраф за подсказку.
   * @returns {void}
   */
  const handleToggleGhost = useCallback((): void => {
    if (!levelInfo?.silhouetteUri) {
      return;
    }

    setIsGhostVisible((prev) => {
      const next = !prev;
      if (!prev && next) {
        setHintsUsed((value) => value + 1);
      }
      return next;
    });
  }, [levelInfo?.silhouetteUri]);

  /**
   * Запускает новую генерацию фигуры.
   * @returns {void}
   */
  const handleNewLevel = useCallback((): void => {
    regenerateLevel();
  }, [regenerateLevel]);

  const scoreSeconds = useMemo(() => {
    return elapsedMs / 1000 + hintsUsed * HINT_PENALTY_SECONDS;
  }, [elapsedMs, hintsUsed]);

  const holdTimeRemaining = useMemo(() => {
    if (isCompleted || matchIoU < difficulty.matchThreshold) {
      return 0;
    }
    return Math.max(0, MATCH_HOLD_DURATION_MS * (1 - holdProgress)) / 1000;
  }, [difficulty.matchThreshold, holdProgress, isCompleted, matchIoU]);

  return (
    <View
      style={[
        styles.container,
        isVerticalLayout ? styles.containerVertical : styles.containerHorizontal,
      ]}
    >
      <View
        style={[
          styles.sceneColumn,
          isVerticalLayout
            ? styles.sceneColumnVertical
            : styles.sceneColumnHorizontal,
        ]}
      >
        <View onLayout={handleLayout} style={styles.sceneContainer}>
          <GLView style={styles.glView} onContextCreate={handleContextCreate} />
          {layout.width > 0 && layout.height > 0 ? (
            <View pointerEvents="box-none" style={styles.overlay}>
              <View {...panResponder.panHandlers} style={styles.rotationRing} />
              {isGhostVisible && levelInfo?.silhouetteUri ? (
                <Image
                  pointerEvents="none"
                  source={{ uri: levelInfo.silhouetteUri }}
                  style={styles.ghostImage}
                  contentFit="contain"
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <View
        style={[
          styles.sidebar,
          isVerticalLayout ? styles.sidebarVertical : styles.sidebarHorizontal,
        ]}
      >
        <View style={styles.sidebarContent}>
          <Text style={styles.sectionTitle}>Состояние</Text>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Время</Text>
            <Text style={styles.scoreValue}>{formatTime(elapsedMs)}</Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>IoU</Text>
            <Text style={styles.scoreValue}>
              {matchIoU.toFixed(3)} / {difficulty.matchThreshold.toFixed(2)}
            </Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Подсказки</Text>
            <Text style={styles.scoreValue}>
              {hintsUsed} (штраф +{hintsUsed * HINT_PENALTY_SECONDS}s)
            </Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Счёт</Text>
            <Text style={styles.scoreValue}>{scoreSeconds.toFixed(1)} c</Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Задержка</Text>
            <Text style={styles.scoreValue}>
              {holdTimeRemaining > 0
                ? `удерживайте ещё ${holdTimeRemaining.toFixed(2)} c`
                : isCompleted
                  ? "силуэт совпал!"
                  : "ищите точный ракурс"}
            </Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Сложность</Text>
            <Text style={styles.scoreValue}>{difficulty.title}</Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Seed</Text>
            <Text style={styles.scoreValue}>
              {levelInfo?.seed ?? "-"} ({levelInfo?.boxCount ?? 0} боксов)
            </Text>
          </View>
          <View style={styles.controls}>
            <Pressable
              onPress={handleToggleGhost}
              style={[styles.button, !levelInfo?.silhouetteUri && styles.buttonDisabled]}
              disabled={!levelInfo?.silhouetteUri}
            >
              <Text style={styles.buttonText}>
                {isGhostVisible ? "Скрыть призрак" : "Показать призрак"}
              </Text>
            </Pressable>
            <Pressable onPress={handleNewLevel} style={styles.button}>
              <Text style={styles.buttonText}>Новая фигура</Text>
            </Pressable>
          </View>
          <View style={styles.silhouetteContainer}>
            {levelInfo?.silhouetteUri ? (
              <Image
                source={{ uri: levelInfo.silhouetteUri }}
                style={styles.silhouetteImage}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.silhouettePlaceholder}>
                Силуэт готовится…
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  containerHorizontal: {
    flexDirection: "row",
  },
  containerVertical: {
    flexDirection: "column",
  },
  sceneColumn: {
    backgroundColor: "#000000",
  },
  sceneColumnHorizontal: {
    flex: 2,
  },
  sceneColumnVertical: {
    flex: 1,
  },
  sceneContainer: {
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
  ghostImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
  },
  sidebar: {
    backgroundColor: "#0f172a",
  },
  sidebarHorizontal: {
    flex: 1,
  },
  sidebarVertical: {
    width: "100%",
  },
  sidebarContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 16,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  scoreBlock: {
    gap: 2,
  },
  scoreLabel: {
    color: "#cbd5f5",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scoreValue: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
  },
  controls: {
    marginTop: 8,
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#1e293b",
    borderRadius: 6,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  silhouetteContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  silhouetteImage: {
    width: "100%",
    height: "100%",
  },
  silhouettePlaceholder: {
    color: "#64748b",
    textAlign: "center",
    fontSize: 16,
  },
});
