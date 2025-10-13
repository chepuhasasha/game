import { DoubleSide, Mesh, MeshStandardMaterial, RingGeometry } from "three";

export type RotationRingOptions = {
  innerRadius: number;
  outerRadius: number;
  radialSegments?: number;
  positionY?: number;
  color?: string | number;
  metalness?: number;
  roughness?: number;
};

/**
 * Тонкое кольцо, лежащее в горизонтальной плоскости и окружающее контейнер с коробками.
 */
export class RotationRingObject extends Mesh {
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
    metalness = 0.35,
    roughness = 0.45,
  }: RotationRingOptions) {
    const geometry = new RingGeometry(innerRadius, outerRadius, radialSegments);
    geometry.rotateX(-Math.PI / 2);

    const material = new MeshStandardMaterial({
      color,
      side: DoubleSide,
      metalness,
      roughness,
    });

    super(geometry, material);

    this.position.set(0, positionY, 0);
  }

  /**
   * Освобождает ресурсы, связанные с геометрией и материалом кольца.
   * @returns {void}
   */
  dispose(): void {
    this.geometry.dispose();
    const material = this.material as MeshStandardMaterial | MeshStandardMaterial[];
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material.dispose();
    }
  }
}
