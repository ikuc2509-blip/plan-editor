// Режим «На месте» (телефон): план сверху, панель шага снизу, полоска шагов внизу экрана.
// Данные и рисование те же, что в «Чистовике» (CLAUDE.md, «Устройство приложения»).
import { useEffect, useRef, useState } from 'preact/hooks';
import * as A from '../../model/actions';
import { uid } from '../../model/state';
import type { Spot } from '../../geometry/unfold';
import { snapMm } from '../../geometry/rotate';
import { saveStatusText } from '../../storage/history';
import { canRedo, canUndo, dirtySince, dispatch, fileSavedAt, gridStep, plan, redo, sel, tab, toast, undo } from '../store';
import { setMode } from '../mode';
import { Toast } from '../common/Toast';
import { PasswordDialog } from '../common/PasswordDialog';
import { UpdateBar } from '../common/UpdateBar';
import { MeasureDialog } from '../common/MeasureDialog';
import { CameraDialog } from '../common/CameraDialog';
import { RectifyDialog } from '../common/RectifyDialog';
import { PhotoViewer } from '../editor/PhotosPanel';
import { Sheet, ZOOM_MAX, ZOOM_MIN, onsiteZoom } from '../editor/Sheet';
import { STEPS, fullSheet, placing, step, type StepKey } from './state';
import { FinishStep, MarkersStep, MeasureStep, OpeningsStep, PhotosStep, RoomStep } from './Steps';

const PANELS: Record<StepKey, () => preact.JSX.Element> = {
  room: RoomStep, openings: OpeningsStep, markers: MarkersStep, photos: PhotosStep, measure: MeasureStep, finish: FinishStep,
};

function placeMarker(s: Spot) {
  const id = uid();
  // палец не точнее сантиметров — округляем, как при перетаскивании
  const sn = (mm: number) => snapMm(mm, gridStep.value);
  const at: A.MarkerAt = s.place === 'floor'
    ? { place: 'floor', x: sn(s.x), y: sn(s.y) }
    : { place: 'wall', wallId: s.wallId, off: sn(s.off), z: sn(s.z) };
  dispatch(p => A.addMarkerAt(p, id, at));
  sel.value = { kind: 'mk', id };
  placing.value = false;
  const m = plan.value.markers.find(k => k.id === id);
  toast(`Метка № ${m?.n ?? ''} поставлена — впишите описание`);
}

function SaveStatus() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const dirty = dirtySince.value !== null;
  return (
    <button class={'status' + (dirty ? ' dirty' : '')} title="Сохранить — шаг «Итог»" onClick={() => { step.value = 'finish'; }}>
      {saveStatusText(dirtySince.value, fileSavedAt.value, Math.max(now, dirtySince.value ?? 0))}
    </button>
  );
}

export function OnsiteApp() {
  const i = STEPS.findIndex(s => s.key === step.value);
  const cur = STEPS[i]!;
  const Panel = PANELS[cur.key];
  const panelRef = useRef<HTMLElement>(null);

  // карточка метки ведёт к её снимку («Фото» в «Чистовике» — вкладка)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (tab.value === 'photos') step.value = 'photos';
  }, [tab.value]);
  // новый шаг — панель с начала
  useEffect(() => { panelRef.current?.scrollTo(0, 0); }, [step.value]);

  const go = (k: StepKey) => { step.value = k; };
  const zoomBy = (k: number) => { onsiteZoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, onsiteZoom.value * k)); };

  return (
    <div class="onsite">
      <header class="os-top">
        <h1><span class="dot">1</span>На месте</h1>
        <SaveStatus />
        <span class="grow" />
        <button class="ghost" aria-label="Отменить" title="Отменить" disabled={!canUndo.value} onClick={undo}>↶</button>
        <button class="ghost" aria-label="Повторить" title="Повторить" disabled={!canRedo.value} onClick={redo}>↷</button>
        <button class="ghost" title="Полный редактор" onClick={() => setMode('editor')}>Чистовик</button>
        <UpdateBar />
      </header>
      <div class="os-plan">
        <Sheet
          onsite
          full={fullSheet.value}
          onPlace={placing.value ? placeMarker : undefined}
          onSelect={k => { if (k === 'wi') go('openings'); else if (k === 'mk') go('markers'); }}
        />
        <div class="os-tools">
          <button aria-label="Уменьшить план" onClick={() => zoomBy(1 / 1.3)}>−</button>
          <button aria-label="Увеличить план" onClick={() => zoomBy(1.3)}>+</button>
          <button onClick={() => { fullSheet.value = !fullSheet.value; onsiteZoom.value = 1; }}>{fullSheet.value ? 'Чертёж' : 'Весь лист'}</button>
        </div>
      </div>
      <section class="os-panel" ref={panelRef} aria-label={cur.title}>
        <h2>{cur.title} <small>шаг {i + 1} из {STEPS.length}</small></h2>
        <Panel />
        <div class="os-nav">
          <button disabled={i === 0} onClick={() => go(STEPS[i - 1]!.key)}>← Назад</button>
          {i < STEPS.length - 1 && <button class="primary" onClick={() => go(STEPS[i + 1]!.key)}>Далее →</button>}
        </div>
      </section>
      <nav class="os-steps" aria-label="Шаги осмотра">
        {STEPS.map((s, k) => (
          <button key={s.key} aria-current={s.key === step.value ? 'step' : undefined} onClick={() => go(s.key)}>
            <span class="num">{k + 1}</span>{s.nav}
          </button>
        ))}
      </nav>
      <Toast />
      <PasswordDialog />
      <MeasureDialog />
      <CameraDialog />
      <RectifyDialog />
      <PhotoViewer />
    </div>
  );
}
