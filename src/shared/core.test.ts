import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildShuffledSubtextOptions,
  isCorrectGuess,
  strokesToStaticSvg,
  validateStrokes,
} from './drawing'
import { scanPii, scanPiiFields } from './pii'
import {
  buildAgentSyncReport,
  evaluateDirection,
  passesAgentMatchGate,
  shuffleQuestionOptions,
} from './quiz'
import type { StoredQuestion } from './types'

describe('PII boundary scanner', () => {
  test('blocks emails, phones, international/spaced/fullwidth numbers, bare domains, QQ, and social handles', () => {
    const blocked = [
      '联系我 alice@example.com',
      'email luna[at]gmail.com',
      '电话 13800138000',
      '电话 138 0013 8000',
      '电话 +8613800138000',
      '电话 138\u200b0013\u200b8000',
      '座机 010-88886666',
      '座机 010 88886666',
      '座机 010-8888-6666',
      '手机 １３８００１３８０００',
      'whatsapp +447911123456',
      'call +1 415-555-0199',
      'text 415-555-0199',
      'text me 4155552671',
      'call (415) 555-0199',
      'phone 415 555 0199',
      'ssn 123-45-6789',
      '主页 https://example.org/me',
      '看看我的站点 kindred.dev/profile',
      'visit www.foo.club',
      'read lunamoon.substack.com',
      'link linktr.ee/alicewonder',
      'short bit.ly/3abcXYZ',
      '频道 t.me/alice/',
      '身份证 110101199001011234',
      '加我微信：my_handle_99',
      '我的微信是alicewonder',
      '我微信是alice_99',
      '我微信是alicewonder',
      '微信alice_99',
      '我微信alice_99',
      '我微信叫alice_99',
      '微信叫alice_99',
      '我微信是 alice-chen',
      '微信号"luna_99"',
      '微信号“luna_99”',
      '微信号：“luna_99” 来聊这题',
      '微信号：`luna_99`',
      '微信号：**luna_99**',
      '微信号：mia_chen',
      '我的微信是 mingming_99',
      'my wechat is mike_2024',
      'telegram: michelle_99',
      '微信号：min_01',
      '微信号：esther_99',
      '微信号：nova_99',
      '微信号：pixel_art99',
      '微信号：claude_fan99',
      '微信号：web_dev99',
      '微信号：ps_player99',
      '微信号：sora99',
      '我的 Discord 名是 halo99',
      '微信号：nova99',
      '微信号：top520',
      '微信号-lunachen',
      '微信号 - lunachen',
      '微信号/lunachen',
      '微信->luna_99',
      '加我->luna_99',
      '我的V alice_99',
      '我v alice_99',
      '本人v alice_99',
      '我的 X luna_99',
      '加我微信，lunachen',
      '加我V，lunachen',
      '+V，lunachen',
      '我的游戏账号是 luna_99',
      '游戏账号：luna_99',
      'my roblox name is luna_99',
      'WeChatID：alice_99',
      'SteamID: luna_99',
      'my wechatID is alice_99',
      'WeChatID：lunachen',
      'ins号：luna_99',
      'ins账号 luna_99',
      'tg号：luna_99',
      'Steam用户名 luna_99',
      'Steam账号luna_99',
      'GitHub账号luna_dev',
      'Steam用户名luna_99',
      'ins号：lunachen',
      'ins号：lunachen，有空聊聊',
      'Instagram账号是 lunachen，微信同号',
      'ins号是lunachen哦',
      'ins号：lunachen（常用）',
      'tg号 luna99',
      'ins账号 luna99',
      'ins账号luna99',
      'Discord账号 luna99',
      'Telegram用户名 luna99',
      'ins: _luna / tg: luna_',
      '加我微信：_lunachen_',
      '我的微信号是 _lunachen_',
      'username: _lunamoon_',
      'handle: lunamoon',
      'Bio, handle: lunamoon',
      'Social handle: luna_99',
      'Online handle: luna_99',
      'Gaming handle: luna_99',
      'Main handle: luna_99',
      'Her handle: luna_99',
      'The handle: luna_99',
      'Bio handle: luna_99',
      'Fav handle: luna_99',
      'I go by handle: luna_99',
      'Contact — handle: luna_99',
      'Contact - handle: luna_99',
      'social handle: lunamoon',
      'His handle: lunamoon',
      'Usual handle: lunamoon',
      'Find me — handle: lunamoon',
      '我的微信号是 lunachen 还是老号',
      '我微信是lunachen还是那个',
      '微信号：lunachen 还是原来的',
      '加我微信 lunachen 还是老规矩',
      '@_luna_moon',
      'ig: _luna_moon',
      '我的ins是 _luna_moon',
      '加我微信：_luna99',
      '微信：nova520',
      'wx: nova520',
      'telegram: nova520',
      'ig: halo123',
      'my wechat id is claude99',
      '微信号->luna_99',
      '微信号➡️luna_99',
      '微信号👉🏻luna_99',
      '微信〈luna_99〉',
      '微信<luna_99>',
      '微信号码是luna_99',
      '微信👉luna_99',
      '账号：luna_99',
      '我的用户名是 luna_99',
      'username: luna_99',
      'my discord name is luna_99',
      '我的博客 lunamoon.com',
      '我博客 lunamoon.com',
      '我网站：lunamoon.com',
      '主页：lunamoon.me',
      'website: lunamoon.com',
      'blog: lunamoon.com',
      '我的博客是 lunamoon.com',
      '我的博客地址：lunamoon.com',
      '个人主页：lunamoon.me',
      'my site is blog.lunamoon.com',
      '加我 luna_99',
      '加我luna_99',
      '找我 luna_99',
      '关注我luna_99',
      '联系我 luna_99',
      '私信我 luna_99',
      'dd我 luna_99',
      '加我 luna.chen',
      'GitHub luna_dev',
      'reddit luna_99',
      'I’m luna_99 on telegram',
      'it’s luna_99 on discord',
      '微信：「luna_99」',
      '微信搜「luna_99」',
      '微信（luna_99）',
      '微信，luna_99',
      '微信名是luna_99',
      '微信同号 luna_99',
      '+V luna_99',
      '加我：luna_99',
      '加我“luna_99”',
      '关注我：luna_99',
      '我的账号是 luna_99',
      '加微信 lunachen',
      '加微信“lunachen”',
      '加微信 lunachen 日常聊',
      'QQ：“123456789”',
      'my wechat is “luna_99”',
      '加vx lunachen',
      '微信号lunachen',
      '小红书号：123456789',
      'wx号alice_99',
      '有空加我v：alice_99',
      '我的ins是alice_99',
      '我的Discord是alice_99',
      '我的telegram是alice_99',
      '我的steam是luna_99',
      '推特：alice_99',
      'v：alice_99',
      'X: alice_99',
      'V信：alice_99',
      '微信搜 alice_99',
      '小红书搜alice_99',
      '我的微信号是kindred_99',
      '加微信号:kindred_99',
      '加微信 kindred_99',
      '加个微信吧 kindred99',
      '加我微信kindred_99',
      '加v：kindred99',
      '加V kindred99',
      'B站：kindred_99',
      'B站：alice99。平时爱看电影',
      'B站：alice99 互关',
      '小红书：alice99 欢迎关注',
      '抖音：alice99 记得关注',
      'B站：alice99，欢迎关注',
      'B站：alice99 私信我聊这题',
      'B站：alice99，欢迎私信聊电影',
      'B站：alice99 和我聊聊',
      'weixin: kindred99',
      'wx: my_id_01',
      'wx kindred_99',
      'my wechat id is lunachen',
      'my wechat id is lunachen please',
      'my wechat: lunachen',
      'my wechat is "luna_99"',
      'telegram: "luna_99"',
      'my username is luna_99',
      'my handle is luna_99',
      'my steam is luna_99',
      'my twitch is luna_99',
      'my telegram is alice_99',
      'my ig is alice_99',
      'my facebook is alice.wonder',
      'my snap is alice_99',
      'my letterboxd is alice_99',
      'find me on telegram as alice_99',
      'find me on twitter as quiet-river',
      'add me: alice_99',
      'dm me luna_99',
      'dm me on X luna_99',
      'dm me at quiet_river',
      'I am luna_99 on discord',
      'follow luna_99 on insta',
      'hmu luna_99',
      'follow me at night_owl',
      'find me at luna.moon',
      'text me at alice_99 please',
      'follow me on X: alice_99',
      'insta: alice_99',
      'Discord alice#1234',
      'LINE: alice99',
      'line id alice_99',
      '小红书: kind_99',
      'QQ 123456789',
      'QQ群 123456789',
      'Q群 123456789',
      '加Q 123456789',
      'find me @kindred_qa_99',
      'tg: @kindred_bot',
      'ins: quiet_reader',
    ]
    for (const sample of blocked) {
      assert.equal(scanPii(sample).clean, false, `Expected PII block on: ${sample}`)
    }
  })

  test('allows ordinary Chinese and English tastes without false positives on time, scores, units, media, or separate fields', () => {
    const allowed = [
      '挑一款新的洗发水时，先翻背面逐项查配方成分表，避开硅油和植物油。',
      '睡前刷小红书看露营攻略，但从不发帖。',
      '睡前会刷小红书 vlog 吗？',
      '买手机先看小红书 iPhone16 实拍吗？',
      '买手机前先去小红书搜 iPhone16 测评',
      'B站搜 GPT5 教程',
      '豆瓣搜 Top250',
      '我的豆瓣 Top250 还差几部',
      '我的 Steam GTA5 存档',
      '加微信、Telegram 还是 Discord？',
      '第一次见面会加微信、Instagram 还是不加？',
      '微信、itch.io 还是 Steam？',
      '游戏账号：GTA5 和 CS2',
      'my phone name is iPhone16',
      'Would you share your WeChat ID before a first date?',
      'Do you share your LINE ID easily?',
      'My Discord ID reflects my mood',
      '你的ins账号 follow 最多的是哪类博主？',
      'Instagram账号 public 还是 private',
      'Instagram账号是 private 吗',
      'Instagram账号是 private？',
      '我的 Instagram 账号是 private',
      'ins账号：private',
      'ins用户名：realname 还是 nickname？',
      '你的ins账号是 creator 账号还是个人账号？',
      'Instagram账号是 business 账号吗',
      'Twitter账号是 protected 的吗',
      'Instagram账号是 suspended 了',
      'ins账号是 archived 状态',
      'Instagram账号是 abandoned 的',
      'Discord 用户名是 gamertag 风格吗',
      'Things I can\'t handle: spiders',
      'What I can\'t handle: snoring',
      'Food I can\'t handle: cilantro',
      'How do you handle: conflict?',
      'How do you handle: error_404?',
      'Discord账号 Level50 以上',
      'ins账号 The1975 更新最勤',
      'Letterboxd: _Past Lives_ five stars',
      'Letterboxd: _Eternal Sunshine of the Spotless Mind_ five stars',
      'Letterboxd: _Star Wars: A New Hope_ five stars',
      'Letterboxd: _Spider-Man: Across the Spider-Verse_ five stars',
      'Goodreads: _Dune: Part Two_ was great',
      'Spotify: _Folklore / Evermore_ on repeat',
      'Letterboxd: _Mission: Impossible_ marathon',
      'Steam: _Hades II: Early Access_ 100 hours',
      'Letterboxd: _Before Sunrise / Before Sunset_ double bill',
      'Please text me at _midnight_.',
      'My Instagram is _mostly_ cats.',
      'My Instagram is __mostly__ cats.',
      '微信 _Moments_ 很少发',
      'Steam账号 Level50 以上',
      'PSN账号 PS5Pro',
      'Steam号 EldenRing2',
      'Spotify账号 The1975 播放最多',
      'Steam 账号 Hades2 通关',
      '买独立游戏去 Steam、itch.io 还是 Epic？',
      'Spotify R.E.M. on repeat',
      'Spotify will.i.am 的歌',
      '闲鱼 iPhone13 二手捡漏。',
      '我的B站是lofi歌单',
      'Booking.com 还是携程？',
      '豆瓣 8.5分以上才看',
      'B站 1.5倍速看完',
      '抖音 15s 短视频',
      '小红书 Y2K穿搭',
      '微信 24h 不回',
      '知乎 10w+ 高赞',
      'itch.io 上的独立游戏',
      'Mr.Robot/Severance 都是我反复刷的剧',
      '小红书：ootd 穿搭灵感',
      '小红书：citywalk 路线',
      '周末拍一条抖音vlog记录城市散步。',
      '喜欢看抖音 1080p 航拍视频。',
      '抖音 Top100 歌单单曲循环。',
      '豆瓣Top250 里最常重看的一部电影。',
      '微博：Taylor Swift 热搜讨论。',
      '微信2024年度报告里全是深夜群聊。',
      '微信 2024年度报告里全是深夜群聊。',
      '每天微信 10000 步打卡。',
      'My bedtime is 2am',
      'Who can text me at 2am?',
      'My sleep is 7.5 hours',
      'My style is Y2K',
      'wechat: stickers',
      'Discord: hangouts',
      'Discord v2.1 更新后界面清爽了不少',
      'B站 GPT-5 测评看了一堆',
      '一样！我也刷 B站 GPT-5 测评',
      '知乎 deepseek-r1 部署教程',
      '闲鱼 A7M4 二手',
      'B站 python3 入门课',
      '贴吧 dota2 老哥',
      '知乎 web3 话题',
      '豆瓣 vol.3 书单',
      '我的 AI 是 gpt-5',
      '微信：always muted',
      '微信=WeChat',
      'Find me on Sundays at Costco',
      'dm me on Discord at midnight',
      'find me: library',
      'add me as friend',
      'My username is embarrassing',
      'My id is expired',
      'My handle is broken on my suitcase',
      'Steam GTA5 打折会不会再入一份',
      'I still boot up Xbox Halo3 with my brother',
      'My Spotify is blink-182 and Sum41',
      'B站：Sora2 测评',
      'B站：Zen5 超频',
      'B站：Zen5 3D 渲染测试',
      'B站：Zen5 和 Zen4 渲染对比',
      'B站：Zen5 和 Zen4 在 Blender 4.2 渲染对比',
      'B站：Zen5 和 Zen4 的 Blender 4.2 渲染对比，重点关注功耗',
      '知乎：Ryzen9 CPU 选购',
      '知乎：Ryzen9 和 Ryzen7 怎么选',
      '知乎：Ryzen9 和 Ryzen7 的 IPC',
      '知乎：Ryzen9 和 Ryzen7，聊聊它们的 IPC 差异',
      'B站：Windows11 的本地账号怎么设置',
      'B站：x86_64 和 ARM64 哪个更省电？',
      'B站：user_id != owner_id 这个条件是什么意思？',
      'B站：a_1 !== b_2 和 != 有什么区别？',
      'B站：user_1?.name 为什么是 undefined？',
      'B站：x_1 ? y_1 : z_1 三元表达式怎么读？',
      '知乎：ChatGPT4 和我聊数学时，为什么会算错？',
      '知乎：Ryzen9 和 Ryzen7 在 Windows 11 游戏实测',
      '我在书单上记了三本书的页数：\n320\n416\n1024',
      '我在书单上记了三本书的页数：\r320\r416\r1024',
      '我在书单上记了三本书的页数：\u2028320\u2028416\u20281024',
      '我在书单上记了三本书的页数：\u2029320\u2029416\u20291024',
      '抖音：Model3 续航',
      '小红书：Labubu3.0 开箱',
      '小红书：Labubu3.0 DIY 改造',
      '平时常用 GitHub\nsnake_case 是命名风格',
      '平时常用 GitHub\rsnake_case 是命名风格',
      '平时常用 GitHub\u2028snake_case 是命名风格',
      '平时常用 GitHub\u2029snake_case 是命名风格',
      '睡前不刷微信\nnotes_2024 是笔记标题',
      '睡前不刷微信\rnotes_2024 是笔记标题',
      '睡前不刷微信\u2028notes_2024 是笔记标题',
      '睡前不刷微信\u2029notes_2024 是笔记标题',
      'find me on Xbox360',
      'my go-to site is Booking.com',
      '订酒店网站 Booking.com 还是 Agoda.com',
      '最爱逛的网站 itch.io',
      '我的网站是 asp.net 写的',
      '周末找我 GTA5 开黑',
      'B站看 stand-up 脱口秀切片',
      '我的 API v2.1 文档还在整理',
      'dev: build_2 passed locally',
      'my car is model_3',
      'Do you miss Twitter 2012 vibes?',
      'Twitter 280 characters limit felt crisp.',
      'Instagram: never',
      'Instagram: scrolling before bed',
      'My Instagram is mostly cats.',
      'My Instagram is boring.',
      'My Instagram is empty.',
      'my wechat is full of work groups',
      'Find me at home on weekends.',
      'Please text me at midnight.',
      'You will find me on vacation in October.',
      'Prefer Node.js/TypeScript or Vue.js/Nuxt?',
      'Is your Instagram account private?',
      'Do you have a Discord account yet?',
      'Do you love xhs recipes?',
      'I prefer ASP.NET over legacy scripts.',
      'Walking 200 300 4000 steps after dinner.',
      'I would rather read instead of sleeping early.',
      'Revenge insomnia and midnight playlists.',
      'Instant click when someone shares quiet insight.',
      'Inspired by trains in the rain and late-night vitamins.',
      'Mortgages, insurance, and scrolling Instagram before bed.',
      'Waiting in line for coffee when phone signal: weak.',
    ]
    for (const sample of allowed) {
      assert.equal(scanPii(sample).clean, true, `Unexpected PII false positive on: ${sample}`)
    }
    assert.equal(scanPiiFields(['聊天工具', '平时最常用哪个？', '微信', 'Telegram', 'Discord', '短信']).clean, true)
  })
})

