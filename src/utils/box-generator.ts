import { Box, type BoxDebuff } from "../box";

type Axis = "width" | "height" | "depth";

type Volume = {
  width: number;
  height: number;
  depth: number;
  origin: {
    x: number;
    y: number;
    z: number;
  };
};

type ContainerDimensions = {
  width: number;
  height: number;
  depth: number;
};

type DebuffDistribution = Partial<Record<keyof BoxDebuff, number>>;

const MIN_DIMENSION_RATIO = 0.25;
const MIN_SPLIT_RATIO = 0.3;
const MAX_SPLIT_ATTEMPTS = 10;

/**
 * Создаёт функцию генератора псевдослучайных чисел с заданным сидом.
 * @param {number} seed Сид генератора случайных чисел.
 * @returns {() => number} Функция, возвращающая псевдослучайное число в диапазоне [0, 1).
 */
const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed ^ 0x6d2b79f5) >>> 0;
  return (): number => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Проверяет, сохраняет ли объём адекватные пропорции.
 * @param {Volume} volume Объём коробки.
 * @returns {boolean} Возвращает true, если объём имеет приемлемые пропорции.
 */
const isProportional = (volume: Volume): boolean => {
  const dimensions = [volume.width, volume.height, volume.depth];
  const min = Math.min(...dimensions);
  const max = Math.max(...dimensions);
  return max === 0 || min / max >= MIN_DIMENSION_RATIO;
};

/**
 * Делит объём на две части вдоль выбранной оси.
 * @param {Volume} volume Исходный объём.
 * @param {Axis} axis Ось разреза.
 * @param {number} ratio Доля объёма, которая останется в первой части.
 * @returns {[Volume, Volume]} Возвращает две коробки после разреза.
 */
const splitVolume = (
  volume: Volume,
  axis: Axis,
  ratio: number
): [Volume, Volume] => {
  const firstSize = volume[axis] * ratio;
  const secondSize = volume[axis] - firstSize;

  const first: Volume = {
    ...volume,
    [axis]: firstSize,
  } as Volume;

  const secondOrigin = { ...volume.origin };
  secondOrigin[
    axis === "width" ? "x" : axis === "height" ? "y" : "z"
  ] += firstSize;

  const second: Volume = {
    ...volume,
    origin: secondOrigin,
    [axis]: secondSize,
  } as Volume;

  return [first, second];
};

/**
 * Перемешивает индексы коробок для равномерного распределения дебаффов.
 * @param {number} length Количество коробок.
 * @param {() => number} random Генератор псевдослучайных чисел.
 * @returns {number[]} Массив индексов в случайном порядке.
 */
const shuffleIndices = (length: number, random: () => number): number[] => {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
};

/**
 * Генерирует коллекцию коробок путём последовательного разрезания контейнера.
 * @param {object} params Параметры генерации.
 * @param {number} params.seed Сид генерации для повторяемости результата.
 * @param {number} params.cuts Количество разрезов контейнера.
 * @param {ContainerDimensions} params.container Размеры исходного контейнера.
 * @param {DebuffDistribution} [params.debuffDistribution] Количество применений каждого дебаффа.
 * @returns {Box[]} Массив сгенерированных коробок.
 */
export const generateBoxes = ({
  seed,
  cuts,
  container,
  debuffDistribution = {},
}: {
  seed: number;
  cuts: number;
  container: ContainerDimensions;
  debuffDistribution?: DebuffDistribution;
}): Box[] => {
  const random = createSeededRandom(seed);
  const segments: Volume[] = [
    {
      width: container.width,
      height: container.height,
      depth: container.depth,
      origin: {
        x: -container.width / 2,
        y: -container.height / 2,
        z: -container.depth / 2,
      },
    },
  ];

  const normalizedCuts = Math.max(0, Math.floor(cuts));

  for (let cut = 0; cut < normalizedCuts; cut += 1) {
    let targetIndex = -1;
    let maxVolume = -Infinity;

    segments.forEach((segment, index) => {
      const volume = segment.width * segment.height * segment.depth;
      if (volume > maxVolume) {
        maxVolume = volume;
        targetIndex = index;
      }
    });

    if (targetIndex < 0) {
      break;
    }

    const target = segments[targetIndex];
    const axes: Axis[] = ["width", "height", "depth"];
    axes.sort((a, b) => target[b] - target[a]);

    let wasSplit = false;

    for (const axis of axes) {
      if (target[axis] <= 0) {
        continue;
      }

      for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt += 1) {
        const ratio =
          MIN_SPLIT_RATIO + random() * (1 - MIN_SPLIT_RATIO * 2);
        const [first, second] = splitVolume(target, axis, ratio);

        if (isProportional(first) && isProportional(second)) {
          segments.splice(targetIndex, 1, first, second);
          wasSplit = true;
          break;
        }
      }

      if (wasSplit) {
        break;
      }
    }

    if (!wasSplit) {
      break;
    }
  }

  const boxes = segments.map((segment) => {
    const centerX = segment.origin.x + segment.width / 2;
    const centerY = segment.origin.y + segment.height / 2;
    const centerZ = segment.origin.z + segment.depth / 2;

    return new Box(
      segment.width,
      segment.height,
      segment.depth,
      centerX,
      centerY,
      centerZ,
      false,
      false,
      false,
      {
        FRAGILE: false,
        HEAVY: false,
        NON_TILTABLE: false,
      }
    );
  });

  (Object.entries(debuffDistribution) as [keyof BoxDebuff, number][]).forEach(
    ([debuff, amount]) => {
      if (!amount || amount <= 0) {
        return;
      }

      const quota = Math.min(Math.floor(amount), boxes.length);
      const shuffled = shuffleIndices(boxes.length, random);

      for (let index = 0; index < quota; index += 1) {
        const target = boxes[shuffled[index]];
        target.debuffs[debuff] = true;
      }
    }
  );

  return boxes;
};
