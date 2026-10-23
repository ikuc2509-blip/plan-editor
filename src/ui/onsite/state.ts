// Состояние режима «На месте»: текущий шаг и «новая метка — касанием плана».
import { effect, signal } from '@preact/signals';
import { loadPref, savePref } from '../../storage/prefs';

export type StepKey = 'room' | 'openings' | 'markers' | 'photos' | 'measure' | 'finish';

/** Шаги по порядку осмотра (decisions.md); переход между ними свободный */
export const STEPS: readonly { key: StepKey; nav: string; title: string }[] = [
  { key: 'room', nav: 'Помещение', title: 'Помещение' },
  { key: 'openings', nav: 'Проёмы', title: 'Проёмы: двери, окна' },
  { key: 'markers', nav: 'Метки', title: 'Метки' },
  { key: 'photos', nav: 'Фото', title: 'Фото' },
  { key: 'measure', nav: 'Замеры', title: 'Замеры' },
  { key: 'finish', nav: 'Итог', title: 'Осмотр завершён' },
];

const isStep = (v: unknown): v is StepKey => STEPS.some(s => s.key === v);

// шаг помнится до следующего запуска: телефон мог перезапустить вкладку в фоне
export const step = signal<StepKey>(loadPref('onsite-step', 'room', isStep));
effect(() => savePref('onsite-step', step.value));

/** ждём касания плана, чтобы поставить новую метку */
export const placing = signal(false);
effect(() => { if (step.value !== 'markers') placing.value = false; });

/** показать на экране лист целиком, а не только чертёж */
export const fullSheet = signal(false);

/** Сегодняшняя дата для штампа: «23.10.2026» */
export const today = (d = new Date()): string => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
