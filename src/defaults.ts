// User-approved planned targets, never workout history. No personal CSV data here.
export const catalog = [
  {
    key: "lat",
    name: "ラットプルダウン",
    muscle: "背中",
    equipment: "ラットプルダウン",
    category: "compound",
    rest: 180,
    weights: [100, 100, 90],
    reps: [8, 7, 8],
    notes:
      "基本RIR2、休憩3分。胸にバーを付ける必要はない。胸を張り、肘を下に引く。戻し2〜3秒。引く時に吐く。",
    videos: ["https://youtube.com/shorts/QMuhF1Z6WwA"],
  },
  {
    key: "row",
    name: "シーテッドロウ",
    muscle: "背中",
    equipment: "シーテッドロウ",
    category: "compound",
    rest: 180,
    weights: [70, 70, 65],
    reps: [8, 7, 8],
    notes:
      "基本RIR2、休憩3分。反動を使わず胸を安定させる。戻し2〜3秒、引く時に吐く。",
  },
  {
    key: "rear",
    name: "リアデルトマシン",
    muscle: "肩（後部）",
    equipment: "リアデルトマシン",
    category: "isolation",
    rest: 120,
    weights: [65, 55, 50],
    reps: [8, 12, 12],
    notes:
      "基本RIR2、最終セットのみRIR0〜1可。休憩2分。戻し3秒。座面は最高位置、腕を床と平行、内側の曲がったグリップ。",
  },
  {
    key: "biceps",
    name: "バイセップマシン",
    muscle: "上腕二頭筋",
    equipment: "バイセップマシン",
    category: "isolation",
    rest: 120,
    weights: [55, 50, 40],
    reps: [8, 8, 10],
    notes:
      "基本RIR2、最終セットのみRIR0〜1可。休憩2分。戻し3秒、肘固定。椅子の高さ9、胸当ては最短。",
  },
  {
    key: "shrug",
    name: "ダンベルシュラッグ",
    muscle: "僧帽筋",
    equipment: "ダンベル",
    category: "isolation",
    rest: 120,
    weights: [30],
    reps: [15],
    locked: true,
    notes:
      "通常30lb×15回で固定。本人が変更するまで自動増量しない。休憩2分。肩を真上にすくめ、トップで1秒、戻し2〜3秒。",
  },
  {
    key: "chest",
    name: "新チェストプレスマシン",
    muscle: "胸",
    equipment: "新チェストプレスマシン",
    category: "compound",
    rest: 180,
    weights: [125, 125, 115],
    reps: [8, 8, 8],
    notes:
      "目標RIR2、休憩3分。肩甲骨を軽く寄せ、肩をすくめない。戻し2秒、押すとき吐く。次の候補135lbという記述はあるが、器具の実際の刻みは未確認。",
  },
  {
    key: "incline",
    name: "インクラインチェストプレスマシン",
    muscle: "胸",
    equipment: "インクラインチェストプレスマシン",
    category: "compound",
    rest: 180,
    weights: [40, 40],
    reps: [8, 7],
    notes:
      "目標RIR2、休憩3分。胸上部を意識、肩をすくめない。戻し2秒、押すとき吐く。",
  },
  {
    key: "pec",
    name: "ペックデック",
    muscle: "胸",
    equipment: "ペックデック",
    category: "isolation",
    rest: 120,
    weights: [70, 70],
    reps: [10, 9],
    notes:
      "基本RIR2、最後RIR0〜1可。休憩2分。シート8、胸の高さに腕。大胸筋を伸ばすが肩に痛みを出さない。戻し3秒。",
  },
  {
    key: "lateral",
    name: "ダンベルサイドレイズ",
    muscle: "肩（側部）",
    equipment: "ダンベル",
    category: "isolation",
    rest: 120,
    weights: [15, 15, 15],
    reps: [10, 9, 8],
    notes:
      "基本RIR2、最後RIR0〜1可。休憩2分。左前腕や左腕の軌道を意識、戻し3秒、フォーム優先。",
    videos: ["https://youtube.com/shorts/-bvP-lzw6X0"],
  },
  {
    key: "triceps",
    name: "トリセップマシン",
    muscle: "上腕三頭筋",
    equipment: "トリセップマシン",
    category: "isolation",
    rest: 120,
    weights: [70, 70],
    reps: [9, 8],
    notes:
      "肘伸展型ならIsolation。基本RIR2、最後RIR0〜1可。休憩2分。椅子は調整穴が1.5個見える設定。肘固定、戻し2秒、押すとき吐く。",
  },
] as const;
export const planNotes = {
  A: "ブランク後は初回セットで調子を確認し、著しい違和感があれば負荷を見直す。コンパウンドはRIR2、アイソレーションは原則RIR2で最終セットRIR0〜1も可。",
  B: "チェストプレス前にウォームアップ2〜3セット（実施した分を追加、ハードセットと分離）。コンパウンドはRIR2優先。予定回数より先にRIR2へ達したらそこで止める。痛みを無視して続行しない。",
};
export const aliases: Record<string, string> = {
  リアデルト: "リアデルトマシン",
  インクラインチェストプレス: "インクラインチェストプレスマシン",
  "新チェストプレスマシン（追加セット）": "新チェストプレスマシン",
};
