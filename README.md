# companion-pet 陪伴小猫

DSH Web 界面内的浏览器端陪伴宠物插件 v0.1。

## 特性（全部本地规则，零 token 消耗）

- **整页背景**：使用你提供的 `背景.png` / `背景_晚上.png`（2048×1152），按本地时间自动切换（6:00–18:59 白天版，其余晚上版）
- **幕布 + 实底双层**：body 上叠一层均匀半透明幕布让场景透出（默认 0.46），同时所有 DSH 表面（对话区、工作区、侧边栏）带半透明深色底（默认 0.62）——**背景真实可见，文字代码清晰可读**，无接缝无割裂
- **焦点实底**：输入框卡片（0.92）、代码块（0.9）、消息气泡（0.78）最实，保证输入/代码/正文完全可读
- **无蒙条**：会话列表底部渐变条、输入区渐变 Seat 均已移除，小猫与背景融为一体
- **个性化设置**：**双击小猫**打开设置面板——背景开关、幕布/实底强度（更通透/适中/更清晰）、昼夜自动切换，设置存 localStorage 自动保存
- **显示**：右下角悬浮透明 GIF 小猫（`assets/idle.gif`，剪映导出的真透明动画）
- **待机**：自动循环呼吸动画
- **点击互动**：单击小猫弹出随机气泡（喵~ / 摸摸我嘛~）
- **深夜提醒**：23:00–5:00 检测到活跃时提醒休息，**每天最多一次**（localStorage 记录，不打扰）
- **输入情绪检测**：正则匹配输入框中的烦躁词/开心词，弹出安慰/分享气泡（带 8 秒冷却，不刷屏）

## 原理：为什么零 token

插件分两半：

| 半 | 文件 | 职责 | token |
|---|---|---|---|
| node 半 | `lib/index.js` | 注册 `/companion-pet/assets` 静态路由 serve GIF | 不调用 LLM |
| browser 半 | `lib/client.js` | 小猫 UI + 全部交互逻辑，在**你的浏览器**里运行 | 不调用 LLM |

所有行为（时间判断、正则、点击事件、localStorage）都在浏览器本地完成，**完全不经过模型请求**。只有未来加"智能对话"功能才会按需消耗 token。

## 结构

```
companion-pet/
├── package.json          # dsh.client 声明（platform: web）
├── assets/
│   ├── idle.gif          # 待机呼吸透明动画（剪映导出）
│   ├── background-day.png    # 白天整页背景
│   └── background-night.png  # 晚上整页背景
└── lib/
    ├── index.js          # node 半：静态路由
    └── client.js         # 浏览器半：小猫本体 + 整页背景
```

## 装配

`$DSH_HOME\profiles\web\cordis.patch.yml` 已加入：

```yaml
- insert:
    - id: companion-pet
      name: companion-pet
```

`profiles\web\node_modules\companion-pet` 是 junction，指向 `D:\hy\DeepLearning\DS\companion-pet`（开发时直接改源码即可，无需重新安装）。

## 生效

重启 dsh web 后，浏览器端会：

1. 通过 `/plugins/companion-pet/client.js` 加载浏览器插件
2. 通过 `/companion-pet/assets/idle.gif` 加载动画

## 后续路线

- [ ] 更多动作（开心跳、打盹、惊吓等）与动作状态机
- [ ] 可拖动、缩放
- [ ] 记忆（昵称、偏好，localStorage）
- [ ] 可选智能模式（按需 LLM）
- [ ] 多宠物
