import type { GameBox } from "./types";
import { createRng } from "./generate";

export type FigureGeneratorOptions = {
  seed: number;
  boxCount: number;
};

export type GeneratedFigure = {
  seed: number;
  boxes: GameBox[];
};

type MutableBox = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
};

const MIN_DIMENSION = 1;
const MAX_DIMENSION = 3;
const MAX_PLACEMENT_ATTEMPTS = 64;

/**
 * Возвращает случайный размер ребра в целых единицах в диапазоне [MIN_DIMENSION, MAX_DIMENSION].
 * @param {() => number} rnd Генератор псевдослучайных чисел.
 * @returns {number} Размер ребра в мировых единицах.
 */
const sampleDimension = (rnd: () => number): number => {
  return MIN_DIMENSION + Math.floor(rnd() * (MAX_DIMENSION - MIN_DIMENSION + 1));
};

/**
 * Проверяет пересечение двух прямоугольных параллелепипедов в мировых координатах.
 * @param {MutableBox} a Первый параллелепипед.
 * @param {MutableBox} b Второй параллелепипед.
 * @returns {boolean} Возвращает true, если объёмы пересекаются.
 */
const boxesOverlap = (a: MutableBox, b: MutableBox): boolean => {
  const overlapX =
    Math.abs(a.x - b.x) * 2 < a.width + b.width - Number.EPSILON;
  const overlapY =
    Math.abs(a.y - b.y) * 2 < a.height + b.height - Number.EPSILON;
  const overlapZ =
    Math.abs(a.z - b.z) * 2 < a.depth + b.depth - Number.EPSILON;
  return overlapX && overlapY && overlapZ;
};

type AttachmentAxis = "x" | "y" | "z";

type AttachmentDirection = -1 | 1;

/**
 * Вычисляет координаты центра коробки, примыкающей к грани опорной коробки.
 * @param {MutableBox} anchor Коробка-опора, к которой прикладывается новая коробка.
 * @param {MutableBox} candidate Коробка, центр которой необходимо вычислить.
 * @param {AttachmentAxis} axis Ось, вдоль которой выполняется прикрепление.
 * @param {AttachmentDirection} direction Направление прикрепления (1 — положительное, -1 — отрицательное).
 * @param {() => number} rnd Генератор псевдослучайных чисел для выбора смещений.
 * @returns {MutableBox} Кандидат с обновлёнными координатами центра.
 */
const placeAdjacentBox = (
  anchor: MutableBox,
  candidate: MutableBox,
  axis: AttachmentAxis,
  direction: AttachmentDirection,
  rnd: () => number
): MutableBox => {
  const result = { ...candidate };

  if (axis === "x") {
    result.x =
      anchor.x + direction * (anchor.width / 2 + candidate.width / 2);
    const yRange = Math.max(anchor.height - candidate.height, 0);
    const zRange = Math.max(anchor.depth - candidate.depth, 0);
    result.y =
      anchor.y + (yRange === 0 ? 0 : (rnd() - 0.5) * yRange) +
      (anchor.height >= candidate.height
        ? 0
        : (candidate.height - anchor.height) / 2 * (rnd() > 0.5 ? 1 : -1));
    result.z =
      anchor.z + (zRange === 0 ? 0 : (rnd() - 0.5) * zRange) +
      (anchor.depth >= candidate.depth
        ? 0
        : (candidate.depth - anchor.depth) / 2 * (rnd() > 0.5 ? 1 : -1));
    return result;
  }

  if (axis === "y") {
    result.y =
      anchor.y + direction * (anchor.height / 2 + candidate.height / 2);
    const xRange = Math.max(anchor.width - candidate.width, 0);
    const zRange = Math.max(anchor.depth - candidate.depth, 0);
    result.x =
      anchor.x + (xRange === 0 ? 0 : (rnd() - 0.5) * xRange) +
      (anchor.width >= candidate.width
        ? 0
        : (candidate.width - anchor.width) / 2 * (rnd() > 0.5 ? 1 : -1));
    result.z =
      anchor.z + (zRange === 0 ? 0 : (rnd() - 0.5) * zRange) +
      (anchor.depth >= candidate.depth
        ? 0
        : (candidate.depth - anchor.depth) / 2 * (rnd() > 0.5 ? 1 : -1));
    return result;
  }

  result.z =
    anchor.z + direction * (anchor.depth / 2 + candidate.depth / 2);
  const xRange = Math.max(anchor.width - candidate.width, 0);
  const yRange = Math.max(anchor.height - candidate.height, 0);
  result.x =
    anchor.x + (xRange === 0 ? 0 : (rnd() - 0.5) * xRange) +
    (anchor.width >= candidate.width
      ? 0
      : (candidate.width - anchor.width) / 2 * (rnd() > 0.5 ? 1 : -1));
  result.y =
    anchor.y + (yRange === 0 ? 0 : (rnd() - 0.5) * yRange) +
    (anchor.height >= candidate.height
      ? 0
      : (candidate.height - anchor.height) / 2 * (rnd() > 0.5 ? 1 : -1));
  return result;
};

