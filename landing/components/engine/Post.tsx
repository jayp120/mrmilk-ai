'use client';

import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Noise,
  Vignette,
  ToneMapping,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Vector2 } from 'three';

export function Post() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.18}
        radius={0.8}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new Vector2(0.0005, 0.0005)}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise premultiply opacity={0.04} blendFunction={BlendFunction.OVERLAY} />
      <Vignette eskil={false} offset={1.1} darkness={0.3} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
