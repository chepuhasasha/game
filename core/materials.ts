import {
  ACESFilmicToneMapping,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

/**
 * Настраивает рендерер для корректной работы физически корректного стекла.
 * @param {WebGLRenderer} renderer Экземпляр WebGLRenderer, созданный Expo Three.
 * @returns {void}
 */
export const configureRendererForGlass = (renderer: WebGLRenderer): void => {
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
