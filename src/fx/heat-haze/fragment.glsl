uniform sampler2D tDiffuse;
uniform float time;
uniform float intensity;
uniform float distortion;
uniform float shimmer;
uniform float blurStrength;
uniform float speed;
uniform float noiseScale;
uniform float hotThreshold;
uniform float hotSoftness;

varying vec2 vUv;

vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float snoise(vec2 v) {
    const vec4 C = vec4(
        0.211324865405187,
        0.366025403784439,
        -0.577350269189626,
        0.024390243902439
    );

    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(
        0.5 - vec3(
            dot(x0, x0),
            dot(x12.xy, x12.xy),
            dot(x12.zw, x12.zw)
        ),
        0.0
    );
    m *= m;
    m *= m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g);
}

void main() {
    float animatedTime = time * speed;
    vec2 flowUv = vUv * noiseScale + vec2(animatedTime * 0.32, animatedTime * 0.18);
    float baseNoise = snoise(flowUv);
    float heatMask = smoothstep(
        hotThreshold - hotSoftness,
        hotThreshold + hotSoftness,
        baseNoise
    );
    heatMask = clamp(heatMask, 0.0, 1.0);

    float detailNoise = snoise(flowUv * 2.3 + vec2(animatedTime * 1.4, animatedTime * -1.6));
    float detailMask = detailNoise * 0.5 + 0.5;

    vec2 gradient = vec2(
        snoise(flowUv + vec2(0.08, 0.0)) - baseNoise,
        snoise(flowUv + vec2(0.0, 0.08)) - baseNoise
    );
    vec2 refraction = gradient * distortion;

    vec2 shimmerOffset = (detailMask - 0.5) * shimmer * intensity * 0.004 * vec2(1.0, -1.0);

    vec2 distortedUv = vUv + refraction * intensity;
    distortedUv = mix(vUv, distortedUv, heatMask * intensity);
    vec2 finalUv = distortedUv + shimmerOffset;
    vec2 safeUv = clamp(finalUv, 0.001, 0.999);

    vec3 refractedColor = texture2D(tDiffuse, safeUv).rgb;

    vec2 blurStep = vec2(0.0015, 0.0);
    vec3 blurredColor = refractedColor * 0.4;
    blurredColor += texture2D(tDiffuse, clamp(safeUv + blurStep, 0.001, 0.999)).rgb * 0.15;
    blurredColor += texture2D(tDiffuse, clamp(safeUv - blurStep, 0.001, 0.999)).rgb * 0.15;
    blurredColor += texture2D(tDiffuse, clamp(safeUv + blurStep.yx, 0.001, 0.999)).rgb * 0.15;
    blurredColor += texture2D(tDiffuse, clamp(safeUv - blurStep.yx, 0.001, 0.999)).rgb * 0.15;

    float blurAmount = clamp(blurStrength * intensity, 0.0, 1.0) * heatMask;
    vec3 hazyColor = mix(refractedColor, blurredColor, blurAmount);

    gl_FragColor = vec4(hazyColor, 1.0);
}
