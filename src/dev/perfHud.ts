import type { WebGLRenderer } from 'three';

// 開発中だけ出す重さの表示。
// 1秒あたりのコマ数（平均・いちばん遅いコマ）、描く回数、三角形の数、
// 読み込んだ形と絵の数、使っているメモリ（Chrome だけ。iPhone の Safari では出ない）。

type ChromeMemory = { usedJSHeapSize: number; jsHeapSizeLimit: number };

export class PerfHud {
  private el: HTMLDivElement;
  private frames = 0;
  private worst = 0;
  private last = performance.now();
  private windowStart = performance.now();
  private startedAt = performance.now();

  constructor(private renderer: WebGLRenderer) {
    this.el = document.createElement('div');
    this.el.id = 'perf';
    document.body.appendChild(this.el);
  }

  /** 毎コマ、描いたあとに呼ぶ */
  tick(): void {
    const now = performance.now();
    this.worst = Math.max(this.worst, now - this.last);
    this.last = now;
    this.frames++;

    const span = now - this.windowStart;
    if (span < 1000) return;

    const fps = (this.frames * 1000) / span;
    const info = this.renderer.info;
    const mem = (performance as Performance & { memory?: ChromeMemory }).memory;
    const memText = mem
      ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB`
      : '—';
    const dpr = this.renderer.getPixelRatio();
    const size = this.renderer.domElement;
    const minutes = (now - this.startedAt) / 60000;

    this.el.textContent = [
      `fps ${fps.toFixed(0)}  遅いコマ ${this.worst.toFixed(0)}ms`,
      `描く回数 ${info.render.calls}  三角形 ${(info.render.triangles / 1000).toFixed(1)}k`,
      `形 ${info.memory.geometries}  絵 ${info.memory.textures}  JS ${memText}`,
      `${size.width}×${size.height} @${dpr.toFixed(2)}  経過 ${minutes.toFixed(1)}分`,
    ].join('\n');

    this.frames = 0;
    this.worst = 0;
    this.windowStart = now;
  }
}
