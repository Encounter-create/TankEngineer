# DEVLOG #6 — 2026-07-09

## 本阶段进展

自 DEVLOG #5（架构优化三步复盘）以来：

| 类别 | 内容 |
|------|------|
| 🏗️ 架构 | 第二次重构——CombatSystem+SkillEntities+SkillRegistry通用化，BattleUI共享 |
| 👑 新模式 | 双王战争——横版对称3路PvE，从零到核心可玩 |
| 🐛 修复 | CC碰撞实体化、技能特效补全、火圈清理、玩家复活等20+bug |
| 📐 设计 | 航线导航系统、远程AI分层索敌、水面波浪特效 |

---

## 详细开发历程

### 一、第二次架构重构

**起因**：开发双王模式时发现 TwoKings 不断从 Siege.ts 导入函数（`handleSkillActivation`/`handleAllies`/`handleBullets` 等），违反模式解耦原则。同时 `moveTank()` 硬编码的指挥所碰撞在双王中桥造成隐形墙。

**阶段 1 — CC 碰撞实体化**：
`Physics.ts` 中 `moveTank()` 的 `skipCC: boolean` → `structures?: SolidStructure[]`。每个模式自声明不可通过区域。Siege 传 CC，TwoKings 传基地，Practice 传空。`handleBullets` 和 `handlePhysicsBlocks` 同步参数化。BattleEngine 删除 `skipCC` 字段。

**阶段 2 — SkillRegistry 扩展**：
`handleSkillActivation` 从 Siege.ts 搬入 SkillRegistry.ts（+190行）。删除 Siege.ts 本地定义（-132行）。Practice 和 TwoKings 改为从 SkillRegistry 导入。

**阶段 3 — CombatSystem 建立**：
创建 `src/systems/CombatSystem.ts`，从 Siege.ts 搬入 `handleBullets`/`handlePhysicsBlocks`/`handleBulletTankCollisions`/`explodeRocket`。`onEnemyKilled` → `onKill` 回调参数化。`endSiege` 从 `handleBulletTankCollisions` 中移除——玩家死亡检测提升到各模式外层。

**阶段 4 — SkillEntities 独立**：
用户指出 `handleAllies`/`handleTurrets`/`handleClones`/`handlePlanes` 属于技能实体行为，不应放在 CombatSystem（物理层）。创建 `src/systems/SkillEntities.ts`，四个函数搬入。

**阶段 5 — BattleUI 共享**：
从 Renderer.ts 提取齿轮按钮/暂停遮罩/退出为 `src/ui/BattleUI.ts`。U-key debug toggle 移入 BattleEngine。这两个功能从此被所有模式共用。

**最终架构**：
```
通用层: CombatSystem(物理)+SkillEntities(实体AI)+SkillRegistry(技能触发)
       +skills/*.ts(14技能)+EffectRenderer(特效调度)
       +BattleEngine(更新管线)+BattleUI(对战UI)+Physics(底层碰撞)
模式层: Siege.ts / TwoKings.ts / Chess.ts
```

TwoKings.ts 零 Siege 导入。未来新模式安装清单：7个通用import+自己的AI/规则/Renderer。

### 二、双王战争模式开发

**地图**：30×22，中轴2列河流（蓝色EMPTS+SolidStructure硬墙+Noah式波浪特效），3座3格宽木板桥。蓝红各1基地+3防御塔，塔悬浮可穿过（远程攻击），基地保留碰撞。

**出兵**：开局立即出兵（t=0），10s一波，每波3路各1辆坦克，随机零件组装（randomBarrel+randomTurret+randomChassis）。

**AI系统**：整个双王开发中最艰难的部分，经历十次迭代：

