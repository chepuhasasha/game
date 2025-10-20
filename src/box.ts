import {
  BoxGeometry,
  EdgesGeometry,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import type { GameObject } from "./types";

import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

import { runAnimationLoop } from "./utils/animation";

export type BoxDebuff = {
  FRAGILE: boolean;
  NON_TILTABLE: boolean;
  HEAVY: boolean;
};

export class Box extends Mesh implements GameObject {
  /**
   * Создаёт коробку с заданными размерами, положением и вращением.
   * @param {number} width Ширина коробки.
   * @param {number} height Высота коробки.
   * @param {number} depth Глубина коробки.
   * @param {number} x Начальная координата X.
   * @param {number} y Начальная координата Y.
   * @param {number} z Начальная координата Z.
   * @param {boolean} rx Нужно ли повернуть коробку вокруг оси X.
   * @param {boolean} ry Нужно ли повернуть коробку вокруг оси Y.
   * @param {boolean} rz Нужно ли повернуть коробку вокруг оси Z.
   * @param {BoxDebuff} debuffs Наложенные дебаффы коробки.
   */
  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly depth: number,
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly rx: boolean,
    public readonly ry: boolean,
    public readonly rz: boolean,
    public debuffs: BoxDebuff
  ) {
    const gap = 0.02;
    const geometry = new BoxGeometry(width - gap, height - gap, depth - gap);
    const material = new MeshStandardMaterial({ color: 0x000000 });
    super(geometry, material);

    const egeo = new EdgesGeometry(geometry, 1);
    const segGeo = new LineSegmentsGeometry();
    segGeo.setPositions(egeo.attributes.position.array);
    const edgeMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 2,
      depthTest: true,
      depthWrite: false,
    });
    const edge = new LineSegments2(segGeo, edgeMaterial);
    edge.computeLineDistances();
    edge.renderOrder = 2;
    this.add(edge);

    this.position.set(x, y, z);
    this.rotate(rx, ry, rz);
  }

  /**
   * Плавно изменяет позицию и вращение коробки за указанное время.
   * @param {{ position?: Vector3; rotation?: { rx: boolean; ry: boolean; rz: boolean } }} target Целевые позиция и/или вращение.
   * @param {number} duration Продолжительность анимации в миллисекундах.
   * @returns {Promise<void>} Промис, разрешающийся после завершения анимации.
   */
  async animateTransform(
    target: {
      position?: Vector3;
      rotation?: { rx: boolean; ry: boolean; rz: boolean };
    },
    duration: number
  ): Promise<void> {
    const targetPosition = target.position ? target.position.clone() : null;
    const rotationFlags = target.rotation ?? null;

    if (!targetPosition && !rotationFlags) {
      return Promise.resolve();
    }

    const startPosition = this.position.clone();
    const startRotation = this.rotation.clone();
    const quarterTurn = Math.PI / 2;
    const targetRotation = rotationFlags
      ? new Euler(
          startRotation.x + (rotationFlags.rx ? quarterTurn : 0),
          startRotation.y + (rotationFlags.ry ? quarterTurn : 0),
          startRotation.z + (rotationFlags.rz ? quarterTurn : 0),
          this.rotation.order
        )
      : null;

    if (duration <= 0) {
      if (targetPosition) {
        this.position.copy(targetPosition);
      }
      if (targetRotation) {
        this.rotation.copy(targetRotation);
      }
      return Promise.resolve();
    }

    await runAnimationLoop({
      duration,
      onFrame: ({ progress }) => {
        if (targetPosition) {
          this.position.set(
            startPosition.x + (targetPosition.x - startPosition.x) * progress,
            startPosition.y + (targetPosition.y - startPosition.y) * progress,
            startPosition.z + (targetPosition.z - startPosition.z) * progress
          );
        }

        if (targetRotation) {
          this.rotation.set(
            startRotation.x + (targetRotation.x - startRotation.x) * progress,
            startRotation.y + (targetRotation.y - startRotation.y) * progress,
            startRotation.z + (targetRotation.z - startRotation.z) * progress,
            this.rotation.order
          );
        }
      },
    });

    if (targetPosition) {
      this.position.copy(targetPosition);
    }
    if (targetRotation) {
      this.rotation.copy(targetRotation);
    }
  }

  /**
   * Выполняет дискретное вращение коробки вокруг указанных осей.
   * @param {boolean} rx Повернуть ли вокруг оси X.
   * @param {boolean} ry Повернуть ли вокруг оси Y.
   * @param {boolean} rz Повернуть ли вокруг оси Z.
   * @returns {void}
   */
  rotate(rx: boolean, ry: boolean, rz: boolean): void {
    const q = Math.PI / 2;
    if (rx) this.rotateX(q);
    if (ry) this.rotateY(q);
    if (rz) this.rotateZ(q);
  }

  /**
   * Обновляет состояние коробки за прошедший промежуток времени.
   * @param {number} dt Дельта времени в секундах.
   * @returns {void}
   */
  update(dt: number): void {
    throw new Error("Method not implemented.");
  }

  /**
   * Освобождает ресурсы, связанные с коробкой.
   * @returns {void}
   */
  dispose(): void {
    throw new Error("Method not implemented.");
  }
}
