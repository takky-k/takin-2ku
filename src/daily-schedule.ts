import { localDate } from "./model";
export const PLAN_START = "2026-11-15";
export const PLAN_STANDARD_START = "2026-11-29";
export const PLAN_END = "2027-01-10";
// Sunday-first; walking minutes come from the agreed two-stage schedule.
export const CARDIO_WEEK = [
  { day: "日", workout: null, easy: 20, standard: 40 },
  { day: "月", workout: "B", easy: 15, standard: 20 },
  { day: "火", workout: "A", easy: 15, standard: 20 },
  { day: "水", workout: null, easy: 20, standard: 30 },
  { day: "木", workout: "B", easy: 15, standard: 20 },
  { day: "金", workout: null, easy: 0, standard: 0 },
  { day: "土", workout: "A", easy: 15, standard: 20 },
] as const;
export const MEAL_PLAN = [
  {
    time: "8:00",
    name: "朝食",
    food: "ご飯180g・納豆1パック・卵2個・味噌汁1杯",
    note: "調理油は小さじ1程度",
  },
  {
    time: "12:00",
    name: "昼食",
    food: "筋肉弁当1個",
    note: "普段の1個をそのまま",
  },
  {
    time: "15:30",
    name: "補食",
    food: "プロテインヨーグルト150g・プロテインシリアル30g・バナナ1本",
    note: "授業が長い日は持ち歩く",
  },
  {
    time: "19:00",
    name: "夕食",
    food: "ご飯180g・皮なし鶏むね肉180g・加熱した野菜200g",
    note: "鶏肉は調理前の重さ。調理油は小さじ1程度",
  },
  {
    time: "21:30",
    name: "補食",
    food: "牛乳または無調整豆乳200ml",
    note: "就寝時刻に合わせて調整",
  },
] as const;
export function cardioForDate(date = new Date(), keepEasy = false) {
  const day = localDate(date),
    row = CARDIO_WEEK[date.getDay()];
  const ended = day > PLAN_END;
  const easy = keepEasy || day < PLAN_STANDARD_START;
  return {
    ...row,
    minutes: ended ? 0 : easy ? row.easy : row.standard,
    easy,
    ended,
  };
}