| 版本 | 尝试 | 问题 | 根因 |
|------|------|------|------|
| v1 | `navigateToward()` 直接设vel | "飘来飘去" | `moveTank` 加速度惯性+方向突变→弧线漂移 |
| v2 | `updateAI()` 巡逻状态机 | 随机游走不沿航线 | `updateAI` 把目标当"玩家"，距离>视野→PATROL |
| v3 | `moveDir.norm()` 直指目标 | "螃蟹走"横着飘 | 每帧方向连续变化→身体角加速度追不上 |
| v4 | `updateAI`+`ctx.targetPos` | 追航点像追玩家 | CHASE模式激活→冲向航点再随机游走 |
| v5 | 漂移消除 `vel.dot()` | "飞一样快" | 杀垂直分量→无摩擦减速→永远满速 |
| v6 | 网格四方向 DIR4 | 多次迭代才收敛 | 四方向钝感但身体有时间旋转 |
| v7 | 目标锁定 `_lockId` | 全打同一座塔 | 索敌用 `towers.find()` 不区分路线 |
| v8 | `towers[lane]` 每路打自己塔 | 塔灭后贴脸基地 | 基地不在索敌列表→无目标→沿航点走到基地位置 |
| v9 | 基地加入索敌 | 边界不开火 | 停止距离 `fireR+20` > 开火判定 `fireR` |
| v10 | `fireR-10`停止+`fireR*0.5`后退 | ✅ 最终方案 | 复刻 Siege `doFire` 保持距离 |

**最终 AI 架构**：
```
aiTargetAndMove() — 统一蓝红双方
├── 锁: _lockId → 目标死/出视野→解锁→按优先级重选
├── 索敌: 敌军>玩家>本路塔>残余塔>基地
├── 移动: dist<fireR*0.5→后退, dist>fireR-10→追击, 中间→原地射击
├── 方向: 网格四方向(==Siege doChase)
├── 速度: Siege钳制 if(vel>maxSpd) vel=vel.norm()*maxSpd
└── 开火: shouldFire+cooldown递减
```

**航线可视化**：3条白色虚线双向绘制（蓝→红+红→蓝），蓝方从基地扇形直连塔→桥→敌塔→敌基，红方逆序同线。出生点关于河中线(x=464)对称：蓝(80,368)红(848,368)各距河384px。

**其他功能**：
- 基地回血：玩家100px内8HP/s+绿粒子+绿虚线圈（仅进入显示）
- 玩家死亡复活（非游戏结束）
- 14技能全部可用（update函数调用+EffectRenderer渲染）
- 火圈更新清理（火箭武器）
- U键debug：AI双圈(射程红+视野蓝)+塔/基地范围

---

## 关键踩坑记录

| 坑 | 后果 | 教训 |
|------|------|------|
| 搬 `handlePhysicsBlocks` 漏掉物块击杀文字 | BLOCK SMASH不显示 | 搬代码必须逐行对比，不做"顺便优化" |
| `ctx.fireCooldown` 递减忘加 | 全部AI哑火 | Siege中 `updateAI` 做这件事，没调它就漏了 |
| 蓝方出兵坦克推入 `state.allies` | 出兵坦克追踪玩家 | `blueTanks`≠`allies`，两个数组不同用途 |
| `RED_LANE_WAYPOINTS` 先reverse再镜像 | 红方出生在蓝方基地 | 逆序和镜像的顺序不可交换 |
| sed 删除代码从顶到底 | 行号错乱残留垃圾代码 | 删除多段必须从底到顶 |
| `drawQuantumCat` 写简化版 | 小猫丢失喵呜气泡等动画 | 搬移原版用git show逐行粘贴 |

---

## 经验教训

1. **搬代码黄金法则**：git提取原版→逐行粘贴→只改参数名→不做任何"顺便优化"。两次踩坑（物块文字、小猫）都因违反此规则。

2. **AI开发不要自己发明**：双王AI十次迭代中，前五次都是自己写简化版（direct velocity/drift cancel等），全失败。第六次直接用Siege的网格四方向+速度钳制+doFire保持距离，一次成功。

3. **索敌列表完整性**：AI不开火/贴脸等问题，根因都是索敌列表缺东西（忘加基地、忘加蓝方坦克碰撞列表、忘递减cooldown）。索敌必须完整覆盖所有可攻击实体。

4. **对称性从源头保证**：航线反复调整四五次，因航点/塔位/出生点不对称。最终方案：蓝方定义航线→红方=逆序→出生=河中线X镜像。一劳永逸。

5. **测试分支存档**：整个重构在 `refactor/combat-system-extraction` 分支完成。出问题 `git checkout master` 即恢复。这是第一次拆分事故后建立的安全机制。

