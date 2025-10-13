declare module "upng-js" {
  interface UPNGStatic {
    /**
     * Кодирует массив кадров в PNG-изображение и возвращает ArrayBuffer.
     * @param {(ArrayBuffer | Uint8Array)[]} frames Набор кадров в формате RGBA.
     * @param {number} width Ширина изображения.
     * @param {number} height Высота изображения.
     * @param {number} [cnum] Количество цветов палитры (0 для true color).
     * @param {number[]} [dels] Длительности кадров в мс для анимированного PNG.
     * @param {number} [deflateLevel] Уровень сжатия (0-3).
     * @param {number} [filter] Тип фильтра PNG.
     * @returns {ArrayBuffer} Буфер PNG-изображения.
     */
    encode(
      frames: ArrayBuffer[] | Uint8Array[],
      width: number,
      height: number,
      cnum?: number,
      dels?: number[],
      deflateLevel?: number,
      filter?: number
    ): ArrayBuffer;
  }

  const UPNG: UPNGStatic;
  export default UPNG;
}
