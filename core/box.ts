import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Updatable } from "./updatable";
import type { GameBox } from "./types";
import { materials } from "./materials";

/** Фиксированный радиус скругления в мировых единицах. */
const EDGE_RADIUS = 0.2;   // подбери визуально; при 1×1×1 видно стабильно
const EDGE_SEGMENTS = 4;    // сглаженность (целое ≥1)

const DEFAULT_EYE_SIDES = 12;

const DEFAULT_EYE_COLOR = 0x090909;

const EYE_SPRING_FACTOR = 12;

const MAX_EYE_OFFSET_RATIO = 0.4;

export class BoxObject extends Mesh implements Updatable {
  private static readonly sharedEyeTarget = new Vector3();

  private static isEyeTargetSet = false;

  private readonly eyesAnchor: Group;

  private readonly eyeObjects: Mesh<SphereGeometry, MeshBasicMaterial>[];

  private readonly eyeBasePositions: [Vector3, Vector3];

  private readonly eyeFocusPoint: Vector3;

  private readonly eyeCurrentOffset = new Vector3();

  private readonly eyeDesiredOffset = new Vector3();

  private readonly tempLocalTarget = new Vector3();

  private readonly eyeMaterial: MeshBasicMaterial;

  private readonly eyeLookRadius: number;

  constructor(box: GameBox, gap: number = 0.05) {
    super(
      // Порядок как в твоём рабочем коде: (w,h,d, smoothness, radius)
      new RoundedBoxGeometry(
        box.width - gap,
        box.height - gap,
        box.depth - gap,
        BoxObject.resolveCornerSmoothness(),
        BoxObject.resolveCornerRadius(box)
      ),
      materials[box.material]
    );
    this.position.set(box.x, box.y, box.z);

    const effectiveWidth = Math.max(box.width - gap, Number.EPSILON);
    const effectiveHeight = Math.max(box.height - gap, Number.EPSILON);
    const effectiveDepth = Math.max(box.depth - gap, Number.EPSILON);

    const eyeRadius = Math.min(effectiveWidth, effectiveHeight) * 0.09;
    const halfWidth = effectiveWidth / 2;
    const halfHeight = effectiveHeight / 2;
    const frontOffset = effectiveDepth / 2 + eyeRadius * 0.25;
    const horizontalOffset = Math.max(
      eyeRadius,
      Math.min(halfWidth - eyeRadius, effectiveWidth * 0.22)
    );
    const verticalOffset = Math.max(
      eyeRadius,
      Math.min(halfHeight - eyeRadius, effectiveHeight * 0.28)
    );

    this.eyesAnchor = new Group();
    this.eyesAnchor.position.set(0, 0, frontOffset);
    this.add(this.eyesAnchor);

    this.eyeMaterial = new MeshBasicMaterial({ color: DEFAULT_EYE_COLOR });

    const leftEye = new Mesh(
      new SphereGeometry(eyeRadius, DEFAULT_EYE_SIDES, DEFAULT_EYE_SIDES),
      this.eyeMaterial
    );
    const rightEye = new Mesh(
      new SphereGeometry(eyeRadius, DEFAULT_EYE_SIDES, DEFAULT_EYE_SIDES),
      this.eyeMaterial
    );

    leftEye.position.set(-horizontalOffset, verticalOffset, 0);
    rightEye.position.set(horizontalOffset, verticalOffset, 0);

    this.eyeBasePositions = [
      leftEye.position.clone(),
      rightEye.position.clone(),
    ];

    this.eyeObjects = [leftEye, rightEye];
    this.eyeFocusPoint = new Vector3(0, verticalOffset, frontOffset);
    this.eyeLookRadius = Math.min(
      eyeRadius * 1.2,
      horizontalOffset * MAX_EYE_OFFSET_RATIO,
      verticalOffset * MAX_EYE_OFFSET_RATIO
    );

    this.eyesAnchor.add(leftEye, rightEye);

    this.updateEyes(0);
  }

  /** Радиус фиксированный, но не больше половины меньшей стороны. */
  private static resolveCornerRadius(box: GameBox): number {
    const halfMin = Math.min(box.width, box.height, box.depth) * 0.5 - 1e-6;
    return Math.min(Math.max(EDGE_RADIUS, 0), halfMin);
  }

  private static resolveCornerSmoothness(): number {
    return Math.max(1, Math.floor(EDGE_SEGMENTS));
  }

  /**
   * Сохраняет мировую точку, за которой должны следить глаза всех коробок.
   * @param {Vector3 | null} target Целевая точка в мировых координатах либо null для сброса.
   * @returns {void}
   */
  static setEyeTarget(target: Vector3 | null): void {
    if (target) {
      BoxObject.sharedEyeTarget.copy(target);
      BoxObject.isEyeTargetSet = true;
      return;
    }

    BoxObject.isEyeTargetSet = false;
  }

  /**
   * Пересчитывает положение глаз коробки относительно текущей цели.
   * @param {number} dt Дельта времени между кадрами.
   * @returns {void}
   */
  private updateEyes(dt: number): void {
    const desired = this.eyeDesiredOffset.set(0, 0, 0);

    if (BoxObject.isEyeTargetSet) {
      const localTarget = this.worldToLocal(
        this.tempLocalTarget.copy(BoxObject.sharedEyeTarget)
      );

      desired.x = localTarget.x - this.eyeFocusPoint.x;
      desired.y = localTarget.y - this.eyeFocusPoint.y;

      const distance = Math.hypot(desired.x, desired.y);
      if (distance > this.eyeLookRadius && distance > 0) {
        const scale = this.eyeLookRadius / distance;
        desired.x *= scale;
        desired.y *= scale;
      }
    }

    if (dt <= 0) {
      this.eyeCurrentOffset.copy(desired);
    } else {
      const factor = 1 - Math.exp(-EYE_SPRING_FACTOR * dt);
      this.eyeCurrentOffset.lerp(desired, factor);
    }

    const [leftBase, rightBase] = this.eyeBasePositions;
    const [leftEye, rightEye] = this.eyeObjects;

    leftEye.position.set(
      leftBase.x + this.eyeCurrentOffset.x,
      leftBase.y + this.eyeCurrentOffset.y,
      leftBase.z
    );
    rightEye.position.set(
      rightBase.x + this.eyeCurrentOffset.x,
      rightBase.y + this.eyeCurrentOffset.y,
      rightBase.z
    );
  }

  /**
   * Обновляет состояние коробки и анимирует положение глаз.
   * @param {number} dt Дельта времени между кадрами.
   * @returns {void}
   */
  update(dt: number): void {
    this.updateEyes(dt);
  }

  /**
   * Освобождает используемые геометрии и материалы коробки вместе с глазами.
   * @returns {void}
   */
  dispose(): void {
    const g = this.geometry as BufferGeometry | undefined;
    const m = this.material as Material | Material[] | undefined;
    g?.dispose?.();
    if (Array.isArray(m)) m.forEach((mm) => mm?.dispose?.());
    else m?.dispose?.();

    this.eyeObjects.forEach((eye) => {
      eye.geometry.dispose();
    });
    this.eyeMaterial.dispose();
  }
}
