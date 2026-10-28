/** 环境声：只在开机/空态/输入框下方出现，永远可忽略。 */
export const APHORISMS = [
  {
    zh: "我只能给你看门。穿过去，得靠你自己。",
    en: "I can only show you the door. You're the one that has to walk through it.",
    src: "MORPHEUS",
  },
  {
    zh: "凡有开始，必有终结。",
    en: "Everything that has a beginning has an end.",
    src: "THE ORACLE",
  },
  {
    zh: "选择是幻觉 —— 它诞生于有权者与无权者之间。",
    en: "Choice is an illusion, created between those with power and those without.",
    src: "THE MEROVINGIAN",
  },
  {
    zh: "否认，是人类最可预测的反应。",
    en: "Denial is the most predictable of all human responses.",
    src: "THE ARCHITECT",
  },
  { zh: "你早已知道该做什么。", en: "You already know what you have to do.", src: "THE ORACLE" },
  { zh: "问题在于选择。", en: "The problem is choice.", src: "THE ARCHITECT" },
  { zh: "此事无可避免。", en: "It is inevitable.", src: "AGENT SMITH" },
  {
    zh: "勺子并不存在。改变的不是勺子，是你。",
    en: "There is no spoon. It's not the spoon that bends — it's you.",
    src: "SPOON BOY",
  },
] as const;

export const pickAphorism = (index: number) =>
  APHORISMS[index % APHORISMS.length] as (typeof APHORISMS)[number];
