// 自動戦闘の考え方。キャラごとのコードは書かず、技のデータ（効果）を見て決める。
// だから、データでキャラを足しても、自動戦闘はそのまま動く。

import type { Battle, Unit } from './battle';
import type { SkillDef } from './types';

export interface AutoChoice {
  score: number; // 0＝使う意味なし、1＝ふつう、2＝役に立つ、3＝今が使いどき
  target?: string;
}

/** 技を今使う価値と、ねらう相手 */
export function evaluateSkill(b: Battle, actor: Unit, skill: SkillDef): AutoChoice {
  const foes = b.foesOf(actor);
  const friends = b.friendsOf(actor);
  const bossFirst = (list: Unit[]) =>
    [...list].sort((x, y) => Number(!!b.enemyDef(y)?.boss) - Number(!!b.enemyDef(x)?.boss) || y.hp - x.hp)[0];
  let best: AutoChoice = { score: 0 };
  const consider = (c: AutoChoice) => {
    if (c.score > best.score) best = c;
  };

  for (const e of skill.effects) {
    if (e.kind === 'damage') {
      if (e.synergy) {
        const ready = foes.filter((f) => b.hasStatus(f, e.synergy!.status));
        if (ready.length) consider({ score: 3, target: bossFirst(ready).uid });
      }
      if (foes.length) consider({ score: 1, target: basicTarget(b, actor, skill).target });
    }
    if (e.kind === 'status') {
      const def = b.data.statuses[e.status];
      const foeSkill = skill.target === 'oneFoe' || skill.target === 'blastFoes' || skill.target === 'allFoes';
      const onFoes = e.to === 'allFoes' || (foeSkill && e.to !== 'self' && e.to !== 'allAllies');
      if (def?.kind === 'debuff' && onFoes) {
        const missing = foes.filter((f) => !b.hasStatus(f, e.status));
        if (missing.length) consider({ score: 2, target: foeSkill ? bossFirst(missing).uid : undefined });
      } else if (def?.kind === 'buff') {
        consider({ score: 1 });
      }
    }
    if (e.kind === 'amplify') {
      const has = foes.filter((f) => b.hasStatus(f, e.status));
      if (has.length) {
        const most = has.sort((x, y) => b.hasStatus(y, e.status)!.stacks - b.hasStatus(x, e.status)!.stacks)[0];
        consider({ score: 2, target: most.uid });
      }
    }
    if (e.kind === 'heal') {
      const low = Math.min(...friends.map((f) => f.hp / f.maxHp));
      consider({ score: low < 0.5 ? 3 : low < 0.8 ? 1 : 0 });
    }
    if (e.kind === 'shield') {
      const unshielded = friends.filter((f) => f.shield <= 0).length;
      const hurt = friends.some((f) => f.hp / f.maxHp < 0.9);
      consider({ score: unshielded >= 2 && hurt ? 2 : 1 });
    }
  }
  return best;
}

/** 通常攻撃の相手：属性の弱点で崩れていない敵 → HPが少ない敵 */
export function basicTarget(b: Battle, actor: Unit, skill: SkillDef): AutoChoice {
  const element = skill.element ?? actor.element;
  const foes = b.foesOf(actor);
  const sorted = [...foes].sort((x, y) => {
    const wx = b.isWeak(x, element) && !x.broken ? 0 : 1;
    const wy = b.isWeak(y, element) && !y.broken ? 0 : 1;
    return wx - wy || x.hp - y.hp;
  });
  return { score: 1, target: sorted[0]?.uid };
}

/** 味方の番：通常攻撃かスキルか、だれをねらうか */
export function chooseCommand(b: Battle): { kind: 'basic' | 'skill'; target?: string } {
  const actor = b.active!;
  const skills = b.skillsOf(actor)!;
  if (b.sp >= 1) {
    const c = evaluateSkill(b, actor, skills.skill);
    if (c.score >= 2 || (c.score >= 1 && b.sp >= 4)) return { kind: 'skill', target: c.target };
  }
  return { kind: 'basic', target: basicTarget(b, actor, skills.basic).target };
}

/** いま撃つとよい必殺技（支援の技を先に） */
export function readyUltimates(b: Battle): { uid: string; target?: string }[] {
  const out: { uid: string; target?: string; prio: number }[] = [];
  for (const u of b.aliveAllies()) {
    if (!b.canUlt(u.uid)) continue;
    const ult = b.skillsOf(u)!.ult;
    const c = evaluateSkill(b, u, ult);
    if (c.score <= 0) continue;
    const support = ult.target === 'allAllies' || ult.target === 'oneAlly' || ult.target === 'self';
    out.push({ uid: u.uid, target: c.target, prio: support ? 0 : 1 });
  }
  return out.sort((a, b2) => a.prio - b2.prio).map(({ uid, target }) => ({ uid, target }));
}

/** 自動の入れかえ：前で倒れている人を、元気な控えと入れかえる */
export function autoSwap(b: Battle): { out: string; in: string } | null {
  if (b.phase !== 'command') return null;
  const down = b.allies.find((u) => !u.bench && !u.alive);
  const fresh = b.benchAllies().sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp)[0];
  if (!down || !fresh || !b.canSwap(down.uid, fresh.uid)) return null;
  return { out: down.uid, in: fresh.uid };
}

/** 最後まで自動で戦う（テストと釣り合いの確かめに使う） */
export function runAuto(b: Battle, maxTurns = 500): Battle['phase'] {
  while (!b.ended && b.turnCount < maxTurns) {
    for (const u of readyUltimates(b)) {
      if (b.ended) break;
      if (b.canUlt(u.uid)) b.ultimate(u.uid, u.target);
    }
    if (b.ended) break;
    if (b.phase === 'between') b.nextTurn();
    else if (b.phase === 'command') {
      const s = autoSwap(b);
      if (s) b.swap(s.out, s.in);
      const c = chooseCommand(b);
      b.command(c.kind, c.target);
    }
  }
  return b.phase;
}
