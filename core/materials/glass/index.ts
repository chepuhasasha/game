import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
} from "three";

/**
 * Создаёт материал матового стекла с мягкими преломлениями и размытием.
 * @returns {MeshPhysicalMaterial} Настроенный материал для стеклянных объектов.
 */
export const createGlassMaterial = (): MeshPhysicalMaterial => {
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
