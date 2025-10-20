uniform sampler2D tDiffuse;
uniform float time;
uniform float threshold;
uniform float intensity;
uniform float blockSize;
uniform float chromaticAberration;
uniform float lineStrength;
uniform float noiseScale;
uniform float tearStrength;
uniform float flickerStrength;
varying vec2 vUv;

float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 saturate(vec2 v) {
    return clamp(v, 0.0, 1.0);
}

void main() {
    vec3 baseColor = texture2D(tDiffuse, vUv).rgb;
    float effect = clamp(threshold, 0.0, 1.0) * max(intensity, 0.0);

    if (effect < 1e-4) {
        gl_FragColor = vec4(baseColor, 1.0);
        return;
    }

    float timeSlice = floor(time * 18.0);
    vec2 blockCoord = floor(vUv * max(blockSize, 1.0));
    float blockNoise = random(blockCoord + timeSlice);
    float dir = mix(-1.0, 1.0, step(0.5, random(blockCoord + timeSlice + 23.17)));
    float blockShift = (blockNoise - 0.5) * effect * 0.18;

    vec2 warpedUv = vUv;
    warpedUv.x += blockShift * dir;

    float sliceNoise = random(vec2(blockCoord.y * 1.7, timeSlice * 0.73));
    warpedUv.x += (sliceNoise - 0.5) * lineStrength * effect * 0.06;

    float tearTrigger = step(0.92, random(vec2(blockCoord.x + timeSlice, blockCoord.y - timeSlice)));
    warpedUv += vec2(tearTrigger * tearStrength * effect * 0.05, 0.0);

    vec2 chromaOffset = vec2(chromaticAberration * effect) * vec2(blockNoise - 0.5, sliceNoise - 0.5);

    vec2 sampleUv = saturate(warpedUv);
    vec3 glitchColor;
    glitchColor.r = texture2D(tDiffuse, saturate(sampleUv + chromaOffset)).r;
    glitchColor.g = texture2D(tDiffuse, sampleUv).g;
    glitchColor.b = texture2D(tDiffuse, saturate(sampleUv - chromaOffset)).b;

    float scanline = sin((warpedUv.y * noiseScale + time * 6.0) * 3.14159265);
    float scanMask = mix(1.0, 0.45 + 0.55 * scanline, clamp(lineStrength, 0.0, 1.5));
    float flicker = mix(1.0, 0.85 + 0.3 * sin(time * 25.0 + blockNoise * 6.2831), clamp(flickerStrength, 0.0, 1.5));

    glitchColor *= scanMask;
    glitchColor += flicker * effect * 0.05;

    vec3 finalColor = mix(baseColor, glitchColor, clamp(effect, 0.0, 1.0));
    gl_FragColor = vec4(finalColor, 1.0);
}
