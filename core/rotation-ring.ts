import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from "three";
import type { Updatable } from "./updatable";

export type RotationRingOptions = {
  innerRadius: number;
  outerRadius: number;
  radialSegments?: number;
  positionY?: number;
  color?: string | number;
  tickColor?: string | number;
  tickCount?: number;
  tickHeight?: number;
  tickWidth?: number;
  tickDepth?: number;
  rotationSpeed?: number;
  metalness?: number;
  roughness?: number;
};

/**
 * Тонкое кольцо, лежащее в горизонтальной плоскости и окружающее контейнер с коробками.
 */
export class RotationRingObject extends Group implements Updatable {
  private readonly ring: Mesh;

  private readonly ticks: Group;

  private readonly ringMaterial: MeshStandardMaterial;

  private readonly tickMaterial: MeshStandardMaterial;

  private readonly ringGeometry: RingGeometry;

  private readonly tickGeometry: BoxGeometry;

  private readonly rotationSpeed: number;

  /**
   * Создаёт кольцо вращения с заданными параметрами радиусов и материала.
   * @param {RotationRingOptions} options Набор параметров геометрии и материала.
   */
  constructor({
    innerRadius,
    outerRadius,
    radialSegments = 128,
    positionY = 0,
    color = "#d0d7ff",
    tickColor = "#ffffff",
    tickCount = 64,
    tickHeight = 0.08,
    tickWidth = 0.04,
    tickDepth = 0.2,
    rotationSpeed = Math.PI / 12,
    metalness = 0.35,
    roughness = 0.45,
  }: RotationRingOptions) {
    super();

    this.rotationSpeed = rotationSpeed;

    this.ringGeometry = new RingGeometry(innerRadius, outerRadius, radialSegments);
    this.ringGeometry.rotateX(-Math.PI / 2);

    this.ringMaterial = new MeshStandardMaterial({
      color,
      side: DoubleSide,
      metalness,
      roughness,
    });

    this.ring = new Mesh(this.ringGeometry, this.ringMaterial);
    this.add(this.ring);

    this.tickGeometry = new BoxGeometry(tickWidth, tickHeight, tickDepth);
    this.tickMaterial = new MeshStandardMaterial({
      color: tickColor,
      metalness: Math.min(metalness + 0.1, 1),
      roughness: Math.max(roughness - 0.2, 0),
    });

    this.ticks = new Group();
    const tickRadius = (innerRadius + outerRadius) / 2;
    const halfHeight = tickHeight / 2;
    const effectiveTickCount = Math.max(1, Math.floor(tickCount));

    for (let i = 0; i < effectiveTickCount; i += 1) {
      const tick = new Mesh(this.tickGeometry, this.tickMaterial);
      const angle = (i / effectiveTickCount) * Math.PI * 2;
      tick.position.set(
        Math.sin(angle) * tickRadius,
        halfHeight,
        Math.cos(angle) * tickRadius
      );
      tick.rotation.y = angle;
      this.ticks.add(tick);
    }

    this.add(this.ticks);

    this.position.set(0, positionY, 0);
  }

  /**
   * Обновляет вращение шкалы, создавая эффект непрерывного движения делений.
   * @param {number} dt Дельта времени с прошлого кадра в секундах.
   * @returns {void}
   */
  update(dt: number): void {
    this.ticks.rotation.y += this.rotationSpeed * dt;
  }

  /**
   * Освобождает ресурсы, связанные с геометрией и материалом кольца.
   * @returns {void}
   */
  dispose(): void {
    this.ringGeometry.dispose();
    this.tickGeometry.dispose();
    this.ringMaterial.dispose();
    this.tickMaterial.dispose();
  }
}
