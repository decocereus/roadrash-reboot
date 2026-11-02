import type * as THREE from "three";

const BONE_TEXELS = 3;

const HEAD = `#ifdef USE_INSTANCING
attribute float walkerFrame;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
uniform highp sampler2D walkerPoses;
mat4 walkerBone(float bone) {
  ivec2 at = ivec2(int(bone) * ${BONE_TEXELS}, int(walkerFrame) - 1);
  return transpose(mat4(
    texelFetch(walkerPoses, at, 0),
    texelFetch(walkerPoses, at + ivec2(1, 0), 0),
    texelFetch(walkerPoses, at + ivec2(2, 0), 0),
    vec4(0.0, 0.0, 0.0, 1.0)
  ));
}
mat4 walkerSkin() {
  return walkerBone(skinIndex.x) * skinWeight.x
    + walkerBone(skinIndex.y) * skinWeight.y
    + walkerBone(skinIndex.z) * skinWeight.z
    + walkerBone(skinIndex.w) * skinWeight.w;
}
#endif
`;

const NORMAL = `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  if (walkerFrame > 0.5) {
    objectNormal = mat3(walkerSkin()) * objectNormal;
  }
#endif`;

const POSITION = `#include <begin_vertex>
#ifdef USE_INSTANCING
  if (walkerFrame > 0.5) {
    transformed = (walkerSkin() * vec4(transformed, 1.0)).xyz;
  }
#endif`;

const walkerPoses: THREE.IUniform<THREE.Texture | null> = { value: null };

export const useWalkerPoses = (poses: THREE.Texture): void => {
  walkerPoses.value = poses;
};

export const skinWalkers = (
  shader: THREE.WebGLProgramParametersWithUniforms
) => {
  shader.uniforms.walkerPoses = walkerPoses;
  shader.vertexShader = `${HEAD}${shader.vertexShader
    .replace("#include <beginnormal_vertex>", NORMAL)
    .replace("#include <begin_vertex>", POSITION)}`;
};

export const POSE_TEXELS_PER_BONE = BONE_TEXELS;
