/** Объект с методом кадрового обновления. */
export interface Updatable {
  /** Вызывается каждый кадр.
   * @param {number} dt Дельта времени в секундах. */
  update(dt: number): void
}
