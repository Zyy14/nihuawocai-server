/**
 * 微信内容安全模块
 * 封装 access_token 获取、code2session 换取 openid、msgSecCheck 文字检测。
 *
 * 依赖环境变量（在 Render 后台 Environment 配置，代码不硬编码密钥）：
 *   WX_APPID  —— 小程序 AppID
 *   WX_SECRET —— 小程序 AppSecret
 *
 * 若未配置环境变量（如本地开发 / 未接入阶段），检测将自动放行（返回通过），
 * 不阻断游戏联机功能；上线提审前在 Render 配置好即可自动生效。
 */

const https = require('https');

const APPID = process.env.WX_APPID || '';
const SECRET = process.env.WX_SECRET || '';

/** 是否已具备调用条件 */
function isConfigured() {
  return !!(APPID && SECRET);
}

/* ---------- 底层 HTTP ---------- */
function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ---------- access_token（缓存，有效期 7200s，提前 5 分钟刷新） ---------- */
let _token = '';
let _tokenExpireAt = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpireAt) return _token;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`;
  const data = await getJSON(url);
  if (!data.access_token) {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(data));
  }
  _token = data.access_token;
  _tokenExpireAt = Date.now() + (data.expires_in - 300) * 1000;
  return _token;
}

/* ---------- code2session：用 wx.login 的 code 换 openid ---------- */
async function code2Session(jsCode) {
  if (!isConfigured() || !jsCode) return { openid: '' };
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${jsCode}&grant_type=authorization_code`;
    const data = await getJSON(url);
    return { openid: data.openid || '', errcode: data.errcode, errmsg: data.errmsg };
  } catch (e) {
    console.error('[wxSecurity] code2Session 异常', e && e.message);
    return { openid: '' };
  }
}

/* ---------- msgSecCheck：文字内容安全检测 ---------- */
/**
 * @returns {Promise<boolean>} true=通过（合规），false=拦截（违规）
 * 说明：未配置密钥、或接口异常时默认放行，避免误伤正常玩家；
 *       审核演示期若要严格拦截，可把异常分支改为 return false。
 */
async function msgSecCheck(content, openid) {
  if (!isConfigured()) return true;        // 未接入阶段：放行
  if (!content) return true;               // 空内容：放行
  if (!openid) return true;                // 无 openid（未登录）：放行，避免阻断
  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    const res = await postJSON(url, {
      version: 2,
      openid,
      scene: 1,          // 1=资料(昵称) 2=评论 3=论坛 4=社交日志
      content: String(content).slice(0, 2500)
    });
    // errcode 0 且 suggest === 'pass' 视为通过
    return res.errcode === 0 && res.result && res.result.suggest === 'pass';
  } catch (e) {
    console.error('[wxSecurity] msgSecCheck 异常', e && e.message);
    return true; // 异常放行
  }
}

module.exports = { isConfigured, code2Session, msgSecCheck };
