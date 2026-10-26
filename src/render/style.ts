// Оформление листа как в образце (prototype/plan_razvertka.py, этап 12): цвета и толщины.
// Чёрно-белый вариант — для принтера без цвета: заливки светлые, красное — чёрным.

export interface Palette {
  /** линии и текст */
  ink: string;
  /** второстепенное: линии сгиба, контуры развёрток, подписи стен */
  grey: string;
  /** метки, открытая створка, контур тела */
  red: string;
  /** толща стены и её штриховка */
  wall: string;
  hatch: string;
  /** двери, столы, шкафы */
  wood: string;
  /** стекло окон, зеркало */
  glass: string;
  /** стулья, кресла, диван: заливка и контур */
  chair: string;
  chairLine: string;
  /** стол преподавателя, кафедра */
  teacher: string;
  lectern: string;
  /** доска (меловая), картина */
  board: string;
  picture: string;
  /** привязки меток к стенам */
  tie: string;
  /** заливка кружка метки */
  markerFill: string;
}

const COLOR: Palette = {
  ink: '#111', grey: '#8A8A8A', red: '#C0392B', wall: '#EFEFEF', hatch: '#8A8A8A',
  wood: '#E9D8C4', glass: '#DCEBF5', chair: '#C9D6F2', chairLine: '#2C4FA3',
  teacher: '#E0C49E', lectern: '#C79A6B', board: '#3E6B4F', picture: '#F3EBD3',
  tie: '#2B5D8A', markerFill: '#fff',
};

const BW: Palette = {
  ink: '#111', grey: '#777', red: '#111', wall: '#F2F2F2', hatch: '#777',
  wood: '#fff', glass: '#fff', chair: '#fff', chairLine: '#111',
  teacher: '#ECECEC', lectern: '#fff', board: '#E3E3E3', picture: '#fff',
  tie: '#555', markerFill: '#fff',
};

export const palette = (bw: boolean): Palette => (bw ? BW : COLOR);

