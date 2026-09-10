"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createWebsiteLotteryOption,
  deleteWebsiteLotteryOption,
  getWebsiteLottery,
  updateWebsiteLotteryOption,
  type WebsiteLotteryOption
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";
import {
  websiteLotteryBankCategories,
  type WebsiteLotteryBankOption,
  type WebsiteLotteryDifficulty
} from "../../lib/website-lottery-bank";

type WebsiteLotteryDifficultyFilter = "all" | WebsiteLotteryDifficulty;

export type WebsiteLotteryDay = {
  id: string;
  dayId?: string;
  title?: string;
  status?: string;
};

const difficultyFilterLabels: Record<WebsiteLotteryDifficultyFilter, string> = {
  all: "全部",
  easy: "简单",
  medium: "中等",
  hard: "较难"
};

export function WebsiteLotteryManager({ dayId, days = [] }: { dayId: string; days?: WebsiteLotteryDay[] }) {
  const [selectedDayId, setSelectedDayId] = useState(dayId);
  const [options, setOptions] = useState<WebsiteLotteryOption[]>([]);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [bankActionId, setBankActionId] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<WebsiteLotteryDifficultyFilter>("all");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    void getWebsiteLottery(selectedDayId, session.token)
      .then((payload) => setOptions(payload.options))
      .catch(() => setMessage("抽奖配置暂不可达。"));
  }, [selectedDayId]);

  useEffect(() => {
    setSelectedDayId(dayId);
  }, [dayId]);

  function selectDay(nextDayId: string) {
    setSelectedDayId(nextDayId);
    setOptions([]);
    setEditingOptionId(null);
    setLabel("");
    setDescription("");
    setMessage(null);
  }

  function hasOption(optionLabel: string) {
    return options.some((item) => item.label === optionLabel);
  }

  const difficultyCounts = websiteLotteryBankCategories.reduce((counts, category) => {
    for (const option of category.options) {
      counts.all += 1;
      counts[option.difficulty] += 1;
    }
    return counts;
  }, { all: 0, easy: 0, medium: 0, hard: 0 });

  const visibleCategories = websiteLotteryBankCategories
    .map((category) => {
      const visibleOptions = category.options.filter((option) => difficultyFilter === "all" || option.difficulty === difficultyFilter);
      return visibleOptions.length > 0 ? { ...category, options: visibleOptions } : null;
    })
    .filter((category): category is (typeof websiteLotteryBankCategories)[number] => category !== null);
  const selectedDayLabel = selectedDayId.replace(/^day-/i, "DAY ");

  async function create(event: FormEvent) {
    event.preventDefault();
    const session = loadSession();
    if (!session || !label.trim()) return;
    try {
      const existing = options.find((item) => item.id === editingOptionId);
      const option = existing
        ? await updateWebsiteLotteryOption(selectedDayId, existing.id, { label, description, isActive: existing.isActive, sortOrder: existing.sortOrder }, session.token)
        : await createWebsiteLotteryOption(selectedDayId, { label, description, sortOrder: options.length + 1 }, session.token);
      setOptions((current) => existing
        ? current.map((item) => item.id === option.id ? option : item)
        : [...current, option]);
      setLabel("");
      setDescription("");
      setEditingOptionId(null);
      setMessage(existing ? "网站类型内容已更新。" : "自定义网站类型已加入抽奖池。");
    } catch {
      setMessage("保存失败，请稍后重试。" );
    }
  }

  async function addFromBank(option: WebsiteLotteryBankOption) {
    const session = loadSession();
    if (!session) return;
    if (hasOption(option.label)) {
      setMessage(`“${option.label}” 已在当前抽奖池中。`);
      return;
    }

    setBankActionId(option.id);
    setMessage(null);
    try {
      const created = await createWebsiteLotteryOption(
        selectedDayId,
        {
          label: option.label,
          description: option.description,
          sortOrder: options.length + 1
        },
        session.token
      );
      setOptions((current) => [...current, created]);
      setMessage(`已加入题库项：${option.label}`);
    } catch {
      setMessage("从题库加入失败，请稍后重试。");
    } finally {
      setBankActionId(null);
    }
  }

  async function toggle(option: WebsiteLotteryOption) {
    const session = loadSession();
    if (!session) return;
    try {
      const updated = await updateWebsiteLotteryOption(selectedDayId, option.id, { ...option, isActive: !option.isActive }, session.token);
      setOptions((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setMessage("更新失败，请稍后重试。" );
    }
  }

  async function remove(optionId: string) {
    const session = loadSession();
    if (!session) return;
    try {
      await deleteWebsiteLotteryOption(selectedDayId, optionId, session.token);
      setOptions((current) => current.filter((item) => item.id !== optionId));
    } catch {
      setMessage("已有学生抽到的选项不能删除，请改为停用。" );
    }
  }

  return (
    <section style={managerStyle} aria-labelledby="lottery-manager-title">
      <span style={managerEyebrow}>{selectedDayLabel} / WEBSITE SETUP</span>
      <h2 id="lottery-manager-title" style={{ margin: "5px 0 10px" }}>网站类型抽奖池</h2>
      {days.length > 0 ? (
        <label style={dayBindingStyle}>
          <span>绑定到课程 Day</span>
          <select aria-label="抽奖绑定 Day" value={selectedDayId} onChange={(event) => selectDay(event.target.value)} style={dayBindingSelectStyle}>
            {days.map((day) => {
              const value = day.dayId ?? day.id;
              return <option key={value} value={value}>{value.replace(/^day-/i, "Day ")}{day.title ? ` · ${day.title}` : ""}</option>;
            })}
          </select>
        </label>
      ) : null}
      <p style={bankHintStyle}>先选择要绑定的 Day，再从系统分类题库或下面的表单加入网站类型。抽奖配置只会出现在当前绑定的 Day，其他 Day 不会显示。</p>
      <div style={difficultyBarStyle} role="group" aria-label="题库难度筛选">
        {(Object.keys(difficultyFilterLabels) as WebsiteLotteryDifficultyFilter[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setDifficultyFilter(level)}
            style={{
              ...difficultyButtonStyle,
              ...(difficultyFilter === level ? difficultyButtonActiveStyle : {})
            }}
          >
            {difficultyFilterLabels[level]}
            <span style={difficultyCountStyle}>{difficultyCounts[level]}</span>
          </button>
        ))}
      </div>
      <div style={bankGridStyle}>
        {visibleCategories.map((category) => (
          <details key={category.id} style={bankCategoryStyle}>
            <summary style={bankSummaryStyle}>
              <span>{category.label}</span>
              <span style={bankSummaryCountStyle}>{category.options.length} 个题目</span>
            </summary>
            <p style={bankDescriptionStyle}>{category.description}</p>
            <div style={bankOptionGridStyle}>
              {category.options.map((option) => {
                const alreadyAdded = hasOption(option.label);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void addFromBank(option)}
                    disabled={alreadyAdded || bankActionId === option.id}
                    style={{
                      ...bankOptionButtonStyle,
                      opacity: alreadyAdded || bankActionId === option.id ? 0.65 : 1,
                      cursor: alreadyAdded || bankActionId === option.id ? "not-allowed" : "pointer"
                    }}
                  >
                    <div style={bankOptionHeaderStyle}>
                      <strong style={{ display: "block" }}>{option.label}</strong>
                      <span style={difficultyBadgeStyle}>{difficultyFilterLabels[option.difficulty]}</span>
                    </div>
                    <span style={bankOptionDescriptionStyle}>{option.description}</span>
                    <span style={bankOptionFooterStyle}>{alreadyAdded ? "已加入" : bankActionId === option.id ? "加入中..." : "加入抽奖池"}</span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
      <form onSubmit={(event) => void create(event)} style={{ display: "grid", gap: 7 }}>
        <input aria-label="网站类型名称" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：宠物领养网站" maxLength={80} required />
        <input aria-label="网站类型说明" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选：主题约束或功能要求" maxLength={300} />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={managerButtonStyle}>{editingOptionId ? "保存修改" : "加入自定义选项"}</button>
          {editingOptionId ? <button type="button" onClick={() => { setEditingOptionId(null); setLabel(""); setDescription(""); }}>取消编辑</button> : null}
        </div>
      </form>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 7 }}>
        {options.map((option) => (
          <li key={option.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid rgba(148,163,184,.2)", borderRadius: 4, opacity: option.isActive ? 1 : .55 }}>
            <span style={{ flex: 1 }}><strong>{option.label}</strong>{option.description ? ` · ${option.description}` : ""}</span>
            <button type="button" onClick={() => { setEditingOptionId(option.id); setLabel(option.label); setDescription(option.description); }}>编辑</button>
            <button type="button" onClick={() => void toggle(option)}>{option.isActive ? "停用" : "启用"}</button>
            <button type="button" onClick={() => void remove(option.id)}>删除</button>
          </li>
        ))}
      </ul>
      {message ? <p role="status" style={{ color: "#fde68a", fontSize: 12 }}>{message}</p> : null}
    </section>
  );
}

const managerStyle = { marginTop: 20, padding: 16, borderRadius: 7, border: "1px solid rgba(250,204,21,.28)", background: "rgba(78,52,10,.22)", color: "#f8fafc" };
const managerEyebrow = { color: "#fde68a", fontSize: 10, fontWeight: 800, letterSpacing: ".14em" };
const dayBindingStyle = { display: "grid", gap: 6, margin: "10px 0 12px", color: "#fff7cc", fontSize: 12, fontWeight: 700 };
const dayBindingSelectStyle = { width: "100%", padding: "8px 10px", border: "1px solid rgba(253,230,138,.35)", borderRadius: 4, background: "#1f2937", color: "#fff", fontSize: 13 };
const managerButtonStyle = { width: "fit-content", padding: "7px 10px", border: "1px solid #fcd34d", borderRadius: 4, background: "#a16207", color: "white", cursor: "pointer" };
const bankHintStyle = { margin: "8px 0 12px", color: "#fef3c7", fontSize: 12, lineHeight: 1.5 };
const bankGridStyle = { display: "grid", gap: 10, marginBottom: 14 };
const bankCategoryStyle = { padding: 10, borderRadius: 6, border: "1px solid rgba(253,230,138,.18)", background: "rgba(15,23,42,.26)" };
const bankSummaryStyle = { display: "flex", justifyContent: "space-between", gap: 10, cursor: "pointer", listStyle: "none", fontWeight: 700, color: "#fff7cc" };
const bankSummaryCountStyle = { color: "#fde68a", fontSize: 12, fontWeight: 600 };
const bankDescriptionStyle = { margin: "8px 0 10px", color: "#f8e7a1", fontSize: 12, lineHeight: 1.45 };
const bankOptionGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 };
const bankOptionButtonStyle = { display: "grid", gap: 4, alignContent: "start", textAlign: "left" as const, padding: 10, minHeight: 118, borderRadius: 6, border: "1px solid rgba(253,230,138,.22)", background: "rgba(251,191,36,.08)", color: "#fff" };
const bankOptionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" };
const bankOptionDescriptionStyle = { color: "#fde68a", fontSize: 12, lineHeight: 1.45 };
const bankOptionFooterStyle = { color: "#f9d46c", fontSize: 11, fontWeight: 700, marginTop: 6 };
const difficultyBarStyle = { display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 12 };
const difficultyButtonStyle = { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid rgba(253,230,138,.2)", borderRadius: 999, background: "rgba(15,23,42,.28)", color: "#fef3c7", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const difficultyButtonActiveStyle = { background: "#a16207", border: "1px solid #fcd34d", color: "#fff" };
const difficultyCountStyle = { minWidth: 18, padding: "0 6px", borderRadius: 999, background: "rgba(255,255,255,.12)", textAlign: "center" as const, fontSize: 11, lineHeight: "18px" };
const difficultyBadgeStyle = { padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,.12)", color: "#fff7cc", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" as const };