---

## 待做任务

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🔴 | 叶公好龙外观重绘 | "像绿色大蛆"→萌龙重画 |
| 🔴 | 双王音效 | 塔攻击/基地受损/胜利失败提示音 |
| 🟡 | 双王波次递增强度 | 目前每波固定1辆，后期应增到2-3辆+更强零件 |
| 🟡 | 双王PvP | 两个玩家分别扮演蓝红方 |
| 🟡 | 塔摧毁粒子特效 | 塔爆裂动画+烟尘 |
| 🟡 | AI被挤出航线自动回归 | 目前被玩家推离后可能卡住 |
| 🟢 | 新文学技能 | 🗼通天塔/🏳️空城计/🔥长城烽火/📜浮士德/🚪罗生门 |
| 🟢 | 渲染层基类 | BattleRenderer.ts 提取网格/瓦片/坦克/子弹共用绘制 |
| 🟢 | 地图编辑器 | 拖拽TileGrid+PhysicsBlock |

---

## 当前项目整体评估

### 设计理念

游戏已演化出三重身份：
1. **几何物理对战**：零件组装→坦克方程约束→物理弹道战斗。这是骨架。
2. **文化表达**："典故优先于机制"——二向箔的诗句、木马的金光、陨石的"世界属于三体"。这是差异化灵魂。
3. **演出体验**：Canvas全屏特效+粒子系统+状态机动画。这是情感冲击。

### 核心玩法

**优势**：
- 49零件×4维度组合产生真实策略深度（非数值假深度）
- 9种弹道风格各有物理规则（非换皮）
- 14个车长技能全部是典故驱动（非"闪电链""火球术"模板）
- 双王模式为PvP打下基础（对称地图+出兵机制）

**问题**：
1. **经济系统形同虚设**：所有零件初始拥有+50000金币，无收集驱动
2. **零件决策深度扁平**：49个零件在4个独立维度上选择，维度间缺乏交叉影响（仅2组协同效应）
3. **围城模式缺乏叙事弧线**：3分钟6波，无Boss台词/地形变化/阶段性高潮
4. **音效系统缺失**：Sound.ts全是stub，纯视觉反馈
5. **无任何教程/引导**：新玩家打开不知道做什么

### 底层机制

**优势**：
- 物理引擎扎实：碰撞检测/弹性反弹/方块推动/惯性滑行
- 对战框架干净：CombatSystem+SkillEntities+SkillRegistry+EffectRenderer 四层解耦
- 技能系统完备：25技能 update+draw+EffectRegister，新增技能只改2个文件

**问题**：
1. **渲染层未共享**：Renderer.ts 和 TwoKingsRenderer.ts 各有重复的坦克/子弹/网格绘制
2. **AI 系统未参数化**：EnemyAI 的巡逻/追击/开火状态机是为围城设计的，双王不能用
3. **地图系统模式绑定**：Map.ts 至为围城服务，双王地图在 TwoKings.ts 里手写
4. **网络/多人架构零准备**：无任何状态同步或输入抽象

### 下一步最佳方案

**优先级排序**：

1. **P0 — 经济系统启动**（1h）：初始3基础零件+200金，围城奖励逐步解锁。让"玩"变成"追求"。这是所有收集循环的前提。

2. **P1 — 渲染层基类提取**（2h）：`src/ui/BattleRenderer.ts`——网格/瓦片/坦克/子弹/粒子统一绘制。Renderer 和 TwoKingsRenderer 继承。消除当前 ~200 行重复代码。

3. **P1 — 双王迭代**（2h）：波次递增（后期每路2-3辆+更强零件）、塔摧毁特效、AI卡墙自动回归。

4. **P2 — 音效系统落地**（1h）：Web Audio API synth 音效（不需要音频文件）。塔攻击/基地受损/击杀/胜利失败。

5. **P2 — 新文学技能**（3h）：🗼通天塔（语言混乱→方向随机）、🏳️空城计（羽扇+城墙幻影）。

---

> 📅 日期：2026-07-09
> 🔄 提交：b9a2c9d → d4592c0
> 📝 状态：双王战争核心可玩，通用对战框架稳定
