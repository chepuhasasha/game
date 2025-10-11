import { Color, DoubleSide, MeshStandardMaterial, ShaderMaterial } from "three";

const glassShaderMaterial = new ShaderMaterial({
  uniforms: {
    envColor: { value: new Color(0xf0f8ff) },
    tintColor: { value: new Color(0xb0e0ff) },
    fresnelPower: { value: 3.5 },
    baseOpacity: { value: 0.2 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 envColor;
    uniform vec3 tintColor;
    uniform float fresnelPower;
    uniform float baseOpacity;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);

      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), fresnelPower);
      vec3 refractionColor = mix(tintColor, envColor, fresnel);

      float highlight = pow(max(dot(normal, viewDir), 0.0), 24.0);
      vec3 color = refractionColor + vec3(highlight);

      float alpha = clamp(mix(baseOpacity, 1.0, fresnel), 0.0, 1.0);
      gl_FragColor = vec4(color, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
});

export default {
  standart: new MeshStandardMaterial({ color: 0xff0000 }),
  glass: glassShaderMaterial,
};
