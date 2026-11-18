// 戦いの画面の時計。倍速（speed）とスロー（slow）をまとめて掛けて進める。
// 動き（tween）と待ち（sleep）はすべてこの時計で進むので、倍速にすると全部が速くなる。

type Tween = { start: number; dur: number; fn: (p: number) => void; resolve: () => void };
type Timer = { at: number; resolve: () => void };

export class GameClock {
  speed = 1;
  slow = 1;
  time = 0;
  private tweens: Tween[] = [];
  private timers: Timer[] = [];

  update(realDt: number): number {
    const dt = realDt * this.speed * this.slow;
    this.time += dt;
    for (const tw of [...this.tweens]) {
      const p = Math.min(1, (this.time - tw.start) / tw.dur);
      tw.fn(p);
      if (p >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    for (const tm of [...this.timers]) {
      if (this.time >= tm.at) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.resolve();
      }
    }
    return dt;
  }

  /** 秒で待つ（倍速で短くなる） */
  sleep(sec: number): Promise<void> {
    if (sec <= 0) return Promise.resolve();
    return new Promise((resolve) => this.timers.push({ at: this.time + sec, resolve }));
  }

  /** sec 秒かけて fn(0→1) を呼ぶ */
  tween(sec: number, fn: (p: number) => void): Promise<void> {
    return new Promise((resolve) => {
      if (sec <= 0) {
        fn(1);
        resolve();
        return;
      }
      fn(0);
      this.tweens.push({ start: this.time, dur: sec, fn, resolve });
    });
  }

  /** 少しのあいだスローにする（相性の演出など） */
  async slowMo(factor: number, sec: number): Promise<void> {
    this.slow = factor;
    await this.sleep(sec * factor);
    this.slow = 1;
  }
}

export const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
export const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
