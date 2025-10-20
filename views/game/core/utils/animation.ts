const fallbackGetNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/**
 * Вызывает переданный колбэк для каждого шага анимации, рассчитывая прогресс во времени.
 * @param {number} duration Продолжительность анимации в миллисекундах.
 * @param {(context: { progress: number; easedProgress: number; elapsed: number }) => void} onFrame Функция, выполняемая на каждом кадре.
 * @param {(value: number) => number} [easing] Функция сглаживания прогресса анимации.
 * @param {() => number} [getNow] Пользовательская функция получения текущего времени.
 * @returns {Promise<void>} Промис, разрешающийся после завершения анимации.
 */
export async function runAnimationLoop(
  {
    duration,
    onFrame,
    easing = (value: number): number => value,
    getNow = fallbackGetNow,
  }: {
    duration: number;
    onFrame: (context: {
      progress: number;
      easedProgress: number;
      elapsed: number;
    }) => void;
    easing?: (value: number) => number;
    getNow?: () => number;
  }
): Promise<void> {
  if (duration <= 0) {
    const progress = 1;
    onFrame({
      progress,
      easedProgress: easing(progress),
      elapsed: 0,
    });
    return Promise.resolve();
  }

  const schedule = (callback: (time: number) => void): void => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame((time?: number) => {
        callback(typeof time === "number" ? time : getNow());
      });
      return;
    }

    setTimeout(() => {
      callback(getNow());
    }, 16);
  };

  const startTime = getNow();

  await new Promise<void>((resolve) => {
    const step = (currentTime: number): void => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const easedProgress = easing(progress);

      onFrame({
        progress,
        easedProgress,
        elapsed,
      });

      if (progress < 1) {
        schedule(step);
      } else {
        resolve();
      }
    };

    schedule(step);
  });
}
