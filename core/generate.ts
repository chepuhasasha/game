import { Box} from './types'

type Axis = "x" | "y" | "z";

/**
 * Детерминируемый генератор случайных чисел в [0,1).
 *
 * @param {number} [seed] Начальное значение. Если не задано, используется Math.random.
 * @returns {() => number} Функция-ГСЧ. При одинаковом seed выдаёт одинаковую последовательность.
 *
 * @example
 * const rnd = createRng(123);
 * const a = rnd(); // 0..1
 */
function createRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0 || 1;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Случайное целое на отрезке [min,max].
 *
 * @param {() => number} rnd Генератор в [0,1).
 * @param {number} min Нижняя граница, целое.
 * @param {number} max Верхняя граница, целое.
 * @returns {number} Целое из диапазона.
 */
function randomIntInclusive(
  rnd: () => number,
  min: number,
  max: number
): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

/**
 * Треугольное распределение на [0,1] с пиком в 0.5.
 *
 * @param {() => number} rnd Генератор в [0,1).
 * @returns {number} Значение в [0,1] с бóльшей плотностью у 0.5.
 */
function tri01(rnd: () => number): number {
  return (rnd() + rnd()) / 2;
}

/**
 * Выбор «сбалансированного» целочисленного разреза размера, смещённого к середине.
 * Ограничение долей: [minRatio, 1 - minRatio].
 *
 * @param {() => number} rnd Генератор в [0,1).
 * @param {number} size Текущий размер (целое > 0).
 * @param {number} [minRatio=0.3] Минимальная доля меньшей части.
 * @returns {number} Целочисленный cut в [1, size-1]. На очень малых размерах возможен возврат 1.
 */
function chooseBalancedCut(
  rnd: () => number,
  size: number,
  minRatio = 0.3
): number {
  if (size <= 2) return 1;
  const low = Math.max(1, Math.ceil(size * minRatio));
  const high = Math.min(size - 1, Math.floor(size * (1 - minRatio)));
  if (low > high) return 1; // на очень малых размерах
  const t = tri01(rnd); // [0,1], пик в 0.5
  const cutFloat = low + t * (high - low);
  const cut = Math.max(1, Math.min(size - 1, Math.round(cutFloat)));
  return cut;
}

/**
 * Индекс самой крупной по объёму коробки, которую ещё можно разрезать
 * (хотя бы одно измерение > 1). Если таких нет — -1.
 *
 * @param {Box[]} boxes Набор коробок.
 * @returns {number} Индекс или -1.
 */
function pickLargestSplittableIndex(boxes: Box[]): number | -1 {
  let best = -1;
  let bestVol = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.width > 1 || b.height > 1 || b.depth > 1) {
      const vol = b.width * b.height * b.depth;
      if (vol > bestVol) {
        bestVol = vol;
        best = i;
      }
    }
  }
  return best;
}

/**
 * Выбор оси с максимальным размером (>1). При равенстве — случайно среди лидеров.
 * Если все размеры <=1, возвращает первую доступную или 'x'.
 *
 * @param {() => number} rnd Генератор в [0,1).
 * @param {Box} b Коробка.
 * @returns {Axis} Ось разреза.
 */
function chooseLongestAxis(rnd: () => number, b: Box): Axis {
  const sizes: Record<Axis, number> = { x: b.width, y: b.height, z: b.depth };
  const maxSize = Math.max(
    sizes.x > 1 ? sizes.x : 0,
    sizes.y > 1 ? sizes.y : 0,
    sizes.z > 1 ? sizes.z : 0
  );
  const candidates = (["x", "y", "z"] as Axis[]).filter(
    (a) => sizes[a] === maxSize && maxSize > 1
  );
  if (candidates.length === 0) {
    // fallback: любая доступная
    const avail = (["x", "y", "z"] as Axis[]).filter((a) => sizes[a] > 1);
    return avail.length ? avail[0] : "x";
  }
  const k = randomIntInclusive(rnd, 0, candidates.length - 1);
  return candidates[k];
}

/**
 * Центрированное разрезание прямоугольного параллелепипеда по выбранной оси.
 * Возвращает две непересекающиеся части, суммарно равные родителю.
 *
 * @param {Box} parent Родительская коробка (центр + размеры).
 * @param {Axis} axis Ось разреза.
 * @param {number} cut Целочисленный разрез в [1, size-1] по выбранной оси.
 * @returns {[Box, Box]} Левая/нижняя/ближняя и правая/верхняя/дальняя части.
 */
function splitBoxByAxisCenter(
  parent: Box,
  axis: Axis,
  cut: number
): [Box, Box] {
  const { x: cx, y: cy, z: cz, width: w, height: h, depth: d } = parent;

  if (axis === "x") {
    const wL = cut,
      wR = w - cut;
    return [
      { x: cx + (cut - w) / 2, y: cy, z: cz, width: wL, height: h, depth: d },
      { x: cx + cut / 2, y: cy, z: cz, width: wR, height: h, depth: d },
    ];
  }
  if (axis === "y") {
    const hB = cut,
      hT = h - cut;
    return [
      { x: cx, y: cy + (cut - h) / 2, z: cz, width: w, height: hB, depth: d },
      { x: cx, y: cy + cut / 2, z: cz, width: w, height: hT, depth: d },
    ];
  }
  const dN = cut,
    dF = d - cut;
  return [
    { x: cx, y: cy, z: cz + (cut - d) / 2, width: w, height: h, depth: dN },
    { x: cx, y: cy, z: cz + cut / 2, width: w, height: h, depth: dF },
  ];
}

/**
 * Генерация набора коробок BSP-разбиением: каждый шаг
 * режет самую объёмную коробку по самой длинной оси,
 * разрез выбран около середины (треугольное распределение).
 *
 * Координаты — центры, единицы — целые. Возвращаемые коробки
 * непересекаются и заполняют контейнер без зазоров.
 *
 * @param {number} size Размер контейнера.
 * @param {number} cuts Количество разрезов (итераций). 0 — без разбиения.
 * @param {number} [seed] Seed для детерминизма.
 * @returns {Box[]} Массив коробок.
 *
 * @example
 * const boxes = generateBoxes(10, 12, 42);
 */
export function generateBoxes(
  size: number,
  cuts: number,
  seed?: number
): Box[] {
  const maxCuts = Math.pow(size, 3) - 1;
  if (cuts > maxCuts) throw new RangeError(`Максимум разрезов: ${maxCuts}.`);

  const rnd = createRng(seed);
  const boxes: Box[] = [
    { x: 0, y: 0, z: 0, width: size, height: size, depth: size },
  ];

  let remaining = cuts;
  while (remaining > 0) {
    const idx = pickLargestSplittableIndex(boxes);
    if (idx === -1) break;

    const box = boxes[idx];
    const axis = chooseLongestAxis(rnd, box);
    const size =
      axis === "x" ? box.width : axis === "y" ? box.height : box.depth;

    const cut = chooseBalancedCut(rnd, size, 0.3); // границы ~30–70%
    const [a, b] = splitBoxByAxisCenter(box, axis, cut);

    boxes.splice(idx, 1, a, b);
    remaining--;
  }

  return boxes;
}