describe('Option shuffling and paired matching gate', () => {
  test('remaps ownerChoice and agentPredicted to the exact same option text after shuffle', () => {
    const original = {
      A: '放卧室外面',
      B: '放床头柜静音',
      C: '放枕边刷手机',
      D: '塞进包里',
    }
    const shuffled = shuffleQuestionOptions(original, 'A', 'B', () => 0.37)
    assert.equal(shuffled.options[shuffled.ownerChoice], '放卧室外面')
    assert.equal(shuffled.options[shuffled.agentPredicted], '放床头柜静音')
    assert.equal(new Set(Object.values(shuffled.options)).size, 4)
  })

  test('rejects high-abstention lucky guesses under paired coverage and hit-rate gate', () => {
    const questions: StoredQuestion[] = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `q_${n}`,
      position: n,
      dimension: '习惯',
      prompt: `Q${n}`,
      options: { A: '1', B: '2', C: '3', D: '4' },
      ownerChoice: 'A',
      agentPredicted: 'A',
      confidence: 'high',
      starred: false,
    }))

    const highAbstain = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'U' },
      { questionId: 'q_3', choice: 'U' },
      { questionId: 'q_4', choice: 'U' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const lowCoverage = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'U' },
      { questionId: 'q_4', choice: 'U' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const lowHitRate = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'B' },
      { questionId: 'q_4', choice: 'B' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const goodPartner = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'A' },
      { questionId: 'q_4', choice: 'B' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])

    assert.equal(highAbstain.hitRate, 1)
    assert.equal(passesAgentMatchGate(highAbstain, goodPartner), false)
    assert.equal(lowCoverage.answered, 2)
    assert.equal(lowCoverage.hitRate, 1)
    assert.equal(passesAgentMatchGate(lowCoverage, goodPartner), false)
    assert.equal(lowHitRate.coverage >= 0.5, true)
    assert.equal(lowHitRate.hitRate, 0.5)
    assert.equal(passesAgentMatchGate(lowHitRate, goodPartner), false)
    assert.equal(passesAgentMatchGate(goodPartner, goodPartner), true)
  })

  test('builds Human-to-Own-Agent sync report excluding U abstentions and listing mismatches', () => {
    const questions: StoredQuestion[] = [
      {
        id: 'q_1',
        position: 1,
        dimension: '习惯',
        prompt: '夜宵怎么选？',
        options: { A: '煮面', B: '便利店', C: '烧烤', D: '不吃' },
        ownerChoice: 'B',
        agentPredicted: 'B',
        confidence: 'high',
        starred: false,
      },
      {
        id: 'q_2',
        position: 2,
        dimension: '审美',
        prompt: '听老歌怎么听？',
        options: { A: '转发', B: '单曲循环', C: '当背景', D: '挖乐评' },
        ownerChoice: 'D',
        agentPredicted: 'D',
        confidence: 'medium',
        starred: false,
      },
      {
        id: 'q_3',
        position: 3,
        dimension: '决策',
        prompt: '工具变复杂怎么办？',
        options: { A: '换更简的', B: '忍着用', C: '看教程', D: '自己写' },
        ownerChoice: 'A',
        agentPredicted: 'A',
        confidence: 'high',
        starred: true,
      },
    ]

    const report = buildAgentSyncReport(
      questions,
      [
        { questionId: 'q_1', choice: 'B' },
        { questionId: 'q_2', choice: 'D' },
        { questionId: 'q_3', choice: 'A' },
      ],
      [
        { questionId: 'q_1', choice: 'A' },
        { questionId: 'q_2', choice: 'U' },
        { questionId: 'q_3', choice: 'A' },
      ],
    )

    assert.equal(report.comparableCount, 2)
    assert.equal(report.abstainedCount, 1)
    assert.equal(report.matchedCount, 1)
    assert.equal(report.syncRate, 0.5)
    assert.equal(report.mismatches.length, 1)
    assert.equal(report.mismatches[0]?.questionId, 'q_1')
    assert.ok(report.calibrationNote?.includes('便利店'))
    assert.ok(report.calibrationNote?.includes('主人的真实选择'))
    assert.equal(report.calibrationNote?.includes('与你的真实选择'), false)

    const enQuestions: StoredQuestion[] = [
      {
        id: 'eq_1',
        position: 1,
        dimension: 'Habits',
        prompt: 'Late-night snack choice?',
        options: { A: 'Ramen', B: 'Tea', C: 'Toast', D: 'Nothing' },
        ownerChoice: 'B',
        agentPredicted: 'B',
        confidence: 'high',
        starred: false,
      },
    ]
    const enReport = buildAgentSyncReport(
      enQuestions,
      [{ questionId: 'eq_1', choice: 'B' }],
      [{ questionId: 'eq_1', choice: 'A' }],
    )
    assert.ok(enReport.calibrationNote)
    assert.equal(/[\u4e00-\u9fff]/.test(enReport.calibrationNote), false)
    assert.ok(enReport.calibrationNote.includes('Tea'))
  })
})

