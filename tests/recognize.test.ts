// Этап 10: подготовка снимка для модели, разбор ответа, повторы рамок, пакет, рамка → стена.
import { describe, expect, test } from 'vitest';
import { OWL_SIZE, decode, fitOf, inside, iou, suppress, textInputs, toPixels, type Detection } from '../src/recognize/owl';
import { QUERIES, TEXT_LEN } from '../src/recognize/queries';
import { PACK, PART_SIZE, packSize, partPath } from '../src/recognize/packInfo';
import { addTracedWallItem, addWallPhoto } from '../src/model/actions';
import { blank } from '../src/model/state';
import { loadPlan } from '../src/model/migrate';
import type { Plan, WallPhoto } from '../src/model/types';
import { photoBoxOf, wallRectOfFrame } from '../src/model/wallPhotos';
import { WI_TYPES } from '../src/model/labels';

const det = (q: number, score: number, x0: number, y0: number, x1: number, y1: number): Detection => ({ q, score, x0, y0, x1, y1 });
const logit = (p: number) => Math.log(p / (1 - p));

describe('запросы модели', () => {
  test('каждый — начало, слова, конец; не длиннее 16; вид элемента стены существует', () => {
    for (const q of QUERIES) {
      expect(q.ids[0]).toBe(49406);
      expect(q.ids.at(-1)).toBe(49407);
      expect(q.ids.length).toBeLessThanOrEqual(TEXT_LEN);
      expect(WI_TYPES[q.type]).toBeTruthy();
    }
    expect(new Set(QUERIES.map(q => q.type))).toEqual(new Set(['window', 'door', 'radiator', 'board', 'screen']));
  });

  test('номера слов дополняются нулями, маска — единицы только у слов', () => {
    const { ids, mask } = textInputs([[49406, 320, 49407], [49406, 49407]]);
    expect(ids.length).toBe(2 * TEXT_LEN);
    expect([...ids.slice(0, 4)]).toEqual([49406n, 320n, 49407n, 0n]);
    expect([...mask.slice(0, 4)]).toEqual([1n, 1n, 1n, 0n]);
    expect([...mask.slice(TEXT_LEN, TEXT_LEN + 3)]).toEqual([1n, 1n, 0n]);
  });
});

describe('снимок для модели', () => {
  test('слои R, G, B подряд, цвета нормированы как у CLIP', () => {
    // 2×2: красный, зелёный, синий, серый
    const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 128, 255];
    const px = toPixels(rgba, 2);
    expect(px.length).toBe(12);
    expect(px[0]).toBeCloseTo((1 - 0.48145466) / 0.26862954, 5); // R красного
    expect(px[4 + 1]).toBeCloseTo((1 - 0.4578275) / 0.26130258, 5); // G зелёного
    expect(px[8 + 2]).toBeCloseTo((1 - 0.40821073) / 0.27577711, 5); // B синего
    expect(px[3]).toBeCloseTo((128 / 255 - 0.48145466) / 0.26862954, 5);
    expect(OWL_SIZE).toBe(960);
  });

  test('широкий снимок занимает верхнюю часть квадрата, узкий — левую', () => {
    expect(fitOf(2000, 1000)).toEqual({ fw: 1, fh: 0.5 });
    expect(fitOf(1000, 2000)).toEqual({ fw: 0.5, fh: 1 });
  });
});

describe('ответ модели', () => {
  // 3 участка × 2 запроса; рамки — центр и размер в долях квадрата
  const logits = [logit(0.9), logit(0.1), logit(0.05), logit(0.3), logit(0.02), logit(0.01)];
  const boxes = [0.5, 0.25, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.1, 0.1];

  test('лучший запрос участка, уверенность, перевод в доли снимка', () => {
    const d = decode(logits, boxes, 2, { fw: 1, fh: 0.5 }, 0.2);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ q: 0 });
    expect(d[0]!.score).toBeCloseTo(0.9, 6);
    expect(d[0]!.x0).toBeCloseTo(0.4, 6);
    expect(d[0]!.x1).toBeCloseTo(0.6, 6);
    // по высоте снимок — половина квадрата: 0,25 ± 0,05 → 0,4…0,6
    expect(d[0]!.y0).toBeCloseTo(0.4, 6);
    expect(d[0]!.y1).toBeCloseTo(0.6, 6);
    expect(d[1]).toMatchObject({ q: 1 });
    expect(d[1]!.score).toBeCloseTo(0.3, 6);
  });

  test('ниже порога и в сером поле — не попадает', () => {
    expect(decode(logits, boxes, 2, { fw: 1, fh: 0.5 }, 0.5)).toHaveLength(1);
    // третий участок при пороге 0 — целиком в сером поле (ниже снимка)
    expect(decode(logits, boxes, 2, { fw: 1, fh: 0.5 }, 0).length).toBe(2);
  });
});

