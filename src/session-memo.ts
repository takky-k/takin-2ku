import { fatigueForMuscle, sorenessForMuscle } from "./wellness";
import { type Entities, localDate } from "./model";
import { effectiveSleepHours } from "./health";
import { sessionDay } from "./training";
export function buildSessionMemo(
  session: Entities["sessions"],
  sessions: Entities["sessions"][],
  sets: Entities["sets"][],
  wellness: Entities["wellness"][],
  health: Entities["health"][] = [],
) {
  const day = sessionDay(session),
    logs = wellness
      .filter((w) => !w.deletedAt && w.dateLocal === day)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    notes: string[] = [];
  const sleep = effectiveSleepHours(health, logs, day);
  notes.push(
    sleep === null
      ? "睡眠データは未取得です。疲労や回復度を補完しません。"
      : `取得した睡眠は${Math.round(sleep * 60)}分です。${sleep < 6 ? "短時間睡眠のため増加を見送り、実際の調子を確認しましょう。" : "睡眠時間だけでは回復度を断定しません。"}`,
  );
  const muscleFatigue = logs
    .flatMap((w) => session.exercises.map((e) => fatigueForMuscle(w, e.muscle)))
    .filter((n): n is number => n !== null);
  const fatigue = muscleFatigue.length ? Math.max(...muscleFatigue) : null,
    mood = logs.find((w) => w.mood !== null)?.mood ?? null;
  const soreness = Math.max(
    0,
    ...logs.flatMap((w) =>
      session.exercises.map((e) => sorenessForMuscle(w, e.muscle) ?? 0),
    ),
  );
  if (logs.some((w) => w.painFlag))
    notes.push(
      "今日は痛み・体調不良の記録があります。痛みを無視して予定を進めず、継続できる状態かを確認してください。負荷を自動で増やしません。",
    );
  else if ((fatigue !== null && fatigue >= 4) || soreness >= 4)
    notes.push(
      `今日は${fatigue !== null ? `筋肉疲労${fatigue}/5` : "強い筋肉痛"}の記録があります。重量を機械的に下げるのではなく、休憩を長めに取り、セット数や余裕を残す止め方を検討してください。`,
    );
  else if (fatigue !== null || mood !== null)
    notes.push(
      `今日の記録は${[fatigue !== null ? `筋肉疲労${fatigue}/5` : null, mood !== null ? `気分${mood}/5` : null].filter(Boolean).join("、")}です。最初のセットでフォームと余力を確認しながら進めましょう。`,
    );
  else
    notes.push(
      "今日のコンディションはまだ未入力です。未入力を「疲労なし」とは判断せず、最初のセットで調子を確認しましょう。",
    );
  const previous = sessions
    .filter(
      (s) =>
        s.id !== session.id &&
        !s.deletedAt &&
        s.status === "finished" &&
        s.planId === session.planId &&
        session.planId !== null &&
        sessionDay(s) <= day &&
        sets.some((r) => !r.deletedAt && r.completedAt && r.sessionId === s.id),
    )
    .sort(
      (a, b) =>
        sessionDay(b).localeCompare(sessionDay(a)) ||
        b.startedAt.localeCompare(a.startedAt),
    );
  if (previous.length) {
    const prev = previous[0],
      days = Math.round(
        (Date.parse(day + "T12:00:00Z") -
          Date.parse(sessionDay(prev) + "T12:00:00Z")) /
          86400000,
      );
    notes.push(
      `同じメニューの前回実施は${sessionDay(prev)}${days >= 0 ? `（${days}日前）` : ""}です。表の前回実績を参考に、今回の重量・回数・実測RIRを記録してください。`,
    );
  } else
    notes.push(
      "同じメニューの比較可能な実績はまだありません。予定値を出発点に、今回の実績を次の比較基準にします。",
    );
  if (previous.length >= 3) {
    const e = session.exercises[0],
      series = e
        ? previous
            .slice(0, 3)
            .map(
              (s) =>
                sets
                  .filter(
                    (r) =>
                      !r.deletedAt &&
                      r.completedAt &&
                      r.sessionId === s.id &&
                      r.exerciseId === e.exerciseId &&
                      r.equipmentId === e.equipmentId &&
                      r.setType === "normal",
                  )
                  .sort(
                    (a, b) => b.weightKg - a.weightKg || b.reps - a.reps,
                  )[0],
            )
        : [];
    if (series.length === 3 && series.every(Boolean)) {
      const stable = series.every(
        (r) =>
          Math.abs(r.weightKg - series[0].weightKg) < 0.001 &&
          r.reps === series[0].reps,
      );
      if (stable)
        notes.push(
          `${e.name}は直近3回の同じ機器で最高重量とその重量での最多回数が同水準です。停滞の可能性はありますが、この3回だけでは断定できません。フォーム、実測RIR、休憩時間も合わせて振り返りましょう。`,
        );
      else
        notes.push(
          `${e.name}の直近3回には重量または回数の変化があります。良い方向かどうかは、同じ機器・フォーム・実測RIRをそろえて判断しましょう。`,
        );
    }
  } else
    notes.push(
      "停滞や個人の回復傾向を判断するには、まだ比較記録が不足しています。",
    );
  return notes;
}