describe('Static SVG drawing compiler and guess matching', () => {
  test('validates bounds and compiles sanitized static SVG with zero script or text tags', () => {
    const bad = validateStrokes([{ color: '#000000', width: 4, points: [[10, 10]] }])
    assert.equal(bad.ok, false)

    const good = validateStrokes([
      { color: 'javascript:alert(1)', width: 99, points: [[-50, 500], [200, 180]] },
    ])
    assert.equal(good.ok, true)
    if (good.ok) {
      assert.equal(good.strokes[0]?.color, '#1F1D1A')
      assert.equal(good.strokes[0]?.width, 24)
      assert.deepEqual(good.strokes[0]?.points[0], [0, 400])

      const svg = strokesToStaticSvg(good.strokes)
      assert.ok(svg.startsWith('<svg '))
      assert.ok(svg.includes('<polyline '))
      assert.equal(svg.includes('<script'), false)
      assert.equal(svg.includes('<text'), false)
    }
  })

  test('shuffles 1 true subtext with 3 surface literal decoys into varying keys while preserving all texts', () => {
    const trueSubtext = '舍不得今天结束的报复性熬夜'
    const decoys = ['半夜还在赶方案加班', '忘了关电脑就睡着了', '晚上喝太多茶失眠了'] as const

    const first = buildShuffledSubtextOptions(trueSubtext, decoys, () => 0)
    const second = buildShuffledSubtextOptions(trueSubtext, decoys, () => 0.99)

    assert.equal(first.options[first.correctOption], trueSubtext)
    assert.equal(second.options[second.correctOption], trueSubtext)
    assert.notEqual(first.correctOption, second.correctOption)

    for (const result of [first, second]) {
      const values = new Set(Object.values(result.options))
      assert.equal(values.size, 4)
      assert.ok(values.has(trueSubtext))
      for (const decoy of decoys) {
        assert.ok(values.has(decoy))
      }
    }
  })

  test('matches normalized Chinese and English guesses', () => {
    assert.equal(isCorrectGuess('湘北平交道的那个夏天', '  湘北平交道的那个夏天！ '), true)
    assert.equal(isCorrectGuess('舍不得今天结束的报复性熬夜', '舍不得今天结束的报复性熬夜'), true)
    assert.equal(isCorrectGuess('湘北平交道的那个夏天', '夏天'), false)
  })
})
