import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";

export type RotationRingOptions = {
  innerRadius: number;
  outerRadius: number;
  positionY?: number;
  tickColor?: string | number;
  tickCount?: number;
  tickHeight?: number;
  tickWidth?: number;
  tickDepth?: number;
  metalness?: number;
  roughness?: number;
};

/**
 * Кольцо из делений, лежащее в горизонтальной плоскости и окружающее контейнер с коробками.
 */
export class RotationRingObject extends Group {
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
    tickColor = "#ffffff",
    tickCount = 64,
    tickHeight = 0.08,
    tickWidth = 0.04,
    tickDepth = 0.2,
    metalness = 0.35,
    roughness = 0.45,
  }: RotationRingOptions) {
    super();

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
   * Освобождает ресурсы, связанные с геометрией и материалом кольца.
   * @returns {void}
   */
  dispose(): void {
    this.tickGeometry.dispose();
    this.tickMaterial.dispose();
  }
}
