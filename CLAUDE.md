# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Guidelines (Karpathy Method)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. Don't Reinvent the Wheel
- Reuse existing, battle-tested code directly — don't write simplified duplicates.
- Tank water logic verified → block water logic uses same code path.
- Practice skills exist in Siege → Practice calls Siege handlers directly, no rewrite.

## 项目概述

坦克工程师 (Tank Engineer) — 搜集零件、组装坦克、在几何物理规则下进行 3 分钟轻量对战的极简策略游戏。浏览器原生，Canvas + TypeScript + Vite，零运行时依赖。

## 常用命令

```bash
npm run dev          # 启动开发服务器 (localhost:3000)
npm run build        # 生产构建 (tsc + vite build)
npx tsc --noEmit     # 仅类型检查，不输出文件
```

## 架构概览

```
src/
├── main.ts              # 入口：Canvas初始化、状态机(garage/shop/siege)、主循环
├── core/                # 引擎层
│   ├── GameLoop.ts      # 固定时间步 (60Hz update + 可变 render)
│   ├── Input.ts         # 键盘状态管理 (isDown / wasJustPressed)
│   └── Physics.ts       # 碰撞检测、坦克移动、子弹反弹/穿透
├── entities/            # 数据与实体
│   ├── Parts.ts         # 零件定义、坦克方程约束、组装函数
│   ├── Tank.ts          # TankEntity 运行时状态
│   ├── Bullet.ts        # BulletEntity (支持 bounce/pierce/straight)
│   └── Map.ts           # 地图生成 (围城模式布局)
├── systems/             # 游戏系统
│   ├── Inventory.ts     # 零件库 + localStorage 持久化
│   ├── Shop.ts          # 每日商店 (3个随机零件)
│   ├── Reward.ts        # 战后奖励 (金币 + 随机零件掉落)
│   └── Assembly.ts      # 组装验证 (零件是否存在、是否拥有)
├── modes/
│   └── Siege.ts         # 围城模式：3分钟防守、6波敌人、指挥所保护
├── ai/
│   └── EnemyAI.ts       # 敌人行为树 (MOVING→AIMING→EVADING/STUCK)
├── ui/                  # Canvas 渲染
│   ├── Renderer.ts      # 战场渲染 (网格/墙体/坦克/子弹/HUD)
│   ├── HUD.ts           # 游戏内信息覆盖
│   ├── Garage.ts        # 组装车间界面
│   └── ShopUI.ts        # 商店界面
└── utils/
    ├── Vector.ts        # Vec2 不可变二维向量
    ├── Grid.ts          # 网格常量 (CELL_SIZE=32, MAP=20×15)
    └── Random.ts        # 种子随机数 (mulberry32)
```

## 关键设计

- **状态机**: AppScreen = `garage | shop | siege`，由 main.ts 的 update/render 分派
- **坦克方程**: 总重量 W = W_炮管 + W_炮塔 + W_车身，轻量(W≤4)速度快有后坐力，重量(W≥7)慢但碾墙
- **子弹物理**: 反射管碰墙 `vel.reflect(normal)`，透射管穿透砖墙，子步骤检测避免高速穿透
- **地图**: 20×15 网格，CELL_SIZE=32px → 640×480 画布。金属墙不可破坏，砖墙可被炮火/重型碾压摧毁
- **持久化**: Inventory 通过 localStorage 保存 (key: `tank_engineer_inventory`)，JSON 格式

## MVP 零件 (6个)

| 维度 | 零件 | 稀有度 |
|------|------|--------|
| 炮管 | 直射管 (straight) | common |
| 炮管 | 反射管 (bounce, 2次反弹) | rare |
| 炮塔 | 轻甲 (HP 80) | common |
| 炮塔 | 重甲 (HP 180, 防御0.85) | rare |
| 车身 | 标准底盘 | common |
| 车身 | 惯性底盘 (松手滑行3格) | rare |

## 设计理念书

完整设计文档见 [DESIGN.md](DESIGN.md)，包含零件系统、游戏模式矩阵、路线图等。
