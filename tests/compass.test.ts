// Этап 11: север по компасу телефона — направление, среднее, стрелка на листе.
import { describe, expect, test } from 'vitest';
import { headingOf, isFlat, meanAngle, northArrow } from '../src/geometry/compass';

describe('направление телефона', () => {
  test('Android: alpha против часовой от севера → по часовой', () => {
    expect(headingOf({ alpha: 0, beta: 0, gamma: 0 })).toBe(0);
    expect(headingOf({ alpha: 90, beta: 0, gamma: 0 })).toBe(270);
    expect(headingOf({ alpha: 270, beta: 0, gamma: 0 })).toBe(90);
    expect(headingOf({ alpha: null, beta: 0, gamma: 0 })).toBeNull();
  });

  test('iPhone: готовое направление по часовой', () => {
    expect(headingOf({ alpha: 10, beta: 0, gamma: 0, webkitCompassHeading: 45 })).toBe(45);
  });

  test('ровно лежит — до 25° наклона', () => {
    expect(isFlat({ alpha: 0, beta: 10, gamma: -20 })).toBe(true);
    expect(isFlat({ alpha: 0, beta: 60, gamma: 0 })).toBe(false);
  });
});

describe('среднее направление', () => {
  test('через север: 350° и 10° → 0°', () => {
    expect(meanAngle([350, 10])! % 360).toBeCloseTo(0, 6);
  });
  test('обычное', () => {
    expect(meanAngle([80, 90, 100])).toBeCloseTo(90, 6);
    expect(meanAngle([])).toBeNull();
  });
});

describe('стрелка севера на листе', () => {
  test('стена А на севере — стрелка вверх', () => expect(northArrow(0)).toBe(0));
  test('стена А на востоке — север слева на листе', () => expect(northArrow(90)).toBe(270));
  test('стена А на юге — север вниз', () => expect(northArrow(180)).toBe(180));
  test('до 5°', () => {
    expect(northArrow(33)).toBe(325);
    expect(northArrow(358)).toBe(0);
  });
});
