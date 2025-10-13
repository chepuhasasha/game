import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import type { Updatable } from "./updatable";

export type RotationRingOptions = {
  innerRadius: number;
  outerRadius: number;
  positionY?: number;
  tickCount?: number;
  tickHeight?: number;
  tickWidth?: number;
  tickDepth?: number;
};

/**
 * Тонкое кольцо, лежащее в горизонтальной плоскости и окружающее контейнер с коробками.
 */
export class RotationRingObject extends Group implements Updatable {
  private readonly ticks: Group;
  private readonly tickMaterial: MeshStandardMaterial;
  private readonly tickGeometry: BoxGeometry;

  /**
   * Создаёт кольцо вращения с заданными параметрами радиусов и материала.
   * @param {RotationRingOptions} options Набор параметров геометрии и материала.
   */
  constructor({
    innerRadius,
    outerRadius,
    positionY = 0,
    tickCount = 40,
    tickHeight = 0.04,
    tickWidth = 0.04,
    tickDepth = 2,
  }: RotationRingOptions) {
    super();
    this.tickGeometry = new BoxGeometry(tickWidth, tickHeight, tickDepth);
    this.tickMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.2
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
    //
  }

  /**
   * Освобождает ресурсы, связанные с геометрией и материалом кольца.
   * @returns {void}
   */
  dispose(): void {
    this.tickGeometry.dispose();
    this.tickMaterial.dispose();
  }
}
