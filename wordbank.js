/**
 * 服务端词库模块
 * 词条按「分类」组织（附近义词用于模糊匹配）；
 * 「主题(theme)」是分类的组合，开局由房主选择，服务端据此选词。
 */

const WORD_BANK = {
  animal: [
    { word: '猫',   synonyms: ['猫咪', '小猫', '喵喵'] },
    { word: '狗',   synonyms: ['小狗', '狗狗', '犬'] },
    { word: '兔子', synonyms: ['小兔', '兔', '小白兔'] },
    { word: '大象', synonyms: ['象'] },
    { word: '长颈鹿', synonyms: [] },
    { word: '熊猫', synonyms: ['大熊猫'] },
    { word: '老虎', synonyms: ['虎', '大老虎'] },
    { word: '狮子', synonyms: ['雄狮'] },
    { word: '猴子', synonyms: ['猴', '小猴子'] },
    { word: '企鹅', synonyms: [] },
    { word: '鳄鱼', synonyms: [] },
    { word: '蝴蝶', synonyms: [] },
    { word: '蜗牛', synonyms: [] },
    { word: '海豚', synonyms: [] },
    { word: '孔雀', synonyms: [] },
    { word: '蛇',   synonyms: ['小蛇'] },
    { word: '鸡',   synonyms: ['小鸡', '公鸡', '母鸡'] },
    { word: '鱼',   synonyms: ['小鱼', '鱼儿'] },
    { word: '螃蟹', synonyms: ['蟹', '大闸蟹'] },
    { word: '乌龟', synonyms: ['龟', '小乌龟', '海龟'] },
  ],
  daily: [
    { word: '雨伞', synonyms: ['伞'] },
    { word: '眼镜', synonyms: [] },
    { word: '手机', synonyms: ['电话', '手提电话'] },
    { word: '电脑', synonyms: ['计算机', '笔记本'] },
    { word: '钢琴', synonyms: [] },
    { word: '篮球', synonyms: [] },
    { word: '自行车', synonyms: ['单车', '脚踏车'] },
    { word: '电风扇', synonyms: ['风扇'] },
    { word: '冰箱', synonyms: [] },
    { word: '闹钟', synonyms: ['钟', '时钟'] },
    { word: '太阳', synonyms: [] },
    { word: '月亮', synonyms: ['月'] },
    { word: '西瓜', synonyms: [] },
    { word: '苹果', synonyms: [] },
    { word: '蛋糕', synonyms: [] },
    { word: '帽子', synonyms: [] },
    { word: '钥匙', synonyms: [] },
    { word: '书包', synonyms: ['背包', '双肩包'] },
    { word: '剪刀', synonyms: [] },
    { word: '牙刷', synonyms: [] },
  ],
  idiom: [
    { word: '画蛇添足', synonyms: [] },
    { word: '守株待兔', synonyms: [] },
    { word: '掩耳盗铃', synonyms: [] },
    { word: '对牛弹琴', synonyms: [] },
    { word: '狐假虎威', synonyms: [] },
    { word: '亡羊补牢', synonyms: [] },
    { word: '井底之蛙', synonyms: [] },
    { word: '刻舟求剑', synonyms: [] },
    { word: '叶公好龙', synonyms: [] },
    { word: '杯弓蛇影', synonyms: [] },
    { word: '鹤立鸡群', synonyms: [] },
    { word: '龙飞凤舞', synonyms: [] },
    { word: '虎头蛇尾', synonyms: [] },
    { word: '画龙点睛', synonyms: [] },
    { word: '鸡飞蛋打', synonyms: [] },
  ],
  food: [
    { word: '汉堡', synonyms: ['汉堡包'] },
    { word: '披萨', synonyms: ['比萨', 'pizza'] },
    { word: '寿司', synonyms: [] },
    { word: '火锅', synonyms: [] },
    { word: '冰淇淋', synonyms: ['雪糕', '冰激凌'] },
    { word: '包子', synonyms: [] },
    { word: '饺子', synonyms: ['水饺'] },
    { word: '面条', synonyms: ['面', '拉面'] },
    { word: '寿面', synonyms: [] },
    { word: '烤鸭', synonyms: ['北京烤鸭'] },
    { word: '珍珠奶茶', synonyms: ['奶茶'] },
    { word: '薯条', synonyms: [] },
    { word: '爆米花', synonyms: [] },
    { word: '甜甜圈', synonyms: ['甜圈'] },
    { word: '棒棒糖', synonyms: [] },
  ],
};

/**
 * 主题：分类的组合。房主开局选择，缺省为「综合(mixed)」。
 * 保持与客户端 utils/wordbank.js 的 THEMES 一致。
 */
const THEMES = {
  mixed:  { name: '综合', cats: ['animal', 'daily', 'idiom', 'food'] },
  animal: { name: '动物', cats: ['animal'] },
  daily:  { name: '日常', cats: ['daily'] },
  food:   { name: '美食', cats: ['food'] },
  idiom:  { name: '成语', cats: ['idiom'] },
};

/** 主题合法性归一：非法/缺省一律回落到 mixed，避免异常入参破坏流程 */
function normalizeTheme(theme) {
  return THEMES[theme] ? theme : 'mixed';
}

/**
 * 随机选取一个词条（避免重复）
 * @param {string[]} usedWords 已使用过的词语
 * @param {string} [theme] 主题 key，决定候选分类范围；缺省/非法回落到 mixed
 * @returns {{ word: string, synonyms: string[], category: string }}
 */
function getRandomWord(usedWords, theme) {
  const cats = THEMES[normalizeTheme(theme)].cats;
  // 汇总主题下所有分类的未使用词条
  let pool = [];
  cats.forEach((cat) => {
    (WORD_BANK[cat] || []).forEach((w) => {
      if (!usedWords.includes(w.word)) pool.push({ entry: w, cat });
    });
  });
  // 全部用完则在主题范围内重置
  if (pool.length === 0) {
    cats.forEach((cat) => {
      (WORD_BANK[cat] || []).forEach((w) => pool.push({ entry: w, cat }));
    });
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { word: picked.entry.word, synonyms: picked.entry.synonyms, category: picked.cat };
}

/**
 * 判定答案是否正确
 * 1. 完全匹配
 * 2. 匹配近义词列表
 * 3. 简易模糊：去空格后匹配
 */
function checkAnswer(guess, wordEntry) {
  const g = guess.replace(/\s+/g, '').trim();
  const w = wordEntry.word.replace(/\s+/g, '');
  if (g === w) return true;
  if (wordEntry.synonyms.some(s => g === s.replace(/\s+/g, ''))) return true;
  return false;
}

module.exports = { WORD_BANK, THEMES, normalizeTheme, getRandomWord, checkAnswer };
