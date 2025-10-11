import {
  ACESFilmicToneMapping,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

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
 * Настраивает рендерер для корректной работы физически корректного стекла.
 * @param {WebGLRenderer} renderer Экземпляр WebGLRenderer, созданный Expo Three.
 * @returns {void}
 */
export const configureRendererForGlass = (renderer: WebGLRenderer): void => {
  ensureMultisampleFallback(renderer);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.physicallyCorrectLights = true;
};

/**
 * Создаёт материал матового стекла с мягкими преломлениями и размытием.
 * @returns {MeshPhysicalMaterial} Настроенный материал для стеклянных объектов.
 */
export const createMatteGlassMaterial = (): MeshPhysicalMaterial => {
  const material = new MeshPhysicalMaterial({
    color: new Color(0xd6eaff),
    transmission: 1.0,
    transparent: true,
    roughness: 0.6,
    metalness: 0.0,
    thickness: 1.4,
    ior: 1.46,
    attenuationColor: new Color(0xb0d4ff),
    attenuationDistance: 2.4,
    clearcoat: 0.25,
    clearcoatRoughness: 0.9,
    specularIntensity: 0.85,
    specularColor: new Color(0xffffff),
    envMapIntensity: 1.0,
  });
  material.side = DoubleSide;
  material.toneMapped = true;
  material.sheen = 0.25;
  material.sheenRoughness = 0.85;
  return material;
};

const materials = {
  standart: new MeshStandardMaterial({ color: 0xff0000 }),
  glass: createMatteGlassMaterial(),
};

export default materials;
