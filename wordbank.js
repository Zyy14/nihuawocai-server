/**
 * 服务端词库模块
 * 包含动物、日常物品、成语三大分类
 * 每个词条附带近义词列表用于模糊匹配
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
};

/**
 * 随机选取一个词条（避免重复）
 * @param {string[]} usedWords 已使用过的词语
 * @returns {{ word: string, synonyms: string[], category: string }}
 */
function getRandomWord(usedWords) {
  const cats = Object.keys(WORD_BANK);
  const cat = cats[Math.floor(Math.random() * cats.length)];
  let pool = WORD_BANK[cat].filter(w => !usedWords.includes(w.word));
  if (pool.length === 0) pool = WORD_BANK[cat]; // 词库用完则重置
  const entry = pool[Math.floor(Math.random() * pool.length)];
  return { word: entry.word, synonyms: entry.synonyms, category: cat };
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

module.exports = { WORD_BANK, getRandomWord, checkAnswer };
