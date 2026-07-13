/**
 * 服务端计分模块
 *
 * 猜对玩家：基础 100 分 + 时间奖励(越早猜对越多) + 顺序奖励(第一个猜对额外加分)
 * 画家：每有一人猜对得 25 分 + 全员猜对额外奖励
 */

const ROUND_TIME = 60;

/**
 * 计算猜对玩家的得分
 * @param {number} timeLeft     剩余秒数
 * @param {number} guessOrder   第几个猜对（从 1 开始）
 * @param {number} totalGuessers 总猜词人数
 */
function calculateGuesserScore(timeLeft, guessOrder, totalGuessers) {
  const timeBonus = Math.floor((timeLeft / ROUND_TIME) * 50);
  const orderBonus = Math.max(0, (totalGuessers - guessOrder + 1) * 10);
  return 100 + timeBonus + orderBonus;
}

/**
 * 计算画家的得分
 * @param {number} correctCount  猜对人数
 * @param {number} totalGuessers 总猜词人数
 */
function calculateDrawerScore(correctCount, totalGuessers) {
  if (correctCount === 0) return 0;
  const base = correctCount * 25;
  const allCorrectBonus = (correctCount >= totalGuessers) ? 50 : 0;
  return base + allCorrectBonus;
}

module.exports = { calculateGuesserScore, calculateDrawerScore };
