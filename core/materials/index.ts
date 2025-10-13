import { WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { createGlassMaterial } from "./glass";
import { createLiquidMaterial } from "./liquid";
import { StandartMaterial } from "./standart";

export const materials = {
  standart: StandartMaterial,
  glass: createGlassMaterial(),
  liquid: createLiquidMaterial(),
};

export type MaterialName = keyof typeof materials;

const MSAA_FALLBACK_TAG = Symbol("expo-gl-msaa-fallback");

type MultisampleSafeContext = WebGL2RenderingContext & {
  renderbufferStorageMultisample?: (
    target: GLenum,
    samples: GLsizei,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei
  ) => void;
  [MSAA_FALLBACK_TAG]?: boolean;
};

/**
 * Подменяет вызов renderbufferStorageMultisample, добавляя откат на обычное хранилище.
 * Это устраняет падение Expo GL, где функция объявлена, но не реализована.
 * @param {WebGLRenderer} renderer Экземпляр WebGLRenderer для доступа к контексту.
 * @returns {void}
 */
const ensureMultisampleFallback = (renderer: WebGLRenderer): void => {
  const gl = renderer.getContext() as MultisampleSafeContext | undefined;
  if (!gl || gl[MSAA_FALLBACK_TAG]) return;

  const original = gl.renderbufferStorageMultisample?.bind(gl);
  if (!original) {
    gl[MSAA_FALLBACK_TAG] = true;
    return;
  }

  gl.renderbufferStorageMultisample = (
    target: GLenum,
    samples: GLsizei,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei
  ): void => {
    if (samples <= 0) {
      original(target, samples, internalformat, width, height);
      return;
    }

    try {
      original(target, samples, internalformat, width, height);
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "Expo GL не поддерживает MSAA, выполняем откат на renderbufferStorage",
          error
        );
      }
      gl.renderbufferStorage(target, internalformat, width, height);
    }
  };

  gl[MSAA_FALLBACK_TAG] = true;
};

/**
 * Настраивает рендерер для корректной работы физических материалов.
 * @param {WebGLRenderer} renderer Экземпляр WebGLRenderer, созданный Expo Three.
 * @returns {void}
 */
export const configureRendererPhysicMaterials = (
  renderer: WebGLRenderer
): void => {
  ensureMultisampleFallback(renderer);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.useLegacyLights = false; // -Property 'useLegacyLights' does not exist on type 'WebGLRenderer'.ts(2339)
};

export * from "./standart";
export * from "./glass";
export * from "./liquid";
