// История изменений — заготовка под отмену и повтор (кнопки — этап 5).
import { describe, expect, test } from 'vitest';
import { canRedo, canUndo, dispatch, endGesture, plan, redo, undo } from '../src/ui/store';
import { setNotes, setRoomSize } from '../src/model/actions';
import { rectSize } from '../src/model/room';

const L = () => rectSize(plan.value.room).L.mm;

describe('история изменений', () => {
  test('каждое действие — шаг истории; отмена и повтор', () => {
    const start = L();
    dispatch(p => setRoomSize(p, { L: 15_000 }));
    dispatch(p => setRoomSize(p, { L: 16_000 }));
    expect(L()).toBe(16_000);
    undo();
    expect(L()).toBe(15_000);
    undo();
    expect(L()).toBe(start);
    expect(canRedo.value).toBe(true);
    redo();
    expect(L()).toBe(15_000);
  });

  test('набор в одном поле — один шаг истории', () => {
    const before = plan.value;
    for (const t of ['П', 'Пр', 'При', 'Прим']) dispatch(p => setNotes(p, t), 'notes');
    endGesture();
    expect(plan.value.notes).toBe('Прим');
    undo();
    expect(plan.value).toBe(before);
    expect(canUndo.value).toBe(true);
  });

  test('новое действие после отмены стирает «повтор»', () => {
    dispatch(p => setNotes(p, 'А'));
    undo();
    dispatch(p => setNotes(p, 'Б'));
    expect(canRedo.value).toBe(false);
  });
});
