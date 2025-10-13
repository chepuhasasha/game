import {
  Color,
  MeshPhysicalMaterial,
  Shader,
  Vector2,
} from "three";

export type LiquidMaterialUniforms = {
  uTime: { value: number };
  uSurfaceColor: { value: Color };
  uDepthColor: { value: Color };
  uFresnelPower: { value: number };
  uNoiseScale: { value: number };
  uNormalDistortion: { value: number };
  uDepthStrength: { value: number };
  uFoamStrength: { value: number };
  uFlowDirectionA: { value: Vector2 };
  uFlowDirectionB: { value: Vector2 };
  uFlowSpeedA: { value: number };
  uFlowSpeedB: { value: number };
};

export type LiquidMaterial = MeshPhysicalMaterial & {
  userData: MeshPhysicalMaterial["userData"] & {
    liquidUniforms?: LiquidMaterialUniforms;
  };
};

/**
 * Создаёт материал физически корректной полупрозрачной жидкости без использования прозрачности.
 * Материал остаётся в непрозрачном проходе, но имитирует глубину и френель для взаимодействия со стеклом.
 * @returns {LiquidMaterial} Настроенный материал жидкости.
 */
export const createLiquidMaterial = (): LiquidMaterial => {
  const material = new MeshPhysicalMaterial({
    color: new Color(0x124b63),
    roughness: 0.35,
    metalness: 0.04,
    transparent: false,
    depthWrite: true,
    transmission: 0.0,
    reflectivity: 0.4,
    envMapIntensity: 1.1,
  }) as LiquidMaterial;

  const liquidUniforms: LiquidMaterialUniforms = {
    uTime: { value: 0 },
    uSurfaceColor: { value: new Color(0x4bd9ff) },
    uDepthColor: { value: new Color(0x05162a) },
    uFresnelPower: { value: 3.25 },
    uNoiseScale: { value: 1.4 },
    uNormalDistortion: { value: 0.35 },
    uDepthStrength: { value: 1.75 },
    uFoamStrength: { value: 0.5 },
    uFlowDirectionA: { value: new Vector2(0.65, 0.25) },
    uFlowDirectionB: { value: new Vector2(-0.4, 0.55) },
    uFlowSpeedA: { value: 0.35 },
    uFlowSpeedB: { value: 0.22 },
  };

  material.onBeforeCompile = (shader: Shader) => {
    shader.uniforms = {
      ...shader.uniforms,
      ...liquidUniforms,
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
          varying vec3 vWorldPosition;
          varying vec3 vWorldNormal;
          varying vec3 vViewDir;
        `
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
          vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          vViewDir = normalize(cameraPosition - vWorldPosition);
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
          varying vec3 vWorldPosition;
          varying vec3 vWorldNormal;
          varying vec3 vViewDir;
          uniform vec3 uSurfaceColor;
          uniform vec3 uDepthColor;
          uniform float uFresnelPower;
          uniform float uTime;
          uniform float uNoiseScale;
          uniform float uNormalDistortion;
          uniform float uDepthStrength;
          uniform float uFoamStrength;
          uniform vec2 uFlowDirectionA;
          uniform vec2 uFlowDirectionB;
          uniform float uFlowSpeedA;
          uniform float uFlowSpeedB;

          float saturate(float value) { return clamp(value, 0.0, 1.0); }

          float hash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          }

          float noise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);

            float n000 = hash(i + vec3(0.0, 0.0, 0.0));
            float n100 = hash(i + vec3(1.0, 0.0, 0.0));
            float n010 = hash(i + vec3(0.0, 1.0, 0.0));
            float n110 = hash(i + vec3(1.0, 1.0, 0.0));
            float n001 = hash(i + vec3(0.0, 0.0, 1.0));
            float n101 = hash(i + vec3(1.0, 0.0, 1.0));
            float n011 = hash(i + vec3(0.0, 1.0, 1.0));
            float n111 = hash(i + vec3(1.0, 1.0, 1.0));

            float nx00 = mix(n000, n100, f.x);
            float nx10 = mix(n010, n110, f.x);
            float nx01 = mix(n001, n101, f.x);
            float nx11 = mix(n011, n111, f.x);

            float nxy0 = mix(nx00, nx10, f.y);
            float nxy1 = mix(nx01, nx11, f.y);

            return mix(nxy0, nxy1, f.z);
          }

          float fbm(vec3 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;

            for (int i = 0; i < 4; i++) {
              value += amplitude * noise(p * frequency);
              frequency *= 2.0;
              amplitude *= 0.5;
            }

            return value;
          }
        `
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
          vec3 flowSampleA = vec3(
            vWorldPosition.xy + uFlowDirectionA * (uTime * uFlowSpeedA),
            vWorldPosition.z
          );
          vec3 flowSampleB = vec3(
            vWorldPosition.xy + uFlowDirectionB * (uTime * uFlowSpeedB),
            vWorldPosition.z
          );

          float noiseA = fbm(flowSampleA * uNoiseScale);
          float noiseB = fbm(flowSampleB * uNoiseScale);
          float liquidFlowSignal = noiseA - noiseB;
          float liquidDepthMix = saturate(0.5 + 0.5 * liquidFlowSignal);
          float liquidFoamMix = saturate(pow(abs(liquidFlowSignal), 3.0));

          vec3 flowNormalOffset = vec3(
            dFdx(liquidFlowSignal),
            dFdy(liquidFlowSignal),
            0.0
          );
          normal = normalize(normal + uNormalDistortion * flowNormalOffset);
        `
      )
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>
          vec3 worldNormal = normalize(vWorldNormal);
          vec3 viewDir = normalize(vViewDir);
          float fresnelTerm = pow(1.0 - saturate(dot(worldNormal, viewDir)), uFresnelPower);
          vec3 depthTint = mix(
            uDepthColor,
            uSurfaceColor,
            pow(liquidDepthMix, uDepthStrength)
          );

          diffuseColor.rgb = mix(diffuseColor.rgb, depthTint, 0.85);
          diffuseColor.rgb += fresnelTerm * uFoamStrength * mix(
            uSurfaceColor,
            vec3(1.0),
            liquidFoamMix
          );
          totalEmissiveRadiance += fresnelTerm * uFoamStrength * 0.15 * uSurfaceColor;
        `
      );
  };

  material.customProgramCacheKey = () => "liquid-material";
  material.userData.liquidUniforms = liquidUniforms;
  material.userData.recommendedRenderOrder = 0;

  return material;
};

/**
 * Обновляет динамические параметры материала жидкости, обеспечивая движение шумов.
 * @param {LiquidMaterial} material Материал жидкости, созданный через createLiquidMaterial.
 * @param {number} elapsedTime Текущее время в секундах, используемое для анимации.
 * @returns {void}
 */
export const updateLiquidMaterial = (
  material: LiquidMaterial,
  elapsedTime: number
): void => {
  const uniforms = material.userData.liquidUniforms;
  if (!uniforms) return;

  uniforms.uTime.value = elapsedTime;
};
