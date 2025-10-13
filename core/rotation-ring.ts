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
  baseZoom?: number;
};

/**
 * Тонкое кольцо, лежащее в горизонтальной плоскости и окружающее контейнер с коробками.
 */
export class RotationRingObject extends Group implements Updatable {
  private readonly ticks: Group;
  private readonly tickMaterial: MeshStandardMaterial;
  private readonly tickGeometry: BoxGeometry;
  private readonly baseInnerRadius: number;
  private readonly baseOuterRadius: number;
  private readonly baseTickRadius: number;
  private readonly baseTickHeight: number;
  private readonly baseZoom: number;
  private zoomCompensation = 1;

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
    baseZoom = 1,
  }: RotationRingOptions) {
    super();
    this.baseInnerRadius = innerRadius;
    this.baseOuterRadius = outerRadius;
    this.baseTickRadius = (innerRadius + outerRadius) / 2;
    this.baseTickHeight = tickHeight;
    this.baseZoom = Math.max(Number.EPSILON, baseZoom);
    this.tickGeometry = new BoxGeometry(tickWidth, tickHeight, tickDepth);
    this.tickMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.2
    });

    this.ticks = new Group();
    const halfHeight = tickHeight / 2;
    const effectiveTickCount = Math.max(1, Math.floor(tickCount));

    for (let i = 0; i < effectiveTickCount; i += 1) {
      const tick = new Mesh(this.tickGeometry, this.tickMaterial);
      const angle = (i / effectiveTickCount) * Math.PI * 2;
      tick.position.set(
        Math.sin(angle) * this.baseTickRadius,
        halfHeight,
        Math.cos(angle) * this.baseTickRadius
      );
      tick.rotation.y = angle;
      tick.userData.angle = angle;
      this.ticks.add(tick);
    }

    this.add(this.ticks);

    this.position.set(0, positionY, 0);
    this.handleZoomChange(baseZoom);
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

  /**
   * Применяет компенсацию масштаба для сохранения размеров делений при изменении zoom.
   * @param {number} zoom Текущее значение zoom ортографической камеры.
   * @returns {void}
   */
  handleZoomChange(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return;
    }

    const compensation = this.baseZoom / zoom;
    if (Math.abs(compensation - this.zoomCompensation) <= Number.EPSILON) {
      return;
    }

    this.zoomCompensation = compensation;
    const halfHeight = (this.baseTickHeight / 2) * compensation;
    const radius = this.baseTickRadius * compensation;

    this.ticks.children.forEach((tick) => {
      if (!(tick instanceof Mesh)) {
        return;
      }

      const { angle } = tick.userData as { angle?: number };
      if (typeof angle !== "number") {
        return;
      }

      tick.scale.set(
        compensation,
        compensation,
        compensation
      );
      tick.position.set(
        Math.sin(angle) * radius,
        halfHeight,
        Math.cos(angle) * radius
      );
    });
  }

  /**
   * Возвращает радиусы кольца с учётом текущей компенсации zoom.
   * @returns {{ inner: number; outer: number }} Объект с внутренним и внешним радиусами.
   */
  getCompensatedRadii(): { inner: number; outer: number } {
    const factor = this.zoomCompensation;
    return {
      inner: this.baseInnerRadius * factor,
      outer: this.baseOuterRadius * factor,
    };
  }
}
