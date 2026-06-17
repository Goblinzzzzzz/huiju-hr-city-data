// src/transforms/num.ts
function safeFloat(v, d = 0) {
  if (v === null || v === void 0) return d;
  const s = String(v).trim();
  if (s === "" || s === "#N/A" || s === "None") return d;
  const n = parseFloat(s);
  return isNaN(n) ? d : n;
}
function safeInt(v, d = 0) {
  return Math.trunc(safeFloat(v, d));
}

// src/transforms/workId.ts
function normalizeWorkId(val) {
  if (val === null || val === void 0) return "";
  const s = String(val).trim();
  if (s === "" || s === "None") return "";
  if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  return s;
}

// src/transforms/tier.ts
var TIERS = [
  "\u6807\u6746",
  "\u6210\u957F90",
  "\u6210\u957F80",
  "\u6210\u957F70",
  "\u6F5C\u529B60",
  "\u6F5C\u529B50",
  "\u6F5C\u529B<50"
];
var TIER_RANK = Object.fromEntries(
  TIERS.map((t, i) => [t, i])
);
var GROWTH_TIERS = ["\u6210\u957F90", "\u6210\u957F80", "\u6210\u957F70"];
function getTier(rate) {
  if (rate >= 100) return { name: "\u6807\u6746", rank: 0 };
  if (rate >= 90) return { name: "\u6210\u957F90", rank: 1 };
  if (rate >= 80) return { name: "\u6210\u957F80", rank: 2 };
  if (rate >= 70) return { name: "\u6210\u957F70", rank: 3 };
  if (rate >= 60) return { name: "\u6F5C\u529B60", rank: 4 };
  if (rate >= 50) return { name: "\u6F5C\u529B50", rank: 5 };
  return { name: "\u6F5C\u529B<50", rank: 6 };
}
function tierChange(currentRank, mayRank) {
  if (currentRank < mayRank) return "\u2191\u5347";
  if (currentRank > mayRank) return "\u2193\u964D";
  return "\u2014";
}

// src/transforms/district.ts
function dabuShort(raw, districts) {
  if (!raw) return "\u5176\u4ED6";
  for (const d of districts) {
    if (d.match.some((m) => raw.includes(m))) return d.name;
  }
  return "\u5176\u4ED6";
}

// src/transforms/flow.ts
function buildFlow(onjob, lost, tiers) {
  const all = [...onjob, ...lost];
  return tiers.map((t) => {
    const may = all.filter((p) => p.mayTier === t).length;
    const up = onjob.filter(
      (p) => p.mayTier === t && p.tierChange === "\u2191\u5347"
    ).length;
    const down = onjob.filter(
      (p) => p.mayTier === t && p.tierChange === "\u2193\u964D"
    ).length;
    const lostC = lost.filter((p) => p.mayTier === t).length;
    const upIn = onjob.filter(
      (p) => p.currentTier === t && p.tierChange === "\u2191\u5347"
    ).length;
    const downIn = onjob.filter(
      (p) => p.currentTier === t && p.tierChange === "\u2193\u964D"
    ).length;
    const june = onjob.filter((p) => p.currentTier === t).length;
    return { tier: t, may, up, down, lost: lostC, upIn, downIn, june, change: june - may };
  });
}
function totalRow(rows) {
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const may = sum("may");
  const june = sum("june");
  return {
    tier: "\u5408\u8BA1",
    may,
    up: sum("up"),
    down: sum("down"),
    lost: sum("lost"),
    upIn: sum("upIn"),
    downIn: sum("downIn"),
    june,
    change: june - may
  };
}

// src/transforms/qa.ts
function checkFlowBalance(rows) {
  const issues = [];
  for (const r of rows) {
    const rhs = r.june + r.up + r.down + r.lost - r.upIn - r.downIn;
    if (r.may !== rhs) {
      issues.push({
        code: "flow-balance",
        severity: "error",
        message: `\u6863\u4F4D ${r.tier} \u52FE\u7A3D\u4E0D\u5E73\uFF1A5\u6708=${r.may} \u2260 6\u6708${r.june}+\u5347${r.up}+\u964D${r.down}+\u79BB${r.lost}-\u5347\u5165${r.upIn}-\u964D\u5165${r.downIn}=${rhs}`
      });
    }
  }
  return issues;
}
function checkFreshness(sources) {
  return sources.filter((s) => !s.ok).map((s) => ({
    code: "freshness",
    severity: "error",
    message: `\u6570\u636E\u6E90\u300C${s.source}\u300D\u672A\u5C31\u7EEA/\u8FC7\u671F${s.note ? "\uFF1A" + s.note : ""}`
  }));
}
function checkPlaceholderRate(total, placeholders, threshold = 0.15) {
  if (total <= 0) return [];
  const rate = placeholders / total;
  if (rate > threshold) {
    return [
      {
        code: "placeholder",
        severity: "warn",
        message: `\u5360\u4F4D/\u7F3A\u5931\u6570\u636E\u5360\u6BD4 ${(rate * 100).toFixed(1)}% \u8D85\u9608\u503C ${(threshold * 100).toFixed(0)}%\uFF0C\u5EFA\u8BAE\u8865\u6570\u636E\u540E\u518D\u63A8\u9001`
      }
    ];
  }
  return [];
}
function canPush(issues) {
  return !issues.some((i) => i.severity === "error");
}

// src/transforms/cumulate.ts
function upsertTrend(history, entry) {
  const data = [...history.data ?? []];
  const i = data.findIndex((e) => e.date === entry.date);
  if (i >= 0) {
    const merged = { ...data[i], ...entry };
    if (entry.rank === null && data[i].rank != null) merged.rank = data[i].rank;
    data[i] = merged;
  } else {
    data.push(entry);
  }
  return { ...history, data };
}
export {
  GROWTH_TIERS,
  TIERS,
  TIER_RANK,
  buildFlow,
  canPush,
  checkFlowBalance,
  checkFreshness,
  checkPlaceholderRate,
  dabuShort,
  getTier,
  normalizeWorkId,
  safeFloat,
  safeInt,
  tierChange,
  totalRow,
  upsertTrend
};