describe('повторы рамок', () => {
  const type = (q: number) => QUERIES[q]!.type;
  const W = 0, D = 1, BOARD1 = 3, BOARD2 = 4;

  test('перекрытие и вложенность', () => {
    const a = det(W, 0.5, 0, 0, 0.4, 0.4), b = det(W, 0.4, 0.1, 0.1, 0.3, 0.3);
    expect(iou(a, a)).toBeCloseTo(1, 9);
    expect(iou(a, b)).toBeCloseTo(0.25, 9);
    expect(inside(a, b)).toBeCloseTo(1, 9);
  });

  test('одно окно несколькими рамками — остаётся самая уверенная', () => {
    const r = suppress([det(W, 0.3, 0.1, 0.1, 0.4, 0.5), det(W, 0.5, 0.12, 0.1, 0.42, 0.5), det(W, 0.2, 0.6, 0.1, 0.9, 0.5)], type);
    expect(r.map(d => d.score)).toEqual([0.5, 0.2]);
  });

  test('створка внутри двери — остаётся вся дверь, если она не намного менее уверенная', () => {
    const leaf = det(D, 0.42, 0.28, 0.34, 0.33, 0.69), door = det(D, 0.41, 0.22, 0.25, 0.35, 0.68);
    expect(suppress([leaf, door], type)).toEqual([door]);
    // дверь сильно менее уверенная — остаётся створка
    expect(suppress([leaf, { ...door, score: 0.2 }], type)).toEqual([leaf]);
  });

  test('«доска» по разным запросам — один вид; окно над дверью — другой вид, остаётся', () => {
    expect(suppress([det(BOARD1, 0.3, 0.1, 0.1, 0.5, 0.5), det(BOARD2, 0.25, 0.1, 0.1, 0.5, 0.52)], type)).toHaveLength(1);
    const transom = det(W, 0.25, 0.24, 0.28, 0.32, 0.34), door = det(D, 0.41, 0.22, 0.25, 0.35, 0.68);
    expect(suppress([transom, door], type)).toHaveLength(2);
  });
});

describe('пакет распознавания', () => {
  test('куски по 50 МБ покрывают каждый файл', () => {
    for (const f of PACK.files) {
      expect(f.parts.length).toBe(Math.ceil(f.size / PART_SIZE));
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      for (const h of f.parts) expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(packSize()).toBe(614_400_346 + 28_312_028);
  });

  test('адрес куска — рядом с приложением, без чужих сайтов', () => {
    const m = PACK.files[0]!;
    expect(partPath(m, 0)).toBe(`pack/${PACK.id}/model.onnx.000`);
    expect(partPath(m, 12)).toMatch(/\.012$/);
    expect(partPath(m, 0)).not.toMatch(/^\/|:/);
  });
});

describe('находка на кадре → участок стены', () => {
  // план 10 × 6 × 3 м; кадр — участок стены А от 2 до 6 м
  const wp: WallPhoto = {
    id: 'f', photoId: 'ph', wallId: 'A', show: true, opacity: 0.8,
    quad: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }],
    left: { kind: 'mark', off: { mm: 2000, status: 'conditional' } }, right: { kind: 'mark', off: { mm: 6000, status: 'conditional' } },
  };
  const p: Plan = addWallPhoto({
    ...blank(),
    photos: [{ id: 'ph', n: '1', file: 'a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1, sha256: '', kind: 'overview', link: { kind: 'wall', wallId: 'A' }, takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '' }],
  }, wp);

  test('доли кадра → отступ, от пола, ширина, высота; до сантиметра', () => {
    const H = p.room.height.mm;
    const r = wallRectOfFrame(p, wp, { x0: 0.25, y0: 0.2, x1: 0.5, y1: 0.7 })!;
    expect(r).toEqual({ off: 3000, z: Math.round(H * 0.3 / 10) * 10, w: 1000, h: Math.round(H * 0.8 / 10) * 10 - Math.round(H * 0.3 / 10) * 10 });
  });

  test('принятое помнит модель и уверенность и переживает сохранение', () => {
    const r = wallRectOfFrame(p, wp, { x0: 0.25, y0: 0.2, x1: 0.5, y1: 0.7 })!;
    const box = photoBoxOf(p, wp, r)!;
    const q = addTracedWallItem(p, 'w1', 'window', 'A', r, { kind: 'photo', photoId: 'ph', box, auto: { model: 'OWLv2', score: 0.74 } });
    const it = q.wallItems.find(i => i.id === 'w1')!;
    expect(it.off.status).toBe('conditional');
    expect(it.origin).toMatchObject({ kind: 'photo', auto: { model: 'OWLv2', score: 0.74 } });
    const back = loadPlan(JSON.parse(JSON.stringify(q)));
    expect(back.ok && back.plan.wallItems.find(i => i.id === 'w1')!.origin).toEqual(it.origin);
  });
});