/**
 * Создаёт новую коробку с размерами, удовлетворяющими ограничению 1:1…1:3.
 * @param {() => number} rnd Генератор псевдослучайных чисел.
 * @returns {MutableBox} Коробка с нулевыми координатами центра.
 */
const createRandomBox = (rnd: () => number): MutableBox => {
  const width = sampleDimension(rnd);
  const height = sampleDimension(rnd);
  const depth = sampleDimension(rnd);
  return { x: 0, y: 0, z: 0, width, height, depth };
};

/**
 * Пересчитывает координаты всех коробок относительно центра сцены.
 * @param {MutableBox[]} boxes Коллекция коробок для нормализации.
 * @returns {void}
 */
const recenterBoxes = (boxes: MutableBox[]): void => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  boxes.forEach((box) => {
    minX = Math.min(minX, box.x - box.width / 2);
    maxX = Math.max(maxX, box.x + box.width / 2);
    minY = Math.min(minY, box.y - box.height / 2);
    maxY = Math.max(maxY, box.y + box.height / 2);
    minZ = Math.min(minZ, box.z - box.depth / 2);
    maxZ = Math.max(maxZ, box.z + box.depth / 2);
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  boxes.forEach((box) => {
    box.x -= centerX;
    box.y -= centerY;
    box.z -= centerZ;
  });
};

/**
 * Генерирует набор коробок, образующих единую фигуру с приклеенными гранями.
 * @param {FigureGeneratorOptions} options Параметры генерации с seed и количеством коробок.
 * @returns {GeneratedFigure} Сгенерированная фигура с GameBox-описаниями.
 */
export const generateFigure = (
  options: FigureGeneratorOptions
): GeneratedFigure => {
  const rnd = createRng(options.seed);
  const mutableBoxes: MutableBox[] = [createRandomBox(rnd)];

  while (mutableBoxes.length < options.boxCount) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt += 1) {
      const anchor =
        mutableBoxes[Math.floor(rnd() * mutableBoxes.length)] ??
        mutableBoxes[0];
      const candidate = createRandomBox(rnd);
      const axisSample = rnd();
      const axis: AttachmentAxis =
        axisSample < 1 / 3 ? "x" : axisSample < 2 / 3 ? "y" : "z";
      const direction: AttachmentDirection = rnd() < 0.5 ? -1 : 1;
      const placedCandidate = placeAdjacentBox(
        anchor,
        candidate,
        axis,
        direction,
        rnd
      );

      if (mutableBoxes.some((box) => boxesOverlap(box, placedCandidate))) {
        continue;
      }

      mutableBoxes.push(placedCandidate);
      placed = true;
      break;
    }

    if (!placed) {
      break;
    }
  }

  recenterBoxes(mutableBoxes);

  const boxes: GameBox[] = mutableBoxes.map((box, index) => ({
    id: index,
    material: rnd() > 0.5 ? "standart" : "glass",
    debuffs: [],
    location: "CONTAINER",
    x: box.x,
    y: box.y,
    z: box.z,
    width: box.width,
    height: box.height,
    depth: box.depth,
  }));

  return {
    seed: options.seed,
    boxes,
  };
};
