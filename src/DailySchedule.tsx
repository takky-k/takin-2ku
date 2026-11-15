import { useState } from "react";
import { Footprints, ChevronDown, Utensils } from "lucide-react";
import { CARDIO_WEEK, MEAL_PLAN, cardioForDate } from "./daily-schedule";
export function DailySchedule({
  date = new Date(),
  storageScope = "takin-2ku",
}: {
  date?: Date;
  storageScope?: string;
}) {
  const key = `takin-cardio-keep-easy:${storageScope}`;
  const [keepEasy, setKeepEasy] = useState(() => {
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return false;
    }
  });
  const cardio = cardioForDate(date, keepEasy);
  const toggleEasy = (value: boolean) => {
    setKeepEasy(value);
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* The choice still applies on this page. */
    }
  };
  return (
    <div className="daily-schedule">
      <section className="card cardio-today" aria-label="今日の有酸素">
        <div className="cardio-heading">
          <span>
            <Footprints size={17} /> 今日の有酸素
          </span>
          <small>
            {cardio.ended ? "プラン終了" : cardio.easy ? "慣らし" : "通常"}
          </small>
        </div>
        <h2>
          {cardio.ended ? (
            "今回のプランは終了"
          ) : cardio.minutes ? (
            <>
              早歩き <strong>{cardio.minutes}</strong>
              <small>分</small>
            </>
          ) : (
            "有酸素は休み"
          )}
        </h2>
        {!cardio.ended && (
          <p className="cardio-action">
            {cardio.minutes
              ? cardio.workout
                ? "筋トレのあとに歩く"
                : "好きな時間に歩く"
              : "普段の移動だけ"}
          </p>
        )}
        {cardio.minutes > 0 && (
          <p className="cardio-pace">
            会話できる速さ{cardio.minutes === 40 ? " · 20分×2回でもOK" : ""}
          </p>
        )}
        <details className="cardio-week">
          <summary>
            1週間の予定
            <ChevronDown size={15} />
          </summary>
          <table>
            <thead>
              <tr>
                <th>曜日</th>
                <th>筋トレ</th>
                <th>慣らし</th>
                <th>通常</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((i) => {
                const row = CARDIO_WEEK[i];
                return (
                  <tr
                    key={row.day}
                    className={i === date.getDay() ? "current-day" : ""}
                  >
                    <th scope="row">{row.day}</th>
                    <td>{row.workout ?? "休み"}</td>
                    <td>{row.easy ? `${row.easy}分` : "休み"}</td>
                    <td>{row.standard ? `${row.standard}分` : "休み"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="schedule-period">
            11/15〜11/28は慣らし、11/29〜1/10は通常
          </p>
          <label className="checkbox cardio-easy-choice">
            <input
              type="checkbox"
              checked={keepEasy}
              onChange={(e) => toggleEasy(e.target.checked)}
            />
            慣らしを続ける
          </label>
        </details>
      </section>
      <details className="card daily-meals">
        <summary>
          <span>
            <Utensils size={17} /> 食事プラン
          </span>
          <ChevronDown size={15} />
        </summary>
        <div className="meal-targets">
          <span>
            目安 <b>2,300〜2,400</b> kcal
          </span>
          <span>
            たんぱく質 <b>130〜150</b> g
          </span>
        </div>
        <ol className="meal-timeline">
          {MEAL_PLAN.map((meal) => (
            <li key={meal.time}>
              <div className="meal-time">
                <time>{meal.time}</time>
                <span>{meal.name}</span>
              </div>
              <div>
                <p>{meal.food}</p>
                <small>{meal.note}</small>
              </div>
            </li>
          ))}
        </ol>
        <div className="meal-extra">
          <b>お菓子</b>
          <span>食後に80〜100kcal程度</span>
        </div>
        <p className="meal-measure">
          ご飯は炊飯後の重さ。時刻は授業に合わせて調整。
        </p>
      </details>
    </div>
  );
}
