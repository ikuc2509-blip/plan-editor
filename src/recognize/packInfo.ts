// Пакет распознавания (этап 10): модель и движок, которые качаются по кнопке с адреса
// приложения. Отпечатки SHA-256 вписаны сюда, в код приложения: скачанное сверяется с ними,
// поэтому подменённый или испорченный файл не запустится. Файл читает и scripts/pack.mjs
// (Node без сборки), поэтому здесь — только данные, без импортов.

export interface PackFile {
  /** что это: модель или движок */
  key: 'model' | 'wasm';
  /** имя файла — как в источнике (для «Загрузить с диска») */
  name: string;
  size: number;
  sha256: string;
  /** отпечатки кусков по PART_SIZE байт, по порядку */
  parts: string[];
}

/** размер куска на сайте: меньше ограничений GitHub, обрыв связи стоит недорого */
export const PART_SIZE = 50_000_000;

export const PACK = {
  /** меняется при смене модели или движка — тогда пакет качается заново */
  id: 'owlv2-b16-fp32_ort-1.30.0',
  title: 'OWLv2 base patch16 ensemble (Google, Apache-2.0)',
  /** откуда scripts/pack.mjs берёт модель при публикации (закреплённая версия) */
  source: 'https://huggingface.co/Xenova/owlv2-base-patch16-ensemble/resolve/3e255bc9bf304b3358a8c1945c0a9514eefe7f10/onnx/model.onnx',
  files: [
    {
      key: 'model',
      // полная точность (fp32): fp16 на многих видеокартах не считается (decisions.md)
      name: 'model.onnx',
      size: 614_400_346,
      sha256: 'a58f0efe148481660a0b1e4843b59cf7af52c8d2965afb6abc98a252c63552d2',
      parts: [
        '17c40aa17b69396cb6b770fda01c740b3836be60547735ff2140730c65ffdeab',
        '94a999b01361dd2bf9a09647ccf6ced2eb19b17dfe3d794ba5554eefd4a32d55',
        '6baf99f51a78cd440e2cecbc833f9fdbd6b210e773735f9813788b78ff85bdf1',
        'e248dbeae128cfc2dc3f8bc82a2362a23d309dcd0b799840a57c7cdc41ca619d',
        'be8f0c9b77f8e51ed1eaf2cb5cdebafc7a3512928e26175c2da5be1942cf4a7f',
        '89460ba44865233bac549881f4f9ad3762e800ca3eb1dee5e0558afe5d8d6c38',
        '164e3c01d0e99f2973262e3ba23efcdb37194bdbb05b9c9e3830a5612abe1543',
        'd1a8a601a0c7ae3d95cb5e4b8ff26a93c20deb04560f12cfa61d84934437127f',
        '78fce65c2bfb97d82672e68ac46e8d19d7c601d36362764e5f870829d5f925f8',
        'ed90baae1ceffc12d96b60d5be72d0432cac6baf33c6955c7c31f3151312bbf2',
        'd0465c44ff67084bfe5bee69b47a117738b1eb3c8b33f026a31dcc11529d7e23',
        '6f5b61fe4934fbab205a91ffb73b025f50120961ffae2dde5787236928fb2baa',
        '55ba9ca11b192f060eadba0c29b2f308daef8e2f66608db0727fa2191ebc6e41',
      ],
    },
    {
      key: 'wasm',
      // из onnxruntime-web 1.30.0, вариант JSEP: и видеокарта (WebGPU), и процессор; в варианте
      // asyncify нет нужных модели операций Cast и Where
      name: 'ort-wasm-simd-threaded.jsep.wasm',
      size: 28_312_028,
      sha256: '3ad23231b5bd6d9dda55a7f84606315e0bf35b6750c28ee993c987c54cacab0f',
      parts: [
        '3ad23231b5bd6d9dda55a7f84606315e0bf35b6750c28ee993c987c54cacab0f',
      ],
    },
  ] as PackFile[],
};

/** адрес куска относительно приложения */
export const partPath = (f: PackFile, i: number): string => `pack/${PACK.id}/${f.name}.${String(i).padStart(3, '0')}`;

/** общий размер пакета, байт */
export const packSize = (): number => PACK.files.reduce((s, f) => s + f.size, 0);
