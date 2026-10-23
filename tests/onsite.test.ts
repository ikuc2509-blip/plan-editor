// Этап 8 «На месте»: режим по устройству, новая метка касанием плана.
import { describe, expect, test } from 'vitest';
import { addMarkerAt } from '../src/model/actions';
import { example } from '../src/model/state';
import { defaultMode } from '../src/ui/mode';

describe('режим по умолчанию', () => {
  test('телефон — «На месте»', () => {
    expect(defaultMode(true, 412)).toBe('onsite');
  });

  test('компьютер и сенсорный ноутбук — «Чистовик»', () => {
    expect(defaultMode(false, 412)).toBe('editor');
    expect(defaultMode(true, 1080)).toBe('editor');
  });
});

describe('новая метка касанием плана', () => {
  test('на полу: положение «условно», номер — следующий', () => {
    const p = example(), before = p.markers.length;
    const q = addMarkerAt(p, 'new', { place: 'floor', x: 2500, y: 4000 });
    const m = q.markers.at(-1)!;
    expect(q.markers).toHaveLength(before + 1);
    expect(m).toMatchObject({ id: 'new', place: 'floor', x: { mm: 2500, status: 'conditional' }, y: { mm: 4000, status: 'conditional' } });
    expect(m.n).toBe(String(Math.max(...p.markers.map(k => parseInt(k.n) || 0)) + 1));
    // старый план не тронут
    expect(p.markers).toHaveLength(before);
  });

  test('на стене: стена, отступ и высота', () => {
    const q = addMarkerAt(example(), 'w', { place: 'wall', wallId: 'B', off: 1200, z: 800 });
    expect(q.markers.at(-1)).toMatchObject({ place: 'wall', wallId: 'B', off: { mm: 1200, status: 'conditional' }, z: { mm: 800, status: 'conditional' } });
  });
});
